export type SqliteBindValue = string | number | null | Uint8Array;
export type SqliteBindParams = Record<string, SqliteBindValue> | SqliteBindValue[];

export type SqliteRunResult = Readonly<{
  changes: number;
  lastInsertRowId: number;
}>;

export interface SqliteExecutor {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqliteBindParams): Promise<SqliteRunResult>;
  getFirstAsync<Row>(source: string, params?: SqliteBindParams): Promise<Row | null>;
  getAllAsync<Row>(source: string, params?: SqliteBindParams): Promise<Row[]>;
}

export interface SqliteDatabase extends SqliteExecutor {
  withExclusiveTransactionAsync(
    task: (transaction: SqliteExecutor) => Promise<void>,
  ): Promise<void>;
}

/**
 * A short-lived, read-only, synchronous handle. It exists for the one read that cannot be
 * asynchronous: the launch-time analytics consent answer, which has to be known before the
 * first React render because `Observe.configure()` runs at module scope. Nothing else may
 * use it; every other access goes through the async repository path.
 */
export interface SqliteSyncReader {
  getFirstSync<Row>(source: string): Row | null;
  closeSync(): void;
}
