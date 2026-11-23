import type { Db } from '../db/types';
import { ensureProduct } from './catalog';
import { assert, audit, BusinessError, cleanText, nextReference, notify, nowISO, requireInt, uuid } from './core';
import { isValidISODate } from './dates';
import { formatMoney, share, type Money } from './money';

export type AdditionalCostMode = 'inventory' | 'expense';

export type PurchaseInput = {
  /** Random id generated when the form opens. Re-submitting the same form never creates a duplicate. */
  requestId?: string;
  brandName: string;
  model: string;
  quantity: number;
  unitCost: Money;
  expectedSellingPrice: Money;
  purchaseDate: string;
  supplierName?: string | null;
  /** Extra costs for this purchase (shipping from supplier, customs, ...). */
  additionalCost?: Money;
  /**
   * 'inventory' → spread over the units and included in their cost (COGS when sold).
   * 'expense'   → recorded as a separate operating expense linked to the purchase.
   */
  additionalCostMode?: AdditionalCostMode;
  notes?: string | null;
  receiptPath?: string | null;
  /** Optional picture for a NEW model (or to set one on a model without a picture). */
  productImagePath?: string | null;
  sku?: string | null;
};

export type PurchaseBatch = {
  id: string;
  reference: string;
  product_id: string;
  brand_name: string;
  model: string;
  image_path: string | null;
  purchase_date: string;
  quantity_purchased: number;
  quantity_remaining: number;
  unit_cost: Money;
  additional_cost: Money;
  additional_cost_mode: AdditionalCostMode;
  expected_selling_price: Money;
  supplier_name: string | null;
  notes: string | null;
  receipt_path: string | null;
  created_at: string;
  updated_at: string;
  /** Total paid to the supplier for the units (quantity × unit cost) */
  total_cost: Money;
  /** Units sold in completed sales */
  quantity_sold: number;
  inventory_value: Money;
};

const BATCH_SQL = `
  SELECT b.*, p.model, p.image_path, br.name AS brand_name,
    b.quantity_purchased * b.unit_cost AS total_cost,
    COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id = si.sale_id
              WHERE si.purchase_batch_id = b.id AND s.status = 'completed'), 0) AS quantity_sold,
    (b.quantity_remaining * b.unit_cost +
      CASE WHEN b.additional_cost_mode = 'inventory'
           THEN CAST(ROUND(1.0 * b.additional_cost * b.quantity_remaining / b.quantity_purchased) AS INTEGER)
           ELSE 0 END) AS inventory_value
  FROM purchase_batches b
  JOIN products p ON p.id = b.product_id
  JOIN brands br ON br.id = p.brand_id`;

export async function getBatch(db: Db, id: string): Promise<PurchaseBatch | null> {
  return db.get<PurchaseBatch>(`${BATCH_SQL} WHERE b.id = ?`, [id]);
}

export async function listBatches(db: Db, opts: { productId?: string; onlyAvailable?: boolean } = {}): Promise<PurchaseBatch[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.productId) {
    where.push('b.product_id = ?');
    params.push(opts.productId);
  }
  if (opts.onlyAvailable) where.push('b.quantity_remaining > 0');
  return db.all<PurchaseBatch>(
    `${BATCH_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.purchase_date DESC, b.created_at DESC`,
    params,
  );
}

/** Unit cost of a batch including its allocated share of additional costs (for display). */
export function unitLandedCost(b: Pick<PurchaseBatch, 'unit_cost' | 'additional_cost' | 'additional_cost_mode' | 'quantity_purchased'>): Money {
  return b.unit_cost + (b.additional_cost_mode === 'inventory' ? share(b.additional_cost, 1, b.quantity_purchased) : 0);
}

function validate(input: PurchaseInput) {
  requireInt(input.quantity, 'Quantity', 1);
  requireInt(input.unitCost, 'Purchase price', 0);
  requireInt(input.expectedSellingPrice, 'Expected selling price', 0);
  requireInt(input.additionalCost ?? 0, 'Additional costs', 0);
  assert(isValidISODate(input.purchaseDate), 'Purchase date is invalid.');
  assert(input.quantity <= 100_000, 'Quantity looks too large.');
}

async function findExpenseCategoryId(tx: Db, name: string): Promise<string> {
  const row = await tx.get<{ id: string }>('SELECT id FROM expense_categories WHERE name = ? COLLATE NOCASE', [name]);
  if (row) return row.id;
  const id = uuid();
  await tx.run('INSERT INTO expense_categories (id, name, is_default, created_at) VALUES (?, ?, 1, ?)', [id, name, nowISO()]);
  return id;
}

