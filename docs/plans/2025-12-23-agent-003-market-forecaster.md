# agent_003: Market Dump Forecaster - Implementation Plan

## Overview

**Goal:** Create a market forecasting agent that predicts the probability of price dumps (significant price drops) over a 1-hour forward window. The agent receives historical chart images and order book data, outputs probability predictions for 13 dump event contracts, and is scored against actual outcomes from the Replay Lab annotations API.

**Key Differentiator from agent_002:** Instead of a Wheel of Fortune game with correctness/difficulty scoring, agent_003:
- Operates on a simulated internal clock (starting from env var, advancing 1hr per round)
- Fetches real market data (charts + order book) from Replay Lab API
- Makes probabilistic predictions (0-1) for multiple event contracts
- Uses proper scoring rules (Brier score, log loss, calibration metrics) from forecasting literature
- Tracks running cumulative scores across rounds

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        POST /api/play                                │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │   Clock Manager   │
        │   (in-memory)     │
        └─────────┬─────────┘
                  │
    ┌─────────────┴──────────────┐
    │                            │
    ▼                            ▼
┌────────────────┐    ┌────────────────────────┐
│ Replay Lab API │    │ Replay Lab API         │
│ (Signed Chart) │    │ (Order Book Snapshot)  │
└───────┬────────┘    └───────────┬────────────┘
        │                         │
        └──────────┬──────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │    Forecaster   │
         │  ┌───────────┐  │
         │  │  Memory   │  │
         │  └───────────┘  │
         └────────┬────────┘
                  │
                  ▼
      ┌──────────────────────┐
      │  Prediction Output   │
      │  (13 probabilities)  │
      └───────────┬──────────┘
                  │
      ┌───────────┴───────────┐
      │                       │
      ▼                       ▼
┌───────────────┐   ┌─────────────────────────┐
│ Replay Lab    │   │ Multi-Scorer Pipeline   │
│ Annotations   │   │ (Brier, Log Loss, etc.) │
│ (Ground Truth)│   └────────────┬────────────┘
└───────┬───────┘                │
        │                        │
        └────────────┬───────────┘
                     │
                     ▼
           ┌─────────────────┐
           │  scorer_results │
           │       DB        │
           └─────────────────┘
```

---

## Contracts (Prediction Targets)

The agent predicts the probability (0-1) of each event occurring within the next 1 hour:

| Contract ID | Event Type | Horizon | Threshold | Description |
|-------------|------------|---------|-----------|-------------|
| `dump-simple-1m-1pct` | Simple | 1min | -1% | Price drops 1% within any 1m window in next hour |
| `dump-simple-1m-3pct` | Simple | 1min | -3% | Price drops 3% within any 1m window in next hour |
| `dump-simple-1m-5pct` | Simple | 1min | -5% | Price drops 5% within any 1m window in next hour |
| `dump-simple-15m-1pct` | Simple | 15min | -1% | Price drops 1% within any 15m window in next hour |
| `dump-simple-15m-3pct` | Simple | 15min | -3% | Price drops 3% within any 15m window in next hour |
| `dump-simple-15m-5pct` | Simple | 15min | -5% | Price drops 5% within any 15m window in next hour |
| `dump-simple-1h-0.5pct` | Simple | 1hr | -0.5% | Price drops 0.5% by end of hour |
| `dump-simple-1h-1pct` | Simple | 1hr | -1% | Price drops 1% by end of hour |
| `dump-vol-adjusted-1m-z2` | Vol-Adjusted | 1min | 2σ | 2-sigma move within any 1m window in next hour |
| `dump-vol-adjusted-15m-z2` | Vol-Adjusted | 15min | 2σ | 2-sigma move within any 15m window in next hour |
| `dump-vol-adjusted-1h-z2` | Vol-Adjusted | 1hr | 2σ | 2-sigma move by end of hour |
| `dump-drawdown-1pct` | Drawdown | - | -1% | Peak-to-trough exceeds 1% within hour |
| `dump-drawdown-3pct` | Drawdown | - | -3% | Peak-to-trough exceeds 3% within hour |

**Monotonicity Constraints (enforced by scorer):**
- Same horizon: `p(5%) ≤ p(3%) ≤ p(1%)` (larger drop is rarer)
- Same threshold: `p(1h, 1%) ≥ p(15m, 1%) ≥ p(1m, 1%)` (longer window = more opportunity)

---

## Environment Variables

```bash
# .env.local for agent_003

# Replay Lab API
REPLAY_LAB_API_KEY=rn_BkZnZOorlWhBhijCyVddeeObnAnApyvEVGZIpNOAsdPekOEFBTLlxKkLnxGKdpZW
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network

# Simulation Clock Start Time (ISO 8601, EST timezone)
SIMULATION_START_TIME=2025-12-22T14:00:00Z

# Symbol to forecast (from API spec)
SYMBOL_ID=COINBASE_SPOT_ETH_USD

# Database (inherited from monorepo)
DATABASE_URL=postgresql://...
```

---

## File Structure

```
apps/agent_003/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── vitest.config.ts
├── next.config.ts
├── .env.local                          # API keys + simulation start time
├── README.md
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── api/
│   │       ├── play/
│   │       │   └── route.ts            # Main orchestration endpoint
│   │       └── debug/
│   │           └── route.ts            # View agent memory + clock state
│   │
│   ├── forecaster.ts                   # Agent definition (prompt + schema)
│   ├── clock-state.ts                  # Simulation clock management
│   │
│   ├── replay-lab/
│   │   ├── client.ts                   # Base API client with auth
│   │   ├── charts.ts                   # Signed chart URL generation
│   │   ├── orderbook.ts                # Order book snapshot fetching
│   │   └── annotations.ts              # Ground truth fetching
│   │
│   └── scorers/
│       ├── types.ts                    # Shared types for prediction scoring
│       ├── brier-scorer.ts             # Brier score per contract
│       ├── log-loss-scorer.ts          # Log loss per contract
│       ├── calibration-scorer.ts       # Calibration metrics
│       ├── monotonicity-scorer.ts      # Constraint violation tracking
│       └── aggregate-scorer.ts         # Combines all scorers
│
└── __tests__/
    ├── clock-state.test.ts
    ├── replay-lab.test.ts
    ├── forecaster.test.ts
    ├── scorers.test.ts
    └── api.test.ts
```

---

## Implementation Tasks

### Phase 1: Project Setup

#### Task 1.1: Copy agent_002 to agent_003
```bash
# From monorepo root
cp -r apps/agent_002 apps/agent_003
```

**Then modify:**
1. `package.json` - Change name to `agent_003`, port to `3004`
2. Remove Wheel of Fortune files: `puzzle-master.ts`, `player.ts`, `game-state.ts`
3. Remove old scorers: `src/scorers/player-round-scorer.ts`
4. Update imports in `src/app/api/play/route.ts` (will be rewritten)

**Verification:** `pnpm install && pnpm build --filter=agent_003`

#### Task 1.2: Create .env.local
```bash
# apps/agent_003/.env.local
REPLAY_LAB_API_KEY=rn_BkZnZOorlWhBhijCyVddeeObnAnApyvEVGZIpNOAsdPekOEFBTLlxKkLnxGKdpZW
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
SIMULATION_START_TIME=2025-12-22T14:00:00Z
SYMBOL_ID=COINBASE_SPOT_ETH_USD
```

**Verification:** Environment variables are loaded in dev mode

---

### Phase 2: Clock State Management

#### Task 2.1: Create clock-state.ts

```typescript
// src/clock-state.ts

/**
 * Simulation clock for market forecasting.
 * Starts at SIMULATION_START_TIME env var, advances 1 hour per round.
 */

export interface ClockState {
  /** Current simulation time (ISO 8601) */
  currentTime: Date;
  /** Number of rounds completed */
  roundNumber: number;
  /** When the simulation started */
  startTime: Date;
}

// In-memory clock state
let clockState: ClockState | undefined;

/**
 * Initialize or get the simulation clock.
 * Uses SIMULATION_START_TIME env var for initial time.
 */
export function initializeClock(): ClockState {
  if (clockState !== undefined) {
    return clockState;
  }

  const startTimeEnv = process.env['SIMULATION_START_TIME'];
  if (!startTimeEnv) {
    throw new Error('SIMULATION_START_TIME environment variable is required');
  }

  const startTime = new Date(startTimeEnv);
  if (isNaN(startTime.getTime())) {
    throw new Error(`Invalid SIMULATION_START_TIME: ${startTimeEnv}`);
  }

  clockState = {
    currentTime: startTime,
    roundNumber: 0,
    startTime,
  };

  return clockState;
}

/**
 * Get current clock state.
 * Throws if clock not initialized.
 */
export function getClockState(): ClockState {
  if (clockState === undefined) {
    throw new Error('Clock not initialized. Call initializeClock() first.');
  }
  return clockState;
}

/**
 * Advance the clock by 1 hour and increment round number.
 * Call this AFTER processing a round.
 */
