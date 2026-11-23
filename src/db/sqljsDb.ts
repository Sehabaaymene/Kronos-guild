import type { Db, SqlValue } from './types';

/** Minimal shape of a sql.js Database that we use (keeps this file testable in Node). */
export interface SqlJsDatabase {
  prepare(sql: string): {
    bind(params?: SqlValue[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, SqlValue>;
    free(): boolean;
  };
  exec(sql: string): unknown;
  getRowsModified(): number;
}

/**
 * Wraps a sql.js (SQLite compiled to WebAssembly) database in our Db interface.
 * Used by the installable web app on iPhone. `onCommitted` is called after
 * every change that is final (outside a transaction, or after COMMIT) so the
 * caller can save the database to the phone's storage.
 */
export function wrapSqlJs(raw: SqlJsDatabase, onCommitted: () => void): Db & { inTransaction(): boolean } {
  let inTx = false;
  let queue: Promise<unknown> = Promise.resolve();

  const run = (sql: string, params: SqlValue[] = []) => {
    const st = raw.prepare(sql);
    try {
      st.bind(params);
      st.step();
    } finally {
      st.free();
    }
    return raw.getRowsModified();
  };

  const db: Db & { inTransaction(): boolean } = {
    inTransaction: () => inTx,
    async run(sql, params = []) {
      const changes = run(sql, params);
      if (!inTx) onCommitted();
      return { changes, lastInsertRowId: 0 };
    },
    async get<T>(sql: string, params: SqlValue[] = []) {
      const st = raw.prepare(sql);
      try {
        st.bind(params);
        return st.step() ? (st.getAsObject() as T) : null;
      } finally {
        st.free();
      }
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      const st = raw.prepare(sql);
      const rows: T[] = [];
      try {
        st.bind(params);
        while (st.step()) rows.push(st.getAsObject() as T);
      } finally {
        st.free();
      }
      return rows;
    },
    async exec(sql) {
      raw.exec(sql);
      if (!inTx) onCommitted();
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      if (inTx) return fn(db);
      // Transactions run one at a time; a throw rolls everything back.
      const job = queue.then(async () => {
        raw.exec('BEGIN IMMEDIATE');
        inTx = true;
        try {
          const result = await fn(db);
          raw.exec('COMMIT');
          inTx = false;
          onCommitted();
          return result;
        } catch (e) {
          inTx = false;
          try {
            raw.exec('ROLLBACK');
          } catch {
            // already rolled back
          }
          throw e;
        }
      });
      queue = job.catch(() => {});
      return job;
    },
  };
  return db;
}