/** Keeps the linked "additional purchase costs" expense in sync with the batch. */
async function syncLinkedExpense(
  tx: Db,
  batchId: string,
  reference: string,
  amount: Money,
  mode: AdditionalCostMode,
  date: string,
) {
  const linked = await tx.get<{ id: string }>('SELECT id FROM expenses WHERE purchase_batch_id = ?', [batchId]);
  const needsExpense = mode === 'expense' && amount > 0;
  if (!needsExpense) {
    if (linked) await tx.run('DELETE FROM expenses WHERE id = ?', [linked.id]);
    return;
  }
  const now = nowISO();
  if (linked) {
    await tx.run('UPDATE expenses SET amount = ?, expense_date = ?, updated_at = ? WHERE id = ?', [amount, date, now, linked.id]);
  } else {
    const categoryId = await findExpenseCategoryId(tx, 'Supplier-related expenses');
    const ref = await nextReference(tx, 'E');
    await tx.run(
      `INSERT INTO expenses (id, reference, category_id, title, amount, expense_date, payment_method, description, purchase_batch_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'cash', ?, ?, ?, ?)`,
      [uuid(), ref, categoryId, `Additional costs for purchase ${reference}`, amount, date, 'Created automatically from the purchase.', batchId, now, now],
    );
  }
}

/**
 * Records a purchase: creates the brand/model if new, creates a NEW purchase
 * batch with its own cost (never overwriting older batches), increases stock,
 * and writes the audit trail — all in one atomic transaction.
 */
