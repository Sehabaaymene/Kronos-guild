import type { Db } from '../db/types';
import { getSetting, notify, nowISO, uuid } from './core';
import { addDays, today } from './dates';
import { checkGoalMilestones } from './goals';
import { formatMoney } from './money';

export type AlertEvent = { kind: 'stock' | 'goal' | 'unpaid'; title: string; message: string };

/**
 * Low-stock / out-of-stock alerts. Each product remembers its alert state
 * (ok → low → out). A notification is created only when the state gets worse,
 * so opening the app never produces duplicates. Restocking resets the state.
 */
export async function checkStockAlerts(db: Db): Promise<AlertEvent[]> {
  const rows = await db.all<{ id: string; label: string; stock: number; threshold: number; state: 'ok' | 'low' | 'out' }>(
    `SELECT p.id, br.name || ' ' || p.model AS label, p.low_stock_threshold AS threshold, p.stock_alert_state AS state,
       COALESCE((SELECT SUM(quantity_remaining) FROM purchase_batches b WHERE b.product_id = p.id), 0) AS stock
     FROM products p JOIN brands br ON br.id = p.brand_id
     WHERE EXISTS (SELECT 1 FROM purchase_batches b WHERE b.product_id = p.id)`,
  );
  const events: AlertEvent[] = [];
  for (const r of rows) {
    const next: 'ok' | 'low' | 'out' = r.stock <= 0 ? 'out' : r.stock <= r.threshold ? 'low' : 'ok';
    if (next === r.state) continue;
    await db.run('UPDATE products SET stock_alert_state = ? WHERE id = ?', [next, r.id]);
    if (next === 'ok') continue;
    const worse = r.state === 'ok' || (r.state === 'low' && next === 'out');
    if (!worse) continue;
    const title = next === 'out' ? `Out of stock: ${r.label}` : `Low stock: ${r.label}`;
    const message =
      next === 'out' ? `${r.label} has no units left.` : `Only ${r.stock} unit(s) left (alert threshold: ${r.threshold}).`;
    await db.run(
      `INSERT INTO notifications (id, type, title, message, related_entity_type, related_entity_id, is_read, created_at)
       VALUES (?, ?, ?, ?, 'product', ?, 0, ?)`,
      [uuid(), next === 'out' ? 'out_of_stock' : 'low_stock', title, message, r.id, nowISO()],
    );
    events.push({ kind: 'stock', title, message });
  }
  return events;
}

/** One reminder per sale that is still (partly) unpaid N days after the sale. */
export async function checkUnpaidAlerts(db: Db, ref = today()): Promise<AlertEvent[]> {
  const days = Number((await getSetting(db, 'unpaid_alert_days')) ?? 3);
  const cutoff = addDays(ref, -days);
  const rows = await db.all<{ id: string; reference: string; customer_name: string | null; balance: number }>(
    `SELECT id, reference, customer_name, total_revenue - amount_paid AS balance FROM sales
     WHERE status = 'completed' AND total_revenue > amount_paid AND sale_date <= ?`,
    [cutoff],
  );
  const events: AlertEvent[] = [];
  for (const r of rows) {
    const title = `Unpaid balance: ${r.reference}`;
    const message = `${r.customer_name ?? 'Customer'} still owes ${formatMoney(r.balance)}.`;
    if (await notify(db, { type: 'unpaid', title, message, relatedEntityType: 'sale', relatedEntityId: r.id, dedupeKey: `unpaid:${r.id}` })) {
      events.push({ kind: 'unpaid', title, message });
    }
  }
  return events;
}

/** Runs every alert check. Called after each change and when the app opens. */
export async function runAlertChecks(db: Db): Promise<AlertEvent[]> {
  const stock = await checkStockAlerts(db);
  const goals = (await checkGoalMilestones(db)).map<AlertEvent>((g) => ({ kind: 'goal', title: g.title, message: g.message }));
  const unpaid = await checkUnpaidAlerts(db);
  return [...stock, ...goals, ...unpaid];
}

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: number;
  created_at: string;
};

export async function listNotifications(db: Db, limit = 200): Promise<AppNotification[]> {
  return db.all<AppNotification>('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?', [limit]);
}

export async function unreadCount(db: Db): Promise<number> {
  const r = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE is_read = 0');
  return r?.n ?? 0;
}

export async function markRead(db: Db, id?: string): Promise<void> {
  if (id) await db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
  else await db.run('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
}

export async function clearReadNotifications(db: Db): Promise<void> {
  // Goal milestone keys must survive so milestones are never re-announced; only their visibility is removed.
  await db.run(`DELETE FROM notifications WHERE is_read = 1 AND (dedupe_key IS NULL OR dedupe_key LIKE 'sale:%')`);
}
