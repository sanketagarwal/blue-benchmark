import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RoundHistory } from '../src/types.js';
import {
  loadMessageHistory,
  saveRoundPrompt,
  saveRoundOutput,
  getCurrentRoundNumber,
  loadRecentRounds,
} from '../src/history.js';

// Mock the database module
vi.mock('@nullagent/database', () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
  };

  return {
    getDatabase: vi.fn(() => mockDb),
    agentMessages: {
      agentId: 'agentId',
      role: 'role',
      kind: 'kind',
      content: 'content',
      outputJson: 'outputJson',
      roundNumber: 'roundNumber',
      createdAt: 'createdAt',
    },
  };
});

describe('history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadMessageHistory', () => {
    it('returns empty array when no messages exist', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const messages = await loadMessageHistory('test-agent');

      expect(messages).toEqual([]);
    });

    it('loads messages since last compaction', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { role: 'user', content: 'Hello', kind: 'prompt' },
              { role: 'assistant', content: 'Hi there', kind: 'output' },
            ]),
          }),
        }),
      });

      const messages = await loadMessageHistory('test-agent');

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
    });

    it('excludes compaction messages from history', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { role: 'user', content: 'Hello', kind: 'prompt' },
              { role: 'assistant', content: 'Summary', kind: 'compaction' },
              { role: 'assistant', content: 'Hi there', kind: 'output' },
            ]),
          }),
        }),
      });

      const messages = await loadMessageHistory('test-agent');

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
    });

    it('returns messages ordered by createdAt ascending', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      const whereMock = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([
          { role: 'user', content: 'First', kind: 'prompt', createdAt: new Date('2024-01-01T00:00:00Z') },
          { role: 'assistant', content: 'Second', kind: 'output', createdAt: new Date('2024-01-01T00:01:00Z') },
          { role: 'user', content: 'Third', kind: 'prompt', createdAt: new Date('2024-01-01T00:02:00Z') },
        ]),
      });
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: whereMock,
        }),
      });

      const messages = await loadMessageHistory('test-agent');

      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({ role: 'user', content: 'First' });
      expect(messages[1]).toEqual({ role: 'assistant', content: 'Second' });
      expect(messages[2]).toEqual({ role: 'user', content: 'Third' });
      expect(whereMock().orderBy).toHaveBeenCalled();
    });

    it('filters messages by since option when provided', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      const sinceDate = new Date('2024-01-01T00:01:00Z');
      const whereMock = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([
          { role: 'user', content: 'After since', kind: 'prompt', createdAt: new Date('2024-01-01T00:02:00Z') },
        ]),
      });
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: whereMock,
        }),
      });

      const messages = await loadMessageHistory('test-agent', { since: sinceDate });

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ role: 'user', content: 'After since' });
    });
  });

  describe('saveRoundPrompt', () => {
    it('inserts prompt message with correct fields', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await saveRoundPrompt('test-agent', 'What is 2+2?', 1);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('inserts prompt message with traceId when provided', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await saveRoundPrompt('test-agent', 'What is 2+2?', 1, 'trace-123');

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('saveRoundOutput', () => {
    it('inserts output message with correct fields', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await saveRoundOutput('test-agent', 'The answer is 4', { result: 4 }, 1);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('inserts output message with traceId when provided', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await saveRoundOutput('test-agent', 'The answer is 4', { result: 4 }, 1, 'trace-123');

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('getCurrentRoundNumber', () => {
    it('returns 0 when no messages exist', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const roundNumber = await getCurrentRoundNumber('test-agent');

      expect(roundNumber).toBe(0);
    });

    it('returns next round number when messages exist', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ roundNumber: 5 }]),
            }),
          }),
        }),
      });

      const roundNumber = await getCurrentRoundNumber('test-agent');

      expect(roundNumber).toBe(6);
    });
  });

  describe('loadRecentRounds', () => {
    it('returns empty array when no rounds exist', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const rounds = await loadRecentRounds<{ result: string }>('test-agent', 10);

      expect(rounds).toEqual([]);
    });

    it('loads recent rounds with prompt and output', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  roundNumber: 1,
                  kind: 'prompt',
                  content: 'What is 2+2?',
                  createdAt: new Date('2024-01-01T00:00:00Z'),
                },
                {
                  roundNumber: 1,
                  kind: 'output',
                  content: 'The answer is 4',
                  outputJson: { result: '4' },
                  createdAt: new Date('2024-01-01T00:00:01Z'),
                },
              ]),
            }),
          }),
        }),
      });

      const rounds = await loadRecentRounds<{ result: string }>('test-agent', 10);

      expect(rounds).toHaveLength(1);
      expect(rounds[0]).toEqual({
        roundNumber: 1,
        prompt: 'What is 2+2?',
        output: { result: '4' },
        timestamp: '2024-01-01T00:00:00.000Z',
      });
    });

    it('groups messages by round number', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  roundNumber: 1,
                  kind: 'prompt',
                  content: 'First',
                  createdAt: new Date('2024-01-01T00:00:00Z'),
                },
                {
                  roundNumber: 1,
                  kind: 'output',
                  content: 'First response',
                  outputJson: { result: 'first' },
                  createdAt: new Date('2024-01-01T00:00:01Z'),
                },
                {
                  roundNumber: 2,
                  kind: 'prompt',
                  content: 'Second',
                  createdAt: new Date('2024-01-01T00:00:02Z'),
                },
                {
                  roundNumber: 2,
                  kind: 'output',
                  content: 'Second response',
                  outputJson: { result: 'second' },
                  createdAt: new Date('2024-01-01T00:00:03Z'),
                },
              ]),
            }),
          }),
        }),
      });

      const rounds = await loadRecentRounds<{ result: string }>('test-agent', 10);

      expect(rounds).toHaveLength(2);
      expect(rounds[0]?.roundNumber).toBe(1);
      expect(rounds[1]?.roundNumber).toBe(2);
    });

    it('handles null roundNumber gracefully', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  roundNumber: null,
                  kind: 'prompt',
                  content: 'Test',
                  createdAt: new Date('2024-01-01T00:00:00Z'),
                },
              ]),
            }),
          }),
        }),
      });

      const rounds = await loadRecentRounds<{ result: string }>('test-agent', 10);

      expect(rounds).toEqual([]);
    });

    it('handles null createdAt gracefully', async () => {
      const { getDatabase } = await import('@nullagent/database');
      const mockDb = getDatabase();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  roundNumber: 1,
                  kind: 'prompt',
                  content: 'Test',
                  createdAt: null,
                },
              ]),
            }),
          }),
        }),
      });

      const rounds = await loadRecentRounds<{ result: string }>('test-agent', 10);

      expect(rounds).toEqual([]);
    });
  });
});
