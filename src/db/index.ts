import 'dotenv/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
  var _sqlUnavailableRuntime: boolean | undefined;
}

export function isSqlConfigured(): boolean {
  if (global._sqlUnavailableRuntime) return false;
  return Boolean(process.env.SQL_HOST && process.env.SQL_HOST.trim());
}

export function markSqlUnavailableRuntime(): void {
  global._sqlUnavailableRuntime = true;
}

export const createPool = (): Pool | null => {
  if (!isSqlConfigured()) {
    return null;
  }
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 8000
    });

    global._postgresPool.on('error', err => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

let cachedDb: NodePgDatabase<typeof schema> | null = null;

export function getSqlDb(): NodePgDatabase<typeof schema> | null {
  if (!isSqlConfigured()) return null;
  if (!cachedDb) {
    const pool = createPool();
    if (!pool) return null;
    cachedDb = drizzle(pool, { schema });
  }
  return cachedDb;
}

export const db = getSqlDb();

