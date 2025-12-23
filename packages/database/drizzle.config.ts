import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Load .env.local from monorepo root
config({ path: resolve(__dirname, '../../.env.local') });

if (!process.env['DATABASE_URL']) {
  throw new Error('DATABASE_URL environment variable is required');
}

export default defineConfig({
  out: './drizzle',
  schema: './src/schema/*',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'],
  },
});
