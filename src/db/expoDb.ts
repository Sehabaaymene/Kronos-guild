import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { nowISO, setUuidGenerator } from '../domain/core';
import { migrate } from './schema';
import type { Db, SqlValue } from './types';

export const DB_NAME = 'watch-business.db';

let webQueue: Promise<void> = Promise.resolve();

type ExpoDbLike =Pick<SQLite.SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'execAsync'>;

function wrap(conn: ExpoDbLike, root: SQLite.SQLiteDatabase | null): Db {
  const db: Db = {
    async run(sql, params: SqlValue[] = []) {
      const r = await conn.runAsync(sql, params);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    async get<T>(sql: string, params: SqlValue[] = []) {
      return (await conn.getFirstAsync<T>(sql, params)) ?? null;
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return conn.getAllAsync<T>(sql, params);
    },
    async exec(sql) {
      await conn.execAsync(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      if (!root) return fn(db); // already inside a transaction
      let result: T | undefined;
      if (Platform.OS === 'web') {
        // Browser preview only: exclusive transactions are unavailable on web, so use a
        // regular transaction, serialised so two writes never overlap.
        const run = webQueue.then(() =>
          root.withTransactionAsync(async () => {
            result = await fn(wrap(root, null));
          }),
        );
        webQueue = run.catch(() => {});
        await run;
        return result as T;
      }
      // Exclusive transaction: no other query can interleave; any throw rolls everything back.
      await root.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(wrap(txn, null));
      });
      return result as T;
    },
  };
  return db;
}

let instance: Promise<Db> | null = null;

/** Opens (once) the on-device SQLite database and applies migrations. */
export function openAppDb(): Promise<Db> {
  if (!instance) {
    instance = (async () => {
      setUuidGenerator(() => Crypto.randomUUID());
      const raw = await SQLite.openDatabaseAsync(DB_NAME);
      await raw.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const db = wrap(raw, raw);
      await migrate(db, nowISO, () => Crypto.randomUUID());
      return db;
    })();
    instance.catch(() => {
      instance = null;
    });
  }
  return instance;
}
