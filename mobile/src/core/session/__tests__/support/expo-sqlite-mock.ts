/**
 * `expo-sqlite` mock backed by a REAL SQLite engine (better-sqlite3, in memory), #40.
 *
 * A hand-written fake buffer would only test the fake: what matters in `buffer.ts` is the
 * SQL semantics itself (INSERT OR IGNORE for replay, INSERT OR REPLACE + CHECK(id = 1)
 * for the single session, ordering by seq, the dynamically built IN (…) list). The mock
 * therefore only translates expo-sqlite's asynchronous API to better-sqlite3's synchronous
 * API, without reimplementing any logic.
 */
import Database from 'better-sqlite3';

type Params = readonly unknown[];

/** Subset of SQLiteDatabase actually used by buffer.ts. */
export interface FakeDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: Params): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, ...params: Params): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: Params): Promise<T[]>;
  closeAsync(): Promise<void>;
}

function wrap(db: Database.Database): FakeDatabase {
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, ...params) {
      const info = db.prepare(sql).run(...(params as unknown[]));
      return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid) };
    },
    async getFirstAsync<T>(sql: string, ...params: Params) {
      return (db.prepare(sql).get(...(params as unknown[])) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...params: Params) {
      return db.prepare(sql).all(...(params as unknown[])) as T[];
    },
    async closeAsync() {
      db.close();
    },
  };
}

export interface ExpoSqliteMock {
  openDatabaseAsync(name: string): Promise<FakeDatabase>;
  /** Closes and forgets every open database (isolation between files). */
  __closeAll(): void;
}

export function createExpoSqliteMock(): ExpoSqliteMock {
  const open = new Map<string, Database.Database>();
  return {
    async openDatabaseAsync(name: string) {
      let db = open.get(name);
      if (db == null) {
        db = new Database(':memory:');
        open.set(name, db);
      }
      return wrap(db);
    },
    __closeAll() {
      for (const db of open.values()) {
        db.close();
      }
      open.clear();
    },
  };
}
