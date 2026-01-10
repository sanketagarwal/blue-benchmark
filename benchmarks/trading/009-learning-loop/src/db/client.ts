/**
 * Database client for 009 Learning Loop
 * Uses Neon serverless driver for Vercel Postgres
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDatabase() {
  if (db) return db;
  
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const sql = neon(databaseUrl);
  db = drizzle(sql, { schema });
  return db;
}

export { schema };
