import type { Db } from '../db/types';
import { assert, audit, BusinessError, cleanText, nextReference, notify, nowISO, requireInt, uuid } from './core';
import { isValidISODate } from './dates';
import { formatMoney, share } from './money';

export const ADJUSTMENT_REASONS = ['damaged', 'lost', 'personal_use', 'returned_to_supplier', 'count_correction', 'found'] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export type InventoryAdjustment = {
  id: string;
  reference: string;
  purchase_batch_id: string;
  quantity_change: number;
  value_change: number;
  reason: AdjustmentReason;
  note: string | null;
  adjustment_date: string;
  created_at: string;
};

/**
 * Corrects stock in a batch outside of a sale (damaged, lost, count error...).
 * Removing units records their cost as an inventory loss (it reduces net
 * profit); adding units back ('found') reverses a previous loss. A batch can
 * never go below 0 or above the quantity originally purchased.
 */
export async function adjustStock(
  db: Db,
  input: { batchId: string; quantityChange: number; reason: AdjustmentReason; note?: string | null; date: string },
): Promise<string> {
  assert(Number.isInteger(input.quantityChange) && input.quantityChange !== 0, 'Enter a quantity to add or remove.');
  requireInt(Math.abs(input.quantityChange), 'Quantity', 1);
  assert(ADJUSTMENT_REASONS.includes(input.reason), 'Choose a reason.');
  assert(isValidISODate(input.date), 'Date is invalid.');
  return db.transaction(async (tx) => {
    const b = await tx.get<{
      reference: string;
      quantity_purchased: number;
      quantity_remaining: number;
      unit_cost: number;
      additional_cost: number;
      additional_cost_mode: string;
    }>('SELECT reference, quantity_purchased, quantity_remaining, unit_cost, additional_cost, additional_cost_mode FROM purchase_batches WHERE id = ?', [
      input.batchId,
    ]);
    assert(b, 'Purchase batch not found.');
    if (input.quantityChange > 0) {
      // Units can only come back if a previous correction removed them (sold units come back by cancelling the sale).
      const removed = await netRemovedByAdjustments(tx, input.batchId);
      if (input.quantityChange > removed) {
        throw new BusinessError(
          removed > 0
            ? `Only ${removed} unit(s) were previously removed by corrections in ${b.reference}.`
            : `No units were removed by corrections in ${b.reference}. To return a sold watch, cancel or edit the sale.`,
        );
      }
    }
    const next = b.quantity_remaining + input.quantityChange;
    if (next < 0) throw new BusinessError(`Only ${b.quantity_remaining} unit(s) left in ${b.reference}.`);
    if (next > b.quantity_purchased) {
      throw new BusinessError(`${b.reference} was purchased with ${b.quantity_purchased} unit(s); stock cannot exceed that. Record a new purchase instead.`);
    }
    const n = Math.abs(input.quantityChange);
    const unitValue = n * b.unit_cost + (b.additional_cost_mode === 'inventory' ? share(b.additional_cost, n, b.quantity_purchased) : 0);
    const value = Math.sign(input.quantityChange) * unitValue;
    await tx.run('UPDATE purchase_batches SET quantity_remaining = ?, updated_at = ? WHERE id = ?', [next, nowISO(), input.batchId]);
    const id = uuid();
    const reference = await nextReference(tx, 'A');
    await tx.run(
      `INSERT INTO inventory_adjustments (id, reference, purchase_batch_id, quantity_change, value_change, reason, note, adjustment_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, reference, input.batchId, input.quantityChange, value, input.reason, cleanText(input.note, 500), input.date, nowISO()],
    );
    const label = input.reason.replace(/_/g, ' ');
    await notify(tx, {
      type: 'inventory',
      title: 'Stock adjusted',
      message: `${b.reference}: ${input.quantityChange > 0 ? '+' : ''}${input.quantityChange} unit(s) (${label}).`,
      relatedEntityType: 'purchase',
      relatedEntityId: input.batchId,
    });
    await audit(tx, {
      action: 'inventory.adjust',
      entityType: 'purchase',
      entityId: input.batchId,
      reference,
      summary: `Stock correction on ${b.reference}: ${input.quantityChange > 0 ? '+' : ''}${input.quantityChange} (${label}), value ${formatMoney(value, { sign: true })}`,
      amount: value,
      status: 'adjusted',
      newValues: input,
    });
    return id;
  });
}

/** Units currently missing from a batch because of corrections (removed minus added back). */
export async function netRemovedByAdjustments(db: Db, batchId: string): Promise<number> {
  const r = await db.get<{ n: number }>('SELECT COALESCE(-SUM(quantity_change), 0) AS n FROM inventory_adjustments WHERE purchase_batch_id = ?', [batchId]);
  return Math.max(0, r?.n ?? 0);
}

export async function listAdjustments(db: Db, batchId: string): Promise<InventoryAdjustment[]> {
  return db.all<InventoryAdjustment>('SELECT * FROM inventory_adjustments WHERE purchase_batch_id = ? ORDER BY created_at DESC', [batchId]);
}
