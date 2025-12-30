# Benchmark Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the agent_005 benchmark with ATR normalization, bid/ask separation, fill count warnings, and EV quintile buckets.

**Architecture:** Four independent modules that integrate into the existing scoring pipeline. ATR calculator computes volatility from trades. Delta-mid scorer normalizes by ATR. Results and table modules display split bid/ask columns with low-sample warnings. A new quintile analyzer provides bucket-level EV analysis.

**Tech Stack:** TypeScript, Vitest, cli-table3, chalk

---

## Task 1: ATR Calculator Module

Create a new module to compute Average True Range from trade data.

**Files:**
- Create: `apps/agent_005/src/replay-lab/atr-calculator.ts`
- Test: `apps/agent_005/__tests__/atr-calculator.test.ts`

**Step 1: Write the failing test for candle building**

```typescript
// apps/agent_005/__tests__/atr-calculator.test.ts
import { describe, expect, it } from 'vitest';
import { buildCandles } from '../src/replay-lab/atr-calculator';
import type { Trade } from '../src/replay-lab/trades';

describe('ATR Calculator', () => {
  describe('buildCandles', () => {
    it('builds 1-minute candles from trades', () => {
      const baseTime = new Date('2024-01-01T12:00:00Z');
      const trades: Trade[] = [
        { symbolId: 'BTC', timestamp: new Date(baseTime.getTime() + 10_000), price: 100, size: 1, takerSide: 'BUY', uuid: '1' },
        { symbolId: 'BTC', timestamp: new Date(baseTime.getTime() + 20_000), price: 105, size: 1, takerSide: 'BUY', uuid: '2' },
        { symbolId: 'BTC', timestamp: new Date(baseTime.getTime() + 30_000), price: 98, size: 1, takerSide: 'SELL', uuid: '3' },
        { symbolId: 'BTC', timestamp: new Date(baseTime.getTime() + 70_000), price: 102, size: 1, takerSide: 'BUY', uuid: '4' },
      ];

      const candles = buildCandles(trades, baseTime, 60_000, 2);

      expect(candles).toHaveLength(2);
      expect(candles[0]).toEqual({ open: 100, high: 105, low: 98, close: 98 });
      expect(candles[1]).toEqual({ open: 102, high: 102, low: 102, close: 102 });
    });

    it('returns empty array when no trades in lookback', () => {
      const candles = buildCandles([], new Date(), 60_000, 20);
      expect(candles).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_005 && pnpm test:unit -- atr-calculator.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation for buildCandles**

```typescript
// apps/agent_005/src/replay-lab/atr-calculator.ts
import type { Trade } from './trades.js';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Build OHLC candles from trades for ATR calculation.
 * Candles are built backwards from the reference time.
 *
 * @param trades - Array of trades to build candles from
 * @param referenceTime - The end time (candles built backwards from here)
 * @param candleDurationMs - Duration of each candle in milliseconds
 * @param candleCount - Number of candles to build
 * @returns Array of candles, oldest first
 */
export function buildCandles(
  trades: Trade[],
  referenceTime: Date,
  candleDurationMs: number,
  candleCount: number
): Candle[] {
  const refMs = referenceTime.getTime();
  const candles: Candle[] = [];

  for (let i = candleCount - 1; i >= 0; i--) {
    const candleStart = refMs - (i + 1) * candleDurationMs;
    const candleEnd = candleStart + candleDurationMs;

    const candleTrades = trades.filter((t) => {
      const ts = t.timestamp.getTime();
      return ts >= candleStart && ts < candleEnd;
    });

    if (candleTrades.length > 0) {
      const prices = candleTrades.map((t) => t.price);
      candles.push({
        open: candleTrades[0].price,
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: candleTrades[candleTrades.length - 1].price,
      });
    }
  }

  return candles;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_005 && pnpm test:unit -- atr-calculator.test.ts`
Expected: PASS

**Step 5: Add test for calculateATR**

Add to `atr-calculator.test.ts`:

```typescript
import { buildCandles, calculateATR } from '../src/replay-lab/atr-calculator';

describe('calculateATR', () => {
  it('computes ATR from candles using Wilder smoothing', () => {
    // 3 candles with known true ranges
    const candles: Candle[] = [
      { open: 100, high: 110, low: 95, close: 105 },  // TR = 15 (high - low)
      { open: 105, high: 112, low: 102, close: 108 }, // TR = max(10, 7, 3) = 10
      { open: 108, high: 115, low: 100, close: 110 }, // TR = max(15, 7, 8) = 15
    ];

    const atr = calculateATR(candles);

    // First ATR = 15 (first TR)
    // Second ATR = (15 * 2 + 10) / 3 = 40/3 ≈ 13.33
    // Third ATR = (13.33 * 2 + 15) / 3 ≈ 13.89
    expect(atr).toBeCloseTo(13.89, 1);
  });

  it('returns undefined for empty candles', () => {
    expect(calculateATR([])).toBeUndefined();
  });

  it('returns first TR for single candle', () => {
    const candles: Candle[] = [{ open: 100, high: 110, low: 95, close: 105 }];
    expect(calculateATR(candles)).toBe(15);
  });
});
```

**Step 6: Run test to verify it fails**

Run: `cd apps/agent_005 && pnpm test:unit -- atr-calculator.test.ts`
Expected: FAIL

**Step 7: Implement calculateATR**

Add to `atr-calculator.ts`:

```typescript
/**
 * Calculate True Range for a candle.
 * TR = max(high - low, |high - prevClose|, |low - prevClose|)
 * For the first candle, TR = high - low
 */
function trueRange(candle: Candle, prevClose: number | undefined): number {
  const highLow = candle.high - candle.low;

  if (prevClose === undefined) {
    return highLow;
  }

  const highPrevClose = Math.abs(candle.high - prevClose);
  const lowPrevClose = Math.abs(candle.low - prevClose);

  return Math.max(highLow, highPrevClose, lowPrevClose);
}

/**
 * Calculate Average True Range using Wilder's smoothing method.
 * ATR_n = (ATR_{n-1} * (period - 1) + TR_n) / period
 *
 * @param candles - Array of OHLC candles, oldest first
 * @returns ATR value, or undefined if no candles
 */
export function calculateATR(candles: Candle[]): number | undefined {
  if (candles.length === 0) {
    return undefined;
  }

  const period = candles.length;
  let atr = trueRange(candles[0], undefined);

  for (let i = 1; i < candles.length; i++) {
    const tr = trueRange(candles[i], candles[i - 1].close);
    atr = (atr * (period - 1) + tr) / period;
  }

  return atr;
}
```

**Step 8: Run test to verify it passes**

Run: `cd apps/agent_005 && pnpm test:unit -- atr-calculator.test.ts`
Expected: PASS

**Step 9: Add test for getATRForHorizon (convenience function)**

Add to `atr-calculator.test.ts`:

```typescript
import { buildCandles, calculateATR, getATRForHorizon } from '../src/replay-lab/atr-calculator';

describe('getATRForHorizon', () => {
  it('computes ATR for 1m horizon using 20 one-minute candles', () => {
    const baseTime = new Date('2024-01-01T12:00:00Z');
    const trades: Trade[] = [];

    // Create 20 minutes of trades with consistent 10-point range
    for (let minute = 0; minute < 20; minute++) {
      const candleStart = baseTime.getTime() - (20 - minute) * 60_000;
      trades.push(
        { symbolId: 'BTC', timestamp: new Date(candleStart + 10_000), price: 100, size: 1, takerSide: 'BUY', uuid: `${minute}-1` },
        { symbolId: 'BTC', timestamp: new Date(candleStart + 30_000), price: 110, size: 1, takerSide: 'BUY', uuid: `${minute}-2` },
        { symbolId: 'BTC', timestamp: new Date(candleStart + 50_000), price: 105, size: 1, takerSide: 'SELL', uuid: `${minute}-3` },
      );
    }

    const atr = getATRForHorizon(trades, baseTime, '1m');

    // Each candle has range of 10, ATR should converge to ~10
    expect(atr).toBeCloseTo(10, 0);
  });

  it('returns undefined when insufficient trade data', () => {
    const atr = getATRForHorizon([], new Date(), '1m');
    expect(atr).toBeUndefined();
  });
});
```

**Step 10: Run test to verify it fails**

Run: `cd apps/agent_005 && pnpm test:unit -- atr-calculator.test.ts`
Expected: FAIL

**Step 11: Implement getATRForHorizon**

Add to `atr-calculator.ts`:

```typescript
type Horizon = '1m' | '5m' | '15m';

const HORIZON_MS: Record<Horizon, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
};