export function advanceClock(): ClockState {
  const state = getClockState();

  const newTime = new Date(state.currentTime);
  newTime.setHours(newTime.getHours() + 1);

  clockState = {
    ...state,
    currentTime: newTime,
    roundNumber: state.roundNumber + 1,
  };

  return clockState;
}

/**
 * Get the time window for the current prediction.
 * Returns {from, to} where 'from' is current time and 'to' is current + 1 hour.
 */
export function getPredictionWindow(): { from: Date; to: Date } {
  const state = getClockState();
  const to = new Date(state.currentTime);
  to.setHours(to.getHours() + 1);

  return {
    from: state.currentTime,
    to,
  };
}

/**
 * Get the lookback window for chart generation.
 * Returns 4 hours of history before current time.
 */
export function getChartWindow(): { from: Date; to: Date } {
  const state = getClockState();
  const from = new Date(state.currentTime);
  from.setHours(from.getHours() - 4);

  return {
    from,
    to: state.currentTime,
  };
}

/**
 * Reset clock state (for testing)
 */
export function resetClockState(): void {
  clockState = undefined;
}
```

#### Task 2.2: Write clock-state tests

```typescript
// __tests__/clock-state.test.ts

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  initializeClock,
  getClockState,
  advanceClock,
  getPredictionWindow,
  getChartWindow,
  resetClockState,
} from '../src/clock-state';

describe('Clock State', () => {
  beforeEach(() => {
    resetClockState();
    vi.stubEnv('SIMULATION_START_TIME', '2025-12-22T14:00:00Z');
  });

  test('initializes clock from env var', () => {
    const clock = initializeClock();

    expect(clock.roundNumber).toBe(0);
    expect(clock.currentTime.toISOString()).toBe('2025-12-22T14:00:00.000Z');
    expect(clock.startTime.toISOString()).toBe('2025-12-22T14:00:00.000Z');
  });

  test('throws when env var missing', () => {
    vi.stubEnv('SIMULATION_START_TIME', '');

    expect(() => initializeClock()).toThrow('SIMULATION_START_TIME environment variable is required');
  });

  test('throws when env var invalid', () => {
    vi.stubEnv('SIMULATION_START_TIME', 'not-a-date');

    expect(() => initializeClock()).toThrow('Invalid SIMULATION_START_TIME');
  });

  test('advances clock by 1 hour', () => {
    initializeClock();

    const newClock = advanceClock();

    expect(newClock.roundNumber).toBe(1);
    expect(newClock.currentTime.toISOString()).toBe('2025-12-22T15:00:00.000Z');
  });

  test('getPredictionWindow returns 1-hour forward window', () => {
    initializeClock();

    const window = getPredictionWindow();

    expect(window.from.toISOString()).toBe('2025-12-22T14:00:00.000Z');
    expect(window.to.toISOString()).toBe('2025-12-22T15:00:00.000Z');
  });

  test('getChartWindow returns 4-hour lookback', () => {
    initializeClock();

    const window = getChartWindow();

    expect(window.from.toISOString()).toBe('2025-12-22T10:00:00.000Z');
    expect(window.to.toISOString()).toBe('2025-12-22T14:00:00.000Z');
  });

  test('multiple advances accumulate correctly', () => {
    initializeClock();
    advanceClock(); // Round 1 -> 15:00
    advanceClock(); // Round 2 -> 16:00
    advanceClock(); // Round 3 -> 17:00

    const clock = getClockState();

    expect(clock.roundNumber).toBe(3);
    expect(clock.currentTime.toISOString()).toBe('2025-12-22T17:00:00.000Z');
  });
});
```

**Verification:** `pnpm test --filter=agent_003 -- clock-state`

---

### Phase 3: Replay Lab API Client

#### Task 3.1: Create base client

```typescript
// src/replay-lab/client.ts

/**
 * Base Replay Lab API client with authentication.
 */

export interface ReplayLabConfig {
  apiKey: string;
  baseUrl: string;
}

export function getConfig(): ReplayLabConfig {
  const apiKey = process.env['REPLAY_LAB_API_KEY'];
  const baseUrl = process.env['REPLAY_LAB_BASE_URL'];

  if (!apiKey) {
    throw new Error('REPLAY_LAB_API_KEY environment variable is required');
  }
  if (!baseUrl) {
    throw new Error('REPLAY_LAB_BASE_URL environment variable is required');
  }

  return { apiKey, baseUrl };
}

export async function replayLabFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Replay Lab API error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<T>;
}
```

#### Task 3.2: Create signed chart URL generator

```typescript
// src/replay-lab/charts.ts

import { replayLabFetch, getConfig } from './client';

export interface SignedUrlResponse {
  url: string;
  expiresAt: string;
}

export interface ChartParams {
  symbolId: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  from: Date;
  to: Date;
  layers: string;
}

/**
 * Generate a signed URL for a chart image.
 * The signed URL can be passed directly to the LLM as an image input.
 */
export async function getSignedChartUrl(params: ChartParams): Promise<string> {
  const { symbolId, timeframe, from, to, layers } = params;

  const chartPath = `/api/charts/${symbolId}/image?` +
    `timeframe=${timeframe}&` +
    `from=${from.toISOString()}&` +
    `to=${to.toISOString()}&` +
    `layers=${encodeURIComponent(layers)}`;

  const response = await replayLabFetch<SignedUrlResponse>('/api/signed-url', {
    method: 'POST',
    body: JSON.stringify({
      path: chartPath,
      expiresIn: 3600, // 1 hour
    }),
  });

  return response.url;
}

/**
 * Get the standard chart URLs for forecasting.
 * Returns two charts: candlestick with SMA, and candlestick with Bollinger Bands.
 */
export async function getForecastingCharts(
  symbolId: string,
  from: Date,
  to: Date
): Promise<{ candleSma: string; candleBb: string }> {
  const [candleSma, candleBb] = await Promise.all([
    getSignedChartUrl({
      symbolId,
      timeframe: '5m',
      from,
      to,
      layers: 'candles,sma',
    }),
    getSignedChartUrl({
      symbolId,
      timeframe: '5m',
      from,
      to,
      layers: 'candles,bb',
    }),
  ]);

  return { candleSma, candleBb };
}
```

#### Task 3.3: Create order book fetcher

```typescript
// src/replay-lab/orderbook.ts

import { replayLabFetch } from './client';

export interface OrderbookSnapshot {
  timestamp: string;
  mid_price: number;
  spread: number;
  spread_bps: number;
  imbalance: number;
  bid_depth: number;
  ask_depth: number;
}

export interface OrderbookResponse {
  symbol_id: string;
  snapshots: OrderbookSnapshot[];
}

/**
 * Get order book snapshot at a specific time.
 * Returns the most recent snapshot before or at the given time.
 */
export async function getOrderbookSnapshot(
  symbolId: string,
  at: Date
): Promise<OrderbookSnapshot> {
  // Get 5 minutes of data ending at our target time
  const from = new Date(at);
  from.setMinutes(from.getMinutes() - 5);

  const response = await replayLabFetch<OrderbookResponse>(
    `/api/orderbook/${symbolId}?` +
    `from=${from.toISOString()}&` +
    `to=${at.toISOString()}&` +
    `limit=1`
  );

  if (response.snapshots.length === 0) {
    throw new Error(`No orderbook data found for ${symbolId} at ${at.toISOString()}`);
  }

  return response.snapshots[0];
}

/**
 * Format orderbook data for inclusion in LLM prompt.
 */
export function formatOrderbookForPrompt(snapshot: OrderbookSnapshot): string {
  return `## Current Order Book (${snapshot.timestamp})
- Mid Price: $${snapshot.mid_price.toFixed(2)}
- Spread: $${snapshot.spread.toFixed(4)} (${snapshot.spread_bps.toFixed(2)} bps)
- Imbalance: ${(snapshot.imbalance * 100).toFixed(1)}% (${snapshot.imbalance > 0 ? 'buy pressure' : 'sell pressure'})
- Bid Depth: ${snapshot.bid_depth.toFixed(4)}
- Ask Depth: ${snapshot.ask_depth.toFixed(4)}`;
}
```

#### Task 3.4: Create annotations fetcher (ground truth)

```typescript
// src/replay-lab/annotations.ts

import { replayLabFetch } from './client';

export interface Annotation {
  id: string;
  time_start: string;
  time_end: string | null;
  type: string;
  schema_version: string;
  payload: Record<string, unknown>;
  source: string;
  created_at: string;
}

export interface AnnotationsResponse {
  symbol_id: string;
  annotations: Annotation[];
}

/**
 * All contract IDs we're predicting.
 */
export const CONTRACT_IDS = [
  'dump-simple-1m-1pct',
  'dump-simple-1m-3pct',
  'dump-simple-1m-5pct',
  'dump-simple-15m-1pct',
  'dump-simple-15m-3pct',
  'dump-simple-15m-5pct',
  'dump-simple-1h-0.5pct',
  'dump-simple-1h-1pct',
  'dump-vol-adjusted-1m-z2',
  'dump-vol-adjusted-15m-z2',
  'dump-vol-adjusted-1h-z2',
  'dump-drawdown-1pct',
  'dump-drawdown-3pct',
] as const;

