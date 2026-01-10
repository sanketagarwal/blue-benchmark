/**
 * Database client for 009 Learning Loop
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDatabase() {
  if (db) return db;
  
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const client = postgres(databaseUrl);
  db = drizzle(client, { schema });
  return db;
}

export { schema };
