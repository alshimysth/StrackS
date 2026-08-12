/**
 * Mock d'`expo-sqlite` adossé à un VRAI moteur SQLite (better-sqlite3, en
 * mémoire) — #40.
 *
 * Un faux buffer écrit à la main ne testerait que le faux : ce qui compte dans
 * `buffer.ts`, c'est la sémantique SQL elle-même (INSERT OR IGNORE pour le
 * rejeu, INSERT OR REPLACE + CHECK(id = 1) pour la séance unique, l'ordre par
 * seq, la liste IN (…) construite dynamiquement). Le mock ne fait donc que
 * traduire l'API asynchrone d'expo-sqlite vers l'API synchrone de
 * better-sqlite3, sans réimplémenter aucune logique.
 */
import Database from 'better-sqlite3';

type Params = readonly unknown[];

/** Sous-ensemble de SQLiteDatabase réellement utilisé par buffer.ts. */
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
  /** Ferme et oublie toutes les bases ouvertes (isolation entre fichiers). */
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
