import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the agent-core module
vi.mock('@nullagent/agent-core', () => ({
  runRound: vi.fn(),
}));

// Mock the scorers module
vi.mock('@nullagent/scorers', () => ({
  saveScore: vi.fn(),
  // defineScorer is used by player-round-scorer.ts - pass through the definition
  defineScorer: <TInput, TResult>(definition: { id: string; name: string; score: (input: TInput) => TResult }) => definition,
}));

// Mock the player module
vi.mock('../src/player', () => ({
  player: {
    definition: {
      id: 'player_001',
    },
  },
}));

// Mock the puzzle-master module
vi.mock('../src/puzzle-master', () => ({
  puzzleMaster: {
    definition: {
      id: 'puzzle_master_001',
    },
  },
}));

import { runRound } from '@nullagent/agent-core';
import { saveScore } from '@nullagent/scorers';

import { POST, GET } from '../src/app/api/play/route';
import { resetGameState } from '../src/game-state';

describe('POST /api/play', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGameState();
  });

  test('creates new puzzle when no game exists', async () => {
    // First call: puzzle master creates puzzle
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO WORLD', category: 'Greeting', reasoning: 'Common phrase' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      // Second call: player makes move
      .mockResolvedValueOnce({
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
    expect(data.puzzleCreated).toBe(true);
    expect(data.puzzleMasterRound).toBe(1);
    expect(data.playerRound).toBe(1);
    expect(data.category).toBe('Greeting');
  });

  test('does not create puzzle when game in progress', async () => {
    // First POST: creates puzzle and makes move
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO WORLD', category: 'Greeting' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
        output: { letter: 'h' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      });

    await POST();

    // Reset mock for second POST
    vi.mocked(runRound).mockClear();
    vi.mocked(runRound).mockResolvedValueOnce({
      output: { letter: 'e' },
      roundNumber: 2,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    // Second POST: should NOT create new puzzle
    const response = await POST();
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.puzzleCreated).toBe(false);
    expect(data.puzzleMasterRound).toBeUndefined();
    expect(runRound).toHaveBeenCalledTimes(1); // Only player, not puzzle master
  });

  test('processes letter guess and updates board', async () => {
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO WORLD', category: 'Greeting' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
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
    expect(data.message).toContain('Found');
  });

  test('handles correct phrase guess', async () => {
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO WORLD', category: 'Greeting' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
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
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO WORLD', category: 'Greeting' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
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
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO WORLD', category: 'Greeting' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
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
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO WORLD', category: 'Greeting' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
        output: { guess: 'HELLO WORLD' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      });

    await POST();

    // Second game - should create new puzzle
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'NEW PHRASE', category: 'Test' },
        roundNumber: 2,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
        output: { letter: 'a' },
        roundNumber: 2,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      });

    const response = await POST();
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.puzzleCreated).toBe(true);
    expect(data.category).toBe('Test');
    expect(data.gameState.solved).toBe(false);
    expect(data.gameState.failed).toBe(false);
  });

  test('includes usage information in response', async () => {
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'TEST', category: 'Test' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
        output: { letter: 't' },
        roundNumber: 1,
        usage: { promptTokens: 123, completionTokens: 45, totalTokens: 168 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      });

    const response = await POST();
    const data = await response.json();

    // Should include player usage (the latest move)
    expect(data.usage).toEqual({
      promptTokens: 123,
      completionTokens: 45,
      totalTokens: 168,
    });
  });

  test('includes traceId in response', async () => {
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'TEST', category: 'Test' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
        output: { letter: 't' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      });

    const response = await POST();
    const data = await response.json();

    expect(data.traceId).toBeDefined();
    expect(typeof data.traceId).toBe('string');
  });

  test('includes score in response for correct guess', async () => {
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO', category: 'Test' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
        output: { letter: 'h' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      });

    const response = await POST();
    const data = await response.json();

    expect(data.score).toBeDefined();
    expect(data.score.correctness).toBe(1);
    expect(data.score.difficulty).toBe(1); // All letters hidden
    expect(data.score.score).toBe(1); // 1 * (0.5 + 1 * 0.5) = 1
  });

  test('includes score in response for incorrect guess', async () => {
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO', category: 'Test' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
        output: { letter: 'x' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      });

    const response = await POST();
    const data = await response.json();

    expect(data.score).toBeDefined();
    expect(data.score.correctness).toBe(0);
    expect(data.score.score).toBe(0);
  });

  test('calls saveScore with correct parameters', async () => {
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO', category: 'Test' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
        output: { letter: 'h' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      });

    await POST();

    expect(saveScore).toHaveBeenCalledTimes(1);
    expect(saveScore).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'player_001',
        roundNumber: 1,
        scorerId: 'player_round_scorer',
        result: expect.objectContaining({
          score: expect.any(Number),
          correctness: expect.any(Number),
          difficulty: expect.any(Number),
        }),
      })
    );
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
    vi.mocked(runRound)
      .mockResolvedValueOnce({
        output: { phrase: 'HELLO WORLD', category: 'Greeting' },
        roundNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        wasCompacted: false,
        traceId: 'test-trace-id',
      })
      .mockResolvedValueOnce({
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
    expect(data.category).toBe('Greeting');
    expect(data.guessedLetters).toBeInstanceOf(Array);
    expect(data.solved).toBeDefined();
    expect(data.failed).toBeDefined();
  });
});
