# agent_006: Bitcoin Bottom Arena Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform agent_006 from market-maker fill prediction into a multi-phase selection protocol for vision LLMs predicting structural market bottoms.

**Architecture:** Replace fill probability contracts with bottom prediction contracts (15m, 1h, 24h, 7d). Add local_extrema annotation fetching with availableAt filter. Implement 4-phase selection: sanity filter → horizon competence → stability/regret → arena ranking. Use log loss scoring with drawdown-bounded ground truth.

**Tech Stack:** Vercel AI Gateway, Replay Lab API (local_extrema annotations), Zod schemas, in-memory state

---

## Task 1: Update Matrix to Load Models from JSON

**Files:**
- Modify: `apps/agent_006/src/matrix.ts`
- Test: `apps/agent_006/__tests__/matrix.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/matrix.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { loadModelMatrix, getModelIds, BENCHMARK_ROUNDS } from '../src/matrix.js';

describe('matrix', () => {
  describe('loadModelMatrix', () => {
    it('loads all vision models from models.json', () => {
      const models = loadModelMatrix();
      expect(models.length).toBeGreaterThan(50);
      expect(models.every(m => m.vision === true)).toBe(true);
    });

    it('includes required fields for each model', () => {
      const models = loadModelMatrix();
      for (const model of models) {
        expect(model.id).toBeDefined();
        expect(model.provider).toBeDefined();
        expect(model.tier).toBeDefined();
      }
    });
  });

  describe('getModelIds', () => {
    it('returns array of model ID strings', () => {
      const ids = getModelIds();
      expect(ids.length).toBeGreaterThan(50);
      expect(ids.every(id => typeof id === 'string')).toBe(true);
      expect(ids[0]).toMatch(/\//); // Format: provider/model
    });
  });

  describe('BENCHMARK_ROUNDS', () => {
    it('exports round count', () => {
      expect(BENCHMARK_ROUNDS).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="matrix" --run`
Expected: FAIL with "loadModelMatrix is not a function" or similar

**Step 3: Write minimal implementation**

Replace `apps/agent_006/src/matrix.ts`:

```typescript
import modelsJson from './models.json' with { type: 'json' };

export interface ModelConfig {
  id: string;
  provider: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  tier: 'budget' | 'mid' | 'frontier';
  vision: boolean;
  notes: string;
}

interface ModelsFile {
  models: ModelConfig[];
  tiers: Record<string, unknown>;
  providers: string[];
}

/**
 * Load all vision models from models.json
 */
export function loadModelMatrix(): ModelConfig[] {
  const data = modelsJson as ModelsFile;
  return data.models.filter(m => m.vision === true);
}

/**
 * Get just the model IDs for iteration
 */
export function getModelIds(): string[] {
  return loadModelMatrix().map(m => m.id);
}

export type ModelId = string;

export const BENCHMARK_ROUNDS = 6; // Phase 0: 6-12 rounds for sanity filter
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="matrix" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/matrix.ts apps/agent_006/__tests__/matrix.test.ts
git commit -m "feat(agent_006): dynamic model loading from models.json"
```

---

## Task 2: Create Bottom Prediction Schema and Agent

**Files:**
- Create: `apps/agent_006/src/bottom-caller.ts`
- Test: `apps/agent_006/__tests__/bottom-caller.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/bottom-caller.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createBottomCaller,
  setBottomCallerContext,
  clearBottomCallerContext,
  BOTTOM_CONTRACT_IDS,
  type BottomCallerContext,
} from '../src/bottom-caller.js';

describe('bottom-caller', () => {
  describe('BOTTOM_CONTRACT_IDS', () => {
    it('has 4 horizon contracts', () => {
      expect(BOTTOM_CONTRACT_IDS).toEqual([
        'bottom-15m',
        'bottom-1h',
        'bottom-24h',
        'bottom-7d',
      ]);
    });
  });

  describe('createBottomCaller', () => {
    const mockContext: BottomCallerContext = {
      chart4h5mUrl: 'https://example.com/chart1.png',
      chart24h15mUrl: 'https://example.com/chart2.png',
      orderbookData: 'mid=100,spread=0.1',
      currentTime: '2025-01-01T00:00:00Z',
      symbolId: 'COINBASE_SPOT_BTC_USD',
    };

    beforeEach(() => {
      setBottomCallerContext(mockContext);
    });

    afterEach(() => {
      clearBottomCallerContext();
    });

    it('creates agent with model-specific ID', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      expect(agent.id).toBe('bottom_caller_anthropic_claude-haiku-4.5');
    });

    it('includes output schema with bottom predictions', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      expect(agent.outputSchema).toBeDefined();
    });

    it('throws if context not set', () => {
      clearBottomCallerContext();
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      expect(() => agent.buildRoundPrompt({ roundNumber: 0 })).toThrow(
        'Bottom caller context not set'
      );
    });

    it('builds prompt with chart URLs and orderbook', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      const prompt = agent.buildRoundPrompt({ roundNumber: 0 });
      expect(prompt).toContain('chart1.png');
      expect(prompt).toContain('chart2.png');
      expect(prompt).toContain('mid=100');
      expect(prompt).toContain('bottom-15m');
      expect(prompt).toContain('bottom-1h');
      expect(prompt).toContain('bottom-24h');
      expect(prompt).toContain('bottom-7d');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="bottom-caller" --run`
Expected: FAIL with "Cannot find module '../src/bottom-caller.js'"

**Step 3: Write minimal implementation**

Create `apps/agent_006/src/bottom-caller.ts`:

```typescript
import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

import type { Agent } from '@nullagent/agent-core';

/**
 * Bottom prediction contract IDs for multi-horizon structural bottom detection
 */
export const BOTTOM_CONTRACT_IDS = [
  'bottom-15m',
  'bottom-1h',
  'bottom-24h',
  'bottom-7d',
] as const;

export type BottomContractId = (typeof BOTTOM_CONTRACT_IDS)[number];

/**
 * Context interface for bottom predictions
 */
export interface BottomCallerContext {
  /** Chart: 4-hour lookback with 5m candles */
  chart4h5mUrl: string;
  /** Chart: 24-hour lookback with 15m candles */
  chart24h15mUrl: string;
  /** Orderbook data including mid_price, spread, imbalance */
  orderbookData: string;
  /** Current prediction time */
  currentTime: string;
  /** Trading symbol identifier */
  symbolId: string;
}

// Context that changes per round
let currentContext: BottomCallerContext | undefined;

const CONTEXT_NOT_SET_ERROR = 'Bottom caller context not set. Call setBottomCallerContext() before runRound().';

/**
 * Set the context for the next bottom caller round
 */
export function setBottomCallerContext(context: BottomCallerContext): void {
  currentContext = context;
}

/**
 * Clear the bottom caller context
 */
export function clearBottomCallerContext(): void {
  currentContext = undefined;
}

// Output schema: probability for each bottom contract (4 horizons)
const PredictionSchema = z.object({
  'bottom-15m': z.number().min(0).max(1),
  'bottom-1h': z.number().min(0).max(1),
  'bottom-24h': z.number().min(0).max(1),
  'bottom-7d': z.number().min(0).max(1),
});

const OutputSchema = z.object({
  reasoning: z.string().max(500).optional().describe('1-2 sentence summary only'),
  predictions: PredictionSchema,
});

export type BottomCallerOutput = z.infer<typeof OutputSchema>;

/**
 * Create a bottom caller agent for a specific model.
 * Uses a model-specific ID for isolated message history per model.
 */
export function createBottomCaller(modelId: string): Agent<BottomCallerOutput> {
  const agentId = `bottom_caller_${modelId.replaceAll('/', '_')}`;

  return defineAgent({
    id: agentId,
    outputSchema: OutputSchema,

    compactionTrigger: {
      type: 'custom',
      shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 10 === 0,
    },

    buildRoundPrompt: (context) => {
      if (currentContext === undefined) {
        throw new Error(CONTEXT_NOT_SET_ERROR);
      }

      const { chart4h5mUrl, chart24h15mUrl, orderbookData, currentTime, symbolId } = currentContext;

      const compactionSection =
        context.compactionSummary !== undefined && context.compactionSummary !== ''
          ? `\n\nYour past learnings:\n${context.compactionSummary}\n`
          : '';

      return `You are predicting structural market bottoms for ${symbolId}.

Current Time: ${currentTime}
Orderbook State: ${orderbookData}

Chart Analysis (IMPORTANT: Analyze these chart images for pattern recognition):
- 4-Hour Chart (5m candles): ${chart4h5mUrl}
- 24-Hour Chart (15m candles): ${chart24h15mUrl}

Both charts include: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, SuperTrend(10,3), RSI(14), MACD(12,26,9), Stochastic RSI(14,3,3), ADX(14), CMF(20), Choppiness(14), Volume, and Volume Ratio(20).

**YOUR TASK:**
Predict the probability that downside has been structurally exhausted at each time scale.

This is NOT:
- Predicting the exact pivot candle
- Predicting price will go up
- Predicting a reversal

You are assessing: "Has the selling pressure at THIS scale been absorbed?"

**CONTRACTS TO PREDICT (0.0 to 1.0):**

- bottom-15m: Probability a 15-minute structural low forms within next 15 minutes
- bottom-1h: Probability a 1-hour structural low forms within next hour
- bottom-24h: Probability a 24-hour structural low forms within next 24 hours
- bottom-7d: Probability a 7-day structural low forms within next 7 days

**WHAT MAKES A STRUCTURAL BOTTOM:**
1. A local extrema pivot LOW must occur (confirmed by future price action)
2. Max drawdown from prediction time must not exceed threshold:
   - 15m: 0.4% max drawdown
   - 1h: 1% max drawdown
   - 24h: 2.5% max drawdown
   - 7d: 6% max drawdown

**HINTS:**
- High confidence requires BOTH structural pivot AND bounded drawdown
- Consider volume exhaustion, momentum divergence, support levels
- Longer horizons are harder to predict but more meaningful
- If price is mid-range with no structure, probabilities should be low

${compactionSection}
Respond with JSON:
{
  "reasoning": "Brief analysis (max 100 chars)",
  "predictions": {
    "bottom-15m": 0.35,
    "bottom-1h": 0.25,
    "bottom-24h": 0.15,
    "bottom-7d": 0.10
  }
}`;
    },

    buildCompactionPrompt: (history) => `
You've completed ${String(history.length)} rounds of structural bottom predictions.

Summarize your learnings:
- What chart patterns best predicted structural bottoms at each horizon?
- How accurate were your drawdown assessments?
- Which horizons were you most/least accurate on?
- What false signals did you fall for?

