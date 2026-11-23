/// <reference types="node" />
// Tests run on a computer with Node, so they can use Node's built-in modules.
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../src/db/schema';
import { wrapSqlJs, type SqlJsDatabase } from '../../src/db/sqljsDb';
import type { Db, SqlValue } from '../../src/db/types';
import { nowISO, setUuidGenerator } from '../../src/domain/core';

/** In-memory SQLite database implementing the same Db interface the app uses. */
export function createNodeDb(): Db {
  const raw = new DatabaseSync(':memory:');
  let depth = 0;
  const db: Db = {
    async run(sql, params = []) {
      const r = raw.prepare(sql).run(...(params as SqlValue[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async get<T>(sql: string, params: SqlValue[] = []) {
      return ((raw.prepare(sql).get(...params) as T | undefined) ?? null) as T | null;
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async exec(sql) {
      raw.exec(sql);
    },
    async transaction(fn) {
      if (depth > 0) return fn(db);
      depth++;
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(db);
        raw.exec('COMMIT');
        return result;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return db;
}

/**
 * Fresh migrated database. DB_ENGINE=sqljs runs the same tests against the
 * sql.js engine used by the iPhone web app (see vitest.config.mts).
 */
export async function freshDb(): Promise<Db> {
  setUuidGenerator(randomUUID);
  let db: Db;
  if (process.env.DB_ENGINE === 'sqljs') {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const raw = new SQL.Database();
    raw.exec('PRAGMA foreign_keys = ON;');
    db = wrapSqlJs(raw as unknown as SqlJsDatabase, () => {});
  } else {
    db = createNodeDb();
  }
  await migrate(db, nowISO, randomUUID);
  return db;
}
