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