export type ContractId = typeof CONTRACT_IDS[number];

/**
 * Ground truth outcomes for a prediction window.
 * Maps contract ID -> boolean (did the event occur?)
 */
export type GroundTruth = Record<ContractId, boolean>;

/**
 * Fetch ground truth for a specific prediction window.
 * Queries annotations API 1 hour after prediction time to get actual outcomes.
 */
export async function getGroundTruth(
  symbolId: string,
  predictionTime: Date,
  predictionEndTime: Date
): Promise<GroundTruth> {
  // Fetch all annotations in the prediction window
  const results: GroundTruth = {} as GroundTruth;

  // Initialize all contracts to false
  for (const contractId of CONTRACT_IDS) {
    results[contractId] = false;
  }

  // Fetch annotations for each contract type
  for (const contractId of CONTRACT_IDS) {
    const response = await replayLabFetch<AnnotationsResponse>(
      `/api/annotations/${symbolId}?` +
      `from=${predictionTime.toISOString()}&` +
      `to=${predictionEndTime.toISOString()}&` +
      `source=${contractId}&` +
      `limit=1`
    );

    // If any annotation exists for this contract in the window, event occurred
    results[contractId] = response.annotations.length > 0;
  }

  return results;
}

/**
 * Batch fetch ground truth (more efficient - single call per contract type).
 */
export async function getGroundTruthBatch(
  symbolId: string,
  predictionTime: Date,
  predictionEndTime: Date
): Promise<GroundTruth> {
  const results: GroundTruth = {} as GroundTruth;

  // Parallel fetch all contract types
  const promises = CONTRACT_IDS.map(async (contractId) => {
    const response = await replayLabFetch<AnnotationsResponse>(
      `/api/annotations/${symbolId}?` +
      `from=${predictionTime.toISOString()}&` +
      `to=${predictionEndTime.toISOString()}&` +
      `source=${contractId}&` +
      `limit=1`
    );
    return { contractId, occurred: response.annotations.length > 0 };
  });

  const outcomes = await Promise.all(promises);
  for (const { contractId, occurred } of outcomes) {
    results[contractId] = occurred;
  }

  return results;
}
```

#### Task 3.5: Write Replay Lab tests

```typescript
// __tests__/replay-lab.test.ts

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Set up env vars before importing modules
vi.stubEnv('REPLAY_LAB_API_KEY', 'test-api-key');
vi.stubEnv('REPLAY_LAB_BASE_URL', 'https://test.replay-lab.com');

import { getSignedChartUrl, getForecastingCharts } from '../src/replay-lab/charts';
import { getOrderbookSnapshot, formatOrderbookForPrompt } from '../src/replay-lab/orderbook';
import { getGroundTruthBatch, CONTRACT_IDS } from '../src/replay-lab/annotations';

describe('Replay Lab Charts', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('getSignedChartUrl calls correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        url: 'https://signed-url.example.com/chart',
        expiresAt: '2025-12-23T15:00:00Z',
      }),
    });

    const url = await getSignedChartUrl({
      symbolId: 'COINBASE_SPOT_ETH_USD',
      timeframe: '5m',
      from: new Date('2025-12-22T10:00:00Z'),
      to: new Date('2025-12-22T14:00:00Z'),
      layers: 'candles,sma',
    });

    expect(url).toBe('https://signed-url.example.com/chart');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.replay-lab.com/api/signed-url',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
        }),
      })
    );
  });

  test('getForecastingCharts fetches both chart types', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://chart-sma.com', expiresAt: '2025-12-23T15:00:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://chart-bb.com', expiresAt: '2025-12-23T15:00:00Z' }),
      });

    const charts = await getForecastingCharts(
      'COINBASE_SPOT_ETH_USD',
      new Date('2025-12-22T10:00:00Z'),
      new Date('2025-12-22T14:00:00Z')
    );

    expect(charts.candleSma).toBe('https://chart-sma.com');
    expect(charts.candleBb).toBe('https://chart-bb.com');
  });
});

describe('Replay Lab Orderbook', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('getOrderbookSnapshot returns latest snapshot', async () => {
    const mockSnapshot = {
      timestamp: '2025-12-22T13:59:00Z',
      mid_price: 3500.50,
      spread: 0.25,
      spread_bps: 0.71,
      imbalance: 0.15,
      bid_depth: 100.5,
      ask_depth: 85.3,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        symbol_id: 'COINBASE_SPOT_ETH_USD',
        snapshots: [mockSnapshot],
      }),
    });

    const snapshot = await getOrderbookSnapshot(
      'COINBASE_SPOT_ETH_USD',
      new Date('2025-12-22T14:00:00Z')
    );

    expect(snapshot.mid_price).toBe(3500.50);
    expect(snapshot.imbalance).toBe(0.15);
  });

  test('formatOrderbookForPrompt formats correctly', () => {
    const formatted = formatOrderbookForPrompt({
      timestamp: '2025-12-22T14:00:00Z',
      mid_price: 3500.50,
      spread: 0.25,
      spread_bps: 0.71,
      imbalance: 0.15,
      bid_depth: 100.5,
      ask_depth: 85.3,
    });

    expect(formatted).toContain('$3500.50');
    expect(formatted).toContain('0.71 bps');
    expect(formatted).toContain('buy pressure');
  });
});

describe('Replay Lab Annotations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('getGroundTruthBatch fetches all contracts', async () => {
    // Mock responses for all 13 contracts
    for (const contractId of CONTRACT_IDS) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          // Return annotation for some contracts
          annotations: contractId.includes('1pct') ? [{ id: 'test' }] : [],
        }),
      });
    }

    const truth = await getGroundTruthBatch(
      'COINBASE_SPOT_ETH_USD',
      new Date('2025-12-22T14:00:00Z'),
      new Date('2025-12-22T15:00:00Z')
    );

    // 1pct contracts should be true
    expect(truth['dump-simple-1m-1pct']).toBe(true);
    expect(truth['dump-drawdown-1pct']).toBe(true);

    // 3pct and 5pct should be false
    expect(truth['dump-simple-1m-3pct']).toBe(false);
    expect(truth['dump-simple-1m-5pct']).toBe(false);
  });

  test('CONTRACT_IDS has all 13 contracts', () => {
    expect(CONTRACT_IDS).toHaveLength(13);
  });
});
```

**Verification:** `pnpm test --filter=agent_003 -- replay-lab`

---

### Phase 4: Forecaster Agent

#### Task 4.1: Create forecaster agent definition

```typescript
// src/forecaster.ts

import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

import { getClockState, getChartWindow } from './clock-state';
import { getForecastingCharts } from './replay-lab/charts';
import { getOrderbookSnapshot, formatOrderbookForPrompt } from './replay-lab/orderbook';
import { CONTRACT_IDS } from './replay-lab/annotations';

/**
 * Schema for prediction output.
 * Each contract gets a probability (0-1).
 */
const PredictionSchema = z.object({
  reasoning: z.string().describe('Brief explanation of your analysis'),
  predictions: z.object({
    'dump-simple-1m-1pct': z.number().min(0).max(1),
    'dump-simple-1m-3pct': z.number().min(0).max(1),
    'dump-simple-1m-5pct': z.number().min(0).max(1),
    'dump-simple-15m-1pct': z.number().min(0).max(1),
    'dump-simple-15m-3pct': z.number().min(0).max(1),
    'dump-simple-15m-5pct': z.number().min(0).max(1),
    'dump-simple-1h-0.5pct': z.number().min(0).max(1),
    'dump-simple-1h-1pct': z.number().min(0).max(1),
    'dump-vol-adjusted-1m-z2': z.number().min(0).max(1),
    'dump-vol-adjusted-15m-z2': z.number().min(0).max(1),
    'dump-vol-adjusted-1h-z2': z.number().min(0).max(1),
    'dump-drawdown-1pct': z.number().min(0).max(1),
    'dump-drawdown-3pct': z.number().min(0).max(1),
  }),
});

export type ForecastOutput = z.infer<typeof PredictionSchema>;

/**
 * Context passed to buildRoundPrompt for data access.
 */
export interface ForecastContext {
  chartSmaUrl: string;
  chartBbUrl: string;
  orderbookData: string;
  currentTime: string;
  symbolId: string;
}

// Store context for current round (set before runRound)
let currentForecastContext: ForecastContext | undefined;

export function setForecastContext(context: ForecastContext): void {
  currentForecastContext = context;
}

export function clearForecastContext(): void {
  currentForecastContext = undefined;
}