const ATR_LOOKBACK_PERIODS = 20;

/**
 * Compute ATR for a specific horizon.
 * Uses 20 periods of the horizon duration.
 *
 * @param trades - Trade data for candle building
 * @param referenceTime - The prediction/fill time
 * @param horizon - The horizon ('1m', '5m', '15m')
 * @returns ATR value or undefined if insufficient data
 */
export function getATRForHorizon(
  trades: Trade[],
  referenceTime: Date,
  horizon: Horizon
): number | undefined {
  const candleDurationMs = HORIZON_MS[horizon];
  const candles = buildCandles(trades, referenceTime, candleDurationMs, ATR_LOOKBACK_PERIODS);

  if (candles.length < 2) {
    return undefined;
  }

  return calculateATR(candles);
}
```

**Step 12: Run test to verify it passes**

Run: `cd apps/agent_005 && pnpm test:unit -- atr-calculator.test.ts`
Expected: PASS

**Step 13: Commit**

```bash
git add apps/agent_005/src/replay-lab/atr-calculator.ts apps/agent_005/__tests__/atr-calculator.test.ts
git commit -m "feat(agent_005): add ATR calculator for delta-mid normalization"
```

---

## Task 2: Normalized Delta-Mid Scorer

Update delta-mid scorer to normalize by ATR and track per-side metrics.

**Files:**
- Modify: `apps/agent_005/src/scorers/delta-mid-scorer.ts`
- Modify: `apps/agent_005/src/scorers/types.ts`
- Modify: `apps/agent_005/__tests__/delta-mid-scorer.test.ts`

**Step 1: Update types for normalized delta-mid and per-side aggregates**

Add to `apps/agent_005/src/scorers/types.ts` after line 128:

```typescript
/**
 * Extended delta-mid aggregates with normalization and per-side breakdown
 */
export interface ExtendedDeltaMidAggregates extends DeltaMidAggregates {
  // Normalized metrics (ATR-relative)
  meanNormalizedMAE: number;
  meanNormalizedBias: number;
  // Per-side breakdown
  bySide: {
    bid: { meanNormalizedMAE: number; meanNormalizedBias: number; sampleCount: number };
    ask: { meanNormalizedMAE: number; meanNormalizedBias: number; sampleCount: number };
  };
}

/**
 * Extended delta-mid contract score with normalization
 */
export interface ExtendedDeltaMidContractScore extends DeltaMidContractScore {
  atr: number | undefined;
  normalizedError: number | undefined; // absoluteError / ATR
  normalizedSignedError: number | undefined; // signedError / ATR
}

/**
 * Extended delta-mid scorer result
 */
export interface ExtendedDeltaMidScorerResult {
  scores: ExtendedDeltaMidContractScore[];
  aggregates: ExtendedDeltaMidAggregates;
}
```

**Step 2: Run type check to verify types compile**

Run: `cd apps/agent_005 && pnpm check-types`
Expected: PASS

**Step 3: Write failing test for normalized scoring**

Add to `apps/agent_005/__tests__/delta-mid-scorer.test.ts`:

```typescript
import {
  absoluteError,
  squaredError,
  signedError,
  scoreDeltaMidPrediction,
  scoreDeltaMidPredictions,
  scoreNormalizedDeltaMidPredictions,
} from '../src/scorers/delta-mid-scorer';
import type { DeltaMidContractId } from '../src/scorers/types';