Keep it concise and actionable.
`,
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="bottom-caller" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/bottom-caller.ts apps/agent_006/__tests__/bottom-caller.test.ts
git commit -m "feat(agent_006): add bottom-caller agent with multi-horizon schema"
```

---

## Task 3: Create Horizon Configuration Constants

**Files:**
- Create: `apps/agent_006/src/horizon-config.ts`
- Test: `apps/agent_006/__tests__/horizon-config.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/horizon-config.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  HORIZON_CONFIG,
  MAX_DRAWDOWN,
  getHorizonDuration,
  getMaxDrawdown,
  getAnnotationMethod,
} from '../src/horizon-config.js';
import type { Horizon } from '../src/horizon-config.js';

describe('horizon-config', () => {
  describe('HORIZON_CONFIG', () => {
    it('has 4 horizons', () => {
      expect(Object.keys(HORIZON_CONFIG)).toEqual(['15m', '1h', '24h', '7d']);
    });

    it('15m uses fractal method with 1m candles', () => {
      expect(HORIZON_CONFIG['15m'].method).toBe('fractal');
      expect(HORIZON_CONFIG['15m'].params.candleTimeframe).toBe('1m');
    });

    it('7d uses zigzag method with 1h candles', () => {
      expect(HORIZON_CONFIG['7d'].method).toBe('zigzag');
      expect(HORIZON_CONFIG['7d'].params.candleTimeframe).toBe('1h');
    });
  });

  describe('MAX_DRAWDOWN', () => {
    it('has correct thresholds', () => {
      expect(MAX_DRAWDOWN['15m']).toBe(0.004);
      expect(MAX_DRAWDOWN['1h']).toBe(0.01);
      expect(MAX_DRAWDOWN['24h']).toBe(0.025);
      expect(MAX_DRAWDOWN['7d']).toBe(0.06);
    });
  });

  describe('getHorizonDuration', () => {
    it('returns milliseconds for each horizon', () => {
      expect(getHorizonDuration('15m')).toBe(15 * 60_000);
      expect(getHorizonDuration('1h')).toBe(60 * 60_000);
      expect(getHorizonDuration('24h')).toBe(24 * 60 * 60_000);
      expect(getHorizonDuration('7d')).toBe(7 * 24 * 60 * 60_000);
    });
  });

  describe('getMaxDrawdown', () => {
    it('returns threshold for each horizon', () => {
      expect(getMaxDrawdown('15m')).toBe(0.004);
      expect(getMaxDrawdown('7d')).toBe(0.06);
    });
  });

  describe('getAnnotationMethod', () => {
    it('returns method config for fractal horizons', () => {
      const method = getAnnotationMethod('15m');
      expect(method.method).toBe('fractal');
      expect(method.params).toEqual({ L: 3, candleTimeframe: '1m' });
    });

    it('returns method config for zigzag horizons', () => {
      const method = getAnnotationMethod('24h');
      expect(method.method).toBe('zigzag');
      expect(method.params).toEqual({ deviationPct: 0.025, candleTimeframe: '15m' });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="horizon-config" --run`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `apps/agent_006/src/horizon-config.ts`:

```typescript
export type Horizon = '15m' | '1h' | '24h' | '7d';

export interface FractalParams {
  L: number;
  candleTimeframe: string;
}

export interface ZigzagParams {
  deviationPct: number;
  candleTimeframe: string;
}

export interface HorizonConfigEntry {
  duration: number;
  method: 'fractal' | 'zigzag';
  params: FractalParams | ZigzagParams;
}

export const HORIZON_CONFIG: Record<Horizon, HorizonConfigEntry> = {
  '15m': {
    duration: 15 * 60_000,
    method: 'fractal',
    params: { L: 3, candleTimeframe: '1m' },
  },
  '1h': {
    duration: 60 * 60_000,
    method: 'fractal',
    params: { L: 3, candleTimeframe: '5m' },
  },
  '24h': {
    duration: 24 * 60 * 60_000,
    method: 'zigzag',
    params: { deviationPct: 0.025, candleTimeframe: '15m' },
  },
  '7d': {
    duration: 7 * 24 * 60 * 60_000,
    method: 'zigzag',
    params: { deviationPct: 0.05, candleTimeframe: '1h' },
  },
} as const;

// Positive magnitudes - max allowed drawdown before prediction is invalidated
export const MAX_DRAWDOWN: Record<Horizon, number> = {
  '15m': 0.004,   // 0.4%
  '1h': 0.01,     // 1%
  '24h': 0.025,   // 2.5%
  '7d': 0.06,     // 6%
} as const;

export function getHorizonDuration(horizon: Horizon): number {
  return HORIZON_CONFIG[horizon].duration;
}

export function getMaxDrawdown(horizon: Horizon): number {
  return MAX_DRAWDOWN[horizon];
}

export function getAnnotationMethod(horizon: Horizon): {
  method: 'fractal' | 'zigzag';
  params: FractalParams | ZigzagParams;
} {
  const config = HORIZON_CONFIG[horizon];
  return { method: config.method, params: config.params };
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="horizon-config" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/horizon-config.ts apps/agent_006/__tests__/horizon-config.test.ts
git commit -m "feat(agent_006): add horizon configuration constants"
```

---

## Task 4: Create Local Extrema Annotation Fetcher

**Files:**
- Modify: `apps/agent_006/src/replay-lab/annotations.ts`
- Test: `apps/agent_006/__tests__/annotations.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/annotations.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getLocalExtremaAnnotations, type LocalExtremaAnnotation } from '../src/replay-lab/annotations.js';
import * as client from '../src/replay-lab/client.js';

vi.mock('../src/replay-lab/client.js');

describe('annotations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getLocalExtremaAnnotations', () => {
    it('fetches local_extrema annotations with availableAt filter', async () => {
      const mockResponse = {
        symbol_id: 'COINBASE_SPOT_BTC_USD',
        annotations: [
          {
            id: 'ann-1',
            time_start: '2025-01-01T00:05:00Z',
            time_end: null,
            type: 'local_extrema',
            schema_version: '1.0',
            payload: { direction: 'low', price: 95000 },
            source: 'fractal',
          },
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const from = new Date('2025-01-01T00:00:00Z');
      const to = new Date('2025-01-01T00:15:00Z');
      const availableAt = new Date('2025-01-01T00:15:00Z');

      const result = await getLocalExtremaAnnotations(
        'COINBASE_SPOT_BTC_USD',
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.payload.direction).toBe('low');
      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('type=local_extrema')
      );
      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('availableAt=')
      );
    });

    it('filters to only pivot LOWs', async () => {
      const mockResponse = {
        symbol_id: 'COINBASE_SPOT_BTC_USD',
        annotations: [
          { id: '1', time_start: '2025-01-01T00:05:00Z', type: 'local_extrema', payload: { direction: 'low' }, source: 'fractal' },
          { id: '2', time_start: '2025-01-01T00:10:00Z', type: 'local_extrema', payload: { direction: 'high' }, source: 'fractal' },
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const result = await getLocalExtremaAnnotations(
        'COINBASE_SPOT_BTC_USD',
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        new Date(),
        new Date(),
        new Date()
      );

      // Should include both for completeness, filtering happens in ground truth
      expect(result).toHaveLength(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="annotations" --run`
Expected: FAIL

**Step 3: Write minimal implementation**

Replace `apps/agent_006/src/replay-lab/annotations.ts`:

```typescript
import { replayLabFetch } from './client.js';

import type { FractalParams, ZigzagParams } from '../horizon-config.js';

export interface LocalExtremaAnnotation {
  id: string;
  time_start: string;
  time_end: string | null;
  type: 'local_extrema';
  schema_version: string;
  payload: {
    direction: 'low' | 'high';
    price?: number;
  };
  source: string;
}

interface AnnotationsResponse {
  symbol_id: string;
  annotations: LocalExtremaAnnotation[];
}

/**
 * Fetch local_extrema annotations within a time window.
 * Uses availableAt filter to prevent lookahead bias.
 *
 * @param symbolId - Trading symbol
 * @param method - Detection method ('fractal' or 'zigzag')
 * @param params - Method parameters
 * @param from - Start of prediction window
 * @param to - End of prediction window (closesAt)
 * @param availableAt - Only return annotations confirmed by this time
 */
export async function getLocalExtremaAnnotations(
  symbolId: string,
  method: 'fractal' | 'zigzag',
  params: FractalParams | ZigzagParams,
  from: Date,
  to: Date,
  availableAt: Date
): Promise<LocalExtremaAnnotation[]> {
  const queryParams = new URLSearchParams({
    type: 'local_extrema',
    method,
    from: from.toISOString(),
    to: to.toISOString(),
    availableAt: availableAt.toISOString(),
  });

  // Add method-specific params
  if ('L' in params) {
    queryParams.set('L', String(params.L));
    queryParams.set('candleTimeframe', params.candleTimeframe);
  } else {
    queryParams.set('deviationPct', String(params.deviationPct));
    queryParams.set('candleTimeframe', params.candleTimeframe);
  }

  const path = `/api/annotations/${symbolId}?${queryParams.toString()}`;
  const response = await replayLabFetch<AnnotationsResponse>(path);

  return response.annotations;
}

/**
 * Filter annotations to only pivot LOWs
 */
export function filterPivotLows(annotations: LocalExtremaAnnotation[]): LocalExtremaAnnotation[] {
  return annotations.filter(a => a.payload.direction === 'low');
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="annotations" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/replay-lab/annotations.ts apps/agent_006/__tests__/annotations.test.ts
git commit -m "feat(agent_006): add local_extrema annotation fetcher with availableAt"
```

---

## Task 5: Create Bottom Ground Truth Checker

