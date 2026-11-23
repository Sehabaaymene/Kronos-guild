import type { Db } from '../db/types';
import { assert, audit, BusinessError, cleanText, nextReference, notify, nowISO, PAYMENT_METHODS, requireInt, uuid, type PaymentMethod } from './core';
import { isValidISODate, today } from './dates';
import { formatMoney, share, type Money } from './money';
import { recomputeSaleTotals } from './purchases';

export type SaleItemInput = {
  /** The exact purchase batch the watch(es) come from — chosen manually by the user. */
  batchId: string;
  quantity: number;
  /** The real negotiated price per watch, saved with the sale. */
  unitPrice: Money;
};

export type SaleInput = {
  requestId?: string;
  saleDate: string;
  items: SaleItemInput[];
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryFeeCharged?: Money;
  paymentMethod?: PaymentMethod;
  /** Money actually received from the customer so far. 0 = unpaid. */
  amountReceived: Money;
  orderReference?: string | null;
  notes?: string | null;
};

export type Sale = {
  id: string;
  reference: string;
  sale_date: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_fee_charged: Money;
  items_revenue: Money;
  total_revenue: Money;
  total_cost: Money;
  gross_profit: Money;
  amount_paid: Money;
  payment_method: PaymentMethod;
  payment_status: 'paid' | 'partial' | 'unpaid';
  status: 'completed' | 'cancelled';
  order_reference: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  purchase_batch_id: string;
  quantity: number;
  unit_selling_price: Money;
  unit_purchase_cost_snapshot: Money;
  unit_additional_cost_snapshot: Money;
  total_revenue: Money;
  total_cost: Money;
  gross_profit: Money;
  brand_name: string;
  model: string;
  image_path: string | null;
  batch_reference: string;
  batch_purchase_date: string;
};

export type Payment = {
  id: string;
  sale_id: string;
  amount: Money;
  payment_date: string;
  method: PaymentMethod;
  kind: 'payment' | 'adjustment' | 'refund';
  note: string | null;
  created_at: string;
};

export type SaleSummaryRow = Sale & { units: number; title: string; image_path: string | null };

export async function getSale(db: Db, id: string): Promise<{ sale: Sale; items: SaleItem[]; payments: Payment[] } | null> {
  const sale = await db.get<Sale>('SELECT * FROM sales WHERE id = ?', [id]);
  if (!sale) return null;
  const items = await db.all<SaleItem>(
    `SELECT si.*, p.model, p.image_path, br.name AS brand_name, b.reference AS batch_reference, b.purchase_date AS batch_purchase_date
     FROM sale_items si
     JOIN products p ON p.id = si.product_id
     JOIN brands br ON br.id = p.brand_id
     JOIN purchase_batches b ON b.id = si.purchase_batch_id
     WHERE si.sale_id = ? ORDER BY b.purchase_date`,
    [id],
  );
  const payments = await db.all<Payment>('SELECT * FROM payments WHERE sale_id = ? ORDER BY created_at', [id]);
  return { sale, items, payments };
}

export async function listSales(db: Db, opts: { from?: string | null; to?: string | null; status?: 'completed' | 'cancelled' } = {}): Promise<SaleSummaryRow[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.from) {
    where.push('s.sale_date >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    where.push('s.sale_date <= ?');
    params.push(opts.to);
  }
  if (opts.status) {
    where.push('s.status = ?');
    params.push(opts.status);
  }
  return db.all<SaleSummaryRow>(
    `SELECT s.*,
       COALESCE((SELECT SUM(quantity) FROM sale_items WHERE sale_id = s.id), 0) AS units,
       COALESCE((SELECT GROUP_CONCAT(br.name || ' ' || p.model, ', ') FROM (SELECT DISTINCT product_id FROM sale_items WHERE sale_id = s.id) x
                 JOIN products p ON p.id = x.product_id JOIN brands br ON br.id = p.brand_id), '') AS title,
       (SELECT p.image_path FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id LIMIT 1) AS image_path
     FROM sales s ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY s.sale_date DESC, s.created_at DESC`,
    params,
  );
}