describe('scoreNormalizedDeltaMidPredictions', () => {
  it('normalizes errors by ATR', () => {
    const predictions: Record<string, number> = {
      'bid-delta-mid-1m': 10,
    };
    const actuals: Record<string, number | undefined> = {
      'bid-delta-mid-1m': 5,
    };
    const atrs: Record<string, number | undefined> = {
      'bid-delta-mid-1m': 10, // ATR = 10, so normalized error = 5/10 = 0.5
    };

    const result = scoreNormalizedDeltaMidPredictions(predictions, actuals, atrs);

    expect(result.scores[0].normalizedError).toBe(0.5);
    expect(result.scores[0].normalizedSignedError).toBe(0.5);
    expect(result.aggregates.meanNormalizedMAE).toBe(0.5);
  });

  it('reports per-side metrics', () => {
    const predictions: Record<string, number> = {
      'bid-delta-mid-1m': 10,
      'ask-delta-mid-1m': -10,
    };
    const actuals: Record<string, number | undefined> = {
      'bid-delta-mid-1m': 5, // Error: 5
      'ask-delta-mid-1m': -2, // Error: 8
    };
    const atrs: Record<string, number | undefined> = {
      'bid-delta-mid-1m': 10,
      'ask-delta-mid-1m': 10,
    };

    const result = scoreNormalizedDeltaMidPredictions(predictions, actuals, atrs);

    expect(result.aggregates.bySide.bid.meanNormalizedMAE).toBe(0.5);
    expect(result.aggregates.bySide.ask.meanNormalizedMAE).toBe(0.8);
    expect(result.aggregates.bySide.bid.sampleCount).toBe(1);
    expect(result.aggregates.bySide.ask.sampleCount).toBe(1);
  });

  it('handles missing ATR gracefully', () => {
    const predictions: Record<string, number> = {
      'bid-delta-mid-1m': 10,
    };
    const actuals: Record<string, number | undefined> = {
      'bid-delta-mid-1m': 5,
    };
    const atrs: Record<string, number | undefined> = {
      'bid-delta-mid-1m': undefined,
    };

    const result = scoreNormalizedDeltaMidPredictions(predictions, actuals, atrs);

    expect(result.scores[0].normalizedError).toBeUndefined();
    expect(result.aggregates.meanNormalizedMAE).toBe(0); // No valid normalized samples
  });
});
```

**Step 4: Run test to verify it fails**

Run: `cd apps/agent_005 && pnpm test:unit -- delta-mid-scorer.test.ts`
Expected: FAIL

**Step 5: Implement scoreNormalizedDeltaMidPredictions**

Add to `apps/agent_005/src/scorers/delta-mid-scorer.ts`:

```typescript
import type {
  DeltaMidContractId,
  DeltaMidContractScore,
  ExtendedDeltaMidContractScore,
  ExtendedDeltaMidScorerResult,
  ExtendedDeltaMidAggregates,
} from './types';

type Side = 'bid' | 'ask';

function extractSide(contractId: string): Side {
  return contractId.startsWith('bid') ? 'bid' : 'ask';
}

/**
 * Score normalized delta-mid predictions with ATR normalization and per-side breakdown.
 *
 * @param predictions - Map of contract ID to predicted delta-mid value
 * @param actuals - Map of contract ID to actual delta-mid value (undefined if no fill)
 * @param atrs - Map of contract ID to ATR value for normalization
 * @returns Extended scorer result with normalized metrics and per-side breakdown
 */
export function scoreNormalizedDeltaMidPredictions(
  predictions: Record<string, number>,
  actuals: Record<string, number | undefined>,
  atrs: Record<string, number | undefined>
): ExtendedDeltaMidScorerResult {
  const scores: ExtendedDeltaMidContractScore[] = [];

  for (const [contractId, predicted] of Object.entries(predictions)) {
    // eslint-disable-next-line security/detect-object-injection -- Safe: iterating over known object keys
    const actual = actuals[contractId];
    if (actual === undefined) {
      continue;
    }

    // eslint-disable-next-line security/detect-object-injection -- Safe: iterating over known object keys
    const atr = atrs[contractId];
    const absError = absoluteError(predicted, actual);
    const sgnError = signedError(predicted, actual);

    scores.push({
      contractId: contractId as DeltaMidContractId,
      predicted,
      actual,
      absoluteError: absError,
      squaredError: squaredError(predicted, actual),
      signedError: sgnError,
      atr,
      normalizedError: atr !== undefined && atr > 0 ? absError / atr : undefined,
      normalizedSignedError: atr !== undefined && atr > 0 ? sgnError / atr : undefined,
    });
  }

  // Calculate aggregates
  const aggregates = calculateExtendedAggregates(scores);

  return { scores, aggregates };
}

function calculateExtendedAggregates(scores: ExtendedDeltaMidContractScore[]): ExtendedDeltaMidAggregates {
  const emptyAggregates: ExtendedDeltaMidAggregates = {
    meanMAE: 0,
    meanMSE: 0,
    meanBias: 0,
    sampleCount: 0,
    meanNormalizedMAE: 0,
    meanNormalizedBias: 0,
    bySide: {
      bid: { meanNormalizedMAE: 0, meanNormalizedBias: 0, sampleCount: 0 },
      ask: { meanNormalizedMAE: 0, meanNormalizedBias: 0, sampleCount: 0 },
    },
  };

  if (scores.length === 0) {
    return emptyAggregates;
  }

  // Raw metrics
  let totalAbsoluteError = 0;
  let totalSquaredError = 0;
  let totalSignedError = 0;

  // Normalized metrics
  let totalNormalizedError = 0;
  let totalNormalizedSignedError = 0;
  let normalizedCount = 0;

  // Per-side normalized metrics
  const bySide: Record<Side, { totalNormError: number; totalNormSigned: number; count: number }> = {
    bid: { totalNormError: 0, totalNormSigned: 0, count: 0 },
    ask: { totalNormError: 0, totalNormSigned: 0, count: 0 },
  };

  for (const score of scores) {
    totalAbsoluteError += score.absoluteError;
    totalSquaredError += score.squaredError;
    totalSignedError += score.signedError;

    if (score.normalizedError !== undefined && score.normalizedSignedError !== undefined) {
      totalNormalizedError += score.normalizedError;
      totalNormalizedSignedError += score.normalizedSignedError;
      normalizedCount++;

      const side = extractSide(score.contractId);
      bySide[side].totalNormError += score.normalizedError;
      bySide[side].totalNormSigned += score.normalizedSignedError;
      bySide[side].count++;
    }
  }

  return {
    meanMAE: totalAbsoluteError / scores.length,
    meanMSE: totalSquaredError / scores.length,
    meanBias: totalSignedError / scores.length,
    sampleCount: scores.length,
    meanNormalizedMAE: normalizedCount > 0 ? totalNormalizedError / normalizedCount : 0,
    meanNormalizedBias: normalizedCount > 0 ? totalNormalizedSignedError / normalizedCount : 0,
    bySide: {
      bid: {
        meanNormalizedMAE: bySide.bid.count > 0 ? bySide.bid.totalNormError / bySide.bid.count : 0,
        meanNormalizedBias: bySide.bid.count > 0 ? bySide.bid.totalNormSigned / bySide.bid.count : 0,
        sampleCount: bySide.bid.count,
      },
      ask: {
        meanNormalizedMAE: bySide.ask.count > 0 ? bySide.ask.totalNormError / bySide.ask.count : 0,
        meanNormalizedBias: bySide.ask.count > 0 ? bySide.ask.totalNormSigned / bySide.ask.count : 0,
        sampleCount: bySide.ask.count,
      },
    },
  };
}
```

**Step 6: Run test to verify it passes**

Run: `cd apps/agent_005 && pnpm test:unit -- delta-mid-scorer.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/agent_005/src/scorers/delta-mid-scorer.ts apps/agent_005/src/scorers/types.ts apps/agent_005/__tests__/delta-mid-scorer.test.ts
git commit -m "feat(agent_005): add ATR-normalized delta-mid scoring with per-side breakdown"
```

---

## Task 3: Integrate ATR into Benchmark Pipeline

Wire up ATR computation and normalized scoring into the benchmark.

**Files:**
- Modify: `apps/agent_005/src/benchmark.ts`
- Modify: `apps/agent_005/src/scorers/aggregate-scorer.ts`
- Modify: `apps/agent_005/src/scorers/types.ts`

**Step 1: Update ForecastScorerInput to accept ATRs**

In `apps/agent_005/src/scorers/types.ts`, update `ForecastScorerInput`:

```typescript
export interface ForecastScorerInput {
  predictions: Record<ContractId, number>;
  actuals: Record<ContractId, boolean>;
  predictionTime: Date;
  symbolId: string;
  // Optional extended inputs for delta-mid, PnL, and EV calculations
  deltaMidPredictions?: Record<string, number>;
  deltaMidActuals?: Record<string, number | undefined>;
  deltaMidATRs?: Record<string, number | undefined>; // NEW: ATR values per contract
  fillDetails?: Record<string, { filled: boolean; fillPrice?: number }>;
  exitMids?: Record<string, number | undefined>;
  fillPrices?: { bestBid: number; bestAsk: number };
}
```

**Step 2: Update ForecastScoreResult to use extended delta-mid**

In `apps/agent_005/src/scorers/types.ts`, update the `deltaMidScores` type:

```typescript
export interface ForecastScoreResult extends ScorerResult {
  // ... existing fields ...
  // Change this:
  deltaMidScores?: ExtendedDeltaMidScorerResult; // Was: DeltaMidScorerResult
  // ... rest unchanged ...
}
```

**Step 3: Update aggregate-scorer to use normalized scorer**

In `apps/agent_005/src/scorers/aggregate-scorer.ts`, update `computeExtendedScores`:

```typescript
import { scoreNormalizedDeltaMidPredictions } from './delta-mid-scorer';

