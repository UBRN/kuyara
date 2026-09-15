import {
  openDatabaseAsync,
  openDatabaseSync,
  type SQLiteBindParams,
  type SQLiteDatabase,
} from 'expo-sqlite';

import type {
  SqliteBindParams,
  SqliteDatabase,
  SqliteExecutor,
  SqliteRunResult,
  SqliteSyncReader,
} from '@/infrastructure/sqlite/sqlite-database';

class ExpoSqliteExecutor implements SqliteExecutor {
  protected readonly database: SQLiteDatabase;

  constructor(database: SQLiteDatabase) {
    this.database = database;
  }

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

let connection: Promise<SqliteDatabase> | null = null;

async function openConnection(): Promise<SqliteDatabase> {
  const database = await openDatabaseAsync('kuyara.db');
  // expo-sqlite sets no busy_timeout and builds sqlite3 without SQLITE_DEFAULT_BUSY_TIMEOUT,
  // so every connection starts at 0 and the first lock conflict fails instead of waiting.
  // Five seconds is far longer than any statement here needs and still well inside the ten
  // seconds the app already waits for weather, so a real deadlock surfaces as an error
  // rather than a hung launch. It covers this connection only, the one every read and write
  // outside a transaction uses; `withExclusiveTransactionAsync` opens each body on its own
  // connection (`useNewConnection: true`), which keeps the default of 0.
  await database.execAsync('PRAGMA busy_timeout = 5000;');
  return new ExpoSqliteDatabase(database);
}

/**
 * Six composition roots open the database independently. expo-sqlite already hands them one
 * shared native connection, but each call used to wrap it in a new object, so the migration
 * memo in `migrateDatabase` had nothing stable to key on. Memoizing the open promise gives
 * all of them the same handle. A failed open is not cached: the next caller retries.
 */
export function openKuyaraDatabase(): Promise<SqliteDatabase> {
  if (!connection) {
    connection = openConnection().catch((error: unknown) => {
      connection = null;
      throw error;
    });
  }

  return connection;
}

/**
 * A separate, short-lived connection for the launch-time consent read. It opens the same
 * file the async path opens, so on a first launch it creates the empty database the
 * migrations then populate, and the caller closes it immediately. It never writes and never
 * opens a transaction, so it cannot interfere with migrations or the repositories.
 */
export function openKuyaraDatabaseSync(): SqliteSyncReader {
  const database = openDatabaseSync('kuyara.db');
  return {
    getFirstSync: <Row,>(source: string) => database.getFirstSync<Row>(source),
    closeSync: () => database.closeSync(),
  };
}
