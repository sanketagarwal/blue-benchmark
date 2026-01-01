# Benchmark Reporting V2 Implementation Plan

## Summary of Changes Needed

### 1. Quick Mode Math Fix
- **Problem**: Percentile calculation divides by `(n-1)`, producing NaN when n=1
- **Solution**: In quick mode, skip rank-based elimination; show absolute scores only

### 2. Timing Diagnostics Fix
- **Problem**: Timing table is empty - pivots aren't being captured
- **Solution**: Ensure `resolveDualGroundTruth` stores both primary/secondary pivot results with timing data

### 3. Per-Round Diagnostic JSON
- **Problem**: No structured round-by-round diagnostic output
- **Solution**: Emit JSON per model per round with integrity, ground truth, scoring, timing

### 4. End-of-Run Reports
- **Problem**: Missing comprehensive model selection reports
- **Solution**: Add per-timeframe leaderboards, quality profiles, calibration, separability

---

## Tasks by File

### Task 1: Fix Quick Mode Percentile Math

**File**: `src/scorers/phase-1-scorer.ts`

Add guard for small sample sizes:
```typescript
if (modelScores.length < 3) {
  // Skip percentile ranking - return all as 50th percentile
  for (const score of modelScores) {
    ranks.set(score.modelId, { '15m': 50, '1h': 50, '24h': 50, '7d': 50 });
  }
  return ranks;
}
```

**File**: `src/benchmark.ts`

- Skip Phase 1/2 rank-based elimination in quick mode
- Show absolute metrics only (mean log loss, stability)

### Task 2: Fix Timing Diagnostics

**File**: `src/benchmark.ts`

Replace deprecated `resolveBottomGroundTruth` with `resolveDualGroundTruth`:
```typescript
const dualResult = await resolveDualGroundTruth(symbolId, horizon, predictionTime);
roundData.primaryLabel = dualResult.primary;
roundData.secondaryLabel = dualResult.secondary;
```

### Task 3: Per-Round Diagnostic JSON

**New File**: `src/diagnostics/round-diagnostics.ts`

```typescript
export interface RoundDiagnostic {
  roundNumber: number;
  timestamp: string;
  modelId: string;

  outputIntegrity: {
    hasBottomed: Record<TimeframeId, boolean>;
    confidence: Record<TimeframeId, number>;
    candlesBack: Record<TimeframeId, number | undefined>;
    schemaValid: boolean;
    abstained: boolean;
  };

  groundTruth: {
    fractal: Record<TimeframeId, { label: boolean; firstPivotAt?: string }>;
    zigzag: Record<TimeframeId, { label: boolean; firstPivotAt?: string }>;
  };

  scores: {
    logLoss: Record<TimeframeId, number>;
    brier: Record<TimeframeId, number>;
  };

  timing: {
    claimedCandlesBack: Record<TimeframeId, number | undefined>;
    actualTimeToPivotRatio: Record<TimeframeId, number | undefined>;
    timingErrorCandles: Record<TimeframeId, number | undefined>;
  };
}
```

**File**: `src/scorers/phase-0-scorer.ts`

Add Brier score computation:
```typescript
import { brierScore } from './brier-scorer.js';

export interface Phase0RoundScore {
  logLossByHorizon: Record<TimeframeId, number>;
  brierByHorizon: Record<TimeframeId, number>;  // NEW
  // ...
}
```

### Task 4: End-of-Run Reports

**New File**: `src/reports/leaderboards.ts`

Per-timeframe leaderboard generator:
```typescript
export interface LeaderboardEntry {
  modelId: string;
  rank: number;
  meanLogLoss: number;
  meanBrier: number;
  winRate: number;
  precision: number;
  calibrationError: number;
  roundsPlayed: number;
}

export interface TimeframeLeaderboard {
  horizon: TimeframeId;
  method: 'fractal' | 'zigzag';
  entries: LeaderboardEntry[];
}
```

**New File**: `src/reports/model-profiles.ts`

Model quality profiles:
```typescript
export interface ModelQualityProfile {
  modelId: string;
  meanLogLoss: number;
  meanBrier: number;
  calibrationSlope: number;
  expectedCalibrationError: number;
  tpRate: number;
  fpRate: number;
  fnRate: number;
  varianceByHorizon: Record<TimeframeId, number>;
}
```

**New File**: `src/reports/separability.ts`

Metric separability analysis:
```typescript
export interface MetricSeparability {
  metricName: string;
  range: number;
  stdDev: number;
  rankCorrelation: number;
  separates: boolean;
}
```

---

## Table Schemas

### Per-Timeframe Leaderboard
```
┌────────────────────────────────────────────────────────────────────────────┐
│                          15m Arena - Fractal Track                         │
├──────┬────────────────────┬────────┬────────┬─────────┬──────────┬─────────┤
│ Rank │ Model              │ LL     │ Brier  │ Win%    │ Prec%    │ CalErr  │
├──────┼────────────────────┼────────┼────────┼─────────┼──────────┼─────────┤
│ 🥇   │ gpt-4o             │ 0.423  │ 0.189  │ 67.3%   │ 72.1%    │ 0.034   │
```

### Model Quality Profiles
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              Model Quality Profiles                                   │
├────────────────────┬────────┬────────┬──────────┬────────┬────────┬────────┬─────────┤
│ Model              │ LL     │ Brier  │ CalSlope │ CalErr │ TP%    │ FP%    │ Stable  │
```

### Metric Separability
```
┌────────────────────────────────────────────────────────────────────────────┐
│                         Metric Separability Analysis                        │
├──────────────────┬─────────┬─────────┬──────────────┬────────────────────────┤
│ Metric           │ Range   │ StdDev  │ Rank Corr    │ Separates?             │
```

---

## Implementation Priority

1. **Quick mode fix** - Prevents NaN, enables meaningful quick runs
2. **Brier scoring** - Cheap to add, reveals calibration
3. **Timing diagnostics** - Debug why timing table is empty
4. **Per-round JSON** - Foundation for all analysis
5. **End-of-run reports** - Answers agent selection question
