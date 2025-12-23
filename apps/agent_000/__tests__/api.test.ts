import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the agent-core module
vi.mock('@nullagent/agent-core', () => ({
  runRound: vi.fn(),
}));

// Mock the agent module
vi.mock('../src/agent', () => ({
  agent: {
    definition: {
      id: 'agent_000',
    },
  },
}));

// Mock the game module to control puzzle selection
vi.mock('../src/game', async () => {
  const actual = await vi.importActual('../src/game');
  return {
    ...actual,
    selectPuzzle: vi.fn(() => ({ phrase: 'HELLO WORLD', category: 'Test' })),
  };
});

import { runRound } from '@nullagent/agent-core';

import { POST, GET } from '../src/app/api/play/route';
import { resetGameState } from '../src/game-state';

describe('POST /api/play', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGameState();
  });

  test('returns success response with letter guess', async () => {
    vi.mocked(runRound).mockResolvedValue({
      output: { letter: 'e', reasoning: 'E is common' },
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.round).toBe(1);
    expect(data.move).toEqual({ letter: 'e', reasoning: 'E is common' });
    expect(data.board).toBeDefined();
    expect(data.category).toBeDefined();
    expect(data.message).toBeDefined();
  });

  test('processes letter guess and updates board', async () => {
    vi.mocked(runRound).mockResolvedValue({
      output: { letter: 'h' },
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    const response = await POST();
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.gameState.guessedLetters).toContain('H');
  });

  test('handles correct phrase guess', async () => {
    vi.mocked(runRound).mockResolvedValue({
      output: { guess: 'HELLO WORLD' },
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    const response = await POST();
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.gameState.solved).toBe(true);
    expect(data.message).toContain('Correct');
  });

  test('handles wrong phrase guess', async () => {
    vi.mocked(runRound).mockResolvedValue({
      output: { guess: 'WRONG GUESS' },
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    const response = await POST();
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.gameState.failed).toBe(true);
    expect(data.message).toContain('Wrong guess');
  });

  test('returns error response when runRound fails', async () => {
    vi.mocked(runRound).mockRejectedValue(new Error('LLM API error'));

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('LLM API error');
  });

  test('handles invalid move with no letter or guess', async () => {
    vi.mocked(runRound).mockResolvedValue({
      output: {},
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    const response = await POST();
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.message).toContain('Invalid move');
  });

  test('starts new game when previous game is solved', async () => {
    // First game - solve it
    vi.mocked(runRound).mockResolvedValue({
      output: { guess: 'HELLO WORLD' },
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    await POST();

    // Second game - should be a new puzzle
    vi.mocked(runRound).mockResolvedValue({
      output: { letter: 'a' },
      roundNumber: 2,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    const response = await POST();
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.gameState.solved).toBe(false);
    expect(data.gameState.failed).toBe(false);
  });

  test('includes usage information in response', async () => {
    vi.mocked(runRound).mockResolvedValue({
      output: { letter: 't' },
      roundNumber: 1,
      usage: { promptTokens: 123, completionTokens: 45, totalTokens: 168 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    const response = await POST();
    const data = await response.json();

    expect(data.usage).toEqual({
      promptTokens: 123,
      completionTokens: 45,
      totalTokens: 168,
    });
  });
});

describe('GET /api/play', () => {
  beforeEach(() => {
    resetGameState();
  });

  test('returns no active game message initially', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBeDefined();
    expect(typeof data.message).toBe('string');
    expect(data.message.toLowerCase()).toContain('no active game');
  });

  test('returns current game state after POST', async () => {
    vi.mocked(runRound).mockResolvedValue({
      output: { letter: 'e' },
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    await POST();

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.board).toBeDefined();
    expect(data.category).toBeDefined();
    expect(data.guessedLetters).toBeInstanceOf(Array);
    expect(data.solved).toBeDefined();
    expect(data.failed).toBeDefined();
  });
});