function validate(input: SaleInput) {
  assert(isValidISODate(input.saleDate), 'Sale date is invalid.');
  assert(input.items.length > 0, 'Select at least one watch to sell.');
  for (const it of input.items) {
    assert(it.batchId, 'Each line must have a purchase batch.');
    requireInt(it.quantity, 'Quantity', 1);
    requireInt(it.unitPrice, 'Selling price', 0);
  }
  requireInt(input.deliveryFeeCharged ?? 0, 'Delivery fee', 0);
  requireInt(input.amountReceived, 'Amount received', 0);
  assert(PAYMENT_METHODS.includes(input.paymentMethod ?? 'cash'), 'Invalid payment method.');
}

/**
 * Takes stock out of the chosen batches and inserts the sale lines with a
 * snapshot of the real cost and selling price. Throws (rolling back the whole
 * transaction) if any batch doesn't have enough units.
 */
async function insertItems(tx: Db, saleId: string, items: SaleItemInput[]): Promise<void> {
  // Merge duplicate lines from the same batch at the same price, and check totals per batch.
  const perBatch = new Map<string, number>();
  for (const it of items) perBatch.set(it.batchId, (perBatch.get(it.batchId) ?? 0) + it.quantity);

  for (const [batchId, qty] of perBatch) {
    const b = await tx.get<{ quantity_remaining: number; reference: string; model: string; brand_name: string }>(
      `SELECT b.quantity_remaining, b.reference, p.model, br.name AS brand_name
       FROM purchase_batches b JOIN products p ON p.id = b.product_id JOIN brands br ON br.id = p.brand_id WHERE b.id = ?`,
      [batchId],
    );
    assert(b, 'The selected purchase batch no longer exists.');
    if (qty > b.quantity_remaining) {
      throw new BusinessError(
        `Not enough stock in batch ${b.reference} (${b.brand_name} ${b.model}): ${b.quantity_remaining} available, ${qty} requested.`,
      );
    }
  }

  for (const it of items) {
    const b = await tx.get<{
      product_id: string;
      unit_cost: number;
      additional_cost: number;
      additional_cost_mode: string;
      quantity_purchased: number;
    }>('SELECT product_id, unit_cost, additional_cost, additional_cost_mode, quantity_purchased FROM purchase_batches WHERE id = ?', [it.batchId]);
    assert(b, 'The selected purchase batch no longer exists.');
    // Guarded decrement: only succeeds if enough stock remains (stock can never go negative).
    const res = await tx.run(
      'UPDATE purchase_batches SET quantity_remaining = quantity_remaining - ?, updated_at = ? WHERE id = ? AND quantity_remaining >= ?',
      [it.quantity, nowISO(), it.batchId, it.quantity],
    );
    if (res.changes !== 1) throw new BusinessError('Not enough stock in the selected batch.');
    const allocated = b.additional_cost_mode === 'inventory';
    const additionalTotal = allocated ? share(b.additional_cost, it.quantity, b.quantity_purchased) : 0;
    const revenue = it.quantity * it.unitPrice;
    const cost = it.quantity * b.unit_cost + additionalTotal;
    await tx.run(
      `INSERT INTO sale_items (id, sale_id, product_id, purchase_batch_id, quantity, unit_selling_price, unit_purchase_cost_snapshot,
         unit_additional_cost_snapshot, total_revenue, total_cost, gross_profit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        saleId,
        b.product_id,
        it.batchId,
        it.quantity,
        it.unitPrice,
        b.unit_cost,
        allocated ? share(b.additional_cost, 1, b.quantity_purchased) : 0,
        revenue,
        cost,
        revenue - cost,
      ],
    );
  }
}

/** Puts every unit of a sale back into the exact batch it came from and removes the lines. */
async function restoreItems(tx: Db, saleId: string): Promise<void> {
  const items = await tx.all<{ purchase_batch_id: string; quantity: number }>(
    'SELECT purchase_batch_id, quantity FROM sale_items WHERE sale_id = ?',
    [saleId],
  );
  for (const it of items) {
    await tx.run('UPDATE purchase_batches SET quantity_remaining = quantity_remaining + ?, updated_at = ? WHERE id = ?', [
      it.quantity,
      nowISO(),
      it.purchase_batch_id,
    ]);
  }
}

function itemsTotal(input: SaleInput): Money {
  return input.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0) + (input.deliveryFeeCharged ?? 0);
}

/**
 * Records a sale atomically: stock decreases in the chosen batches, the real
 * selling price and acquisition cost are saved, profit is calculated, and the
 * money actually received is stored as a payment (unpaid ≠ cash).
 */
export async function createSale(db: Db, input: SaleInput): Promise<{ saleId: string; reference: string; duplicate: boolean }> {
  validate(input);
  const total = itemsTotal(input);
  if (input.amountReceived > total) throw new BusinessError(`Amount received cannot exceed the sale total (${formatMoney(total)}).`);
  return db.transaction(async (tx) => {
    if (input.requestId) {
      const dup = await tx.get<{ id: string; reference: string }>('SELECT id, reference FROM sales WHERE request_id = ?', [input.requestId]);
      if (dup) return { saleId: dup.id, reference: dup.reference, duplicate: true };
    }
    const id = uuid();
    const reference = await nextReference(tx, 'S');
    const now = nowISO();
    const method = input.paymentMethod ?? 'cash';
    await tx.run(
      `INSERT INTO sales (id, reference, request_id, sale_date, customer_name, customer_phone, delivery_fee_charged, payment_method,
         status, order_reference, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
      [
        id,
        reference,
        input.requestId ?? null,
        input.saleDate,
        cleanText(input.customerName, 120),
        cleanText(input.customerPhone, 40),
        input.deliveryFeeCharged ?? 0,
        method,
        cleanText(input.orderReference, 80),
        cleanText(input.notes, 2000),
        now,
        now,
      ],
    );
    await insertItems(tx, id, input.items);
    if (input.amountReceived > 0) {
      await tx.run(
        `INSERT INTO payments (id, sale_id, amount, payment_date, method, kind, note, created_at) VALUES (?, ?, ?, ?, ?, 'payment', ?, ?)`,
        [uuid(), id, input.amountReceived, input.saleDate, method, 'Received at sale', now],
      );
    }
    await recomputeSaleTotals(tx, id);
    const sale = await tx.get<Sale>('SELECT * FROM sales WHERE id = ?', [id]);
    const units = input.items.reduce((s, i) => s + i.quantity, 0);
    await notify(tx, {
      type: 'sale',
      title: `Sale ${reference} recorded`,
      message: `${units} watch(es) · ${formatMoney(sale!.total_revenue)} · profit ${formatMoney(sale!.gross_profit)}`,
      relatedEntityType: 'sale',
      relatedEntityId: id,
      dedupeKey: `sale:${id}`,
    });
    await audit(tx, {
      action: 'sale.create',
      entityType: 'sale',
      entityId: id,
      reference,
      summary: `Sold ${units} watch(es) for ${formatMoney(sale!.total_revenue)} (gross profit ${formatMoney(sale!.gross_profit)})`,
      amount: sale!.total_revenue,
      status: 'completed',
      newValues: input,
    });
    return { saleId: id, reference, duplicate: false };
  });
}

