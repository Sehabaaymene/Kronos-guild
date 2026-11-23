/**
 * Tiny IndexedDB key-value store (web app only). Safari keeps this data on
 * the iPhone; web apps added to the Home Screen get their own storage that
 * Safari does not clear automatically.
 */
const DB = 'watch-business';
const VERSION = 1;
export const STORES = { kv: 'kv', files: 'files' } as const;

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORES.kv)) db.createObjectStore(STORES.kv);
        if (!db.objectStoreNames.contains(STORES.files)) db.createObjectStore(STORES.files);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return opening;
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(store: string, key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(store: string, key: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbEntries<T>(store: string): Promise<[string, T][]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out: [string, T][] = [];
    const req = db.transaction(store, 'readonly').objectStore(store).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push([String(cur.key), cur.value as T]);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Asks the browser to never evict this app's data (best effort). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
