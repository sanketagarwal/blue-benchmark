import { config } from 'dotenv';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

config();

// Singleton database instance to prevent connection exhaustion
let databaseInstance: PostgresJsDatabase | undefined;

/**
 * Get a Drizzle database instance (singleton)
 *
 * @returns The Drizzle database instance
 * @throws Error if DATABASE_URL is not set
 */
export function getDatabase(): PostgresJsDatabase {
  if (databaseInstance !== undefined) {
    return databaseInstance;
  }

  const databaseUrl = process.env['DATABASE_URL'];

  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = postgres(databaseUrl);
  databaseInstance = drizzle(client);
  return databaseInstance;
}
