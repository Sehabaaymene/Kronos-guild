import type { Db, SqlValue } from '../db/types';
import { SCHEMA_VERSION, TABLES_IN_ORDER } from '../db/schema';
import { BusinessError, nowISO } from './core';

export const BACKUP_FORMAT = 'watch-business-manager-backup';
export const BACKUP_VERSION = 1;

export type BackupData = {
  format: typeof BACKUP_FORMAT;
  version: number;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, Record<string, SqlValue>[]>;
  /** relative image path → base64 file content */
  files: Record<string, string>;
};

/** Reads every table into a plain object (images are added by the app layer). */
export async function exportTables(db: Db): Promise<Pick<BackupData, 'tables' | 'schemaVersion'>> {
  const tables: BackupData['tables'] = {};
  for (const t of TABLES_IN_ORDER) tables[t] = await db.all<Record<string, SqlValue>>(`SELECT * FROM ${t}`);
  return { tables, schemaVersion: SCHEMA_VERSION };
}

export function makeBackup(tables: BackupData['tables'], files: Record<string, string>): BackupData {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: nowISO(), tables, files };
}

export function validateBackup(data: unknown): BackupData {
  const d = data as Partial<BackupData> | null;
  if (!d || typeof d !== 'object' || d.format !== BACKUP_FORMAT) throw new BusinessError('This file is not a Watch Business backup.');
  if (typeof d.schemaVersion !== 'number' || d.schemaVersion > SCHEMA_VERSION) {
    throw new BusinessError('This backup was made by a newer version of the app. Update the app first.');
  }
  if (!d.tables || typeof d.tables !== 'object') throw new BusinessError('The backup file is damaged (no tables).');
  return { ...(d as BackupData), files: d.files ?? {} };
}

export function backupStats(data: BackupData) {
  const n = (t: string) => data.tables[t]?.length ?? 0;
  return {
    exportedAt: data.exportedAt,
    products: n('products'),
    purchases: n('purchase_batches'),
    sales: n('sales'),
    expenses: n('expenses'),
    goals: n('goals'),
    images: Object.keys(data.files ?? {}).length,
  };
}

/**
 * Replaces ALL business data with the backup's content, atomically: if any row
 * fails to insert, nothing is changed. Columns are matched by name so older
 * backups (fewer columns) still restore.
 */
export async function importTables(db: Db, data: BackupData): Promise<void> {
  await db.transaction(async (tx) => {
    for (const t of [...TABLES_IN_ORDER].reverse()) await tx.run(`DELETE FROM ${t}`);
    for (const t of TABLES_IN_ORDER) {
      const rows = data.tables[t] ?? [];
      if (!rows.length) continue;
      const cols = (await tx.all<{ name: string }>(`PRAGMA table_info(${t})`)).map((c) => c.name);
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => cols.includes(k));
        if (!keys.length) continue;
        await tx.run(
          `INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
          keys.map((k) => row[k] as SqlValue),
        );
      }
    }
  });
}

/** Every relative file path referenced by the data (product pictures, receipts, logo). */
export async function referencedFiles(db: Db): Promise<string[]> {
  const rows = await db.all<{ p: string | null }>(
    `SELECT image_path AS p FROM products UNION SELECT receipt_path FROM purchase_batches
     UNION SELECT receipt_path FROM expenses UNION SELECT value FROM settings WHERE key = 'logo_path'`,
  );
  return rows.map((r) => r.p).filter((p): p is string => !!p);
}
