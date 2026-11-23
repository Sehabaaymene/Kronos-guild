import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import { nowISO, setUuidGenerator, uuid } from '../domain/core';
import { loadWebFiles } from '../services/files.web';
import { idbGet, idbSet, requestPersistentStorage, STORES } from '../services/webStore';
import { migrate } from './schema';
import { wrapSqlJs, type SqlJsDatabase } from './sqljsDb';
import type { Db } from './types';

/**
 * Web-app version of the database (used when the app is installed from Safari
 * to the iPhone Home Screen). SQLite runs inside the page (sql.js) and the
 * whole database file is saved to the phone's storage (IndexedDB) after every
 * committed change. Nothing is sent to any server.
 */
export const DB_NAME = 'watch-business.db';
const KEY = 'database';

let instance: Promise<Db> | null = null;

export function openAppDb(): Promise<Db> {
  if (!instance) {
    instance = (async () => {
      setUuidGenerator(() => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : uuid()));
      await requestPersistentStorage();
      const SQL = await initSqlJs();
      const saved = await idbGet<Uint8Array>(STORES.kv, KEY);
      const raw = (saved ? new SQL.Database(saved) : new SQL.Database()) as unknown as SqlJsDatabase & { export(): Uint8Array };
      raw.exec('PRAGMA foreign_keys = ON;');

      let saving: Promise<void> = Promise.resolve();
      let scheduled = false;
      let db: ReturnType<typeof wrapSqlJs>;
      const persist = () => {
        if (scheduled) return;
        scheduled = true;
        // Coalesce several writes made in the same tick into one save.
        queueMicrotask(() => {
          scheduled = false;
          if (db.inTransaction()) return; // the COMMIT will save

          const bytes = raw.export(); // note: export() resets PRAGMAs
          raw.exec('PRAGMA foreign_keys = ON;');
          saving = saving.then(() => idbSet(STORES.kv, KEY, bytes)).catch((e) => console.error('Could not save data', e));
        });
      };

      db = wrapSqlJs(raw, persist);
      await migrate(db, nowISO, uuid);
      await loadWebFiles();
      return db;
    })();
    instance.catch(() => {
      instance = null;
    });
  }
  return instance;
}
