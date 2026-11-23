/**
 * Minimal database interface used by all business logic.
 *
 * The app implements it with expo-sqlite (src/db/expoDb.ts) and the automated
 * tests implement it with Node's built-in SQLite (tests/helpers/nodeDb.ts).
 * Keeping business logic behind this interface is what lets us verify the
 * financial rules automatically on a computer, without a phone.
 */
export type SqlValue = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface Db {
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  /**
   * Runs `fn` atomically. If anything throws, every change made inside is
   * rolled back, so the database is never left half-updated.
   * Calling transaction() on a transaction handle simply reuses it.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
