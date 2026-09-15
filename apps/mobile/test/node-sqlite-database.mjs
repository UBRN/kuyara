import { DatabaseSync } from 'node:sqlite';

function bindStatement(statement, params) {
  if (Array.isArray(params)) {
    return params;
  }

  return params ?? {};
}

export class NodeSqliteDatabase {
  // A second wrapper over the same connection stands in for a second caller that
  // `migrateDatabase` does not recognise, so the idempotency tests still re-run the chain.
  constructor(database = new DatabaseSync(':memory:')) {
    this.database = database;
  }

  async execAsync(source) {
    this.database.exec(source);
  }

  async runAsync(source, params = []) {
    const statement = this.database.prepare(source);
    const bound = bindStatement(statement, params);
    const result = Array.isArray(bound) ? statement.run(...bound) : statement.run(bound);

    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync(source, params = []) {
    const statement = this.database.prepare(source);
    const bound = bindStatement(statement, params);
    return (Array.isArray(bound) ? statement.get(...bound) : statement.get(bound)) ?? null;
  }

  async getAllAsync(source, params = []) {
    const statement = this.database.prepare(source);
    const bound = bindStatement(statement, params);
    return Array.isArray(bound) ? statement.all(...bound) : statement.all(bound);
  }

  async withExclusiveTransactionAsync(task) {
    // expo opens each transaction body on a fresh connection with `useNewConnection: true`,
    // where foreign keys are off. `node:sqlite` starts them on and runs BEGIN on this one
    // connection, so turn them off around the body or the double is the inverse of
    // production. The pragma is a no-op once a transaction is open, hence before BEGIN.
    const previous = this.database.prepare('PRAGMA foreign_keys').get().foreign_keys;
    this.database.exec('PRAGMA foreign_keys = OFF');
    this.database.exec('BEGIN EXCLUSIVE');
    try {
      await task(this);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    } finally {
      this.database.exec(`PRAGMA foreign_keys = ${previous ? 'ON' : 'OFF'}`);
    }
  }

  close() {
    this.database.close();
  }
}
