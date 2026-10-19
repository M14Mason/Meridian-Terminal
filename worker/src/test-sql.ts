// node:sqlite adapter that mimics Durable Object SqlStorage.exec(...).toArray() for tests.
import { DatabaseSync } from 'node:sqlite';
import type { Sql, SqlValue } from './vault-core';

export function memorySql(): Sql {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query: string, ...bindings: SqlValue[]) {
      const rows = db.prepare(query).all(...(bindings as (string | number | null)[]));
      return { toArray: () => rows as Record<string, SqlValue>[] };
    },
  };
}