function computeExtendedScores(
  result: ForecastScoreResult,
  input: ForecastScorerInput
): void {
  const { predictions, deltaMidPredictions, deltaMidActuals, deltaMidATRs, fillDetails, exitMids, fillPrices } =
    input;

  // Optional: Delta-mid scoring with normalization
  if (deltaMidPredictions !== undefined && deltaMidActuals !== undefined) {
    result.deltaMidScores = scoreNormalizedDeltaMidPredictions(
      deltaMidPredictions,
      deltaMidActuals,
      deltaMidATRs ?? {} // Pass empty object if no ATRs
    );
  }

  // ... rest unchanged ...
}
```

**Step 4: Add ATR computation to benchmark.ts**

In `apps/agent_005/src/benchmark.ts`, add imports and computation:

```typescript
import { getATRForHorizon } from './replay-lab/atr-calculator.js';
import type { DeltaMidContractId } from './scorers/types.js';

// Add new function after computeExitMids:
/**
 * Computes ATR values for each delta-mid contract.
 * Uses trades leading up to fill time for each filled contract.
 *
 * @param trades - Array of trades to compute ATR from
 * @param fillDetails - Fill details for each contract from extended ground truth
 * @returns Record mapping delta-mid contract IDs to ATR values
 */
function computeATRs(
  trades: Trade[],
  fillDetails: Record<string, FillCheckResult>
): Record<DeltaMidContractId, number | undefined> {
  const result: Record<string, number | undefined> = {};

  const sides: Side[] = ['bid', 'ask'];
  const horizons: Horizon[] = ['1m', '5m', '15m'];

  for (const side of sides) {
    for (const horizon of horizons) {
      const fillContractId = `${side}-fill-${horizon}` as FillContractId;
      const deltaMidContractId = `${side}-delta-mid-${horizon}` as DeltaMidContractId;
      // eslint-disable-next-line security/detect-object-injection -- fillContractId is constructed from controlled enum values
      const fillDetail = fillDetails[fillContractId];
      const fillTime = fillDetail?.fillTime;

      if (fillDetail !== undefined && fillDetail.filled && fillTime !== undefined) {
        // eslint-disable-next-line security/detect-object-injection -- deltaMidContractId is constructed from controlled enum values
        result[deltaMidContractId] = getATRForHorizon(trades, fillTime, horizon);
      } else {
        // eslint-disable-next-line security/detect-object-injection -- deltaMidContractId is constructed from controlled enum values
        result[deltaMidContractId] = undefined;
      }
    }
  }

  return result as Record<DeltaMidContractId, number | undefined>;
}
```

**Step 5: Wire ATRs into runModelRound**

In `runModelRound`, add ATR computation and pass to scorer:

```typescript
// After: const deltaMidActuals = computeDeltaMidActuals(trades, extendedGroundTruth.details);
// Add:
const deltaMidATRs = computeATRs(trades, extendedGroundTruth.details);

// Update scorer call:
const scoreResult = await forecastScorer.score({
  predictions: output.predictions as Record<FillContractId, number>,
  actuals: extendedGroundTruth.fills as Record<FillContractId, boolean>,
  predictionTime,
  symbolId,
  deltaMidPredictions: output.predictions as Record<string, number>,
  deltaMidActuals: deltaMidActuals as Record<string, number | undefined>,
  deltaMidATRs: deltaMidATRs as Record<string, number | undefined>, // NEW
  fillDetails: extendedGroundTruth.details as Record<string, { filled: boolean; fillPrice?: number }>,
  exitMids: exitMids as Record<string, number | undefined>,
  fillPrices: { bestBid, bestAsk },
});
```

**Step 6: Run type check**

Run: `pnpm check-types`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/agent_005/src/benchmark.ts apps/agent_005/src/scorers/aggregate-scorer.ts apps/agent_005/src/scorers/types.ts
git commit -m "feat(agent_005): integrate ATR normalization into benchmark pipeline"
```

---

## Task 4: Update Results Aggregation for Per-Side Metrics

Update ModelSummary and aggregation to track per-side metrics.

**Files:**
- Modify: `apps/agent_005/src/results.ts`
- Modify: `apps/agent_005/src/scorers/types.ts`

**Step 1: Update ModelSummary type**

In `apps/agent_005/src/results.ts`:

```typescript
export interface PerSideMetrics {
  meanNormalizedMAE: number;
  meanEV: number;
  meanPnL: number;
  fillCount: number;
}

export interface ModelSummary {
  modelId: ModelId;
  meanBrier: number;
  meanLogLoss: number;
  meanAccuracy: number;
  // EV benchmark metrics (optional)
  meanNormalizedDeltaMAE?: number;
  meanEV?: number;
  meanPnL?: number;
  evPnLGap?: number;
  // Per-side breakdown
  bidMetrics?: PerSideMetrics;
  askMetrics?: PerSideMetrics;
  // Fill counts for low-sample warnings
  fillCounts?: {
    bid: Record<'1m' | '5m' | '15m', number>;
    ask: Record<'1m' | '5m' | '15m', number>;
  };
}
```

