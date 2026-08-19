/**
 * The narrow database surface the rest of the app is written against.
 *
 * It is deliberately a structural subset of expo-sqlite's `SQLiteDatabase`, so
 * the production adapter in database.ts is close to an identity function, while
 * the test suite can drive the exact same repository, migration and backup code
 * against an in-memory SQLite build. Nothing in this file imports expo or
 * react-native, which is what keeps that possible.
 */

export type SqlParam = string | number | null;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDatabase {
  /** Runs one or more statements with no parameters. */
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlParam[]): Promise<SqlRunResult>;
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  /**
   * Runs `task` inside a transaction, committing on success and rolling back if
   * it throws. Every multi-table write in this app goes through here.
   */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** Minimal key-value surface, so migration code can read AsyncStorage without importing it. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