export async function createPurchase(db: Db, input: PurchaseInput): Promise<{ batchId: string; reference: string; duplicate: boolean }> {
  validate(input);
  return db.transaction(async (tx) => {
    if (input.requestId) {
      const dup = await tx.get<{ id: string; reference: string }>('SELECT id, reference FROM purchase_batches WHERE request_id = ?', [
        input.requestId,
      ]);
      if (dup) return { batchId: dup.id, reference: dup.reference, duplicate: true };
    }
    const product = await ensureProduct(tx, {
      brandName: input.brandName,
      model: input.model,
      defaultSellingPrice: input.expectedSellingPrice,
      sku: input.sku,
      imagePath: input.productImagePath,
    });
    const now = nowISO();
    if (!product.created) {
      // The latest purchase's expected price becomes the suggested selling price.
      await tx.run('UPDATE products SET default_selling_price = ?, updated_at = ? WHERE id = ?', [input.expectedSellingPrice, now, product.id]);
      if (input.productImagePath) {
        await tx.run('UPDATE products SET image_path = ? WHERE id = ? AND image_path IS NULL', [input.productImagePath, product.id]);
      }
    }
    const id = uuid();
    const reference = await nextReference(tx, 'P');
    const mode = input.additionalCostMode ?? 'inventory';
    const additional = input.additionalCost ?? 0;
    await tx.run(
      `INSERT INTO purchase_batches (id, reference, request_id, product_id, purchase_date, quantity_purchased, quantity_remaining,
         unit_cost, additional_cost, additional_cost_mode, expected_selling_price, supplier_name, notes, receipt_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        reference,
        input.requestId ?? null,
        product.id,
        input.purchaseDate,
        input.quantity,
        input.quantity,
        input.unitCost,
        additional,
        mode,
        input.expectedSellingPrice,
        cleanText(input.supplierName, 120),
        cleanText(input.notes, 2000),
        input.receiptPath ?? null,
        now,
        now,
      ],
    );
    await syncLinkedExpense(tx, id, reference, additional, mode, input.purchaseDate);
    const total = input.quantity * input.unitCost;
    await audit(tx, {
      action: 'purchase.create',
      entityType: 'purchase',
      entityId: id,
      reference,
      summary: `Purchased ${input.quantity} × ${input.brandName.trim()} ${input.model.trim()} at ${formatMoney(input.unitCost)}`,
      amount: total + additional,
      status: 'recorded',
      newValues: { ...input },
    });
    return { batchId: id, reference, duplicate: false };
  });
}

export type UpdatePurchaseInput = PurchaseInput & {
  id: string;
  /**
   * When the unit cost changes and units were already sold: true updates the cost
   * saved on those sales too (use when the original price was a typo); false
   * keeps the historical cost on past sales.
   */
  applyCostToExistingSales?: boolean;
};

export type PurchaseEditImpact = {
  unitsConsumed: number; // sold + adjusted out
  unitsSold: number;
  saleCount: number;
  minQuantity: number;
};

/** Information the edit screen shows as a warning before saving. */
export async function getPurchaseEditImpact(db: Db, batchId: string): Promise<PurchaseEditImpact> {
  const b = await db.get<{ quantity_purchased: number; quantity_remaining: number }>(
    'SELECT quantity_purchased, quantity_remaining FROM purchase_batches WHERE id = ?',
    [batchId],
  );
  assert(b, 'Purchase not found.');
  const sold = await db.get<{ units: number; sales: number }>(
    `SELECT COALESCE(SUM(si.quantity), 0) AS units, COUNT(DISTINCT si.sale_id) AS sales
     FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.purchase_batch_id = ? AND s.status = 'completed'`,
    [batchId],
  );
  const consumed = b.quantity_purchased - b.quantity_remaining;
  return { unitsConsumed: consumed, unitsSold: sold?.units ?? 0, saleCount: sold?.sales ?? 0, minQuantity: Math.max(1, consumed) };
}

/**
 * Safely edits a purchase. The new quantity can never go below the units
 * already sold/adjusted (stock can never become negative). Model and cost
 * corrections are propagated to dependent records as described below.
 */
export async function updatePurchase(db: Db, input: UpdatePurchaseInput): Promise<void> {
  validate(input);
  await db.transaction(async (tx) => {
    const old = await getBatch(tx, input.id);
    assert(old, 'Purchase not found.');
    const consumed = old.quantity_purchased - old.quantity_remaining;
    if (input.quantity < consumed) {
      throw new BusinessError(
        `Quantity cannot be lower than ${consumed}: ${consumed} unit(s) from this purchase were already sold or adjusted. Cancel or edit those sales first.`,
      );
    }
    const newRemaining = input.quantity - consumed;
    const product = await ensureProduct(tx, {
      brandName: input.brandName,
      model: input.model,
      defaultSellingPrice: input.expectedSellingPrice,
      sku: input.sku,
      imagePath: input.productImagePath,
    });
    const now = nowISO();
    const mode = input.additionalCostMode ?? old.additional_cost_mode;
    const additional = input.additionalCost ?? 0;
    await tx.run(
      `UPDATE purchase_batches SET product_id = ?, purchase_date = ?, quantity_purchased = ?, quantity_remaining = ?, unit_cost = ?,
         additional_cost = ?, additional_cost_mode = ?, expected_selling_price = ?, supplier_name = ?, notes = ?, receipt_path = ?, updated_at = ?
       WHERE id = ?`,
      [
        product.id,
        input.purchaseDate,
        input.quantity,
        newRemaining,
        input.unitCost,
        additional,
        mode,
        input.expectedSellingPrice,
        cleanText(input.supplierName, 120),
        cleanText(input.notes, 2000),
        input.receiptPath ?? null,
        now,
        input.id,
      ],
    );
    if (input.productImagePath) {
      await tx.run('UPDATE products SET image_path = ?, updated_at = ? WHERE id = ?', [input.productImagePath, now, product.id]);
    }

    // Model correction: sales of these units must point at the corrected model.
    if (product.id !== old.product_id) {
      await tx.run('UPDATE sale_items SET product_id = ? WHERE purchase_batch_id = ?', [product.id, input.id]);
      // If the wrong model is now completely unused (it was only created by the typo), remove it.
      const leftover = await tx.get<{ n: number }>(
        `SELECT (SELECT COUNT(*) FROM purchase_batches WHERE product_id = ?) + (SELECT COUNT(*) FROM sale_items WHERE product_id = ?) AS n`,
        [old.product_id, old.product_id],
      );
      if ((leftover?.n ?? 0) === 0) await tx.run('DELETE FROM products WHERE id = ?', [old.product_id]);
    }

    // Cost correction on units already sold: re-snapshot every sale line of this batch
    // with the corrected cost (also works if an earlier edit chose not to apply it).
    if (input.applyCostToExistingSales) {
      const items = await tx.all<{ id: string; sale_id: string; quantity: number; total_revenue: number }>(
        'SELECT id, sale_id, quantity, total_revenue FROM sale_items WHERE purchase_batch_id = ?',
        [input.id],
      );
      const perUnitAdditional = mode === 'inventory' ? share(additional, 1, input.quantity) : 0;
      for (const it of items) {
        const totalCost = it.quantity * input.unitCost + (mode === 'inventory' ? share(additional, it.quantity, input.quantity) : 0);
        await tx.run(
          `UPDATE sale_items SET unit_purchase_cost_snapshot = ?, unit_additional_cost_snapshot = ?, total_cost = ?, gross_profit = total_revenue - ?
           WHERE id = ?`,
          [input.unitCost, perUnitAdditional, totalCost, totalCost, it.id],
        );
      }
      const saleIds = [...new Set(items.map((i) => i.sale_id))];
      for (const sid of saleIds) await recomputeSaleTotals(tx, sid);
    }

    await syncLinkedExpense(tx, input.id, old.reference, additional, mode, input.purchaseDate);

    if (input.quantity !== old.quantity_purchased) {
      await notify(tx, {
        type: 'inventory',
        title: 'Purchase quantity corrected',
        message: `${old.reference}: quantity changed from ${old.quantity_purchased} to ${input.quantity}.`,
        relatedEntityType: 'purchase',
        relatedEntityId: input.id,
      });
    }
    await audit(tx, {
      action: 'purchase.update',
      entityType: 'purchase',
      entityId: input.id,
      reference: old.reference,
      summary: `Purchase ${old.reference} edited${consumed > 0 ? ` (${consumed} unit(s) already sold/adjusted)` : ''}`,
      amount: input.quantity * input.unitCost + additional,
      status: 'edited',
      oldValues: {
        brand: old.brand_name,
        model: old.model,
        quantity: old.quantity_purchased,
        unitCost: old.unit_cost,
        expectedSellingPrice: old.expected_selling_price,
        purchaseDate: old.purchase_date,
        supplier: old.supplier_name,
        additionalCost: old.additional_cost,
        additionalCostMode: old.additional_cost_mode,
      },
      newValues: { ...input },
    });
  });
}

/** Deletes a purchase only when none of its units were sold or adjusted. */
export async function deletePurchase(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const old = await getBatch(tx, id);
    assert(old, 'Purchase not found.');
    const used = await tx.get<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM sale_items WHERE purchase_batch_id = ?) +
              (SELECT COUNT(*) FROM inventory_adjustments WHERE purchase_batch_id = ?) AS n`,
      [id, id],
    );
    if ((used?.n ?? 0) > 0 || old.quantity_remaining !== old.quantity_purchased) {
      throw new BusinessError(
        'This purchase has sales or stock adjustments (including cancelled sales kept for history), so it cannot be deleted. Edit it instead.',
      );
    }
    await tx.run('DELETE FROM expenses WHERE purchase_batch_id = ?', [id]);
    await tx.run('DELETE FROM purchase_batches WHERE id = ?', [id]);
    await audit(tx, {
      action: 'purchase.delete',
      entityType: 'purchase',
      entityId: id,
      reference: old.reference,
      summary: `Purchase ${old.reference} deleted (${old.quantity_purchased} × ${old.brand_name} ${old.model})`,
      amount: old.total_cost,
      status: 'deleted',
      oldValues: old,
    });
  });
}