**Step 2: Update ExtendedMetricsTotals**

In `apps/agent_005/src/results.ts`:

```typescript
interface ExtendedMetricsTotals {
  totalNormalizedDeltaMAE: number;
  totalExpectedValue: number;
  totalPnL: number;
  totalExpectedValuePnLGap: number;
  extendedRoundsCount: number;
  // Per-side totals
  bidTotals: { normalizedMAE: number; ev: number; pnl: number; fills: number; rounds: number };
  askTotals: { normalizedMAE: number; ev: number; pnl: number; fills: number; rounds: number };
  // Fill counts by side and horizon (accumulated across rounds)
  fillCounts: {
    bid: Record<'1m' | '5m' | '15m', number>;
    ask: Record<'1m' | '5m' | '15m', number>;
  };
}
```

**Step 3: Update aggregateExtendedMetrics**

```typescript
function aggregateExtendedMetrics(
  score: ForecastScoreResult,
  totals: ExtendedMetricsTotals
): void {
  if (
    score.deltaMidScores === undefined ||
    score.evResults === undefined ||
    score.pnlResults === undefined ||
    score.evPnlGap === undefined
  ) {
    return;
  }

  // Aggregate normalized delta-mid MAE
  totals.totalNormalizedDeltaMAE += score.deltaMidScores.aggregates.meanNormalizedMAE;
  totals.totalExpectedValuePnLGap += score.evPnlGap.gap;
  totals.extendedRoundsCount++;

  totals.totalExpectedValue += score.evResults.meanEV;
  totals.totalPnL += score.pnlResults.meanPnL;

  // Per-side delta-mid
  const bidDelta = score.deltaMidScores.aggregates.bySide.bid;
  const askDelta = score.deltaMidScores.aggregates.bySide.ask;

  if (bidDelta.sampleCount > 0) {
    totals.bidTotals.normalizedMAE += bidDelta.meanNormalizedMAE;
    totals.bidTotals.rounds++;
  }
  if (askDelta.sampleCount > 0) {
    totals.askTotals.normalizedMAE += askDelta.meanNormalizedMAE;
    totals.askTotals.rounds++;
  }

  // Per-side EV
  totals.bidTotals.ev += score.evResults.evBySide.bid;
  totals.askTotals.ev += score.evResults.evBySide.ask;

  // Per-side PnL
  totals.bidTotals.pnl += score.pnlResults.pnlBySide.bid;
  totals.askTotals.pnl += score.pnlResults.pnlBySide.ask;

  // Fill counts by side and horizon
  totals.bidTotals.fills += bidDelta.sampleCount;
  totals.askTotals.fills += askDelta.sampleCount;

  // Accumulate per-horizon fill counts from deltaMidScores
  for (const scoreItem of score.deltaMidScores.scores) {
    const side = scoreItem.contractId.startsWith('bid') ? 'bid' : 'ask';
    const horizon = scoreItem.contractId.split('-')[3] as '1m' | '5m' | '15m';
    totals.fillCounts[side][horizon]++;
  }
}
```

**Step 4: Update calculateModelSummary**

```typescript
export function calculateModelSummary(results: ModelResults): ModelSummary {
  const { modelId, rounds } = results;

  if (rounds.length === 0) {
    return {
      modelId,
      meanBrier: 0,
      meanLogLoss: 0,
      meanAccuracy: 0,
    };
  }

  let totalBrier = 0;
  let totalLogLoss = 0;
  let totalAccuracy = 0;

  const extendedTotals: ExtendedMetricsTotals = {
    totalNormalizedDeltaMAE: 0,
    totalExpectedValue: 0,
    totalPnL: 0,
    totalExpectedValuePnLGap: 0,
    extendedRoundsCount: 0,
    bidTotals: { normalizedMAE: 0, ev: 0, pnl: 0, fills: 0, rounds: 0 },
    askTotals: { normalizedMAE: 0, ev: 0, pnl: 0, fills: 0, rounds: 0 },
    fillCounts: {
      bid: { '1m': 0, '5m': 0, '15m': 0 },
      ask: { '1m': 0, '5m': 0, '15m': 0 },
    },
  };

  for (const round of rounds) {
    totalBrier += round.score.aggregates.meanBrierScore;
    totalLogLoss += round.score.aggregates.meanLogLoss;
    totalAccuracy += round.score.aggregates.accuracy;

    if (hasExtendedMetrics(round.score)) {
      aggregateExtendedMetrics(round.score, extendedTotals);
    }
  }

  const baseSummary: ModelSummary = {
    modelId,
    meanBrier: totalBrier / rounds.length,
    meanLogLoss: totalLogLoss / rounds.length,
    meanAccuracy: totalAccuracy / rounds.length,
  };

  if (extendedTotals.extendedRoundsCount > 0) {
    const count = extendedTotals.extendedRoundsCount;
    baseSummary.meanNormalizedDeltaMAE = extendedTotals.totalNormalizedDeltaMAE / count;
    baseSummary.meanEV = extendedTotals.totalExpectedValue / count;
    baseSummary.meanPnL = extendedTotals.totalPnL / count;
    baseSummary.evPnLGap = extendedTotals.totalExpectedValuePnLGap / count;

    // Per-side metrics
    baseSummary.bidMetrics = {
      meanNormalizedMAE: extendedTotals.bidTotals.rounds > 0
        ? extendedTotals.bidTotals.normalizedMAE / extendedTotals.bidTotals.rounds
        : 0,
      meanEV: extendedTotals.bidTotals.ev / count,
      meanPnL: extendedTotals.bidTotals.pnl / count,
      fillCount: extendedTotals.bidTotals.fills,
    };

    baseSummary.askMetrics = {
      meanNormalizedMAE: extendedTotals.askTotals.rounds > 0
        ? extendedTotals.askTotals.normalizedMAE / extendedTotals.askTotals.rounds
        : 0,
      meanEV: extendedTotals.askTotals.ev / count,
      meanPnL: extendedTotals.askTotals.pnl / count,
      fillCount: extendedTotals.askTotals.fills,
    };

    baseSummary.fillCounts = extendedTotals.fillCounts;
  }

  return baseSummary;
}
```

**Step 5: Run type check**

