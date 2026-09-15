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

const databaseName = 'kuyara.db';
// expo-sqlite sets no busy_timeout, so every connection starts at 0 and the first lock
// conflict fails instead of waiting. Five seconds outlasts any statement here and stays
// inside the ten seconds the app already waits for weather, so a deadlock is an error, not a hang.
const busyTimeoutMs = 5000;

class ExpoSqliteDatabase extends ExpoSqliteExecutor implements SqliteDatabase {
  async withExclusiveTransactionAsync(
    task: (transaction: SqliteExecutor) => Promise<void>,
  ): Promise<void> {
    // The same fresh connection expo's own transaction helper would open, bypassing its
    // connection cache on both platforms, but with kuyara's pragmas and lock mode. Both
    // pragmas must precede BEGIN: busy_timeout has to exist before the lock is requested, and
    // SQLite ignores foreign_keys inside a transaction.
    const transactionConnection = await openDatabaseAsync(databaseName, { useNewConnection: true });
    try {
      await transactionConnection.execAsync(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
      await transactionConnection.execAsync('PRAGMA foreign_keys = ON;');
      // IMMEDIATE takes the write lock up front so the busy handler is consulted. A deferred
      // BEGIN whose body reads first (every migration) gets SQLITE_BUSY or BUSY_SNAPSHOT after
      // 0 ms instead. It sits outside the inner try so a lock failure propagates as itself.
      await transactionConnection.execAsync('BEGIN IMMEDIATE;');
      try {
        await task(new ExpoSqliteExecutor(transactionConnection));
        await transactionConnection.execAsync('COMMIT;');
      } catch (error) {
        // COMMIT can fail and leave the transaction open (SQLITE_BUSY) or already rolled back
        // (SQLITE_FULL, IOERR); ask before rolling back so the body's error survives.
        if (await transactionConnection.isInTransactionAsync()) {
          await transactionConnection.execAsync('ROLLBACK;');
        }
        throw error;
      }
    } finally {
      // Refcount is 1 on a useNewConnection handle, so this closes the native connection and
      // sqlite3_close rolls back anything still open: a throw above cannot leak a lock.
      await transactionConnection.closeAsync();
    }
  }
}

let connection: Promise<SqliteDatabase> | null = null;

async function openConnection(): Promise<SqliteDatabase> {
  const database = await openDatabaseAsync(databaseName);
  // Covers this shared connection only, the one every read and write outside a transaction
  // uses; each transaction body gets the same value on its own connection above.
  await database.execAsync(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
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
 * A separate, short-lived connection for the launch-time consent read. It is opened outside
 * expo's connection cache (`useNewConnection: true`), so it can never share or release the
 * memoized handle above: its `closeSync` closes only itself. It opens the same file the async
 * path opens, so on a first launch it creates the empty database the migrations then
 * populate. It never writes and never opens a transaction, so it cannot interfere with
 * migrations or the repositories.
 */
export function openKuyaraDatabaseSync(): SqliteSyncReader {
  const database = openDatabaseSync(databaseName, { useNewConnection: true });
  return {
    getFirstSync: <Row,>(source: string) => database.getFirstSync<Row>(source),
    closeSync: () => database.closeSync(),
  };
}