export const forecaster = defineAgent({
  id: 'forecaster_001',

  outputSchema: PredictionSchema,

  // Compact every 10 rounds to learn from past predictions
  compactionTrigger: {
    type: 'custom',
    shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 10 === 0,
  },

  buildRoundPrompt: (context) => {
    if (currentForecastContext === undefined) {
      throw new Error('Forecast context not set. Call setForecastContext() before runRound().');
    }

    const { chartSmaUrl, chartBbUrl, orderbookData, currentTime, symbolId } = currentForecastContext;

    const compactionSection =
      context.compactionSummary !== undefined && context.compactionSummary !== ''
        ? `\n## Your Past Learnings\n${context.compactionSummary}\n`
        : '';

    // Build contract list for clarity
    const contractList = CONTRACT_IDS.map(id => `- ${id}`).join('\n');

    return `You are a market forecaster predicting price dumps for ${symbolId}.

## Current Time
${currentTime}

${orderbookData}

## Your Task
Analyze the charts and order book data to predict the probability (0.0 to 1.0) of each dump event occurring within the NEXT 1 HOUR.

## Contracts to Predict
${contractList}

## Contract Definitions
- **dump-simple-Xm-Ypct**: Price drops at least Y% within any X-minute window in the next hour
- **dump-vol-adjusted-Xm-z2**: A 2-sigma price drop (relative to recent volatility) within any X-minute window
- **dump-drawdown-Ypct**: Peak-to-trough decline exceeds Y% at any point in the next hour

## Important Constraints
Your predictions MUST satisfy these monotonicity constraints:
1. **Threshold monotonicity** (same horizon): p(5%) ≤ p(3%) ≤ p(1%) - larger drops are rarer
2. **Horizon monotonicity** (same threshold): p(1h) ≥ p(15m) ≥ p(1m) - longer windows have more opportunity

## Charts
I'm providing two chart images:
1. Candlestick chart with Simple Moving Average (SMA)
2. Candlestick chart with Bollinger Bands

[Chart 1: Candlestick + SMA]
${chartSmaUrl}

[Chart 2: Candlestick + Bollinger Bands]
${chartBbUrl}
${compactionSection}
## Output Format
Respond with a JSON object containing:
1. "reasoning": Brief explanation of your analysis (what patterns you see, risk factors)
2. "predictions": Object with each contract ID mapped to probability (0.0 to 1.0)

Example:
{
  "reasoning": "Tight Bollinger Bands suggest low volatility, bid/ask imbalance shows buying pressure...",
  "predictions": {
    "dump-simple-1m-1pct": 0.05,
    "dump-simple-1m-3pct": 0.02,
    ...
  }
}`;
  },

  buildCompactionPrompt: (history) => `
You've made ${String(history.length)} rounds of dump predictions.

Summarize patterns you've noticed:
- What chart patterns preceded dumps?
- What order book conditions were predictive?
- Which contracts were you most/least accurate on?
- What should you do differently going forward?

Keep it concise and actionable for future predictions.
`,
});
```

#### Task 4.2: Write forecaster tests

```typescript
// __tests__/forecaster.test.ts

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { forecaster, setForecastContext, clearForecastContext } from '../src/forecaster';
import type { ForecastOutput } from '../src/forecaster';

describe('Forecaster Agent', () => {
  beforeEach(() => {
    clearForecastContext();
  });

  test('agent is defined with correct id', () => {
    expect(forecaster.definition.id).toBe('forecaster_001');
  });

  test('output schema validates correct predictions', () => {
    const validOutput: ForecastOutput = {
      reasoning: 'Test reasoning',
      predictions: {
        'dump-simple-1m-1pct': 0.1,
        'dump-simple-1m-3pct': 0.05,
        'dump-simple-1m-5pct': 0.02,
        'dump-simple-15m-1pct': 0.15,
        'dump-simple-15m-3pct': 0.08,
        'dump-simple-15m-5pct': 0.03,
        'dump-simple-1h-0.5pct': 0.25,
        'dump-simple-1h-1pct': 0.2,
        'dump-vol-adjusted-1m-z2': 0.05,
        'dump-vol-adjusted-15m-z2': 0.1,
        'dump-vol-adjusted-1h-z2': 0.15,
        'dump-drawdown-1pct': 0.12,
        'dump-drawdown-3pct': 0.04,
      },
    };

    expect(() => forecaster.definition.outputSchema.parse(validOutput)).not.toThrow();
  });

  test('output schema rejects probabilities outside 0-1', () => {
    const invalidOutput = {
      reasoning: 'Test',
      predictions: {
        'dump-simple-1m-1pct': 1.5, // Invalid: > 1
        'dump-simple-1m-3pct': 0.05,
        'dump-simple-1m-5pct': 0.02,
        'dump-simple-15m-1pct': 0.15,
        'dump-simple-15m-3pct': 0.08,
        'dump-simple-15m-5pct': 0.03,
        'dump-simple-1h-0.5pct': 0.25,
        'dump-simple-1h-1pct': 0.2,
        'dump-vol-adjusted-1m-z2': 0.05,
        'dump-vol-adjusted-15m-z2': 0.1,
        'dump-vol-adjusted-1h-z2': 0.15,
        'dump-drawdown-1pct': 0.12,
        'dump-drawdown-3pct': 0.04,
      },
    };

    expect(() => forecaster.definition.outputSchema.parse(invalidOutput)).toThrow();
  });

  test('buildRoundPrompt throws without context', () => {
    expect(() =>
      forecaster.definition.buildRoundPrompt({
        roundNumber: 1,
        compactionSummary: undefined,
      })
    ).toThrow('Forecast context not set');
  });

  test('buildRoundPrompt includes all contract IDs', () => {
    setForecastContext({
      chartSmaUrl: 'https://chart-sma.com',
      chartBbUrl: 'https://chart-bb.com',
      orderbookData: '## Order Book\nMid: $3500',
      currentTime: '2025-12-22T14:00:00Z',
      symbolId: 'COINBASE_SPOT_ETH_USD',
    });

    const prompt = forecaster.definition.buildRoundPrompt({
      roundNumber: 1,
      compactionSummary: undefined,
    });

    expect(prompt).toContain('dump-simple-1m-1pct');
    expect(prompt).toContain('dump-simple-1m-3pct');
    expect(prompt).toContain('dump-simple-1m-5pct');
    expect(prompt).toContain('dump-vol-adjusted-1h-z2');
    expect(prompt).toContain('dump-drawdown-3pct');
    expect(prompt).toContain('COINBASE_SPOT_ETH_USD');
  });
});
```

**Verification:** `pnpm test --filter=agent_003 -- forecaster`

---

### Phase 5: Scoring System

#### Task 5.1: Create scorer types

```typescript
// src/scorers/types.ts

import type { ContractId } from '../replay-lab/annotations';
import type { ScorerResult } from '@nullagent/scorers';

/**
 * Input for scoring a round of predictions.
 */
export interface ForecastScorerInput {
  /** Predicted probabilities for each contract */
  predictions: Record<ContractId, number>;
  /** Actual outcomes (did each event occur?) */
  actuals: Record<ContractId, boolean>;
  /** Prediction timestamp */
  predictionTime: Date;
  /** Symbol being predicted */
  symbolId: string;
}

/**
 * Per-contract score details.
 */
export interface ContractScore {
  contractId: ContractId;
  predicted: number;
  actual: boolean;
  brierScore: number;
  logLoss: number;
}

/**
 * Monotonicity violation details.
 */
export interface MonotonicityViolation {
  type: 'threshold' | 'horizon';
  contract1: ContractId;
  contract2: ContractId;
  p1: number;
  p2: number;
  expected: 'p1 >= p2' | 'p1 <= p2';
}

/**
 * Full scoring result for a prediction round.
 */
export interface ForecastScoreResult extends ScorerResult {
  /** Overall aggregated score (lower is better for Brier/Log Loss) */
  score: number;

  /** Aggregate metrics */
  aggregates: {
    /** Mean Brier score across all contracts (0-1, lower is better) */
    meanBrierScore: number;
    /** Mean log loss across all contracts (0+, lower is better) */
    meanLogLoss: number;
    /** Accuracy (fraction of events correctly predicted at 0.5 threshold) */
    accuracy: number;
    /** Number of events that actually occurred */
    eventsOccurred: number;
    /** Number of monotonicity violations */
    monotonicityViolations: number;
  };

  /** Per-contract breakdown */
  perContract: ContractScore[];

  /** Monotonicity constraint violations */
  violations: MonotonicityViolation[];
}

/**
 * Running tally of scores across rounds.
 */
export interface RunningTally {
  roundsCompleted: number;
  cumulativeBrierScore: number;
  cumulativeLogLoss: number;
  cumulativeAccuracy: number;
  totalEventsOccurred: number;
  totalViolations: number;
  /** Per-contract cumulative stats */
  perContract: Record<ContractId, {
    totalPredictions: number;
    totalBrierScore: number;
    totalLogLoss: number;
    timesEventOccurred: number;
  }>;
}
```

#### Task 5.2: Create Brier scorer

```typescript
// src/scorers/brier-scorer.ts

/**
 * Brier Score: Mean squared error for probability predictions.
 * BS = mean((p - y)²) where p is predicted probability, y is outcome (0 or 1)
 * Range: 0 (perfect) to 1 (worst possible)
 */

/**
 * Calculate Brier score for a single prediction.
 */
