import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import type { KeyValueStore, SqlDatabase, SqlParam } from '../../../src/lib/sqlite/types';

/**
 * Real SQLite, in memory, behind the same `SqlDatabase` interface the app uses.
 *
 * This is what makes the migration and repository tests meaningful: foreign
 * keys, transactions, rollback and constraint violations all behave exactly as
 * they will on a device, rather than being simulated by a hand-written double.
 */

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;

let runtime: Promise<SqlJsStatic> | null = null;

function sqlJs(): Promise<SqlJsStatic> {
  runtime ??= initSqlJs();
  return runtime;
}

/** sql.js is synchronous; the async signatures here just satisfy the interface. */
function adapt(database: Database): SqlDatabase {
  let depth = 0;

  return {
    async execAsync(sql: string): Promise<void> {
      database.exec(sql);
    },

    async runAsync(sql: string, params: SqlParam[] = []) {
      database.run(sql, params);
      const [result] = database.exec('SELECT last_insert_rowid() AS id');
      const lastInsertRowId = Number(result?.values[0]?.[0] ?? 0);
      return { changes: database.getRowsModified(), lastInsertRowId };
    },

    async getAllAsync<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
      const statement = database.prepare(sql);
      try {
        statement.bind(params);
        const rows: T[] = [];
        while (statement.step()) rows.push(statement.getAsObject() as T);
        return rows;
      } finally {
        statement.free();
      }
    },

    async getFirstAsync<T>(sql: string, params: SqlParam[] = []): Promise<T | null> {
      const statement = database.prepare(sql);
      try {
        statement.bind(params);
        return statement.step() ? (statement.getAsObject() as T) : null;
      } finally {
        statement.free();
      }
    },

    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      // Nested calls join the outer transaction, matching expo-sqlite, so a
      // repository helper can be called either standalone or from a larger write.
      if (depth > 0) {
        depth += 1;
        try {
          await task();
        } finally {
          depth -= 1;
        }
        return;
      }

      depth = 1;
      database.run('BEGIN');
      try {
        await task();
        database.run('COMMIT');
      } catch (error) {
        database.run('ROLLBACK');
        throw error;
      } finally {
        depth = 0;
      }
    },
  };
}

export async function openTestDatabase(): Promise<SqlDatabase> {
  const SQL = await sqlJs();
  return adapt(new SQL.Database());
}

/** In-memory stand-in for AsyncStorage. */
export class MemoryKeyValueStore implements KeyValueStore {
  constructor(private readonly entries = new Map<string, string>()) {}

  async getItem(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.entries.set(key, value);
  }

  /** Test helper: assert the legacy source was left untouched. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.entries);
  }
}
