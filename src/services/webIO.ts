/** Browser helpers for choosing and saving files (web app only). */

/** Opens the iPhone/computer file chooser. Resolves null if the user cancels. */
export function pickFile(accept: string, capture?: 'environment'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    let done = false;
    const finish = (f: File | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Saves a file: on iPhone opens the share sheet (Save to Files, AirDrop, Mail…);
 * otherwise downloads it.
 */
export async function saveOrShareFile(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user closed the share sheet
      // NotAllowedError etc. → fall back to a normal download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Shrinks a photo to max `maxSize` px and returns a JPEG data URL (keeps storage small). */
export function imageToJpegDataUrl(file: File, maxSize = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This picture could not be read.'));
    };
    img.src = url;
  });
}
