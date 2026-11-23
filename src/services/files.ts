import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { BusinessError, uuid } from '../domain/core';

/**
 * Pictures (watches, receipts, logo) are copied into the app's private
 * Documents folder. The database stores a RELATIVE path such as
 * "images/abc.jpg" because iOS can change the absolute container path after
 * an app update — relative paths always keep working.
 */
export const IMAGES_DIR = 'images';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];

function imagesDir(): Directory {
  const dir = new Directory(Paths.document, IMAGES_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Turns a stored relative path into a file:// URI that <Image> can display. */
export function resolveFile(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  try {
    const f = new File(Paths.document, relativePath);
    return f.exists ? f.uri : null;
  } catch {
    return null; // e.g. web preview, where there is no app Documents folder
  }
}

export type ImageSource = 'camera' | 'library';

/** Opens the camera or photo library; returns the saved relative path, or null if cancelled. */
export async function pickAndSaveImage(source: ImageSource, opts: { square?: boolean } = {}): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new BusinessError('Camera access is off. Enable it in iPhone Settings › Watch Business › Camera.');
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new BusinessError('Photo access is off. Enable it in iPhone Settings › Watch Business › Photos.');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: !!opts.square,
    aspect: opts.square ? [1, 1] : undefined,
    exif: false,
  };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.mimeType && !ALLOWED.includes(asset.mimeType.toLowerCase())) {
    throw new BusinessError('Please choose a photo (JPEG, PNG or HEIC).');
  }
  if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) throw new BusinessError('This picture is larger than 15 MB.');
  const src = new File(asset.uri);
  const ext = (src.extension || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
  const name = `${uuid()}${ext.startsWith('.') ? ext : '.' + ext}`;
  const dest = new File(imagesDir(), name);
  src.copy(dest);
  return `${IMAGES_DIR}/${name}`;
}

/** Deletes a stored picture (ignored if missing). */
export function deleteStoredFile(relativePath: string | null | undefined) {
  if (!relativePath) return;
  try {
    const f = new File(Paths.document, relativePath);
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
}

export function readFileBase64(relativePath: string): string | null {
  try {
    const f = new File(Paths.document, relativePath);
    return f.exists ? f.base64Sync() : null;
  } catch {
    return null;
  }
}

export function writeFileBase64(relativePath: string, base64: string) {
  const safe = relativePath.replace(/\\/g, '/');
  if (!/^images\/[A-Za-z0-9._-]+$/.test(safe)) return; // never write outside the images folder
  imagesDir();
  const f = new File(Paths.document, safe);
  if (f.exists) f.delete();
  f.create();
  f.write(base64, { encoding: 'base64' });
}
