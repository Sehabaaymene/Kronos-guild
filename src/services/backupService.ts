import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Db } from '../db/types';
import { backupStats, exportTables, importTables, makeBackup, referencedFiles, validateBackup, type BackupData } from '../domain/backup';
import { BusinessError, setSetting } from '../domain/core';
import { nowISO, today } from '../domain/dates';
import { IMAGES_DIR, readFileBase64, writeFileBase64 } from './files';

const SAFETY_DIR = 'backups';

/** Builds a complete backup: every table + every picture (base64) in one .json file. */
export async function buildBackupFile(db: Db, opts: { folder?: 'cache' | 'safety' } = {}): Promise<File> {
  const { tables } = await exportTables(db);
  const files: Record<string, string> = {};
  for (const p of await referencedFiles(db)) {
    const b64 = readFileBase64(p);
    if (b64) files[p] = b64;
  }
  const data = makeBackup(tables, files);
  const stamp = nowISO().slice(0, 19).replace(/[:T]/g, '-');
  const dir = opts.folder === 'safety' ? new Directory(Paths.document, SAFETY_DIR) : Paths.cache;
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `WatchBusiness-backup-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(data));
  return file;
}

/** Creates a backup and opens the iOS share sheet (Save to Files, AirDrop, email to yourself…). */
export async function shareBackup(db: Db): Promise<void> {
  const file = await buildBackupFile(db);
  if (!(await Sharing.isAvailableAsync())) throw new BusinessError('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your backup' });
  await setSetting(db, 'last_backup_at', nowISO());
}

/** Lets the user pick a backup file and returns its parsed, validated content (nothing is changed yet). */
export async function pickBackup(): Promise<{ data: BackupData; stats: ReturnType<typeof backupStats>; name: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  if (asset.size && asset.size > 500 * 1024 * 1024) throw new BusinessError('This file is too large to be a backup.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await new File(asset.uri).text());
  } catch {
    throw new BusinessError('This file could not be read as a backup.');
  }
  const data = validateBackup(parsed);
  return { data, stats: backupStats(data), name: asset.name };
}

/**
 * Replaces all current data with the backup. A safety copy of the current
 * data is saved on the phone first (Documents/backups) so a mistaken restore
 * can itself be undone.
 */
export async function restoreBackup(db: Db, data: BackupData): Promise<void> {
  await buildBackupFile(db, { folder: 'safety' });
  await importTables(db, data);
  for (const [path, b64] of Object.entries(data.files ?? {})) {
    if (path.startsWith(IMAGES_DIR + '/')) writeFileBase64(path, b64);
  }
  await setSetting(db, 'last_restore_at', nowISO());
}

export function listSafetyBackups(): { name: string; uri: string; size: number }[] {
  try {
    const dir = new Directory(Paths.document, SAFETY_DIR);
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((f): f is File => f instanceof File && f.name.endsWith('.json'))
      .map((f) => ({ name: f.name, uri: f.uri, size: f.size }))
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return []; // storage unavailable (e.g. browser preview) — never break the Settings screen
  }
}

export async function shareFileUri(uri: string, mimeType: string, uti: string) {
  await Sharing.shareAsync(uri, { mimeType, UTI: uti });
}

export function backupFileNameDate() {
  return today();
}