/** Recalculates a sale's cached totals from its items and payments. */
export async function recomputeSaleTotals(tx: Db, saleId: string): Promise<void> {
  const t = await tx.get<{ revenue: number; cost: number }>(
    'SELECT COALESCE(SUM(total_revenue), 0) AS revenue, COALESCE(SUM(total_cost), 0) AS cost FROM sale_items WHERE sale_id = ?',
    [saleId],
  );
  const s = await tx.get<{ delivery_fee_charged: number; status: string }>('SELECT delivery_fee_charged, status FROM sales WHERE id = ?', [saleId]);
  assert(s && t, 'Sale not found.');
  const paid = await tx.get<{ paid: number }>('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE sale_id = ?', [saleId]);
  const totalRevenue = t.revenue + s.delivery_fee_charged;
  const amountPaid = paid?.paid ?? 0;
  await tx.run(
    `UPDATE sales SET items_revenue = ?, total_revenue = ?, total_cost = ?, gross_profit = ?, amount_paid = ?, payment_status = ? WHERE id = ?`,
    [t.revenue, totalRevenue, t.cost, totalRevenue - t.cost, amountPaid, paymentStatus(amountPaid, totalRevenue), saleId],
  );
}

export function paymentStatus(paid: Money, total: Money): 'paid' | 'partial' | 'unpaid' {
  if (paid <= 0) return total <= 0 ? 'paid' : 'unpaid';
  if (paid >= total) return 'paid';
  return 'partial';
}
