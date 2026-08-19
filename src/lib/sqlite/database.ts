import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { migrateSchema } from './schema';
import type { KeyValueStore, SqlDatabase, SqlParam } from './types';

/**
 * The one place expo-sqlite is touched.
 *
 * Everything above this file works against the `SqlDatabase` interface, which
 * is why the schema, repositories, migration and backup code can be tested
 * against a real SQLite engine outside React Native.
 */

export const DATABASE_NAME = 'wordping.db';

function adapt(database: SQLite.SQLiteDatabase): SqlDatabase {
  return {
    execAsync: sql => database.execAsync(sql),
    runAsync: (sql, params = []) => database.runAsync(sql, params as SQLite.SQLiteBindValue[]),
    getAllAsync: <T,>(sql: string, params: SqlParam[] = []) =>
      database.getAllAsync<T>(sql, params as SQLite.SQLiteBindValue[]) as Promise<T[]>,
    getFirstAsync: <T,>(sql: string, params: SqlParam[] = []) =>
      database.getFirstAsync<T>(sql, params as SQLite.SQLiteBindValue[]) as Promise<T | null>,
    withTransactionAsync: task => database.withTransactionAsync(task),
  };
}

let connection: Promise<SqlDatabase> | null = null;

/**
 * Opens the database and brings the schema up to date, once per app launch.
 *
 * The promise is cached rather than the resolved value so concurrent callers
 * during startup share a single open, and a failure clears the cache so a later
 * call can retry rather than being stuck with a rejected promise forever.
 */
export function getDatabase(): Promise<SqlDatabase> {
  connection ??= (async () => {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    const db = adapt(database);
    await migrateSchema(db);
    return db;
  })().catch(error => {
    connection = null;
    throw error;
  });
  return connection;
}

/** Test and teardown hook. The next getDatabase() call reopens from scratch. */
export function resetDatabaseConnection(): void {
  connection = null;
}

/** AsyncStorage behind the narrow interface the migration code expects. */
export const asyncStorageAdapter: KeyValueStore = {
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};