**Files:**
- Create: `apps/agent_006/src/ground-truth/bottom-checker.ts`
- Test: `apps/agent_006/__tests__/bottom-checker.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/bottom-checker.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  resolveBottomGroundTruth,
  computeMaxDrawdown,
  type GroundTruthResult,
} from '../src/ground-truth/bottom-checker.js';
import * as annotations from '../src/replay-lab/annotations.js';
import type { Trade } from '../src/replay-lab/trades.js';

vi.mock('../src/replay-lab/annotations.js');

describe('bottom-checker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('computeMaxDrawdown', () => {
    it('computes drawdown as positive magnitude', () => {
      const trades: Trade[] = [
        { timestamp: '2025-01-01T00:00:00Z', price: 100, size: 1, taker_side: 'buy' },
        { timestamp: '2025-01-01T00:05:00Z', price: 98, size: 1, taker_side: 'sell' }, // lowest
        { timestamp: '2025-01-01T00:10:00Z', price: 102, size: 1, taker_side: 'buy' },
      ];
      const entryPrice = 100;

      const drawdown = computeMaxDrawdown(trades, entryPrice);

      expect(drawdown).toBe(0.02); // (100 - 98) / 100 = 2%
    });

    it('returns 0 if price never goes below entry', () => {
      const trades: Trade[] = [
        { timestamp: '2025-01-01T00:00:00Z', price: 100, size: 1, taker_side: 'buy' },
        { timestamp: '2025-01-01T00:05:00Z', price: 105, size: 1, taker_side: 'buy' },
      ];

      const drawdown = computeMaxDrawdown(trades, 100);

      expect(drawdown).toBe(0);
    });
  });

  describe('resolveBottomGroundTruth', () => {
    it('returns valid=true when pivot LOW exists and drawdown within threshold', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([
        {
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          time_end: null,
          type: 'local_extrema',
          schema_version: '1.0',
          payload: { direction: 'low', price: 99.5 },
          source: 'fractal',
        },
      ]);

      const trades: Trade[] = [
        { timestamp: '2025-01-01T00:00:00Z', price: 100, size: 1, taker_side: 'buy' },
        { timestamp: '2025-01-01T00:05:00Z', price: 99.7, size: 1, taker_side: 'sell' }, // 0.3% drawdown
        { timestamp: '2025-01-01T00:10:00Z', price: 101, size: 1, taker_side: 'buy' },
      ];

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z'),
        trades
      );

      expect(result.hasStructuralBottom).toBe(true);
      expect(result.maxDrawdownPct).toBe(0.003); // 0.3%
      expect(result.isValid).toBe(true); // 0.3% < 0.4% threshold
    });

    it('returns valid=false when drawdown exceeds threshold', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([
        {
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          time_end: null,
          type: 'local_extrema',
          schema_version: '1.0',
          payload: { direction: 'low' },
          source: 'fractal',
        },
      ]);

      const trades: Trade[] = [
        { timestamp: '2025-01-01T00:00:00Z', price: 100, size: 1, taker_side: 'buy' },
        { timestamp: '2025-01-01T00:05:00Z', price: 99, size: 1, taker_side: 'sell' }, // 1% drawdown
      ];

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z'),
        trades
      );

      expect(result.hasStructuralBottom).toBe(true);
      expect(result.maxDrawdownPct).toBe(0.01); // 1%
      expect(result.isValid).toBe(false); // 1% > 0.4% threshold
    });

    it('returns valid=false when no pivot LOW exists', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([]);

      const trades: Trade[] = [
        { timestamp: '2025-01-01T00:00:00Z', price: 100, size: 1, taker_side: 'buy' },
      ];

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z'),
        trades
      );

      expect(result.hasStructuralBottom).toBe(false);
      expect(result.isValid).toBe(false);
    });

    it('computes timeToPivotRatio when pivot exists', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([
        {
          id: '1',
          time_start: '2025-01-01T00:07:30Z', // 7.5 minutes in
          time_end: null,
          type: 'local_extrema',
          schema_version: '1.0',
          payload: { direction: 'low' },
          source: 'fractal',
        },
      ]);

      const trades: Trade[] = [
        { timestamp: '2025-01-01T00:00:00Z', price: 100, size: 1, taker_side: 'buy' },
        { timestamp: '2025-01-01T00:07:30Z', price: 99.8, size: 1, taker_side: 'sell' },
      ];

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z'),
        trades
      );

      // 7.5 minutes / 15 minutes = 0.5
      expect(result.timeToPivotRatio).toBeCloseTo(0.5, 2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="bottom-checker" --run`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `apps/agent_006/src/ground-truth/bottom-checker.ts`:

```typescript
import {
  HORIZON_CONFIG,
  MAX_DRAWDOWN,
  getHorizonDuration,
  getAnnotationMethod,
} from '../horizon-config.js';
import {
  getLocalExtremaAnnotations,
  filterPivotLows,
} from '../replay-lab/annotations.js';
import { getMidPriceAtTime } from '../replay-lab/mid-price.js';

import type { Horizon } from '../horizon-config.js';
import type { Trade } from '../replay-lab/trades.js';

export interface GroundTruthResult {
  hasStructuralBottom: boolean;
  maxDrawdownPct: number;
  isValid: boolean;
  timeToPivotRatio?: number;
}

/**
 * Compute max drawdown as positive magnitude.
 * Drawdown = (entryPrice - lowestPrice) / entryPrice
 */
export function computeMaxDrawdown(trades: Trade[], entryPrice: number): number {
  if (trades.length === 0) return 0;

  const lowestPrice = Math.min(...trades.map(t => t.price));
  const drawdown = (entryPrice - lowestPrice) / entryPrice;

  return Math.max(0, drawdown); // Ensure non-negative
}

/**
 * Resolve ground truth for a bottom prediction.
 *
 * A prediction is valid (label = 1) if:
 * 1. A local_extrema pivot LOW exists within [predictedAt, closesAt]
 * 2. Max drawdown from predictedAt does not exceed the horizon threshold
 */
export async function resolveBottomGroundTruth(
  symbolId: string,
  horizon: Horizon,
  predictedAt: Date,
  trades: Trade[]
): Promise<GroundTruthResult> {
  const horizonDuration = getHorizonDuration(horizon);
  const closesAt = new Date(predictedAt.getTime() + horizonDuration);
  const maxAllowedDrawdown = MAX_DRAWDOWN[horizon];
  const { method, params } = getAnnotationMethod(horizon);

  // 1. Fetch local_extrema annotations confirmed by closesAt
  const annotations = await getLocalExtremaAnnotations(
    symbolId,
    method,
    params,
    predictedAt,
    closesAt,
    closesAt // availableAt = closesAt prevents lookahead
  );

  // 2. Filter to pivot LOWs only
  const pivotLows = filterPivotLows(annotations);
  const hasStructuralBottom = pivotLows.length > 0;

  // 3. Compute max drawdown
  const entryPrice = getMidPriceAtTime(trades, predictedAt);
  const windowTrades = trades.filter(t => {
    const tradeTime = new Date(t.timestamp).getTime();
    return tradeTime >= predictedAt.getTime() && tradeTime <= closesAt.getTime();
  });
  const maxDrawdownPct = computeMaxDrawdown(windowTrades, entryPrice);

  // 4. Determine validity
  const isValid = hasStructuralBottom && maxDrawdownPct <= maxAllowedDrawdown;

  // 5. Compute time to pivot ratio for Phase 3 early bonus
  let timeToPivotRatio: number | undefined;
  if (hasStructuralBottom && pivotLows.length > 0) {
    const pivotTimes = pivotLows.map(p => new Date(p.time_start).getTime());
    const earliestPivot = Math.min(...pivotTimes);
    const timeToPivot = earliestPivot - predictedAt.getTime();
    timeToPivotRatio = timeToPivot / horizonDuration;
  }

  return {
    hasStructuralBottom,
    maxDrawdownPct,
    isValid,
    timeToPivotRatio,
  };
}

/**
 * Resolve ground truth for all horizons
 */
export async function resolveAllHorizonsGroundTruth(
  symbolId: string,
  predictedAt: Date,
  trades: Trade[]
): Promise<Record<Horizon, GroundTruthResult>> {
  const horizons: Horizon[] = ['15m', '1h', '24h', '7d'];

  const results = await Promise.all(
    horizons.map(async (horizon) => {
      const result = await resolveBottomGroundTruth(symbolId, horizon, predictedAt, trades);
      return [horizon, result] as const;
    })
  );

  return Object.fromEntries(results) as Record<Horizon, GroundTruthResult>;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="bottom-checker" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/ground-truth/bottom-checker.ts apps/agent_006/__tests__/bottom-checker.test.ts
git commit -m "feat(agent_006): add bottom ground truth checker with drawdown validation"
```

---

## Task 6: Create Phase 0 Sanity Scorer

**Files:**
- Create: `apps/agent_006/src/scorers/phase-0-scorer.ts`
- Test: `apps/agent_006/__tests__/phase-0-scorer.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/phase-0-scorer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  scorePhase0Round,
  aggregatePhase0Scores,
  shouldEliminatePhase0,
  RANDOM_BASELINE,
  type Phase0RoundScore,
  type Phase0AggregateScore,
} from '../src/scorers/phase-0-scorer.js';
import type { Horizon } from '../src/horizon-config.js';

describe('phase-0-scorer', () => {
  describe('RANDOM_BASELINE', () => {
    it('is ln(2)', () => {
      expect(RANDOM_BASELINE).toBeCloseTo(0.693, 3);
    });
  });

  describe('scorePhase0Round', () => {
    it('computes log loss per horizon', () => {
      const predictions = {
        'bottom-15m': 0.8,
        'bottom-1h': 0.5,
        'bottom-24h': 0.3,
        'bottom-7d': 0.2,
      };
      const labels = {
        '15m': true,
        '1h': false,
        '24h': true,
        '7d': false,
      };

      const score = scorePhase0Round(predictions, labels);

      expect(score.logLossByHorizon['15m']).toBeDefined();
      expect(score.logLossByHorizon['1h']).toBeDefined();
      // High confidence correct = low loss
      expect(score.logLossByHorizon['15m']).toBeLessThan(0.3);
    });

    it('tracks extreme errors (confident wrong)', () => {
      const predictions = {
        'bottom-15m': 0.9, // Very confident
        'bottom-1h': 0.5,
        'bottom-24h': 0.5,
        'bottom-7d': 0.5,
      };
      const labels = {
        '15m': false, // But wrong!
        '1h': false,
        '24h': false,
        '7d': false,
      };

      const score = scorePhase0Round(predictions, labels);

      expect(score.extremeErrors['15m']).toBe(true); // p > 0.8 when label = 0
    });
  });

  describe('aggregatePhase0Scores', () => {
    it('computes mean log loss per horizon', () => {
      const rounds: Phase0RoundScore[] = [
        {
          logLossByHorizon: { '15m': 0.2, '1h': 0.3, '24h': 0.4, '7d': 0.5 },
          extremeErrors: { '15m': false, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
        {
          logLossByHorizon: { '15m': 0.4, '1h': 0.5, '24h': 0.6, '7d': 0.7 },
          extremeErrors: { '15m': false, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
      ];

      const aggregate = aggregatePhase0Scores(rounds);

      expect(aggregate.meanLogLoss['15m']).toBe(0.3);
      expect(aggregate.meanLogLoss['1h']).toBe(0.4);
    });

    it('computes extreme error rate', () => {
      const rounds: Phase0RoundScore[] = [
        {
          logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
          extremeErrors: { '15m': true, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.9, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
        {
          logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
          extremeErrors: { '15m': true, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.85, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
      ];

      const aggregate = aggregatePhase0Scores(rounds);

      expect(aggregate.extremeErrorRate['15m']).toBe(1.0); // 2/2
      expect(aggregate.extremeErrorRate['1h']).toBe(0);
    });

    it('detects degenerate patterns', () => {
      const rounds: Phase0RoundScore[] = Array.from({ length: 6 }, () => ({
        logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        extremeErrors: { '15m': false, '1h': false, '24h': false, '7d': false },
        predictions: { '15m': 0.95, '1h': 0.95, '24h': 0.95, '7d': 0.95 }, // Always high
      }));

      const aggregate = aggregatePhase0Scores(rounds);

      expect(aggregate.degeneratePattern).toBe(true);
    });
  });

  describe('shouldEliminatePhase0', () => {
    it('eliminates if meanLogLoss > baseline * 1.1 on 2+ horizons', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: {
          '15m': RANDOM_BASELINE * 1.2, // Above threshold
          '1h': RANDOM_BASELINE * 1.2,  // Above threshold
          '24h': 0.5,
          '7d': 0.5,
        },
        extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '7d': 0 },
        degeneratePattern: false,
      };

      expect(shouldEliminatePhase0(score)).toBe(true);
    });

    it('eliminates if degenerate pattern', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '7d': 0 },
        degeneratePattern: true,
      };

      expect(shouldEliminatePhase0(score)).toBe(true);
    });

    it('eliminates if extreme error rate > 0.2 on any horizon', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        extremeErrorRate: { '15m': 0.25, '1h': 0, '24h': 0, '7d': 0 }, // > 0.2
        degeneratePattern: false,
      };

      expect(shouldEliminatePhase0(score)).toBe(true);
    });

    it('keeps good models', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.4, '1h': 0.5, '24h': 0.5, '7d': 0.6 },
        extremeErrorRate: { '15m': 0.1, '1h': 0.05, '24h': 0, '7d': 0 },
        degeneratePattern: false,
      };

      expect(shouldEliminatePhase0(score)).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="phase-0-scorer" --run`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `apps/agent_006/src/scorers/phase-0-scorer.ts`:

```typescript
import { logLoss } from './log-loss-scorer.js';

import type { Horizon } from '../horizon-config.js';
import type { BottomContractId } from '../bottom-caller.js';

export const RANDOM_BASELINE = Math.log(2); // ~0.693

export interface Phase0RoundScore {
  logLossByHorizon: Record<Horizon, number>;
  extremeErrors: Record<Horizon, boolean>;
  predictions: Record<Horizon, number>;
}

export interface Phase0AggregateScore {
  meanLogLoss: Record<Horizon, number>;
  extremeErrorRate: Record<Horizon, number>;
  degeneratePattern: boolean;
}

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

function contractToHorizon(contractId: BottomContractId): Horizon {
  return contractId.replace('bottom-', '') as Horizon;
}

/**
 * Score a single round for Phase 0 metrics
 */
export function scorePhase0Round(
  predictions: Record<BottomContractId, number>,
  labels: Record<Horizon, boolean>
): Phase0RoundScore {
  const logLossByHorizon: Record<string, number> = {};
  const extremeErrors: Record<string, boolean> = {};
  const predictionsByHorizon: Record<string, number> = {};

  for (const horizon of HORIZONS) {
    const contractId = `bottom-${horizon}` as BottomContractId;
    const prediction = predictions[contractId];
    const label = labels[horizon];

    logLossByHorizon[horizon] = logLoss(prediction, label);
    predictionsByHorizon[horizon] = prediction;

    // Extreme error: confident wrong (p > 0.8 when label = false)
    extremeErrors[horizon] = prediction > 0.8 && !label;
  }

  return {
    logLossByHorizon: logLossByHorizon as Record<Horizon, number>,
    extremeErrors: extremeErrors as Record<Horizon, boolean>,
    predictions: predictionsByHorizon as Record<Horizon, number>,
  };
}

/**
 * Aggregate Phase 0 scores across rounds
 */
export function aggregatePhase0Scores(rounds: Phase0RoundScore[]): Phase0AggregateScore {
  const meanLogLoss: Record<string, number> = {};
  const extremeErrorRate: Record<string, number> = {};

  for (const horizon of HORIZONS) {
    // Mean log loss
    const losses = rounds.map(r => r.logLossByHorizon[horizon]);
    meanLogLoss[horizon] = losses.reduce((a, b) => a + b, 0) / losses.length;

    // Extreme error rate
    const errors = rounds.filter(r => r.extremeErrors[horizon]).length;
    extremeErrorRate[horizon] = errors / rounds.length;
  }

  // Degenerate pattern: always > 0.9 or always < 0.1
  const allPredictions = rounds.flatMap(r => Object.values(r.predictions));
  const alwaysHigh = allPredictions.every(p => p > 0.9);
  const alwaysLow = allPredictions.every(p => p < 0.1);
  const degeneratePattern = alwaysHigh || alwaysLow;

  return {
    meanLogLoss: meanLogLoss as Record<Horizon, number>,
    extremeErrorRate: extremeErrorRate as Record<Horizon, number>,
    degeneratePattern,
  };
}

/**
 * Determine if model should be eliminated in Phase 0
 */
export function shouldEliminatePhase0(score: Phase0AggregateScore): boolean {
  const threshold = RANDOM_BASELINE * 1.1;

  // Count horizons with log loss above threshold
  const horizonsAboveThreshold = HORIZONS.filter(
    h => score.meanLogLoss[h] > threshold
  ).length;

  // Eliminate if:
  // 1. meanLogLoss > baseline * 1.1 on 2+ horizons
  if (horizonsAboveThreshold >= 2) return true;

  // 2. degeneratePattern = true
  if (score.degeneratePattern) return true;

  // 3. extremeErrorRate > 0.2 on any horizon
  for (const horizon of HORIZONS) {
    if (score.extremeErrorRate[horizon] > 0.2) return true;
  }

  return false;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="phase-0-scorer" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/scorers/phase-0-scorer.ts apps/agent_006/__tests__/phase-0-scorer.test.ts
git commit -m "feat(agent_006): add Phase 0 sanity filter scorer"
```

---

## Task 7: Create Phase 1 Horizon Competence Scorer

**Files:**
- Create: `apps/agent_006/src/scorers/phase-1-scorer.ts`
- Test: `apps/agent_006/__tests__/phase-1-scorer.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/phase-1-scorer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  computePercentileRanks,
  shouldEliminatePhase1,
  type Phase1ModelScore,
} from '../src/scorers/phase-1-scorer.js';
import type { Horizon } from '../src/horizon-config.js';

describe('phase-1-scorer', () => {
  describe('computePercentileRanks', () => {
    it('computes percentile rank per horizon relative to cohort', () => {
      // 5 models with different log losses
      const modelScores: Phase1ModelScore[] = [
        { modelId: 'model-a', meanLogLoss: { '15m': 0.3, '1h': 0.4, '24h': 0.5, '7d': 0.6 } },
        { modelId: 'model-b', meanLogLoss: { '15m': 0.4, '1h': 0.5, '24h': 0.6, '7d': 0.7 } },
        { modelId: 'model-c', meanLogLoss: { '15m': 0.5, '1h': 0.6, '24h': 0.7, '7d': 0.8 } },
        { modelId: 'model-d', meanLogLoss: { '15m': 0.6, '1h': 0.7, '24h': 0.8, '7d': 0.9 } },
        { modelId: 'model-e', meanLogLoss: { '15m': 0.7, '1h': 0.8, '24h': 0.9, '7d': 1.0 } },
      ];

      const ranks = computePercentileRanks(modelScores);

      // Best model (lowest log loss) should have highest percentile
      expect(ranks.get('model-a')?.['15m']).toBeGreaterThan(75);
      // Worst model should have lowest percentile
      expect(ranks.get('model-e')?.['15m']).toBeLessThan(25);
    });
  });

  describe('shouldEliminatePhase1', () => {
    it('eliminates if percentileRank < 25 on 2+ horizons', () => {
      const percentiles: Record<Horizon, number> = {
        '15m': 20, // Below 25
        '1h': 15,  // Below 25
        '24h': 50,
        '7d': 60,
      };

      expect(shouldEliminatePhase1(percentiles)).toBe(true);
    });

    it('eliminates if no horizon has percentileRank >= 75', () => {
      const percentiles: Record<Horizon, number> = {
        '15m': 50,
        '1h': 60,
        '24h': 55,
        '7d': 65, // None >= 75
      };

      expect(shouldEliminatePhase1(percentiles)).toBe(true);
    });

    it('keeps specialists with one strong horizon', () => {
      const percentiles: Record<Horizon, number> = {
        '15m': 80, // Strong!
        '1h': 40,
        '24h': 35,
        '7d': 30,
      };

      expect(shouldEliminatePhase1(percentiles)).toBe(false);
    });

    it('keeps well-rounded models', () => {
      const percentiles: Record<Horizon, number> = {
        '15m': 60,
        '1h': 80, // Strong
        '24h': 55,
        '7d': 50,
      };

      expect(shouldEliminatePhase1(percentiles)).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="phase-1-scorer" --run`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `apps/agent_006/src/scorers/phase-1-scorer.ts`:

```typescript
import type { Horizon } from '../horizon-config.js';

export interface Phase1ModelScore {
  modelId: string;
  meanLogLoss: Record<Horizon, number>;
}

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

/**
 * Compute percentile ranks for each model per horizon.
 * Lower log loss = higher percentile (better).
 */
export function computePercentileRanks(
  modelScores: Phase1ModelScore[]
): Map<string, Record<Horizon, number>> {
  const ranks = new Map<string, Record<Horizon, number>>();

  // Initialize
  for (const score of modelScores) {
    ranks.set(score.modelId, { '15m': 0, '1h': 0, '24h': 0, '7d': 0 });
  }

  // Compute percentile per horizon
  for (const horizon of HORIZONS) {
    // Sort by log loss ascending (best first)
    const sorted = [...modelScores].sort(
      (a, b) => a.meanLogLoss[horizon] - b.meanLogLoss[horizon]
    );

    const n = sorted.length;
    for (let i = 0; i < n; i++) {
      const model = sorted[i];
      if (model === undefined) continue;

      // Percentile: 100 * (n - rank) / n
      // Best (rank 0) gets ~100, worst gets ~0
      const percentile = 100 * (n - 1 - i) / (n - 1);
      const modelRanks = ranks.get(model.modelId);
      if (modelRanks !== undefined) {
        modelRanks[horizon] = percentile;
      }
    }
  }

  return ranks;
}

/**
 * Determine if model should be eliminated in Phase 1
 */
export function shouldEliminatePhase1(
  percentiles: Record<Horizon, number>
): boolean {
  // Count horizons with percentile < 25 (bottom quartile)
  const horizonsBelowThreshold = HORIZONS.filter(
    h => percentiles[h] < 25
  ).length;

  // Eliminate if bottom quartile on 2+ horizons
  if (horizonsBelowThreshold >= 2) return true;

  // Check if any horizon has percentile >= 75 (top quartile strength)
  const hasStrength = HORIZONS.some(h => percentiles[h] >= 75);

  // Eliminate if no horizon shows strength
  if (!hasStrength) return true;

  return false;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="phase-1-scorer" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/scorers/phase-1-scorer.ts apps/agent_006/__tests__/phase-1-scorer.test.ts
git commit -m "feat(agent_006): add Phase 1 horizon competence scorer"
```

---

## Task 8: Create Phase 2 Stability Scorer

**Files:**
- Create: `apps/agent_006/src/scorers/phase-2-scorer.ts`
- Test: `apps/agent_006/__tests__/phase-2-scorer.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/phase-2-scorer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  computeRollingWindows,
  computeStabilityMetrics,
  shouldEliminatePhase2,
  type Phase2ModelScore,
} from '../src/scorers/phase-2-scorer.js';
import type { Horizon } from '../src/horizon-config.js';

describe('phase-2-scorer', () => {
  describe('computeRollingWindows', () => {
    it('computes 6-round rolling windows', () => {
      const roundLosses = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

      const windows = computeRollingWindows(roundLosses, 6);

      expect(windows).toHaveLength(3); // 8 - 6 + 1 = 3
      // First window: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8] avg = 0.55
      expect(windows[0]).toBeCloseTo(0.55, 2);
    });
  });

  describe('computeStabilityMetrics', () => {
    it('computes best/worst window and variance', () => {
      const roundLosses = [0.3, 0.4, 0.5, 0.6, 0.5, 0.4, 0.3, 0.4];

      const metrics = computeStabilityMetrics(roundLosses);

      expect(metrics.bestWindow).toBeDefined();
      expect(metrics.worstWindow).toBeDefined();
      expect(metrics.worstWindow).toBeGreaterThanOrEqual(metrics.bestWindow);
      expect(metrics.variance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('shouldEliminatePhase2', () => {
    it('eliminates if regret > 1.5 on 2+ horizons', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: {
          '15m': 1.8, // Above 1.5
          '1h': 1.6,  // Above 1.5
          '24h': 1.0,
          '7d': 0.9,
        },
        stabilityByHorizon: { '15m': 0.1, '1h': 0.1, '24h': 0.1, '7d': 0.1 },
      };
      const medianStability: Record<Horizon, number> = {
        '15m': 0.1, '1h': 0.1, '24h': 0.1, '7d': 0.1,
      };

      expect(shouldEliminatePhase2(modelScore, medianStability)).toBe(true);
    });

    it('eliminates if stability > 2x median on 3+ horizons', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: { '15m': 1.0, '1h': 1.0, '24h': 1.0, '7d': 1.0 },
        stabilityByHorizon: {
          '15m': 0.3, // > 2 * 0.1
          '1h': 0.3,  // > 2 * 0.1
          '24h': 0.3, // > 2 * 0.1
          '7d': 0.1,
        },
      };
      const medianStability: Record<Horizon, number> = {
        '15m': 0.1, '1h': 0.1, '24h': 0.1, '7d': 0.1,
      };

      expect(shouldEliminatePhase2(modelScore, medianStability)).toBe(true);
    });

    it('keeps stable models', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: { '15m': 1.0, '1h': 1.2, '24h': 1.1, '7d': 0.9 },
        stabilityByHorizon: { '15m': 0.08, '1h': 0.09, '24h': 0.1, '7d': 0.11 },
      };
      const medianStability: Record<Horizon, number> = {
        '15m': 0.1, '1h': 0.1, '24h': 0.1, '7d': 0.1,
      };

      expect(shouldEliminatePhase2(modelScore, medianStability)).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="phase-2-scorer" --run`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `apps/agent_006/src/scorers/phase-2-scorer.ts`:

```typescript
import type { Horizon } from '../horizon-config.js';

export interface Phase2ModelScore {
  modelId: string;
  regretByHorizon: Record<Horizon, number>;
  stabilityByHorizon: Record<Horizon, number>;
  bestWindowByHorizon?: Record<Horizon, number>;
  worstWindowByHorizon?: Record<Horizon, number>;
  timeToPivotRatioByHorizon?: Record<Horizon, number>;
}

export interface StabilityMetrics {
  bestWindow: number;
  worstWindow: number;
  variance: number;
}

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];
const WINDOW_SIZE = 6;

/**
 * Compute rolling window averages
 */
export function computeRollingWindows(
  roundLosses: number[],
  windowSize: number = WINDOW_SIZE
): number[] {
  const windows: number[] = [];

  for (let i = 0; i <= roundLosses.length - windowSize; i++) {
    const window = roundLosses.slice(i, i + windowSize);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    windows.push(avg);
  }

  return windows;
}

/**
 * Compute stability metrics from round losses
 */
export function computeStabilityMetrics(roundLosses: number[]): StabilityMetrics {
  const windows = computeRollingWindows(roundLosses);

  if (windows.length === 0) {
    return { bestWindow: 0, worstWindow: 0, variance: 0 };
  }

  const bestWindow = Math.min(...windows);
  const worstWindow = Math.max(...windows);

  // Variance of rolling performance
  const mean = windows.reduce((a, b) => a + b, 0) / windows.length;
  const variance = windows.reduce((sum, w) => sum + (w - mean) ** 2, 0) / windows.length;

  return { bestWindow, worstWindow, variance };
}

/**
 * Compute regret: model's worstWindow / median of all worstWindows
 */
export function computeRegret(
  modelWorstWindow: number,
  medianWorstWindow: number
): number {
  if (medianWorstWindow === 0) return 1;
  return modelWorstWindow / medianWorstWindow;
}

/**
 * Determine if model should be eliminated in Phase 2
 */
export function shouldEliminatePhase2(
  modelScore: Phase2ModelScore,
  medianStability: Record<Horizon, number>
): boolean {
  // Count horizons with regret > 1.5
  const horizonsHighRegret = HORIZONS.filter(
    h => modelScore.regretByHorizon[h] > 1.5
  ).length;

  // Eliminate if regret > 1.5 on 2+ horizons
  if (horizonsHighRegret >= 2) return true;

  // Count horizons with stability > 2x median
  const horizonsUnstable = HORIZONS.filter(
    h => modelScore.stabilityByHorizon[h] > 2 * medianStability[h]
  ).length;

  // Eliminate if stability > 2x median on 3+ horizons
  if (horizonsUnstable >= 3) return true;

  return false;
}

/**
 * Compute median of array
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="phase-2-scorer" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/scorers/phase-2-scorer.ts apps/agent_006/__tests__/phase-2-scorer.test.ts
git commit -m "feat(agent_006): add Phase 2 stability/regret scorer"
```

---

## Task 9: Create Phase 3 Arena Ranking Scorer

**Files:**
- Create: `apps/agent_006/src/scorers/phase-3-scorer.ts`
- Test: `apps/agent_006/__tests__/phase-3-scorer.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/phase-3-scorer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  winsorize,
  normalize,
  computeCompositeScore,
  rankModels,
  type Phase3ModelMetrics,
} from '../src/scorers/phase-3-scorer.js';

describe('phase-3-scorer', () => {
  describe('winsorize', () => {
    it('clips values to 5th-95th percentile', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]; // 100 is outlier

      const result = winsorize(values);

      expect(result[9]).toBeLessThan(100); // Outlier clipped
      expect(result[0]).toBe(1); // Normal values unchanged
    });
  });

  describe('normalize', () => {
    it('normalizes to 0-1 range', () => {
      const values = [10, 20, 30, 40, 50];

      const result = normalize(values);

      expect(Math.min(...result)).toBeCloseTo(0);
      expect(Math.max(...result)).toBeCloseTo(1);
    });
  });

  describe('computeCompositeScore', () => {
    it('computes weighted composite', () => {
      const metrics: Phase3ModelMetrics = {
        avgPercentileRank: 80,      // 40% weight
        avgBestWindow: 0.3,         // 30% weight (lower is better)
        avgStability: 0.1,          // 20% weight (lower is better)
        avgTimeToPivotRatio: 0.4,   // 10% weight (lower is better = earlier)
      };

      const score = computeCompositeScore(metrics, {
        bestWindowRange: { min: 0.2, max: 0.5 },
        stabilityRange: { min: 0.05, max: 0.2 },
      });

      // Higher is better
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('rankModels', () => {
    it('returns top 8 models by composite score', () => {
      const models: Array<{ modelId: string; metrics: Phase3ModelMetrics }> = [];
      for (let i = 0; i < 12; i++) {
        models.push({
          modelId: `model-${i}`,
          metrics: {
            avgPercentileRank: 50 + i * 4, // 50-94
            avgBestWindow: 0.3 + i * 0.01,
            avgStability: 0.1 + i * 0.005,
            avgTimeToPivotRatio: 0.5,
          },
        });
      }

      const ranked = rankModels(models);

      expect(ranked).toHaveLength(8);
      // Best models (highest percentile) should be first
      expect(ranked[0]?.modelId).toBe('model-11');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="phase-3-scorer" --run`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `apps/agent_006/src/scorers/phase-3-scorer.ts`:

```typescript
export interface Phase3ModelMetrics {
  avgPercentileRank: number;      // 0-100
  avgBestWindow: number;          // Lower is better
  avgStability: number;           // Lower is better (variance)
  avgTimeToPivotRatio: number;    // Lower is better (earlier detection)
}

export interface NormalizationRanges {
  bestWindowRange: { min: number; max: number };
  stabilityRange: { min: number; max: number };
}

const ARENA_SIZE = 8;

/**
 * Winsorize values to 5th-95th percentile
 */
export function winsorize(values: number[]): number[] {
  if (values.length === 0) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const p5Index = Math.floor(values.length * 0.05);
  const p95Index = Math.ceil(values.length * 0.95) - 1;

  const p5 = sorted[p5Index] ?? sorted[0]!;
  const p95 = sorted[p95Index] ?? sorted[sorted.length - 1]!;

  return values.map(v => Math.max(p5, Math.min(p95, v)));
}

/**
 * Normalize values to 0-1 range
 */
export function normalize(values: number[]): number[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) return values.map(() => 0.5);

  return values.map(v => (v - min) / (max - min));
}

/**
 * Compute composite score for a model
 *
 * Weights:
 * - 40% avgPercentileRank (higher is better)
 * - 30% avgBestWindow (lower is better, inverted)
 * - 20% avgStability (lower is better, inverted)
 * - 10% avgTimeToPivotRatio (lower is better, inverted = early bonus)
 */
export function computeCompositeScore(
  metrics: Phase3ModelMetrics,
  ranges: NormalizationRanges
): number {
  // Normalize percentile rank (0-100 to 0-1)
  const normalizedRank = metrics.avgPercentileRank / 100;

  // Normalize and invert best window (lower is better)
  const bestWindowNorm = (metrics.avgBestWindow - ranges.bestWindowRange.min) /
    (ranges.bestWindowRange.max - ranges.bestWindowRange.min);
  const bestWindowScore = 1 - Math.max(0, Math.min(1, bestWindowNorm));

  // Normalize and invert stability (lower is better)
  const stabilityNorm = (metrics.avgStability - ranges.stabilityRange.min) /
    (ranges.stabilityRange.max - ranges.stabilityRange.min);
  const stabilityScore = 1 - Math.max(0, Math.min(1, stabilityNorm));

  // Time to pivot ratio is already 0-1, invert (lower = earlier = better)
  const earlyBonus = 1 - metrics.avgTimeToPivotRatio;

  // Weighted composite
  const composite =
    0.40 * normalizedRank +
    0.30 * bestWindowScore +
    0.20 * stabilityScore +
    0.10 * earlyBonus;

  return composite;
}

/**
 * Rank models and return top 8 arena competitors
 */
export function rankModels(
  models: Array<{ modelId: string; metrics: Phase3ModelMetrics }>
): Array<{ modelId: string; score: number }> {
  // Compute normalization ranges from cohort
  const bestWindows = models.map(m => m.metrics.avgBestWindow);
  const stabilities = models.map(m => m.metrics.avgStability);

  // Winsorize before computing ranges
  const winsorizedBW = winsorize(bestWindows);
  const winsorizedStab = winsorize(stabilities);

  const ranges: NormalizationRanges = {
    bestWindowRange: {
      min: Math.min(...winsorizedBW),
      max: Math.max(...winsorizedBW),
    },
    stabilityRange: {
      min: Math.min(...winsorizedStab),
      max: Math.max(...winsorizedStab),
    },
  };

  // Score each model
  const scored = models.map(m => ({
    modelId: m.modelId,
    score: computeCompositeScore(m.metrics, ranges),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return top 8
  return scored.slice(0, ARENA_SIZE);
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="phase-3-scorer" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/scorers/phase-3-scorer.ts apps/agent_006/__tests__/phase-3-scorer.test.ts
git commit -m "feat(agent_006): add Phase 3 arena ranking scorer"
```

---

## Task 10: Create Model State Manager

**Files:**
- Create: `apps/agent_006/src/state/model-state.ts`
- Test: `apps/agent_006/__tests__/model-state.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/model-state.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import {
  ModelStateManager,
  type ModelState,
  type Phase,
} from '../src/state/model-state.js';

describe('model-state', () => {
  let manager: ModelStateManager;

  beforeEach(() => {
    manager = new ModelStateManager(['model-a', 'model-b', 'model-c']);
  });

  describe('initialization', () => {
    it('starts all models as active in phase 0', () => {
      expect(manager.getActiveModels()).toHaveLength(3);
      expect(manager.getCurrentPhase()).toBe(0);
    });
  });

  describe('eliminateModel', () => {
    it('removes model from active set', () => {
      manager.eliminateModel('model-a', 0, 'Failed sanity check');

      expect(manager.getActiveModels()).toHaveLength(2);
      expect(manager.isEliminated('model-a')).toBe(true);
    });

    it('records elimination reason', () => {
      manager.eliminateModel('model-b', 1, 'No strength');

      const state = manager.getModelState('model-b');
      expect(state?.eliminatedInPhase).toBe(1);
      expect(state?.eliminationReason).toBe('No strength');
    });
  });

  describe('addRoundScore', () => {
    it('accumulates round scores for model', () => {
      manager.addRoundScore('model-a', { roundNumber: 1, logLoss: 0.5 });
      manager.addRoundScore('model-a', { roundNumber: 2, logLoss: 0.4 });

      const state = manager.getModelState('model-a');
      expect(state?.roundScores).toHaveLength(2);
    });
  });

  describe('advancePhase', () => {
    it('increments current phase', () => {
      manager.advancePhase();
      expect(manager.getCurrentPhase()).toBe(1);

      manager.advancePhase();
      expect(manager.getCurrentPhase()).toBe(2);
    });
  });

  describe('getEliminatedModels', () => {
    it('returns all eliminated models', () => {
      manager.eliminateModel('model-a', 0, 'Reason A');
      manager.eliminateModel('model-b', 1, 'Reason B');

      const eliminated = manager.getEliminatedModels();
      expect(eliminated).toHaveLength(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="model-state" --run`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `apps/agent_006/src/state/model-state.ts`:

```typescript
import type { Horizon } from '../horizon-config.js';

export type Phase = 0 | 1 | 2 | 3;

export interface RoundScore {
  roundNumber: number;
  logLoss: number;
  logLossByHorizon?: Record<Horizon, number>;
  predictions?: Record<Horizon, number>;
  labels?: Record<Horizon, boolean>;
  timeToPivotRatio?: Record<Horizon, number | undefined>;
}

export interface ModelState {
  modelId: string;
  isActive: boolean;
  eliminatedInPhase?: Phase;
  eliminationReason?: string;
  roundScores: RoundScore[];
}

export class ModelStateManager {
  private models: Map<string, ModelState>;
  private currentPhase: Phase;

  constructor(modelIds: string[]) {
    this.models = new Map();
    this.currentPhase = 0;

    for (const modelId of modelIds) {
      this.models.set(modelId, {
        modelId,
        isActive: true,
        roundScores: [],
      });
    }
  }

  getCurrentPhase(): Phase {
    return this.currentPhase;
  }

  advancePhase(): void {
    if (this.currentPhase < 3) {
      this.currentPhase = (this.currentPhase + 1) as Phase;
    }
  }

  getActiveModels(): string[] {
    return [...this.models.values()]
      .filter(m => m.isActive)
      .map(m => m.modelId);
  }

  getEliminatedModels(): ModelState[] {
    return [...this.models.values()].filter(m => !m.isActive);
  }

  isEliminated(modelId: string): boolean {
    return this.models.get(modelId)?.isActive === false;
  }

  getModelState(modelId: string): ModelState | undefined {
    return this.models.get(modelId);
  }

  eliminateModel(modelId: string, phase: Phase, reason: string): void {
    const state = this.models.get(modelId);
    if (state !== undefined) {
      state.isActive = false;
      state.eliminatedInPhase = phase;
      state.eliminationReason = reason;
    }
  }

  addRoundScore(modelId: string, score: RoundScore): void {
    const state = this.models.get(modelId);
    if (state !== undefined) {
      state.roundScores.push(score);
    }
  }

  getAllModelStates(): ModelState[] {
    return [...this.models.values()];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="model-state" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/state/model-state.ts apps/agent_006/__tests__/model-state.test.ts
git commit -m "feat(agent_006): add in-memory model state manager"
```

---

## Task 11: Create Phase Runner

**Files:**
- Create: `apps/agent_006/src/phases/phase-runner.ts`
- Test: `apps/agent_006/__tests__/phase-runner.test.ts`

**Step 1: Write the failing test**

Create `apps/agent_006/__tests__/phase-runner.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  runPhase0,
  runPhase1,
  runPhase2,
  runPhase3,
} from '../src/phases/phase-runner.js';
import { ModelStateManager } from '../src/state/model-state.js';
import type { Horizon } from '../src/horizon-config.js';

// Mock dependencies
vi.mock('../src/bottom-caller.js');
vi.mock('../src/ground-truth/bottom-checker.js');
vi.mock('@nullagent/agent-core');

describe('phase-runner', () => {
  describe('runPhase0', () => {
    it('eliminates models that fail sanity checks', async () => {
      const manager = new ModelStateManager(['model-a', 'model-b']);

      // Add failing scores for model-a
      manager.addRoundScore('model-a', {
        roundNumber: 1,
        logLoss: 0.9, // Very bad
        logLossByHorizon: { '15m': 0.9, '1h': 0.9, '24h': 0.9, '7d': 0.9 },
        predictions: { '15m': 0.95, '1h': 0.95, '24h': 0.95, '7d': 0.95 }, // Degenerate
      });

      // Add passing scores for model-b
      manager.addRoundScore('model-b', {
        roundNumber: 1,
        logLoss: 0.4,
        logLossByHorizon: { '15m': 0.4, '1h': 0.4, '24h': 0.4, '7d': 0.4 },
        predictions: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
      });

      // Simulate 6 rounds of the same
      for (let i = 0; i < 5; i++) {
        manager.addRoundScore('model-a', {
          roundNumber: i + 2,
          logLoss: 0.9,
          logLossByHorizon: { '15m': 0.9, '1h': 0.9, '24h': 0.9, '7d': 0.9 },
          predictions: { '15m': 0.95, '1h': 0.95, '24h': 0.95, '7d': 0.95 },
        });
        manager.addRoundScore('model-b', {
          roundNumber: i + 2,
          logLoss: 0.4,
          logLossByHorizon: { '15m': 0.4, '1h': 0.4, '24h': 0.4, '7d': 0.4 },
          predictions: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        });
      }

      runPhase0(manager);

      expect(manager.isEliminated('model-a')).toBe(true);
      expect(manager.isEliminated('model-b')).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="phase-runner" --run`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `apps/agent_006/src/phases/phase-runner.ts`:

```typescript
import { ModelStateManager } from '../state/model-state.js';
import {
  aggregatePhase0Scores,
  shouldEliminatePhase0,
  type Phase0RoundScore,
} from '../scorers/phase-0-scorer.js';
import {
  computePercentileRanks,
  shouldEliminatePhase1,
  type Phase1ModelScore,
} from '../scorers/phase-1-scorer.js';
import {
  computeStabilityMetrics,
  computeRegret,
  shouldEliminatePhase2,
  median,
  type Phase2ModelScore,
} from '../scorers/phase-2-scorer.js';
import {
  rankModels,
  type Phase3ModelMetrics,
} from '../scorers/phase-3-scorer.js';

import type { Horizon } from '../horizon-config.js';

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

/**
 * Run Phase 0 elimination on accumulated scores
 */
export function runPhase0(manager: ModelStateManager): void {
  const activeModels = manager.getActiveModels();

  for (const modelId of activeModels) {
    const state = manager.getModelState(modelId);
    if (state === undefined) continue;

    // Convert round scores to Phase0RoundScore format
    const phase0Rounds: Phase0RoundScore[] = state.roundScores
      .filter(r => r.logLossByHorizon !== undefined && r.predictions !== undefined)
      .map(r => ({
        logLossByHorizon: r.logLossByHorizon!,
        extremeErrors: HORIZONS.reduce((acc, h) => {
          acc[h] = r.predictions![h] > 0.8 && r.labels?.[h] === false;
          return acc;
        }, {} as Record<Horizon, boolean>),
        predictions: r.predictions!,
      }));

    if (phase0Rounds.length < 6) continue; // Need minimum rounds

    const aggregate = aggregatePhase0Scores(phase0Rounds);

    if (shouldEliminatePhase0(aggregate)) {
      manager.eliminateModel(modelId, 0, getPhase0Reason(aggregate));
    }
  }
}

function getPhase0Reason(aggregate: ReturnType<typeof aggregatePhase0Scores>): string {
  if (aggregate.degeneratePattern) return 'Degenerate pattern';
  const RANDOM_BASELINE = Math.log(2);
  const threshold = RANDOM_BASELINE * 1.1;
  const badHorizons = HORIZONS.filter(h => aggregate.meanLogLoss[h] > threshold);
  if (badHorizons.length >= 2) return `High log loss on ${badHorizons.join(', ')}`;
  const extremeHorizons = HORIZONS.filter(h => aggregate.extremeErrorRate[h] > 0.2);
  if (extremeHorizons.length > 0) return `Extreme errors on ${extremeHorizons.join(', ')}`;
  return 'Failed sanity check';
}

/**
 * Run Phase 1 elimination on accumulated scores
 */
export function runPhase1(manager: ModelStateManager): void {
  const activeModels = manager.getActiveModels();

  // Build Phase1 scores for all active models
  const phase1Scores: Phase1ModelScore[] = activeModels
    .map(modelId => {
      const state = manager.getModelState(modelId);
      if (state === undefined) return null;

      const meanLogLoss: Record<Horizon, number> = { '15m': 0, '1h': 0, '24h': 0, '7d': 0 };
      let count = 0;

      for (const round of state.roundScores) {
        if (round.logLossByHorizon !== undefined) {
          for (const h of HORIZONS) {
            meanLogLoss[h] += round.logLossByHorizon[h];
          }
          count++;
        }
      }

      if (count === 0) return null;

      for (const h of HORIZONS) {
        meanLogLoss[h] /= count;
      }

      return { modelId, meanLogLoss };
    })
    .filter((s): s is Phase1ModelScore => s !== null);

  // Compute percentile ranks
  const percentileRanks = computePercentileRanks(phase1Scores);

  // Eliminate models
  for (const modelId of activeModels) {
    const percentiles = percentileRanks.get(modelId);
    if (percentiles !== undefined && shouldEliminatePhase1(percentiles)) {
      manager.eliminateModel(modelId, 1, getPhase1Reason(percentiles));
    }
  }
}

function getPhase1Reason(percentiles: Record<Horizon, number>): string {
  const weakHorizons = HORIZONS.filter(h => percentiles[h] < 25);
  if (weakHorizons.length >= 2) return `Bottom quartile on ${weakHorizons.join(', ')}`;
  const hasStrength = HORIZONS.some(h => percentiles[h] >= 75);
  if (!hasStrength) return 'No horizon strength';
  return 'Failed competence filter';
}

/**
 * Run Phase 2 elimination on accumulated scores
 */
export function runPhase2(manager: ModelStateManager): void {
  const activeModels = manager.getActiveModels();

  // Compute stability metrics for all active models
  const phase2Scores: Phase2ModelScore[] = [];

  for (const modelId of activeModels) {
    const state = manager.getModelState(modelId);
    if (state === undefined) continue;

    const regretByHorizon: Record<string, number> = {};
    const stabilityByHorizon: Record<string, number> = {};
    const worstWindowByHorizon: Record<string, number> = {};

    for (const h of HORIZONS) {
      const losses = state.roundScores
        .filter(r => r.logLossByHorizon !== undefined)
        .map(r => r.logLossByHorizon![h]);

      const metrics = computeStabilityMetrics(losses);
      stabilityByHorizon[h] = metrics.variance;
      worstWindowByHorizon[h] = metrics.worstWindow;
    }

    phase2Scores.push({
      modelId,
      regretByHorizon: regretByHorizon as Record<Horizon, number>,
      stabilityByHorizon: stabilityByHorizon as Record<Horizon, number>,
      worstWindowByHorizon: worstWindowByHorizon as Record<Horizon, number>,
    });
  }

  // Compute median worst windows for regret calculation
  for (const h of HORIZONS) {
    const worstWindows = phase2Scores.map(s => s.worstWindowByHorizon?.[h] ?? 0);
    const medianWorst = median(worstWindows);

    for (const score of phase2Scores) {
      score.regretByHorizon[h] = computeRegret(
        score.worstWindowByHorizon?.[h] ?? 0,
        medianWorst
      );
    }
  }

  // Compute median stability per horizon
  const medianStability: Record<Horizon, number> = { '15m': 0, '1h': 0, '24h': 0, '7d': 0 };
  for (const h of HORIZONS) {
    const stabilities = phase2Scores.map(s => s.stabilityByHorizon[h]);
    medianStability[h] = median(stabilities);
  }

  // Eliminate models
  for (const score of phase2Scores) {
    if (shouldEliminatePhase2(score, medianStability)) {
      manager.eliminateModel(score.modelId, 2, getPhase2Reason(score, medianStability));
    }
  }
}

function getPhase2Reason(
  score: Phase2ModelScore,
  medianStability: Record<Horizon, number>
): string {
  const highRegret = HORIZONS.filter(h => score.regretByHorizon[h] > 1.5);
  if (highRegret.length >= 2) return `High regret on ${highRegret.join(', ')}`;
  const unstable = HORIZONS.filter(h => score.stabilityByHorizon[h] > 2 * medianStability[h]);
  if (unstable.length >= 3) return `Unstable on ${unstable.join(', ')}`;
  return 'Failed stability filter';
}

/**
 * Run Phase 3 ranking (no elimination)
 */
export function runPhase3(manager: ModelStateManager): Array<{ modelId: string; score: number }> {
  const activeModels = manager.getActiveModels();

  const phase3Models: Array<{ modelId: string; metrics: Phase3ModelMetrics }> = [];

  for (const modelId of activeModels) {
    const state = manager.getModelState(modelId);
    if (state === undefined) continue;

    // Compute average percentile rank across horizons
    // This is a simplification - in full implementation would use Phase 1 percentiles
    let avgPercentileRank = 50; // Placeholder

    // Compute average best window, stability, time-to-pivot
    let avgBestWindow = 0;
    let avgStability = 0;
    let avgTimeToPivotRatio = 0.5;
    let horizonCount = 0;

    for (const h of HORIZONS) {
      const losses = state.roundScores
        .filter(r => r.logLossByHorizon !== undefined)
        .map(r => r.logLossByHorizon![h]);

      const metrics = computeStabilityMetrics(losses);
      avgBestWindow += metrics.bestWindow;
      avgStability += metrics.variance;

      // Average time-to-pivot for this horizon
      const pivotRatios = state.roundScores
        .filter(r => r.timeToPivotRatio?.[h] !== undefined)
        .map(r => r.timeToPivotRatio![h]!);
      if (pivotRatios.length > 0) {
        avgTimeToPivotRatio += pivotRatios.reduce((a, b) => a + b, 0) / pivotRatios.length;
      }

      horizonCount++;
    }

    if (horizonCount > 0) {
      avgBestWindow /= horizonCount;
      avgStability /= horizonCount;
      avgTimeToPivotRatio /= horizonCount;
    }

    phase3Models.push({
      modelId,
      metrics: {
        avgPercentileRank,
        avgBestWindow,
        avgStability,
        avgTimeToPivotRatio,
      },
    });
  }

  return rankModels(phase3Models);
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_006 && pnpm test:unit -- --testNamePattern="phase-runner" --run`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/phases/phase-runner.ts apps/agent_006/__tests__/phase-runner.test.ts
git commit -m "feat(agent_006): add phase runner for 4-phase elimination"
```

---

## Task 12: Update Benchmark Orchestrator

**Files:**
- Modify: `apps/agent_006/src/benchmark.ts`

**Step 1: Update benchmark.ts**

Replace `apps/agent_006/src/benchmark.ts` with multi-phase orchestration:

```typescript
import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';

import { initializeClock, advanceClock, resetClockState } from './clock-state.js';
import {
  createBottomCaller,
  setBottomCallerContext,
  clearBottomCallerContext,
} from './bottom-caller.js';
import { resolveAllHorizonsGroundTruth } from './ground-truth/bottom-checker.js';
import { getModelIds, BENCHMARK_ROUNDS } from './matrix.js';
import { getForecastingCharts } from './replay-lab/charts.js';
import { getOrderbookSnapshot, formatOrderbookForPrompt } from './replay-lab/orderbook.js';
import { getTrades } from './replay-lab/trades.js';
import { ModelStateManager } from './state/model-state.js';
import { runPhase0, runPhase1, runPhase2, runPhase3 } from './phases/phase-runner.js';
import { logLoss } from './scorers/log-loss-scorer.js';
import { printPhaseResults, printArenaResults } from './table.js';

import type { Horizon } from './horizon-config.js';
import type { BottomContractId } from './bottom-caller.js';

const logger = createBenchmarkLogger(process.argv.includes('--verbose'));

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

// Phase configuration
const PHASE_ROUNDS = {
  0: 6,   // Sanity filter: 6-12 rounds
  1: 12,  // Horizon competence: 12-24 rounds
  2: 24,  // Stability: 24-48 rounds
  3: 0,   // Ranking only, no additional rounds
} as const;