export function brierScore(predicted: number, actual: boolean): number {
  const outcome = actual ? 1 : 0;
  return Math.pow(predicted - outcome, 2);
}

/**
 * Calculate mean Brier score across multiple predictions.
 */
export function meanBrierScore(
  predictions: number[],
  actuals: boolean[]
): number {
  if (predictions.length !== actuals.length) {
    throw new Error('Predictions and actuals must have same length');
  }
  if (predictions.length === 0) {
    throw new Error('Cannot calculate Brier score for empty arrays');
  }

  const total = predictions.reduce((sum, p, i) => sum + brierScore(p, actuals[i]), 0);
  return total / predictions.length;
}

/**
 * Calculate Brier Skill Score vs a baseline (usually event base rate).
 * BSS = 1 - (BS_model / BS_baseline)
 * BSS > 0 means model beats baseline, BSS = 1 is perfect
 */
export function brierSkillScore(
  modelBrierScore: number,
  baselineBrierScore: number
): number {
  if (baselineBrierScore === 0) {
    // Baseline is perfect, can't beat it
    return modelBrierScore === 0 ? 0 : -Infinity;
  }
  return 1 - (modelBrierScore / baselineBrierScore);
}
```

#### Task 5.3: Create Log Loss scorer

```typescript
// src/scorers/log-loss-scorer.ts

/**
 * Log Loss (Cross-Entropy): Penalizes confident wrong predictions heavily.
 * LL = -mean(y * log(p) + (1-y) * log(1-p))
 * Range: 0 (perfect) to +infinity
 */

// Small epsilon to avoid log(0)
const EPSILON = 1e-15;

/**
 * Calculate log loss for a single prediction.
 * Clips probabilities to avoid log(0).
 */
export function logLoss(predicted: number, actual: boolean): number {
  // Clip to avoid log(0)
  const p = Math.max(EPSILON, Math.min(1 - EPSILON, predicted));
  const outcome = actual ? 1 : 0;

  return -(outcome * Math.log(p) + (1 - outcome) * Math.log(1 - p));
}

/**
 * Calculate mean log loss across multiple predictions.
 */
export function meanLogLoss(
  predictions: number[],
  actuals: boolean[]
): number {
  if (predictions.length !== actuals.length) {
    throw new Error('Predictions and actuals must have same length');
  }
  if (predictions.length === 0) {
    throw new Error('Cannot calculate log loss for empty arrays');
  }

  const total = predictions.reduce((sum, p, i) => sum + logLoss(p, actuals[i]), 0);
  return total / predictions.length;
}
```

#### Task 5.4: Create monotonicity checker

```typescript
// src/scorers/monotonicity-scorer.ts

import type { ContractId } from '../replay-lab/annotations';
import type { MonotonicityViolation } from './types';

/**
 * Define monotonicity constraints.
 * Format: [contract1, contract2, 'p1 <= p2' | 'p1 >= p2']
 */
const THRESHOLD_CONSTRAINTS: Array<[ContractId, ContractId]> = [
  // Same horizon, larger threshold should be less likely
  ['dump-simple-1m-5pct', 'dump-simple-1m-3pct'],   // p(5%) <= p(3%)
  ['dump-simple-1m-3pct', 'dump-simple-1m-1pct'],   // p(3%) <= p(1%)
  ['dump-simple-15m-5pct', 'dump-simple-15m-3pct'], // p(5%) <= p(3%)
  ['dump-simple-15m-3pct', 'dump-simple-15m-1pct'], // p(3%) <= p(1%)
  ['dump-simple-1h-1pct', 'dump-simple-1h-0.5pct'], // p(1%) <= p(0.5%)
  ['dump-drawdown-3pct', 'dump-drawdown-1pct'],     // p(3%) <= p(1%)
];

const HORIZON_CONSTRAINTS: Array<[ContractId, ContractId]> = [
  // Same threshold, longer horizon should be more likely
  ['dump-simple-1m-1pct', 'dump-simple-15m-1pct'],  // p(1m) <= p(15m)
  ['dump-simple-15m-1pct', 'dump-simple-1h-1pct'],  // p(15m) <= p(1h)
  ['dump-simple-1m-3pct', 'dump-simple-15m-3pct'],  // p(1m) <= p(15m)
  ['dump-simple-1m-5pct', 'dump-simple-15m-5pct'],  // p(1m) <= p(15m)
  ['dump-vol-adjusted-1m-z2', 'dump-vol-adjusted-15m-z2'],  // p(1m) <= p(15m)
  ['dump-vol-adjusted-15m-z2', 'dump-vol-adjusted-1h-z2'],  // p(15m) <= p(1h)
];

/**
 * Check all monotonicity constraints and return violations.
 */
export function checkMonotonicity(
  predictions: Record<ContractId, number>
): MonotonicityViolation[] {
  const violations: MonotonicityViolation[] = [];

  // Check threshold constraints: p1 <= p2
  for (const [c1, c2] of THRESHOLD_CONSTRAINTS) {
    const p1 = predictions[c1];
    const p2 = predictions[c2];
    if (p1 > p2) {
      violations.push({
        type: 'threshold',
        contract1: c1,
        contract2: c2,
        p1,
        p2,
        expected: 'p1 <= p2',
      });
    }
  }

  // Check horizon constraints: p1 <= p2
  for (const [c1, c2] of HORIZON_CONSTRAINTS) {
    const p1 = predictions[c1];
    const p2 = predictions[c2];
    if (p1 > p2) {
      violations.push({
        type: 'horizon',
        contract1: c1,
        contract2: c2,
        p1,
        p2,
        expected: 'p1 <= p2',
      });
    }
  }

  return violations;
}

/**
 * Count total monotonicity violations.
 */
export function countViolations(predictions: Record<ContractId, number>): number {
  return checkMonotonicity(predictions).length;
}
```

#### Task 5.5: Create aggregate scorer

```typescript
// src/scorers/aggregate-scorer.ts

import { defineScorer } from '@nullagent/scorers';
import { CONTRACT_IDS } from '../replay-lab/annotations';
import { brierScore, meanBrierScore } from './brier-scorer';
import { logLoss, meanLogLoss } from './log-loss-scorer';
import { checkMonotonicity } from './monotonicity-scorer';

import type { ContractId } from '../replay-lab/annotations';
import type {
  ForecastScorerInput,
  ForecastScoreResult,
  ContractScore,
} from './types';

/**
 * Aggregate scorer that combines Brier, Log Loss, and Monotonicity metrics.
 *
 * The primary score is the mean Brier score (lower is better).
 */
export const forecastScorer = defineScorer<ForecastScorerInput, ForecastScoreResult>({
  id: 'forecast_scorer',
  name: 'Forecast Scorer',

  score(input) {
    const { predictions, actuals } = input;

    // Calculate per-contract scores
    const perContract: ContractScore[] = CONTRACT_IDS.map(contractId => ({
      contractId,
      predicted: predictions[contractId],
      actual: actuals[contractId],
      brierScore: brierScore(predictions[contractId], actuals[contractId]),
      logLoss: logLoss(predictions[contractId], actuals[contractId]),
    }));

    // Extract arrays for aggregate calculations
    const predArray = CONTRACT_IDS.map(id => predictions[id]);
    const actualArray = CONTRACT_IDS.map(id => actuals[id]);

    // Calculate aggregates
    const meanBrier = meanBrierScore(predArray, actualArray);
    const meanLL = meanLogLoss(predArray, actualArray);

    // Accuracy at 0.5 threshold
    const correctPredictions = CONTRACT_IDS.filter(id => {
      const predicted = predictions[id] >= 0.5;
      return predicted === actuals[id];
    }).length;
    const accuracy = correctPredictions / CONTRACT_IDS.length;

    // Events that occurred
    const eventsOccurred = CONTRACT_IDS.filter(id => actuals[id]).length;

    // Monotonicity violations
    const violations = checkMonotonicity(predictions);

    return {
      // Primary score is Brier (lower is better)
      score: meanBrier,

      aggregates: {
        meanBrierScore: meanBrier,
        meanLogLoss: meanLL,
        accuracy,
        eventsOccurred,
        monotonicityViolations: violations.length,
      },

      perContract,
      violations,
    };
  },
});

/**
 * Update running tally with a new round's scores.
 */
