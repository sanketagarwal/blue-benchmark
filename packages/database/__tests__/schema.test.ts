import { describe, it, expect } from 'vitest';
import { agentMessages } from '../src/schema/agent-messages';
import { getTableName } from 'drizzle-orm';

describe('agentMessages schema', () => {
  it('exports a table with correct name', () => {
    expect(agentMessages).toBeDefined();
    const tableName = getTableName(agentMessages);
    expect(tableName).toBe('agent_messages');
  });

  it('has all required columns', () => {
    const columns = Object.keys(agentMessages);
    expect(columns).toContain('id');
    expect(columns).toContain('agentId');
    expect(columns).toContain('role');
    expect(columns).toContain('kind');
    expect(columns).toContain('content');
    expect(columns).toContain('outputJson');
    expect(columns).toContain('roundNumber');
    expect(columns).toContain('createdAt');
  });

  it('has correct column types', () => {
    // Access column metadata through Drizzle's internal structure
    const { id, agentId, role, kind, content, outputJson, roundNumber, createdAt } =
      agentMessages;

    // Check that columns exist and have expected properties
    expect(id).toBeDefined();
    expect(agentId).toBeDefined();
    expect(role).toBeDefined();
    expect(kind).toBeDefined();
    expect(content).toBeDefined();
    expect(outputJson).toBeDefined();
    expect(roundNumber).toBeDefined();
    expect(createdAt).toBeDefined();

    // Verify column data types via Drizzle's column metadata
    expect(id.dataType).toBe('string'); // uuid
    expect(agentId.dataType).toBe('string'); // text
    expect(role.dataType).toBe('string'); // text
    expect(kind.dataType).toBe('string'); // text
    expect(content.dataType).toBe('string'); // text
    expect(outputJson.dataType).toBe('json'); // jsonb
    expect(roundNumber.dataType).toBe('number'); // integer
    expect(createdAt.dataType).toBe('date'); // timestamptz
  });
});
