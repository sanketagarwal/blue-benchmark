import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase } from '../src/client';

describe('getDatabase', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.DATABASE_URL = originalEnv;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it('throws error when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => getDatabase()).toThrow('DATABASE_URL environment variable is required');
  });

  it('throws error when DATABASE_URL is empty string', () => {
    process.env.DATABASE_URL = '';
    expect(() => getDatabase()).toThrow('DATABASE_URL environment variable is required');
  });

  it('returns drizzle instance when DATABASE_URL is set', () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    const database = getDatabase();
    expect(database).toBeDefined();
    expect(typeof database.select).toBe('function');
  });

  it('returns same instance on subsequent calls (singleton)', () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    const database1 = getDatabase();
    const database2 = getDatabase();
    expect(database1).toBe(database2);
  });
});