export function updateRunningTally(
  tally: import('./types').RunningTally | undefined,
  roundScore: ForecastScoreResult,
  predictions: Record<ContractId, number>,
  actuals: Record<ContractId, boolean>
): import('./types').RunningTally {
  const newTally: import('./types').RunningTally = tally ?? {
    roundsCompleted: 0,
    cumulativeBrierScore: 0,
    cumulativeLogLoss: 0,
    cumulativeAccuracy: 0,
    totalEventsOccurred: 0,
    totalViolations: 0,
    perContract: {} as Record<ContractId, {
      totalPredictions: number;
      totalBrierScore: number;
      totalLogLoss: number;
      timesEventOccurred: number;
    }>,
  };

  // Initialize per-contract if needed
  for (const contractId of CONTRACT_IDS) {
    if (!(contractId in newTally.perContract)) {
      newTally.perContract[contractId] = {
        totalPredictions: 0,
        totalBrierScore: 0,
        totalLogLoss: 0,
        timesEventOccurred: 0,
      };
    }
  }

  // Update aggregates
  newTally.roundsCompleted += 1;
  newTally.cumulativeBrierScore += roundScore.aggregates.meanBrierScore;
  newTally.cumulativeLogLoss += roundScore.aggregates.meanLogLoss;
  newTally.cumulativeAccuracy += roundScore.aggregates.accuracy;
  newTally.totalEventsOccurred += roundScore.aggregates.eventsOccurred;
  newTally.totalViolations += roundScore.aggregates.monotonicityViolations;

  // Update per-contract
  for (const cs of roundScore.perContract) {
    const pc = newTally.perContract[cs.contractId];
    pc.totalPredictions += 1;
    pc.totalBrierScore += cs.brierScore;
    pc.totalLogLoss += cs.logLoss;
    if (cs.actual) {
      pc.timesEventOccurred += 1;
    }
  }

  return newTally;
}
```

#### Task 5.6: Write scorer tests

```typescript
// __tests__/scorers.test.ts

import { describe, test, expect } from 'vitest';
import { brierScore, meanBrierScore, brierSkillScore } from '../src/scorers/brier-scorer';
import { logLoss, meanLogLoss } from '../src/scorers/log-loss-scorer';
import { checkMonotonicity } from '../src/scorers/monotonicity-scorer';
import { forecastScorer, updateRunningTally } from '../src/scorers/aggregate-scorer';
import { CONTRACT_IDS } from '../src/replay-lab/annotations';
import type { ContractId } from '../src/replay-lab/annotations';

describe('Brier Score', () => {
  test('perfect prediction scores 0', () => {
    expect(brierScore(1.0, true)).toBe(0);
    expect(brierScore(0.0, false)).toBe(0);
  });

  test('worst prediction scores 1', () => {
    expect(brierScore(0.0, true)).toBe(1);
    expect(brierScore(1.0, false)).toBe(1);
  });

  test('50% prediction scores 0.25', () => {
    expect(brierScore(0.5, true)).toBe(0.25);
    expect(brierScore(0.5, false)).toBe(0.25);
  });

  test('meanBrierScore averages correctly', () => {
    const predictions = [1.0, 0.0, 0.5];
    const actuals = [true, false, true];
    // (0 + 0 + 0.25) / 3 = 0.0833...
    expect(meanBrierScore(predictions, actuals)).toBeCloseTo(0.0833, 3);
  });

  test('brierSkillScore shows improvement over baseline', () => {
    const modelBrier = 0.1;
    const baselineBrier = 0.25; // Random baseline
    const bss = brierSkillScore(modelBrier, baselineBrier);
    expect(bss).toBeCloseTo(0.6, 3); // 1 - 0.1/0.25 = 0.6
  });
});

describe('Log Loss', () => {
  test('confident correct prediction has low loss', () => {
    expect(logLoss(0.99, true)).toBeLessThan(0.1);
    expect(logLoss(0.01, false)).toBeLessThan(0.1);
  });

  test('confident wrong prediction has high loss', () => {
    expect(logLoss(0.01, true)).toBeGreaterThan(4);
    expect(logLoss(0.99, false)).toBeGreaterThan(4);
  });

  test('50% prediction has log(2) loss', () => {
    expect(logLoss(0.5, true)).toBeCloseTo(Math.log(2), 3);
    expect(logLoss(0.5, false)).toBeCloseTo(Math.log(2), 3);
  });
});

describe('Monotonicity Checker', () => {
  test('returns no violations for valid predictions', () => {
    const predictions = makeValidPredictions();
    const violations = checkMonotonicity(predictions);
    expect(violations).toHaveLength(0);
  });

  test('detects threshold violation', () => {
    const predictions = makeValidPredictions();
    // Violate: p(5%) should be <= p(3%), but we set it higher
    predictions['dump-simple-1m-5pct'] = 0.5;
    predictions['dump-simple-1m-3pct'] = 0.3;

    const violations = checkMonotonicity(predictions);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].type).toBe('threshold');
  });

  test('detects horizon violation', () => {
    const predictions = makeValidPredictions();
    // Violate: p(1m) should be <= p(15m), but we set it higher
    predictions['dump-simple-1m-1pct'] = 0.8;
    predictions['dump-simple-15m-1pct'] = 0.5;

    const violations = checkMonotonicity(predictions);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].type).toBe('horizon');
  });
});

describe('Aggregate Scorer', () => {
  test('scores valid predictions', () => {
    const predictions = makeValidPredictions();
    const actuals = makeActuals(3); // 3 events occurred

    const result = forecastScorer.score({ predictions, actuals, predictionTime: new Date(), symbolId: 'TEST' });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.aggregates.eventsOccurred).toBe(3);
    expect(result.perContract).toHaveLength(CONTRACT_IDS.length);
  });

  test('running tally accumulates correctly', () => {
    const predictions = makeValidPredictions();
    const actuals = makeActuals(2);

    const round1 = forecastScorer.score({ predictions, actuals, predictionTime: new Date(), symbolId: 'TEST' });
    const tally1 = updateRunningTally(undefined, round1, predictions, actuals);

    expect(tally1.roundsCompleted).toBe(1);

    const round2 = forecastScorer.score({ predictions, actuals, predictionTime: new Date(), symbolId: 'TEST' });
    const tally2 = updateRunningTally(tally1, round2, predictions, actuals);

    expect(tally2.roundsCompleted).toBe(2);
    expect(tally2.cumulativeBrierScore).toBeCloseTo(tally1.cumulativeBrierScore * 2, 5);
  });
});

// Helper functions
function makeValidPredictions(): Record<ContractId, number> {
  // Create predictions that satisfy all monotonicity constraints
  return {
    'dump-simple-1m-1pct': 0.15,
    'dump-simple-1m-3pct': 0.08,
    'dump-simple-1m-5pct': 0.03,
    'dump-simple-15m-1pct': 0.25,
    'dump-simple-15m-3pct': 0.15,
    'dump-simple-15m-5pct': 0.06,
    'dump-simple-1h-0.5pct': 0.40,
    'dump-simple-1h-1pct': 0.35,
    'dump-vol-adjusted-1m-z2': 0.10,
    'dump-vol-adjusted-15m-z2': 0.18,
    'dump-vol-adjusted-1h-z2': 0.28,
    'dump-drawdown-1pct': 0.30,
    'dump-drawdown-3pct': 0.12,
  };
}

function makeActuals(numTrue: number): Record<ContractId, boolean> {
  const actuals: Record<ContractId, boolean> = {} as Record<ContractId, boolean>;
  CONTRACT_IDS.forEach((id, i) => {
    actuals[id] = i < numTrue;
  });
  return actuals;
}
```

**Verification:** `pnpm test --filter=agent_003 -- scorers`

---

### Phase 6: API Route Orchestration

#### Task 6.1: Create play route

```typescript
// src/app/api/play/route.ts

import { runRound } from '@nullagent/agent-core';
import { saveScore } from '@nullagent/scorers';
import { NextResponse } from 'next/server';

import {
  initializeClock,
  advanceClock,
  getClockState,
  getChartWindow,
  getPredictionWindow,
} from '../../../clock-state';
import { forecaster, setForecastContext, clearForecastContext } from '../../../forecaster';
import { getForecastingCharts } from '../../../replay-lab/charts';
import { getOrderbookSnapshot, formatOrderbookForPrompt } from '../../../replay-lab/orderbook';
import { getGroundTruthBatch } from '../../../replay-lab/annotations';
import { forecastScorer, updateRunningTally } from '../../../scorers/aggregate-scorer';

import type { ForecastOutput } from '../../../forecaster';
import type { ForecastScoreResult, RunningTally } from '../../../scorers/types';
import type { ContractId } from '../../../replay-lab/annotations';

// In-memory running tally
let runningTally: RunningTally | undefined;

function getSymbolId(): string {
  const symbolId = process.env['SYMBOL_ID'];
  if (!symbolId) {
    throw new Error('SYMBOL_ID environment variable is required');
  }
  return symbolId;
}