Run: `pnpm check-types`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/agent_005/src/results.ts
git commit -m "feat(agent_005): add per-side metrics and fill counts to model summary"
```

---

## Task 5: Update Table Display with Bid/Ask Split and Low-Sample Warnings

Update table to show per-side columns and gray out low-sample metrics.

**Files:**
- Modify: `apps/agent_005/src/table.ts`

**Step 1: Add constants and helpers for low-sample warning**

```typescript
const MIN_FILLS_PER_SIDE_HORIZON = 10;
const LOW_SAMPLE_MARKER = '†';

interface LowSampleFlags {
  bidMAE: boolean;
  askMAE: boolean;
  bidEV: boolean;
  askEV: boolean;
  bidPnL: boolean;
  askPnL: boolean;
}

function getLowSampleFlags(summary: ModelSummary): LowSampleFlags {
  const fillCounts = summary.fillCounts;
  if (fillCounts === undefined) {
    return { bidMAE: false, askMAE: false, bidEV: false, askEV: false, bidPnL: false, askPnL: false };
  }

  const bidTotal = fillCounts.bid['1m'] + fillCounts.bid['5m'] + fillCounts.bid['15m'];
  const askTotal = fillCounts.ask['1m'] + fillCounts.ask['5m'] + fillCounts.ask['15m'];

  return {
    bidMAE: bidTotal < MIN_FILLS_PER_SIDE_HORIZON,
    askMAE: askTotal < MIN_FILLS_PER_SIDE_HORIZON,
    bidEV: bidTotal < MIN_FILLS_PER_SIDE_HORIZON,
    askEV: askTotal < MIN_FILLS_PER_SIDE_HORIZON,
    bidPnL: bidTotal < MIN_FILLS_PER_SIDE_HORIZON,
    askPnL: askTotal < MIN_FILLS_PER_SIDE_HORIZON,
  };
}

function formatWithWarning(value: string, isLowSample: boolean): string {
  if (isLowSample) {
    return chalk.dim(`${value}${LOW_SAMPLE_MARKER}`);
  }
  return value;
}
```

**Step 2: Update printEVTable for wider layout with split columns**

```typescript
function printEVTable(
  summaries: ModelSummary[],
  totalRounds: number,
  winner: ModelSummary | undefined,
  best: BestValues
): void {
  const baselinePnL = summaries.find((s) => s.meanPnL !== undefined)?.meanPnL;

  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    colWidths: [22, 8, 8, 10, 10, 10, 10, 10, 10, 10],
    wordWrap: true,
    style: { head: [], border: [] }
  });

  // Title row
  table.push([{
    colSpan: 10,
    content: chalk.bold(`agent_005 EV Benchmark Results (${String(totalRounds)} rounds)`),
    hAlign: 'center'
  }]);

  // Group header row
  table.push([
    { content: '', hAlign: 'center' },
    { colSpan: 2, content: chalk.cyan.bold('Leg 1: Fill'), hAlign: 'center' },
    { colSpan: 2, content: chalk.cyan.bold('Leg 2: Δ MAE'), hAlign: 'center' },
    { colSpan: 2, content: chalk.cyan.bold('Leg 3: EV'), hAlign: 'center' },
    { colSpan: 2, content: chalk.cyan.bold('Leg 3: PnL'), hAlign: 'center' },
    { content: chalk.cyan.bold('Gap'), hAlign: 'center' },
  ]);

  // Column header row
  table.push([
    { content: chalk.dim('Model'), hAlign: 'center' },
    { content: chalk.dim('Brier↓'), hAlign: 'center' },
    { content: chalk.dim('Acc↑'), hAlign: 'center' },
    { content: chalk.dim('Bid↓'), hAlign: 'center' },
    { content: chalk.dim('Ask↓'), hAlign: 'center' },
    { content: chalk.dim('Bid'), hAlign: 'center' },
    { content: chalk.dim('Ask'), hAlign: 'center' },
    { content: chalk.dim('Bid'), hAlign: 'center' },
    { content: chalk.dim('Ask'), hAlign: 'center' },
    { content: chalk.dim('→0'), hAlign: 'center' },
  ]);

  // Data rows
  for (const s of summaries) {
    const isWinner = winner !== undefined && s.modelId === winner.modelId;
    const modelName = isWinner ? chalk.bold.cyan(s.modelId) : chalk.cyan(s.modelId);
    const flags = getLowSampleFlags(s);

    const bidMAE = s.bidMetrics?.meanNormalizedMAE;
    const askMAE = s.askMetrics?.meanNormalizedMAE;
    const bidEV = s.bidMetrics?.meanEV;
    const askEV = s.askMetrics?.meanEV;
    const bidPnL = s.bidMetrics?.meanPnL;
    const askPnL = s.askMetrics?.meanPnL;

    table.push([
      { content: modelName, hAlign: 'left' },
      { content: formatBrier(s.meanBrier, best.brier), hAlign: 'right' },
      { content: formatAccuracy(s.meanAccuracy, best.accuracy), hAlign: 'right' },
      { content: formatWithWarning(formatNormalizedMAE(bidMAE), flags.bidMAE), hAlign: 'right' },
      { content: formatWithWarning(formatNormalizedMAE(askMAE), flags.askMAE), hAlign: 'right' },
      { content: formatWithWarning(formatEVValue(bidEV), flags.bidEV), hAlign: 'right' },
      { content: formatWithWarning(formatEVValue(askEV), flags.askEV), hAlign: 'right' },
      { content: formatWithWarning(formatPnLValue(bidPnL), flags.bidPnL), hAlign: 'right' },
      { content: formatWithWarning(formatPnLValue(askPnL), flags.askPnL), hAlign: 'right' },
      { content: formatGap(s.evPnLGap, best.evPnLGap), hAlign: 'right' },
    ]);
  }

  // Footer with baseline PnL and winner
  const pnlText = baselinePnL === undefined
    ? 'Realized PnL: -'
    : `Realized PnL: ${formatSigned(baselinePnL)}`;
  const winnerText = winner === undefined
    ? NO_WINNER_TEXT
    : `Winner: ${chalk.bold.green(winner.modelId)}`;
  table.push([{
    colSpan: 10,
    content: `${chalk.dim(pnlText)}  │  ${winnerText}`,
    hAlign: 'left'
  }]);

  // Footnote for low sample warning
  const hasLowSamples = summaries.some((s) => {
    const flags = getLowSampleFlags(s);
    return Object.values(flags).some(Boolean);
  });
  if (hasLowSamples) {
    table.push([{
      colSpan: 10,
      content: chalk.dim(`${LOW_SAMPLE_MARKER} Low sample size (<${MIN_FILLS_PER_SIDE_HORIZON} fills) - interpret with caution`),
      hAlign: 'left'
    }]);
  }

  // eslint-disable-next-line no-console -- CLI table output
  console.log(table.toString());
}

