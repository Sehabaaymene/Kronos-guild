import type { Db } from '../db/types';
import { backupStats, exportTables, importTables, makeBackup, referencedFiles, validateBackup, type BackupData } from '../domain/backup';
import { BusinessError, setSetting } from '../domain/core';
import { nowISO } from '../domain/dates';
import { IMAGES_DIR, readFileBase64, writeFileBase64 } from './files.web';
import { pickFile, saveOrShareFile } from './webIO';
import { idbEntries, idbDelete, idbSet, STORES } from './webStore';

/** Web-app version: same backup file format as the native app (fully compatible). */
async function buildBackupJson(db: Db): Promise<string> {
  const { tables } = await exportTables(db);
  const files: Record<string, string> = {};
  for (const p of await referencedFiles(db)) {
    const b64 = readFileBase64(p);
    if (b64) files[p] = b64;
  }
  return JSON.stringify(makeBackup(tables, files));
}

function stampName() {
  return `WatchBusiness-backup-${nowISO().slice(0, 19).replace(/[:T]/g, '-')}.json`;
}

/** Creates a backup and opens the share sheet (Save to Files / iCloud Drive) or downloads it. */
export async function shareBackup(db: Db): Promise<void> {
  const json = await buildBackupJson(db);
  await saveOrShareFile(new Blob([json], { type: 'application/json' }), stampName());
  await setSetting(db, 'last_backup_at', nowISO());
}

export async function pickBackup(): Promise<{ data: BackupData; stats: ReturnType<typeof backupStats>; name: string } | null> {
  const file = await pickFile('.json,application/json');
  if (!file) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new BusinessError('This file could not be read as a backup.');
  }
  const data = validateBackup(parsed);
  return { data, stats: backupStats(data), name: file.name };
}

/** Keeps a safety copy of the current data in the phone's storage, then replaces everything. */
export async function restoreBackup(db: Db, data: BackupData): Promise<void> {
  const safety = await buildBackupJson(db);
  await idbSet(STORES.kv, `safety:${nowISO()}`, safety);
  const old = (await idbEntries<string>(STORES.kv)).filter(([k]) => k.startsWith('safety:')).sort((a, b) => b[0].localeCompare(a[0]));
  for (const [k] of old.slice(3)) await idbDelete(STORES.kv, k);
  await importTables(db, data);
  for (const [path, b64] of Object.entries(data.files ?? {})) {
    if (path.startsWith(IMAGES_DIR + '/')) writeFileBase64(path, b64);
  }
  await setSetting(db, 'last_restore_at', nowISO());
}

/** Safety copies live in browser storage on web; they are restored through the native-format file instead. */
export function listSafetyBackups(): { name: string; uri: string; size: number }[] {
  return [];
}

export async function shareFileUri(_uri: string, _mimeType: string, _uti: string) {}
