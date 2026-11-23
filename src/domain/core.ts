import type { Db } from '../db/types';
import { nowISO } from './dates';

/** A business-rule violation with a message that is safe to show to the user. */
export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new BusinessError(message);
}

// ---------------------------------------------------------------- IDs
let uuidImpl: () => string = defaultUuid;

/** The app plugs in expo-crypto's randomUUID at startup; tests use Node's crypto. */
export function setUuidGenerator(fn: () => string) {
  uuidImpl = fn;
}

export function uuid(): string {
  return uuidImpl();
}

function defaultUuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // RFC4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export { nowISO };

// ---------------------------------------------------------------- references
export type RefPrefix = 'P' | 'S' | 'E' | 'A';

/** Human-friendly sequential references: P-0001 (purchase), S-0001 (sale), E-0001 (expense), A-0001 (adjustment). */
export async function nextReference(tx: Db, prefix: RefPrefix): Promise<string> {
  const key = `seq_${prefix}`;
  const row = await tx.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  const next = (row ? Number(row.value) : 0) + 1;
  await tx.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    key,
    String(next),
  ]);
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

// ---------------------------------------------------------------- audit log
export type AuditEntry = {
  action: string; // e.g. purchase.create, sale.cancel
  entityType: string;
  entityId?: string | null;
  reference?: string | null;
  summary: string;
  amount?: number | null;
  status?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
};

export async function audit(tx: Db, e: AuditEntry): Promise<void> {
  await tx.run(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, reference, summary, amount, status, old_values, new_values, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      e.action,
      e.entityType,
      e.entityId ?? null,
      e.reference ?? null,
      e.summary,
      e.amount ?? null,
      e.status ?? null,
      e.oldValues === undefined ? null : JSON.stringify(e.oldValues),
      e.newValues === undefined ? null : JSON.stringify(e.newValues),
      nowISO(),
    ],
  );
}

// ---------------------------------------------------------------- notifications
export type NotificationType = 'low_stock' | 'out_of_stock' | 'sale' | 'goal' | 'unpaid' | 'inventory' | 'system';

export type NewNotification = {
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** If set, a notification with the same key is never created twice. */
  dedupeKey?: string;
};

/** Inserts an in-app notification. Returns true if it was new (not a duplicate). */
export async function notify(tx: Db, n: NewNotification): Promise<boolean> {
  const res = await tx.run(
    `INSERT OR IGNORE INTO notifications (id, type, title, message, related_entity_type, related_entity_id, dedupe_key, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [uuid(), n.type, n.title, n.message, n.relatedEntityType ?? null, n.relatedEntityId ?? null, n.dedupeKey ?? null, nowISO()],
  );
  return res.changes > 0;
}

// ---------------------------------------------------------------- settings
export async function getSetting(db: Db, key: string): Promise<string | null> {
  const row = await db.get<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string | null): Promise<void> {
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    key,
    value,
  ]);
}

// ---------------------------------------------------------------- validation helpers
export function cleanText(s: string | null | undefined, max = 500): string | null {
  if (s == null) return null;
  const t = String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (!t) return null;
  return t.slice(0, max);
}

export function requireInt(n: unknown, name: string, min = 0): number {
  assert(typeof n === 'number' && Number.isInteger(n), `${name} must be a whole number.`);
  assert(n >= min, `${name} must be at least ${min}.`);
  return n;
}

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
