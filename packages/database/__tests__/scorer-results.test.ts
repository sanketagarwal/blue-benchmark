import { describe, test, expect } from 'vitest';

import { scorerResults } from '../src/schema/scorer-results';

describe('scorerResults schema', () => {
  test('has required columns', () => {
    const columns = Object.keys(scorerResults);
    expect(columns).toContain('id');
    expect(columns).toContain('traceId');
    expect(columns).toContain('agentId');
    expect(columns).toContain('roundNumber');
    expect(columns).toContain('scorerId');
    expect(columns).toContain('score');
    expect(columns).toContain('result');
    expect(columns).toContain('createdAt');
  });
});
