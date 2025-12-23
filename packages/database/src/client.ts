import { config } from 'dotenv';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

config();

/**
 * Get a Drizzle database instance
 *
 * @returns The Drizzle database instance
 * @throws Error if DATABASE_URL is not set
 */
export function getDatabase(): PostgresJsDatabase {
  const databaseUrl = process.env['DATABASE_URL'];

  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = postgres(databaseUrl);
  return drizzle(client);
}