export async function POST(): Promise<NextResponse> {
  try {
    const traceId = crypto.randomUUID();
    const symbolId = getSymbolId();

    // Initialize or get clock
    const clockBefore = initializeClock();
    const chartWindow = getChartWindow();
    const predictionWindow = getPredictionWindow();

    // Fetch market data in parallel
    const [charts, orderbook] = await Promise.all([
      getForecastingCharts(symbolId, chartWindow.from, chartWindow.to),
      getOrderbookSnapshot(symbolId, clockBefore.currentTime),
    ]);

    // Set context for forecaster prompt
    setForecastContext({
      chartSmaUrl: charts.candleSma,
      chartBbUrl: charts.candleBb,
      orderbookData: formatOrderbookForPrompt(orderbook),
      currentTime: clockBefore.currentTime.toISOString(),
      symbolId,
    });

    // Run forecaster
    const forecastResult = await runRound(forecaster, { traceId });
    const forecastOutput = forecastResult.output as ForecastOutput;

    clearForecastContext();

    // Get ground truth (actual outcomes for the prediction window)
    const groundTruth = await getGroundTruthBatch(
      symbolId,
      predictionWindow.from,
      predictionWindow.to
    );

    // Score the predictions
    const scoreInput = {
      predictions: forecastOutput.predictions as Record<ContractId, number>,
      actuals: groundTruth,
      predictionTime: clockBefore.currentTime,
      symbolId,
    };

    const scoreResult = forecastScorer.score(scoreInput);

    // Update running tally
    runningTally = updateRunningTally(
      runningTally,
      scoreResult,
      forecastOutput.predictions as Record<ContractId, number>,
      groundTruth
    );

    // Save score to database
    await saveScore({
      traceId,
      agentId: forecaster.definition.id,
      roundNumber: forecastResult.roundNumber,
      scorerId: forecastScorer.id,
      result: scoreResult,
    });

    // Advance clock for next round
    const clockAfter = advanceClock();

    return NextResponse.json({
      success: true,
      traceId,

      // Clock state
      clock: {
        predictionTime: clockBefore.currentTime.toISOString(),
        roundNumber: clockBefore.roundNumber,
        nextPredictionTime: clockAfter.currentTime.toISOString(),
      },

      // What the model saw
      inputs: {
        symbolId,
        chartWindow: {
          from: chartWindow.from.toISOString(),
          to: chartWindow.to.toISOString(),
        },
        orderbook: {
          midPrice: orderbook.mid_price,
          spreadBps: orderbook.spread_bps,
          imbalance: orderbook.imbalance,
        },
      },

      // Model output
      predictions: forecastOutput.predictions,
      reasoning: forecastOutput.reasoning,

      // Ground truth
      actuals: groundTruth,

      // Scoring
      score: {
        roundScore: scoreResult.score,
        meanBrierScore: scoreResult.aggregates.meanBrierScore,
        meanLogLoss: scoreResult.aggregates.meanLogLoss,
        accuracy: scoreResult.aggregates.accuracy,
        eventsOccurred: scoreResult.aggregates.eventsOccurred,
        monotonicityViolations: scoreResult.aggregates.monotonicityViolations,
      },

      // Running tally
      runningTally: {
        roundsCompleted: runningTally.roundsCompleted,
        avgBrierScore: runningTally.cumulativeBrierScore / runningTally.roundsCompleted,
        avgLogLoss: runningTally.cumulativeLogLoss / runningTally.roundsCompleted,
        avgAccuracy: runningTally.cumulativeAccuracy / runningTally.roundsCompleted,
        totalEventsOccurred: runningTally.totalEventsOccurred,
        totalViolations: runningTally.totalViolations,
      },

      usage: forecastResult.usage,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Play route error:', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// GET to see current state
export function GET(): NextResponse {
  try {
    const clock = initializeClock();

    return NextResponse.json({
      clock: {
        currentTime: clock.currentTime.toISOString(),
        roundNumber: clock.roundNumber,
        startTime: clock.startTime.toISOString(),
      },
      runningTally: runningTally ?? { message: 'No rounds completed yet' },
    });
  } catch {
    return NextResponse.json({ message: 'Clock not initialized. POST to /api/play to start.' });
  }
}
```

#### Task 6.2: Create debug route

```typescript
// src/app/api/debug/route.ts

import { getMessageHistory } from '@nullagent/agent-core';
import { NextResponse } from 'next/server';

import { forecaster } from '../../../forecaster';
import { getClockState, resetClockState } from '../../../clock-state';

export async function GET(): Promise<NextResponse> {
  try {
    const history = await getMessageHistory(forecaster.definition.id, 20);

    let clock;
    try {
      clock = getClockState();
    } catch {
      clock = null;
    }

    return NextResponse.json({
      forecaster: {
        id: forecaster.definition.id,
        messageCount: history.length,
        recentMessages: history.slice(-5).map(m => ({
          role: m.role,
          kind: m.kind,
          roundNumber: m.roundNumber,
          createdAt: m.createdAt,
          contentPreview: m.content.slice(0, 200) + (m.content.length > 200 ? '...' : ''),
        })),
      },
      clock,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// DELETE to reset clock (for testing)
export function DELETE(): NextResponse {
  resetClockState();
  return NextResponse.json({ message: 'Clock reset. Next POST will start from SIMULATION_START_TIME.' });
}
```

#### Task 6.3: Write API tests

```typescript
// __tests__/api.test.ts

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@nullagent/agent-core', () => ({
  runRound: vi.fn(),
  getMessageHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('@nullagent/scorers', () => ({
  saveScore: vi.fn(),
  defineScorer: <TInput, TResult>(def: { id: string; name: string; score: (i: TInput) => TResult }) => def,
}));

// Mock replay-lab modules
vi.mock('../src/replay-lab/charts', () => ({
  getForecastingCharts: vi.fn().mockResolvedValue({
    candleSma: 'https://chart-sma.test.com',
    candleBb: 'https://chart-bb.test.com',
  }),
}));

vi.mock('../src/replay-lab/orderbook', () => ({
  getOrderbookSnapshot: vi.fn().mockResolvedValue({
    timestamp: '2025-12-22T13:59:00Z',
    mid_price: 3500.50,
    spread: 0.25,
    spread_bps: 0.71,
    imbalance: 0.15,
    bid_depth: 100.5,
    ask_depth: 85.3,
  }),
  formatOrderbookForPrompt: vi.fn().mockReturnValue('## Order Book\nMid: $3500.50'),
}));

vi.mock('../src/replay-lab/annotations', () => ({
  getGroundTruthBatch: vi.fn().mockResolvedValue({
    'dump-simple-1m-1pct': false,
    'dump-simple-1m-3pct': false,
    'dump-simple-1m-5pct': false,
    'dump-simple-15m-1pct': true,
    'dump-simple-15m-3pct': false,
    'dump-simple-15m-5pct': false,
    'dump-simple-1h-0.5pct': true,
    'dump-simple-1h-1pct': false,
    'dump-vol-adjusted-1m-z2': false,
    'dump-vol-adjusted-15m-z2': false,
    'dump-vol-adjusted-1h-z2': false,
    'dump-drawdown-1pct': true,
    'dump-drawdown-3pct': false,
  }),
  CONTRACT_IDS: [
    'dump-simple-1m-1pct',
    'dump-simple-1m-3pct',
    'dump-simple-1m-5pct',
    'dump-simple-15m-1pct',
    'dump-simple-15m-3pct',
    'dump-simple-15m-5pct',
    'dump-simple-1h-0.5pct',
    'dump-simple-1h-1pct',
    'dump-vol-adjusted-1m-z2',
    'dump-vol-adjusted-15m-z2',
    'dump-vol-adjusted-1h-z2',
    'dump-drawdown-1pct',
    'dump-drawdown-3pct',
  ],
}));

vi.mock('../src/forecaster', () => ({
  forecaster: {
    definition: { id: 'forecaster_001' },
  },
  setForecastContext: vi.fn(),
  clearForecastContext: vi.fn(),
}));

// Set env vars
vi.stubEnv('SIMULATION_START_TIME', '2025-12-22T14:00:00Z');
vi.stubEnv('SYMBOL_ID', 'COINBASE_SPOT_ETH_USD');
vi.stubEnv('REPLAY_LAB_API_KEY', 'test-key');
vi.stubEnv('REPLAY_LAB_BASE_URL', 'https://test.replay-lab.com');

import { runRound } from '@nullagent/agent-core';
import { saveScore } from '@nullagent/scorers';
import { POST, GET } from '../src/app/api/play/route';
import { resetClockState } from '../src/clock-state';

describe('POST /api/play', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClockState();
  });

  test('returns successful prediction response', async () => {
    vi.mocked(runRound).mockResolvedValueOnce({
      output: {
        reasoning: 'Test reasoning',
        predictions: {
          'dump-simple-1m-1pct': 0.15,
          'dump-simple-1m-3pct': 0.08,
          'dump-simple-1m-5pct': 0.03,
          'dump-simple-15m-1pct': 0.25,
          'dump-simple-15m-3pct': 0.15,
          'dump-simple-15m-5pct': 0.06,
          'dump-simple-1h-0.5pct': 0.40,
          'dump-simple-1h-1pct': 0.35,
          'dump-vol-adjusted-1m-z2': 0.10,
          'dump-vol-adjusted-15m-z2': 0.18,
          'dump-vol-adjusted-1h-z2': 0.28,
          'dump-drawdown-1pct': 0.30,
          'dump-drawdown-3pct': 0.12,
        },
      },
      roundNumber: 1,
      usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.predictions).toBeDefined();
    expect(data.actuals).toBeDefined();
    expect(data.score).toBeDefined();
    expect(data.runningTally).toBeDefined();
    expect(data.clock.roundNumber).toBe(0);
  });

  test('advances clock after each round', async () => {
    vi.mocked(runRound).mockResolvedValue({
      output: {
        reasoning: 'Test',
        predictions: makeMockPredictions(),
      },
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    // First round
    const response1 = await POST();
    const data1 = await response1.json();
    expect(data1.clock.predictionTime).toBe('2025-12-22T14:00:00.000Z');
    expect(data1.clock.nextPredictionTime).toBe('2025-12-22T15:00:00.000Z');

    // Second round
    const response2 = await POST();
    const data2 = await response2.json();
    expect(data2.clock.predictionTime).toBe('2025-12-22T15:00:00.000Z');
    expect(data2.clock.nextPredictionTime).toBe('2025-12-22T16:00:00.000Z');
  });

  test('saves score to database', async () => {
    vi.mocked(runRound).mockResolvedValueOnce({
      output: {
        reasoning: 'Test',
        predictions: makeMockPredictions(),
      },
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    await POST();

    expect(saveScore).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'forecaster_001',
        roundNumber: 1,
        scorerId: 'forecast_scorer',
      })
    );
  });

  test('accumulates running tally', async () => {
    vi.mocked(runRound).mockResolvedValue({
      output: {
        reasoning: 'Test',
        predictions: makeMockPredictions(),
      },
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    await POST();
    const response2 = await POST();
    const data2 = await response2.json();

    expect(data2.runningTally.roundsCompleted).toBe(2);
  });
});

describe('GET /api/play', () => {
  beforeEach(() => {
    resetClockState();
  });

  test('returns clock state after initialization', async () => {
    vi.mocked(runRound).mockResolvedValueOnce({
      output: {
        reasoning: 'Test',
        predictions: makeMockPredictions(),
      },
      roundNumber: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      wasCompacted: false,
      traceId: 'test-trace-id',
    });

    await POST(); // Initialize clock

    const response = await GET();
    const data = await response.json();

    expect(data.clock).toBeDefined();
    expect(data.runningTally).toBeDefined();
  });
});

// Helper
function makeMockPredictions() {
  return {
    'dump-simple-1m-1pct': 0.15,
    'dump-simple-1m-3pct': 0.08,
    'dump-simple-1m-5pct': 0.03,
    'dump-simple-15m-1pct': 0.25,
    'dump-simple-15m-3pct': 0.15,
    'dump-simple-15m-5pct': 0.06,
    'dump-simple-1h-0.5pct': 0.40,
    'dump-simple-1h-1pct': 0.35,
    'dump-vol-adjusted-1m-z2': 0.10,
    'dump-vol-adjusted-15m-z2': 0.18,
    'dump-vol-adjusted-1h-z2': 0.28,
    'dump-drawdown-1pct': 0.30,
    'dump-drawdown-3pct': 0.12,
  };
}
```

**Verification:** `pnpm test --filter=agent_003 -- api`

---

### Phase 7: Documentation & Cleanup

#### Task 7.1: Create README.md

```markdown
# agent_003: Market Dump Forecaster

A probabilistic forecasting agent that predicts market dump events using chart analysis and order book data.

## What It Does

**Forecaster** analyzes market data and predicts the probability of 13 different dump events:
- Receives 4 hours of historical chart images (candlestick + indicators)
- Sees current order book state (mid price, spread, imbalance)
- Outputs probability (0-1) for each dump contract
- Gets scored against actual outcomes using proper scoring rules (Brier, Log Loss)

The agent operates on a **simulated clock** that advances 1 hour per round, allowing replay of historical market conditions.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     POST /api/play                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │    Clock Manager      │ ← Simulation time
              └───────────┬───────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
        ▼                                   ▼
┌───────────────────┐           ┌────────────────────┐
│  Signed Chart URL │           │  Order Book Data   │
│  (Replay Lab API) │           │  (Replay Lab API)  │
└─────────┬─────────┘           └──────────┬─────────┘
          │                                │
          └──────────────┬─────────────────┘
                         │
                         ▼
               ┌──────────────────┐
               │    Forecaster    │
               │   ┌──────────┐   │
               │   │  Memory  │   │
               │   └──────────┘   │
               └────────┬─────────┘
                        │
                        ▼
              ┌──────────────────────┐
              │  13 Probabilities    │
              │  (dump contracts)    │
              └──────────┬───────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
┌───────────────────┐         ┌───────────────────────┐
│   Ground Truth    │         │   Multi-Scorer        │
│   (Annotations)   │         │   (Brier, LogLoss,    │
└─────────┬─────────┘         │    Monotonicity)      │
          │                   └───────────┬───────────┘
          └────────────┬──────────────────┘
                       │
                       ▼
             ┌─────────────────┐
             │  scorer_results │
             │       DB        │
             └─────────────────┘
```

## Scoring System

The forecaster is evaluated using proper scoring rules from forecasting literature:

| Metric | Description | Range | Better |
|--------|-------------|-------|--------|
| **Brier Score** | Mean squared error: (p - y)² | 0-1 | Lower |
| **Log Loss** | Cross-entropy: -[y log(p) + (1-y) log(1-p)] | 0-∞ | Lower |
| **Accuracy** | Fraction correct at 0.5 threshold | 0-1 | Higher |
| **Violations** | Monotonicity constraint violations | 0-12 | Lower |

### Monotonicity Constraints

Predictions must satisfy logical constraints:
- **Threshold**: p(5%) ≤ p(3%) ≤ p(1%) - larger drops are rarer
- **Horizon**: p(1h) ≥ p(15m) ≥ p(1m) - longer windows have more opportunity

Violations are tracked but don't affect the Brier/Log Loss scores.

## Environment Variables

```bash
# Replay Lab API
REPLAY_LAB_API_KEY=rn_your_key_here
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network

# Simulation
SIMULATION_START_TIME=2025-12-22T14:00:00Z  # ISO 8601
SYMBOL_ID=COINBASE_SPOT_ETH_USD
```

## Usage

```bash
# Start dev server
pnpm dev --filter=agent_003

# Make predictions (advances clock by 1 hour)
curl -X POST http://localhost:3004/api/play

# View current state
curl http://localhost:3004/api/play

# Reset clock
curl -X DELETE http://localhost:3004/api/debug
```

## Example Response

```json
{
  "success": true,
  "traceId": "abc123...",
  "clock": {
    "predictionTime": "2025-12-22T14:00:00.000Z",
    "roundNumber": 0,
    "nextPredictionTime": "2025-12-22T15:00:00.000Z"
  },
  "predictions": {
    "dump-simple-1m-1pct": 0.15,
    "dump-simple-1m-3pct": 0.08,
    "dump-simple-1h-1pct": 0.35,
    ...
  },
  "actuals": {
    "dump-simple-1m-1pct": false,
    "dump-simple-15m-1pct": true,
    ...
  },
  "score": {
    "roundScore": 0.142,
    "meanBrierScore": 0.142,
    "meanLogLoss": 0.423,
    "accuracy": 0.769,
    "eventsOccurred": 3,
    "monotonicityViolations": 0
  },
  "runningTally": {
    "roundsCompleted": 1,
    "avgBrierScore": 0.142,
    "avgLogLoss": 0.423,
    "avgAccuracy": 0.769
  }
}
```

## When to Use This Pattern

- Probabilistic forecasting with proper evaluation
- Multi-output prediction tasks
- Simulated replay of historical scenarios
- Calibration-focused AI systems
- Financial or time-series prediction agents
```

#### Task 7.2: Update package.json port

Ensure `package.json` has port 3004:
```json
{
  "scripts": {
    "dev": "next dev --port 3004"
  }
}
```

#### Task 7.3: Run full QA

```bash
pnpm qa --filter=agent_003
```

This runs: lint, type-check, test, build

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm install` succeeds
- [ ] `pnpm lint --filter=agent_003` passes
- [ ] `pnpm check-types --filter=agent_003` passes
- [ ] `pnpm test --filter=agent_003` passes with >90% coverage
- [ ] `pnpm build --filter=agent_003` succeeds
- [ ] `pnpm dev --filter=agent_003` starts on port 3004
- [ ] `curl -X POST localhost:3004/api/play` returns valid response
- [ ] Database has scorer_results entries after curl
- [ ] Clock advances by 1 hour after each POST
- [ ] Running tally accumulates across rounds
- [ ] 5 consecutive rounds complete without errors

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Replay Lab API rate limits | Add exponential backoff retry logic |
| Signed URL expiration | URLs expire in 1hr, plenty of time for single round |
| Large image tokens | Charts are ~1200x628px, manageable for vision models |
| Annotation gaps | API returns empty array if no events, handled as `false` |
| Clock drift | In-memory only, resets on server restart (acceptable for demo) |

---

## Future Enhancements (Out of Scope)

1. **Persist clock state** - Save to database for cross-restart continuity
2. **Batch replay** - Run multiple rounds without manual curl
3. **Calibration visualization** - Plot reliability curves over time
4. **Multi-symbol support** - Forecast multiple assets simultaneously
5. **Isotonic regression** - Post-process predictions to enforce monotonicity