async function runModelRound(
  modelId: string,
  symbolId: string,
  roundNumber: number,
  predictionTime: Date
): Promise<{
  predictions: Record<Horizon, number>;
  labels: Record<Horizon, boolean>;
  logLossByHorizon: Record<Horizon, number>;
  timeToPivotRatio: Record<Horizon, number | undefined>;
}> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  process.env['MODEL_ID'] = modelId;

  const agent = createBottomCaller(modelId);
  const result = await runRound(agent);
  const output = result.output;

  // Fetch trades for ground truth (need full 7d window for longest horizon)
  const tradeWindowEnd = new Date(predictionTime.getTime() + 7 * 24 * 60 * 60 * 1000);
  const trades = await getTrades(symbolId, predictionTime, tradeWindowEnd);

  // Resolve ground truth for all horizons
  const groundTruth = await resolveAllHorizonsGroundTruth(symbolId, predictionTime, trades);

  // Extract predictions and compute log loss per horizon
  const predictions: Record<string, number> = {};
  const labels: Record<string, boolean> = {};
  const logLossByHorizon: Record<string, number> = {};
  const timeToPivotRatio: Record<string, number | undefined> = {};

  for (const horizon of HORIZONS) {
    const contractId = `bottom-${horizon}` as BottomContractId;
    predictions[horizon] = output.predictions[contractId];
    labels[horizon] = groundTruth[horizon].isValid;
    logLossByHorizon[horizon] = logLoss(predictions[horizon], labels[horizon]);
    timeToPivotRatio[horizon] = groundTruth[horizon].timeToPivotRatio;
  }

  logger.logModelScoreCompact(modelId, logLossByHorizon['15m'], 0);

  return {
    predictions: predictions as Record<Horizon, number>,
    labels: labels as Record<Horizon, boolean>,
    logLossByHorizon: logLossByHorizon as Record<Horizon, number>,
    timeToPivotRatio: timeToPivotRatio as Record<Horizon, number | undefined>,
  };
}

async function runPhaseRounds(
  manager: ModelStateManager,
  phase: 0 | 1 | 2,
  symbolId: string,
  startRound: number
): Promise<number> {
  const rounds = PHASE_ROUNDS[phase];
  let clockState = initializeClock();
  let currentRound = startRound;

  for (let r = 0; r < rounds; r++) {
    const activeModels = manager.getActiveModels();
    if (activeModels.length === 0) break;

    logger.logRoundHeader(currentRound, currentRound + rounds - r, clockState.currentTime);

    // Fetch market data once per round
    const charts = await getForecastingCharts(symbolId, clockState.currentTime);
    const orderbook = await getOrderbookSnapshot(symbolId, clockState.currentTime);
    const orderbookData = formatOrderbookForPrompt(orderbook);

    setBottomCallerContext({
      chart4h5mUrl: charts.chart4h5m,
      chart24h15mUrl: charts.chart24h15m,
      orderbookData,
      currentTime: clockState.currentTime.toISOString(),
      symbolId,
    });

    // Run each active model
    for (const modelId of activeModels) {
      logger.startSpinner(`Phase ${phase} Round ${currentRound}: ${modelId}`);

      const result = await runModelRound(
        modelId,
        symbolId,
        currentRound,
        clockState.currentTime
      );

      manager.addRoundScore(modelId, {
        roundNumber: currentRound,
        logLoss: Object.values(result.logLossByHorizon).reduce((a, b) => a + b, 0) / 4,
        logLossByHorizon: result.logLossByHorizon,
        predictions: result.predictions,
        labels: result.labels,
        timeToPivotRatio: result.timeToPivotRatio,
      });

      logger.succeedSpinner(`${modelId}: Done`);
    }

    clearBottomCallerContext();
    clockState = advanceClock();
    currentRound++;
  }

  return currentRound;
}

async function main(): Promise<void> {
  logger.header('agent_006 Bitcoin Bottom Arena');

  const symbolId = process.env['SYMBOL_ID'];
  if (symbolId === undefined || symbolId === '') {
    throw new Error('SYMBOL_ID environment variable is required');
  }

  // Load all vision models
  const modelIds = getModelIds();
  logger.logBenchmarkInfo({
    symbol: symbolId,
    startTime: new Date().toISOString(),
    models: modelIds,
    rounds: PHASE_ROUNDS[0] + PHASE_ROUNDS[1] + PHASE_ROUNDS[2],
  });

  // Initialize state manager with all models
  const manager = new ModelStateManager(modelIds);
  resetClockState();

  let totalRounds = 1;

  // Phase 0: Sanity Filter
  console.log('\n=== PHASE 0: Sanity Filter ===');
  console.log(`Starting with ${manager.getActiveModels().length} models`);
  totalRounds = await runPhaseRounds(manager, 0, symbolId, totalRounds);
  runPhase0(manager);
  printPhaseResults(manager, 0);

  // Phase 1: Horizon Competence
  console.log('\n=== PHASE 1: Horizon Competence ===');
  console.log(`${manager.getActiveModels().length} models remaining`);
  manager.advancePhase();
  totalRounds = await runPhaseRounds(manager, 1, symbolId, totalRounds);
  runPhase1(manager);
  printPhaseResults(manager, 1);

  // Phase 2: Stability
  console.log('\n=== PHASE 2: Stability & Regret ===');
  console.log(`${manager.getActiveModels().length} models remaining`);
  manager.advancePhase();
  totalRounds = await runPhaseRounds(manager, 2, symbolId, totalRounds);
  runPhase2(manager);
  printPhaseResults(manager, 2);

  // Phase 3: Arena Ranking
  console.log('\n=== PHASE 3: Arena Ranking ===');
  console.log(`${manager.getActiveModels().length} models remaining`);
  manager.advancePhase();
  const arenaCompetitors = runPhase3(manager);
  printArenaResults(arenaCompetitors);

  console.log('\n✅ Arena selection complete');
}

await main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('Benchmark failed:', error);
    process.exit(1);
  });
```

**Step 2: Run type check**

Run: `cd apps/agent_006 && pnpm check-types`
Expected: PASS (or list issues to fix)

**Step 3: Commit**

```bash
git add apps/agent_006/src/benchmark.ts
git commit -m "feat(agent_006): update benchmark to multi-phase orchestration"
```

---

## Task 13: Update Table Output

**Files:**
- Modify: `apps/agent_006/src/table.ts`

**Step 1: Update table.ts**

Add phase results and arena results printing functions to `apps/agent_006/src/table.ts`:

```typescript
import Table from 'cli-table3';
import chalk from 'chalk';

import type { ModelStateManager } from './state/model-state.js';

/**
 * Print phase elimination results
 */
export function printPhaseResults(manager: ModelStateManager, phase: 0 | 1 | 2): void {
  const eliminated = manager.getEliminatedModels().filter(m => m.eliminatedInPhase === phase);
  const active = manager.getActiveModels();

  console.log(`\nPhase ${phase} Results:`);
  console.log(`- Eliminated: ${eliminated.length}`);
  console.log(`- Remaining: ${active.length}`);

  if (eliminated.length > 0) {
    const table = new Table({
      head: [chalk.bold('Model'), chalk.bold('Reason')],
      colWidths: [40, 50],
    });

    for (const model of eliminated) {
      table.push([model.modelId, model.eliminationReason ?? 'Unknown']);
    }

    console.log(table.toString());
  }
}

/**
 * Print final arena results
 */
export function printArenaResults(
  competitors: Array<{ modelId: string; score: number }>
): void {
  console.log('\n🏆 Arena Competitors (Top 8):');

  const table = new Table({
    head: [
      chalk.bold('Rank'),
      chalk.bold('Model'),
      chalk.bold('Composite Score'),
    ],
    colWidths: [8, 45, 20],
  });

  for (const [index, competitor] of competitors.entries()) {
    const rank = index + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

    table.push([
      medal,
      competitor.modelId,
      competitor.score.toFixed(4),
    ]);
  }

  console.log(table.toString());
}

// Keep existing exports for backward compatibility
export { printResultsTable, printQuintileTable } from './table-legacy.js';
```

**Step 2: Create table-legacy.ts**

Move existing table functions to `apps/agent_006/src/table-legacy.ts` (rename current table.ts content).

**Step 3: Commit**

```bash
git add apps/agent_006/src/table.ts apps/agent_006/src/table-legacy.ts
git commit -m "feat(agent_006): add phase and arena result tables"
```

---

## Task 14: Run Full QA and Fix Issues

**Step 1: Run lint**

Run: `cd apps/agent_006 && pnpm lint`
Fix any issues found.

**Step 2: Run type check**

Run: `cd apps/agent_006 && pnpm check-types`
Fix any type errors.

**Step 3: Run tests**

Run: `cd apps/agent_006 && pnpm test:unit --run`
Ensure all tests pass.

**Step 4: Run build**

Run: `cd apps/agent_006 && pnpm build`
Fix any build errors.

**Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix(agent_006): resolve QA issues"
```

---

## Task 15: Integration Test

**Step 1: Set up test environment**

Ensure `.env.local` has required variables:
- REPLAY_LAB_API_KEY
- REPLAY_LAB_BASE_URL
- SYMBOL_ID
- AI_GATEWAY_BASE_URL
- AI_GATEWAY_API_KEY

**Step 2: Run benchmark with limited models**

Temporarily modify `matrix.ts` to use only 3 models for testing:

```typescript
// For testing only
export function getModelIds(): string[] {
  return loadModelMatrix().slice(0, 3).map(m => m.id);
}
```

**Step 3: Run benchmark**

Run: `cd apps/agent_006 && pnpm benchmark`

**Step 4: Verify output**

Check that:
- All 4 phases execute
- Models are eliminated in phases 0-2
- Arena competitors are ranked in phase 3
- No runtime errors

**Step 5: Restore full model list and commit**

```bash
git checkout apps/agent_006/src/matrix.ts  # If modified for testing
git add -A
git commit -m "test(agent_006): verify integration works"
```

---

## Summary

This plan transforms agent_006 from market-maker fill prediction into a multi-phase selection protocol with:

1. **56 vision models** loaded from models.json
2. **4 horizons** (15m, 1h, 24h, 7d) for structural bottom prediction
3. **Ground truth** via local_extrema annotations with drawdown validation
4. **4 phases** of selection:
   - Phase 0: Sanity filter (56 → ~30 models)
   - Phase 1: Horizon competence (~30 → ~20 models)
   - Phase 2: Stability/regret (~20 → ~12 models)
   - Phase 3: Arena ranking (~12 → 8 competitors)
5. **In-memory state** for demo purposes

Total estimated tasks: 15
Files created: ~10
Files modified: ~5
