import {
  openDatabaseAsync,
  type SQLiteBindParams,
  type SQLiteDatabase,
} from 'expo-sqlite';

import type {
  SqliteBindParams,
  SqliteDatabase,
  SqliteExecutor,
  SqliteRunResult,
} from '@/infrastructure/sqlite/sqlite-database';

class ExpoSqliteExecutor implements SqliteExecutor {
  constructor(protected readonly database: SQLiteDatabase) {}

  execAsync(source: string): Promise<void> {
    return this.database.execAsync(source);
  }

  async runAsync(source: string, params: SqliteBindParams = []): Promise<SqliteRunResult> {
    return this.database.runAsync(source, params as SQLiteBindParams);
  }

  getFirstAsync<Row>(source: string, params: SqliteBindParams = []): Promise<Row | null> {
    return this.database.getFirstAsync<Row>(source, params as SQLiteBindParams);
  }

  getAllAsync<Row>(source: string, params: SqliteBindParams = []): Promise<Row[]> {
    return this.database.getAllAsync<Row>(source, params as SQLiteBindParams);
  }
}

class ExpoSqliteDatabase extends ExpoSqliteExecutor implements SqliteDatabase {
  withExclusiveTransactionAsync(
    task: (transaction: SqliteExecutor) => Promise<void>,
  ): Promise<void> {
    return this.database.withExclusiveTransactionAsync((transaction) =>
      task(new ExpoSqliteExecutor(transaction)),
    );
  }
}

export async function openKuyaraDatabase(): Promise<SqliteDatabase> {
  const database = await openDatabaseAsync('kuyara.db');
  return new ExpoSqliteDatabase(database);
}