function formatNormalizedMAE(value: number | undefined): string {
  if (value === undefined) {
    return chalk.dim('-');
  }
  // Normalized MAE thresholds: good ≤ 0.5 ATR, ok ≤ 1.0 ATR
  const quality = getQuality(value, 0.5, 1.0, true);
  return getQualityColor(quality)(value.toFixed(2));
}

function formatEVValue(value: number | undefined): string {
  if (value === undefined) {
    return chalk.dim('-');
  }
  const quality = getQuality(value, 0, -0.1, false);
  return getQualityColor(quality)(formatSigned(value, 3));
}

function formatPnLValue(value: number | undefined): string {
  if (value === undefined) {
    return chalk.dim('-');
  }
  return formatSigned(value, 3);
}
```

**Step 3: Run type check and lint**

Run: `pnpm qa:quick`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/agent_005/src/table.ts
git commit -m "feat(agent_005): add bid/ask split columns and low-sample warnings to table"
```

---

## Task 6: EV Quintile Bucket Analysis

Create quintile analysis module and integrate into benchmark output.

**Files:**
- Create: `apps/agent_005/src/scorers/quintile-analyzer.ts`
- Test: `apps/agent_005/__tests__/quintile-analyzer.test.ts`
- Modify: `apps/agent_005/src/table.ts`
- Modify: `apps/agent_005/src/results.ts`
- Modify: `apps/agent_005/src/benchmark.ts`

**Step 1: Write failing test for quintile bucketing**

```typescript
// apps/agent_005/__tests__/quintile-analyzer.test.ts
import { describe, expect, it } from 'vitest';
import { bucketByQuintile, type QuintileBucket } from '../src/scorers/quintile-analyzer';

describe('Quintile Analyzer', () => {
  describe('bucketByQuintile', () => {
    it('buckets samples into 5 quintiles by predicted EV', () => {
      const samples = [
        { predictedEV: 10, realizedPnL: 8 },
        { predictedEV: 20, realizedPnL: 15 },
        { predictedEV: 30, realizedPnL: 25 },
        { predictedEV: 40, realizedPnL: 35 },
        { predictedEV: 50, realizedPnL: 45 },
        { predictedEV: 60, realizedPnL: 55 },
        { predictedEV: 70, realizedPnL: 65 },
        { predictedEV: 80, realizedPnL: 75 },
        { predictedEV: 90, realizedPnL: 85 },
        { predictedEV: 100, realizedPnL: 95 },
      ];

      const buckets = bucketByQuintile(samples);

      expect(buckets).toHaveLength(5);
      expect(buckets[0].label).toBe('Q1 (lowest)');
      expect(buckets[4].label).toBe('Q5 (highest)');
      expect(buckets[0].sampleCount).toBe(2);
    });

    it('computes mean predicted EV per bucket', () => {
      const samples = [
        { predictedEV: 10, realizedPnL: 5 },
        { predictedEV: 20, realizedPnL: 15 },
      ];

      const buckets = bucketByQuintile(samples);

      // With only 2 samples, they go into different buckets
      expect(buckets[0].meanPredictedEV).toBe(10);
    });

    it('computes mean realized PnL per bucket', () => {
      const samples = [
        { predictedEV: 10, realizedPnL: 5 },
        { predictedEV: 20, realizedPnL: 15 },
        { predictedEV: 30, realizedPnL: 25 },
        { predictedEV: 40, realizedPnL: 35 },
        { predictedEV: 50, realizedPnL: 45 },
      ];

      const buckets = bucketByQuintile(samples);

      // Each quintile has 1 sample
      expect(buckets[0].meanRealizedPnL).toBe(5);
      expect(buckets[4].meanRealizedPnL).toBe(45);
    });

    it('computes EV-PnL gap per bucket', () => {
      const samples = [
        { predictedEV: 100, realizedPnL: 80 }, // Gap: 20
      ];

      const buckets = bucketByQuintile(samples);

      expect(buckets[0].evPnLGap).toBe(20);
    });

    it('returns empty buckets for empty input', () => {
      const buckets = bucketByQuintile([]);

      expect(buckets).toHaveLength(5);
      expect(buckets.every(b => b.sampleCount === 0)).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/agent_005 && pnpm test:unit -- quintile-analyzer.test.ts`
Expected: FAIL

**Step 3: Implement quintile analyzer**

```typescript
// apps/agent_005/src/scorers/quintile-analyzer.ts

export interface EVPnLSample {
  predictedEV: number;
  realizedPnL: number;
}

export interface QuintileBucket {
  label: string;
  meanPredictedEV: number;
  meanRealizedPnL: number;
  evPnLGap: number;
  sampleCount: number;
}

const QUINTILE_LABELS = [
  'Q1 (lowest)',
  'Q2',
  'Q3',
  'Q4',
  'Q5 (highest)',
];

/**
 * Bucket EV-PnL samples into quintiles by predicted EV.
 *
 * @param samples - Array of EV-PnL pairs
 * @returns Array of 5 quintile buckets
 */
export function bucketByQuintile(samples: EVPnLSample[]): QuintileBucket[] {
  // Initialize empty buckets
  const buckets: QuintileBucket[] = QUINTILE_LABELS.map((label) => ({
    label,
    meanPredictedEV: 0,
    meanRealizedPnL: 0,
    evPnLGap: 0,
    sampleCount: 0,
  }));

  if (samples.length === 0) {
    return buckets;
  }

  // Sort samples by predicted EV
  const sorted = [...samples].sort((a, b) => a.predictedEV - b.predictedEV);

  // Assign each sample to a quintile
  const samplesPerBucket = sorted.length / 5;

  for (let i = 0; i < sorted.length; i++) {
    const bucketIndex = Math.min(Math.floor(i / samplesPerBucket), 4);
    const sample = sorted[i];
    const bucket = buckets[bucketIndex];

    // Accumulate for averaging
    bucket.meanPredictedEV += sample.predictedEV;
    bucket.meanRealizedPnL += sample.realizedPnL;
    bucket.sampleCount++;
  }

  // Compute means and gaps
  for (const bucket of buckets) {
    if (bucket.sampleCount > 0) {
      bucket.meanPredictedEV /= bucket.sampleCount;
      bucket.meanRealizedPnL /= bucket.sampleCount;
      bucket.evPnLGap = bucket.meanPredictedEV - bucket.meanRealizedPnL;
    }
  }

  return buckets;
}

/**
 * Collect EV-PnL samples from scorer results.
 * Matches EV predictions with realized PnL by contract.
 */
export function collectEVPnLSamples(
  evResults: { side: string; horizon: string; ev: number }[],
  pnlResults: { side: string; horizon: string; pnl: number }[]
): EVPnLSample[] {
  const samples: EVPnLSample[] = [];

  for (const evResult of evResults) {
    const matchingPnl = pnlResults.find(
      (p) => p.side === evResult.side && p.horizon === evResult.horizon
    );

    if (matchingPnl !== undefined) {
      samples.push({
        predictedEV: evResult.ev,
        realizedPnL: matchingPnl.pnl,
      });
    }
  }

  return samples;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/agent_005 && pnpm test:unit -- quintile-analyzer.test.ts`
