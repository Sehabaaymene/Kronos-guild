import { BusinessError, uuid } from '../domain/core';
import { imageToJpegDataUrl, pickFile } from './webIO';
import { idbDelete, idbEntries, idbSet, STORES } from './webStore';

/**
 * Web-app version of picture storage. Pictures are resized and kept in the
 * phone's browser storage (IndexedDB) under the same relative paths the
 * native app uses ("images/<id>.jpg"), so backups are compatible both ways.
 */
export const IMAGES_DIR = 'images';
const MAX_BYTES = 25 * 1024 * 1024;
const cache = new Map<string, string>(); // path → data URL

/** Loads all saved pictures into memory (called once when the app starts). */
export async function loadWebFiles(): Promise<void> {
  for (const [path, data] of await idbEntries<string>(STORES.files)) cache.set(path, data);
}

export function resolveFile(relativePath: string | null | undefined): string | null {
  return relativePath ? (cache.get(relativePath) ?? null) : null;
}

export type ImageSource = 'camera' | 'library';

export async function pickAndSaveImage(source: ImageSource, _opts: { square?: boolean } = {}): Promise<string | null> {
  const file = await pickFile('image/*', source === 'camera' ? 'environment' : undefined);
  if (!file) return null;
  if (file.type && !file.type.startsWith('image/')) throw new BusinessError('Please choose a photo.');
  if (file.size > MAX_BYTES) throw new BusinessError('This picture is too large.');
  const dataUrl = await imageToJpegDataUrl(file);
  const path = `${IMAGES_DIR}/${uuid()}.jpg`;
  cache.set(path, dataUrl);
  await idbSet(STORES.files, path, dataUrl);
  return path;
}

export function deleteStoredFile(relativePath: string | null | undefined) {
  if (!relativePath) return;
  cache.delete(relativePath);
  idbDelete(STORES.files, relativePath).catch(() => {});
}

export function readFileBase64(relativePath: string): string | null {
  const d = cache.get(relativePath);
  return d ? d.slice(d.indexOf(',') + 1) : null;
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };

export function writeFileBase64(relativePath: string, base64: string) {
  const safe = relativePath.replace(/\\/g, '/');
  if (!/^images\/[A-Za-z0-9._-]+$/.test(safe)) return;
  const ext = safe.split('.').pop()?.toLowerCase() ?? 'jpg';
  const dataUrl = `data:${MIME[ext] ?? 'image/jpeg'};base64,${base64}`;
  cache.set(safe, dataUrl);
  idbSet(STORES.files, safe, dataUrl).catch(() => {});
}