export type UpdateSaleInput = SaleInput & { id: string };

/**
 * Edits a completed sale: the old units are returned to their batches, the new
 * lines are validated and taken out again, totals are recalculated, and any
 * change in the amount received is recorded as a payment adjustment so the
 * payment history is preserved. Atomic.
 */
export async function updateSale(db: Db, input: UpdateSaleInput): Promise<void> {
  validate(input);
  const total = itemsTotal(input);
  if (input.amountReceived > total) throw new BusinessError(`Amount received cannot exceed the sale total (${formatMoney(total)}).`);
  await db.transaction(async (tx) => {
    const before = await getSale(tx, input.id);
    assert(before, 'Sale not found.');
    if (before.sale.status === 'cancelled') throw new BusinessError('A cancelled sale cannot be edited.');
    await restoreItems(tx, input.id);
    await tx.run('DELETE FROM sale_items WHERE sale_id = ?', [input.id]);
    const method = input.paymentMethod ?? 'cash';
    await tx.run(
      `UPDATE sales SET sale_date = ?, customer_name = ?, customer_phone = ?, delivery_fee_charged = ?, payment_method = ?,
         order_reference = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [
        input.saleDate,
        cleanText(input.customerName, 120),
        cleanText(input.customerPhone, 40),
        input.deliveryFeeCharged ?? 0,
        method,
        cleanText(input.orderReference, 80),
        cleanText(input.notes, 2000),
        nowISO(),
        input.id,
      ],
    );
    await insertItems(tx, input.id, input.items);
    const diff = input.amountReceived - before.sale.amount_paid;
    if (diff !== 0) {
      await tx.run(
        `INSERT INTO payments (id, sale_id, amount, payment_date, method, kind, note, created_at) VALUES (?, ?, ?, ?, ?, 'adjustment', ?, ?)`,
        [uuid(), input.id, diff, today(), method, 'Amount received corrected while editing the sale', nowISO()],
      );
    }
    await recomputeSaleTotals(tx, input.id);
    const after = await getSale(tx, input.id);
    await audit(tx, {
      action: 'sale.update',
      entityType: 'sale',
      entityId: input.id,
      reference: before.sale.reference,
      summary: `Sale ${before.sale.reference} edited: revenue ${formatMoney(before.sale.total_revenue)} → ${formatMoney(after!.sale.total_revenue)}, profit ${formatMoney(before.sale.gross_profit)} → ${formatMoney(after!.sale.gross_profit)}`,
      amount: after!.sale.total_revenue,
      status: 'edited',
      oldValues: { sale: before.sale, items: before.items.map(slimItem) },
      newValues: { sale: after!.sale, items: after!.items.map(slimItem) },
    });
  });
}

function slimItem(i: SaleItem) {
  return {
    product: `${i.brand_name} ${i.model}`,
    batch: i.batch_reference,
    quantity: i.quantity,
    unitPrice: i.unit_selling_price,
    unitCost: i.unit_purchase_cost_snapshot,
  };
}

/**
 * Cancels a sale. The exact quantities go back to their original batches, the
 * sale is kept (marked cancelled) for history, and money already received is
 * recorded as refunded. Cancelled sales never count in revenue or profit.
 */
export async function cancelSale(db: Db, id: string, reason?: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await getSale(tx, id);
    assert(before, 'Sale not found.');
    if (before.sale.status === 'cancelled') throw new BusinessError('This sale is already cancelled.');
    await restoreItems(tx, id);
    const now = nowISO();
    if (before.sale.amount_paid > 0) {
      await tx.run(
        `INSERT INTO payments (id, sale_id, amount, payment_date, method, kind, note, created_at) VALUES (?, ?, ?, ?, ?, 'refund', ?, ?)`,
        [uuid(), id, -before.sale.amount_paid, today(), before.sale.payment_method, 'Refunded on cancellation', now],
      );
    }
    await tx.run(`UPDATE sales SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, updated_at = ? WHERE id = ?`, [
      now,
      cleanText(reason, 500),
      now,
      id,
    ]);
    await recomputeSaleTotals(tx, id);
    const units = before.items.reduce((s, i) => s + i.quantity, 0);
    await audit(tx, {
      action: 'sale.cancel',
      entityType: 'sale',
      entityId: id,
      reference: before.sale.reference,
      summary: `Sale ${before.sale.reference} cancelled — ${units} watch(es) returned to stock${reason ? ` (${reason})` : ''}`,
      amount: before.sale.total_revenue,
      status: 'cancelled',
      oldValues: { sale: before.sale, items: before.items.map(slimItem) },
    });
  });
}

/** Records money received later for a partially paid / unpaid sale. */
export async function addPayment(
  db: Db,
  input: { saleId: string; amount: Money; paymentDate: string; method?: PaymentMethod; note?: string | null },
): Promise<void> {
  requireInt(input.amount, 'Amount', 1);
  assert(isValidISODate(input.paymentDate), 'Payment date is invalid.');
  await db.transaction(async (tx) => {
    const s = await tx.get<Sale>('SELECT * FROM sales WHERE id = ?', [input.saleId]);
    assert(s, 'Sale not found.');
    if (s.status === 'cancelled') throw new BusinessError('Cannot add a payment to a cancelled sale.');
    const balance = s.total_revenue - s.amount_paid;
    if (input.amount > balance) throw new BusinessError(`Payment exceeds the outstanding balance (${formatMoney(balance)}).`);
    await tx.run(
      `INSERT INTO payments (id, sale_id, amount, payment_date, method, kind, note, created_at) VALUES (?, ?, ?, ?, ?, 'payment', ?, ?)`,
      [uuid(), input.saleId, input.amount, input.paymentDate, input.method ?? s.payment_method, cleanText(input.note, 300), nowISO()],
    );
    await recomputeSaleTotals(tx, input.saleId);
    await audit(tx, {
      action: 'sale.payment',
      entityType: 'sale',
      entityId: input.saleId,
      reference: s.reference,
      summary: `Payment of ${formatMoney(input.amount)} received for ${s.reference}`,
      amount: input.amount,
      status: 'payment',
    });
  });
}