Expected: PASS

**Step 5: Add printQuintileTable to table.ts**

```typescript
import type { QuintileBucket } from './scorers/quintile-analyzer.js';

export function printQuintileTable(buckets: QuintileBucket[], modelId: string): void {
  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    style: { head: [], border: [] }
  });

  table.push([{
    colSpan: 5,
    content: chalk.bold(`EV Quintile Analysis: ${modelId}`),
    hAlign: 'center'
  }]);

  table.push([
    { content: chalk.dim('Quintile'), hAlign: 'center' },
    { content: chalk.dim('Mean EV'), hAlign: 'center' },
    { content: chalk.dim('Mean PnL'), hAlign: 'center' },
    { content: chalk.dim('Gap'), hAlign: 'center' },
    { content: chalk.dim('N'), hAlign: 'center' },
  ]);

  for (const bucket of buckets) {
    const gapQuality = getQuality(Math.abs(bucket.evPnLGap), GAP_GOOD, GAP_OK, true);
    const gapColor = getQualityColor(gapQuality);

    table.push([
      { content: bucket.label, hAlign: 'left' },
      { content: bucket.sampleCount > 0 ? formatSigned(bucket.meanPredictedEV, 3) : '-', hAlign: 'right' },
      { content: bucket.sampleCount > 0 ? formatSigned(bucket.meanRealizedPnL, 3) : '-', hAlign: 'right' },
      { content: bucket.sampleCount > 0 ? gapColor(formatSigned(bucket.evPnLGap, 3)) : '-', hAlign: 'right' },
      { content: String(bucket.sampleCount), hAlign: 'right' },
    ]);
  }

  // eslint-disable-next-line no-console -- CLI table output
  console.log(table.toString());
}
```

**Step 6: Wire quintile analysis into benchmark output**

Update `benchmark.ts` to collect samples and print quintile tables:

```typescript
import { bucketByQuintile, collectEVPnLSamples, type EVPnLSample } from './scorers/quintile-analyzer.js';
import { printQuintileTable } from './table.js';

// In main(), after building results:

// Collect EV-PnL samples per model for quintile analysis
const modelQuintileSamples = new Map<ModelId, EVPnLSample[]>();

for (const modelResult of results.models) {
  const samples: EVPnLSample[] = [];

  for (const round of modelResult.rounds) {
    if (round.score.evResults !== undefined && round.score.pnlResults !== undefined) {
      // Need raw EV and PnL results - extract from perContract or recalculate
      // This requires storing raw results during scoring
    }
  }

  modelQuintileSamples.set(modelResult.modelId, samples);
}

// Print quintile tables after main results table
console.log(); // Blank line
for (const [modelId, samples] of modelQuintileSamples) {
  if (samples.length > 0) {
    const buckets = bucketByQuintile(samples);
    printQuintileTable(buckets, modelId);
  }
}
```

**Step 7: Store raw EV/PnL results for quintile analysis**

Update types and scorer to preserve raw results:

In `types.ts`:
```typescript
export interface ForecastScoreResult extends ScorerResult {
  // ... existing ...
  // Add raw results for quintile analysis
  rawEVResults?: { side: string; horizon: string; ev: number }[];
  rawPnLResults?: { side: string; horizon: string; pnl: number }[];
}
```

In `aggregate-scorer.ts`:
```typescript
// In computeExtendedScores, after EV calculation:
if (expectedValueResultsRaw !== undefined) {
  result.rawEVResults = expectedValueResultsRaw.map(r => ({
    side: r.side,
    horizon: r.horizon,
    ev: r.ev,
  }));
}

// After PnL calculation:
if (pnlResultsRaw !== undefined) {
  result.rawPnLResults = pnlResultsRaw.map(r => ({
    side: r.side,
    horizon: r.horizon,
    pnl: r.pnl,
  }));
}
```

**Step 8: Run full QA**

Run: `pnpm qa`
Expected: PASS

**Step 9: Commit**

```bash
git add apps/agent_005/src/scorers/quintile-analyzer.ts apps/agent_005/__tests__/quintile-analyzer.test.ts apps/agent_005/src/table.ts apps/agent_005/src/scorers/types.ts apps/agent_005/src/scorers/aggregate-scorer.ts apps/agent_005/src/benchmark.ts
git commit -m "feat(agent_005): add EV quintile bucket analysis"
```

---

## Task 7: Final Integration and Cleanup

Verify all changes work together and clean up any remaining issues.

**Step 1: Remove deprecated meanDeltaMAE field**

In `results.ts`, the old `meanDeltaMAE` field should be removed in favor of `meanNormalizedDeltaMAE`.

**Step 2: Update verbose logging to show raw delta-mid**

In `benchmark.ts`, update `logger.logEVMetrics` call to include raw delta-mid for debug:

```typescript
logger.logEVMetrics({
  deltaMidMAE: scoreResult.deltaMidScores?.aggregates.meanMAE, // Raw for verbose
  deltaMidNormalizedMAE: scoreResult.deltaMidScores?.aggregates.meanNormalizedMAE,
  // ... rest ...
});
```

**Step 3: Run full benchmark test**

Run: `cd apps/agent_005 && pnpm dev`
Expected: Benchmark runs successfully with new table format

**Step 4: Run full QA**

Run: `pnpm qa`
Expected: All checks pass

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(agent_005): complete benchmark improvements - ATR normalization, bid/ask split, quintiles"
```

---

## Summary

This plan implements all four benchmark improvements:

1. **ATR Normalization** (Tasks 1-3): New `atr-calculator.ts` module computes ATR from trades, delta-mid scorer normalizes errors by ATR per horizon.

2. **Bid/Ask Split** (Tasks 4-5): `ModelSummary` and table display per-side MAE, EV, and PnL columns.

3. **Fill Count Warnings** (Task 5): Table grays out and marks (†) metrics with <10 fills per side.

4. **EV Quintile Buckets** (Task 6): New `quintile-analyzer.ts` module buckets EV predictions into quintiles and displays separate analysis table.

All changes modify `benchmark.ts` directly with no legacy paths.
