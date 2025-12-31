# agent_006 Benchmark Spec v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the final qualification, analysis, and arena-seeding specification for agent_006 with deterministic chart semantics, candlesBack tracking, Track A/B measurement separation, and horizon-isolated elimination.

**Architecture:** Per-horizon chart generation replaces generic 2-chart system. Prediction schema adds candlesBack field. Phase 0 elimination becomes horizon-isolated. Track A (correctness) drives elimination; Track B (timing) provides analytics only. Output sections expanded for arena design insights.

**Tech Stack:** TypeScript, Zod schemas, cli-table3, chalk, Replay Lab API

---

## Task 1: Per-Horizon Chart Configuration

**Files:**
- Modify: `apps/agent_006/src/replay-lab/charts.ts:43-84`
- Modify: `apps/agent_006/src/horizon-config.ts` (add chart config)

**Step 1: Add chart configuration to horizon-config.ts**

Add after line 40 in `horizon-config.ts`:

```typescript
export interface HorizonChartConfig {
  candleTimeframe: '5m' | '15m' | '1h' | '4h';
  lookbackMs: number;
}

export const HORIZON_CHART_CONFIG: Record<Horizon, HorizonChartConfig> = {
  '15m': { candleTimeframe: '5m', lookbackMs: 2 * 60 * 60_000 },      // 2h of 5m
  '1h': { candleTimeframe: '15m', lookbackMs: 4 * 60 * 60_000 },      // 4h of 15m
  '24h': { candleTimeframe: '1h', lookbackMs: 24 * 60 * 60_000 },     // 24h of 1h
  '7d': { candleTimeframe: '4h', lookbackMs: 7 * 24 * 60 * 60_000 },  // 7d of 4h
} as const;
```

**Step 2: Update ForecastingCharts interface**

Replace lines 43-48 in `charts.ts`:

```typescript
import type { Horizon } from '../horizon-config.js';
import { HORIZON_CHART_CONFIG } from '../horizon-config.js';

export interface ForecastingCharts {
  chartByHorizon: Record<Horizon, string>;
}
```

**Step 3: Implement per-horizon chart fetching**

Replace `getForecastingCharts` function (lines 50-84):

```typescript
export async function getForecastingCharts(
  symbolId: string,
  snapTime: Date
): Promise<ForecastingCharts> {
  const horizons: Horizon[] = ['15m', '1h', '24h', '7d'];

  const chartPromises = horizons.map(async (horizon) => {
    const config = HORIZON_CHART_CONFIG[horizon];
    const fromTime = new Date(snapTime.getTime() - config.lookbackMs);

    const url = await getSignedChartUrl({
      symbolId,
      timeframe: config.candleTimeframe,
      from: fromTime,
      to: snapTime,
      layers: CHART_LAYERS,
    });

    return [horizon, url] as const;
  });

  const results = await Promise.all(chartPromises);
  const chartByHorizon = Object.fromEntries(results) as Record<Horizon, string>;

  return { chartByHorizon };
}
```

**Step 4: Run type check**

Run: `pnpm check-types --filter=agent_006`
Expected: Errors in files using old chart interface (will fix in Task 2)

**Step 5: Commit**

```bash
git add apps/agent_006/src/horizon-config.ts apps/agent_006/src/replay-lab/charts.ts
git commit -m "feat(agent_006): per-horizon chart configuration and fetching"
```

---

## Task 2: Update Bottom Caller Context and Prompt

**Files:**
- Modify: `apps/agent_006/src/bottom-caller.ts:21-30,90-148`

**Step 1: Update BottomCallerContext interface**

Replace lines 21-30:

```typescript
import type { Horizon } from './horizon-config.js';

export interface BottomCallerContext {
  chartByHorizon: Record<Horizon, string>;
  currentTime: string;
  symbolId: string;
}

let context: BottomCallerContext | undefined;
```

**Step 2: Update buildRoundPrompt to use per-horizon charts**

Replace lines 90-148 with updated prompt:

```typescript
function buildRoundPrompt(): string {
  if (context === undefined) {
    throw new Error('BottomCallerContext not set');
  }

  const { chartByHorizon, currentTime, symbolId } = context;

  return `You are predicting structural market bottoms for ${symbolId}.

Current Time: ${currentTime}

**CHART ANALYSIS** (Analyze each chart for its corresponding horizon):

15-Minute Horizon Chart (5m candles, 2h lookback):
${chartByHorizon['15m']}

1-Hour Horizon Chart (15m candles, 4h lookback):
${chartByHorizon['1h']}

24-Hour Horizon Chart (1h candles, 24h lookback):
${chartByHorizon['24h']}

7-Day Horizon Chart (4h candles, 7d lookback):
${chartByHorizon['7d']}

All charts include: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, Volume.

**CANDLE INDEXING:**
The rightmost candle in each chart is the most recent closed candle.
Use this candle as candlesBack = 0.
candlesBack = 3 means three closed candles before that.

**YOUR TASK:**
For each horizon, predict:
1. hasBottomed: Has downside selling pressure been structurally exhausted?
2. confidence: How confident are you (0.0 to 1.0)?
3. candlesBack: If you believe a bottom formed, which candle? (0 = rightmost, positive integers only)

This is NOT predicting price will go up. You are assessing: "Has the selling pressure at THIS scale been absorbed?"

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
- If price is mid-range with no structure, confidence should be low
- candlesBack helps us understand timing - be specific about where you see structure`;
}
```

**Step 3: Run type check**

Run: `pnpm check-types --filter=agent_006`
Expected: Errors in benchmark.ts (will fix in Task 4)

**Step 4: Commit**

```bash
git add apps/agent_006/src/bottom-caller.ts
git commit -m "feat(agent_006): update bottom caller for per-horizon charts and candlesBack prompt"
```

---

## Task 3: Update Prediction Schema with candlesBack

**Files:**
- Modify: `apps/agent_006/src/bottom-caller.ts:53-63`

**Step 1: Update PredictionSchema**

Replace lines 53-63:

```typescript
const HorizonPredictionSchema = z.object({
  hasBottomed: z.boolean(),
  confidence: z.number().min(0).max(1),
  candlesBack: z.number().int().min(0),
});

const PredictionSchema = z.object({
  '15m': HorizonPredictionSchema,
  '1h': HorizonPredictionSchema,
  '24h': HorizonPredictionSchema,
  '7d': HorizonPredictionSchema,
});

export type HorizonPrediction = z.infer<typeof HorizonPredictionSchema>;
export type BottomPredictions = z.infer<typeof PredictionSchema>;
```

**Step 2: Update OutputSchema**

Update line 65-68:

```typescript
const OutputSchema = z.object({
  reasoning: z.string().optional().describe('Brief reasoning for predictions'),
  predictions: PredictionSchema,
});

export type BottomCallerOutput = z.infer<typeof OutputSchema>;
```

**Step 3: Run type check**

Run: `pnpm check-types --filter=agent_006`
Expected: Multiple type errors (prediction consumers expect old format)

**Step 4: Commit**

```bash
git add apps/agent_006/src/bottom-caller.ts
git commit -m "feat(agent_006): add candlesBack to prediction schema"
```

---

## Task 4: Update Benchmark to Use New Chart/Prediction Format

**Files:**
- Modify: `apps/agent_006/src/benchmark.ts:660-710`

**Step 1: Update chart fetching and context setting**

Find the `runBenchmarkRound` function and update chart handling (around line 660-668):

```typescript
const charts = await getForecastingCharts(symbolId, currentTime);

setBottomCallerContext({
  chartByHorizon: charts.chartByHorizon,
  currentTime: currentTime.toISOString(),
  symbolId,
});
```

**Step 2: Update prediction extraction**

Find where predictions are extracted and update to handle new schema structure.
Change from:
```typescript
const prediction = output.predictions[`bottom-${horizon}`];
```

To:
```typescript
const horizonPrediction = output.predictions[horizon];
const prediction = horizonPrediction.confidence; // Use confidence as probability
const candlesBack = horizonPrediction.candlesBack;
```

**Step 3: Store candlesBack in RoundScore**

Update the score storage to include candlesBack:

```typescript
// In model-state.ts, add to RoundScore interface:
candlesBack?: Record<Horizon, number>;
```

**Step 4: Run type check and fix remaining errors**

Run: `pnpm check-types --filter=agent_006`
Fix any remaining type mismatches.

**Step 5: Commit**

```bash
git add apps/agent_006/src/benchmark.ts apps/agent_006/src/state/model-state.ts
git commit -m "feat(agent_006): integrate new chart and prediction format in benchmark"
```

---

## Task 5: Fix Phase 0 Horizon Isolation

**Files:**
- Modify: `apps/agent_006/src/scorers/phase-0-scorer.ts:65-130`

**Step 1: Remove cross-horizon degenerate pattern check**

Replace `aggregatePhase0Scores` function (lines 65-94):

```typescript
export function aggregatePhase0Scores(rounds: Phase0RoundScore[]): Phase0AggregateScore {
  const horizons: Horizon[] = ['15m', '1h', '24h', '7d'];

  const meanLogLoss: Record<Horizon, number> = { '15m': 0, '1h': 0, '24h': 0, '7d': 0 };
  const extremeErrorRate: Record<Horizon, number> = { '15m': 0, '1h': 0, '24h': 0, '7d': 0 };
  const degenerateByHorizon: Record<Horizon, boolean> = { '15m': false, '1h': false, '24h': false, '7d': false };

  for (const horizon of horizons) {
    const horizonLosses = rounds.map(r => r.logLossByHorizon[horizon]);
    const horizonErrors = rounds.map(r => r.extremeErrorByHorizon[horizon]);
    const horizonPredictions = rounds.map(r => r.predictions[horizon]);

    // Mean log loss per horizon
    meanLogLoss[horizon] = horizonLosses.reduce((a, b) => a + b, 0) / horizonLosses.length;

    // Extreme error rate per horizon
    extremeErrorRate[horizon] = horizonErrors.filter(Boolean).length / horizonErrors.length;

    // Degenerate check PER HORIZON (not cross-horizon)
    const alwaysHigh = horizonPredictions.every(p => p > 0.9);
    const alwaysLow = horizonPredictions.every(p => p < 0.1);
    degenerateByHorizon[horizon] = alwaysHigh || alwaysLow;
  }

  return { meanLogLoss, extremeErrorRate, degenerateByHorizon };
}
```

**Step 2: Update Phase0AggregateScore interface**

Add near line 60:

```typescript
export interface Phase0AggregateScore {
  meanLogLoss: Record<Horizon, number>;
  extremeErrorRate: Record<Horizon, number>;
  degenerateByHorizon: Record<Horizon, boolean>;
}
```

**Step 3: Update shouldEliminatePhase0 to return per-horizon disqualification**

Replace function (lines 101-130):

```typescript
export function getPhase0DisqualifiedHorizons(
  aggregateScore: Phase0AggregateScore
): Set<Horizon> {
  const RANDOM_BASELINE = Math.log(2);
  const threshold = RANDOM_BASELINE * 1.1;
  const horizons: Horizon[] = ['15m', '1h', '24h', '7d'];
  const disqualified = new Set<Horizon>();

  for (const horizon of horizons) {
    // Disqualify if: worse than random OR degenerate OR high extreme error rate
    if (
      aggregateScore.meanLogLoss[horizon] > threshold ||
      aggregateScore.degenerateByHorizon[horizon] ||
      aggregateScore.extremeErrorRate[horizon] > 0.2
    ) {
      disqualified.add(horizon);
    }
  }

  return disqualified;
}

// Keep old function for backwards compatibility but mark deprecated
/** @deprecated Use getPhase0DisqualifiedHorizons for per-horizon elimination */
export function shouldEliminatePhase0(aggregateScore: Phase0AggregateScore): boolean {
  const disqualified = getPhase0DisqualifiedHorizons(aggregateScore);
  // Only fully eliminate if disqualified from ALL horizons
  return disqualified.size === 4;
}
```

**Step 4: Run tests**

Run: `pnpm test:unit --filter=agent_006`
Expected: Tests pass (or update tests for new behavior)

**Step 5: Commit**

```bash
git add apps/agent_006/src/scorers/phase-0-scorer.ts
git commit -m "fix(agent_006): phase 0 horizon isolation - no cross-horizon contamination"
```

---

## Task 6: Update Benchmark Phase 0 Logic

**Files:**
- Modify: `apps/agent_006/src/benchmark.ts` (phase 0 section)

**Step 1: Update runPhase0 to use per-horizon disqualification**

Find the `runPhase0` function and update:

```typescript
function runPhase0(models: Map<string, ModelState>): void {
  const phase: Phase = 0;

  for (const [modelId, state] of models) {
    const phase0Rounds = state.roundScores.filter(r =>
      r.roundNumber <= PHASE_0_ROUNDS
    );

    if (phase0Rounds.length === 0) {
      continue;
    }

    // Convert to Phase0RoundScore format
    const phase0RoundScores = phase0Rounds.map(r => ({
      predictions: r.predictions ?? {},
      logLossByHorizon: r.logLossByHorizon ?? {},
      extremeErrorByHorizon: computeExtremeErrors(r),
    }));

    const aggregateScore = aggregatePhase0Scores(phase0RoundScores);
    const disqualifiedHorizons = getPhase0DisqualifiedHorizons(aggregateScore);

    // Disqualify from specific horizons (not global elimination)
    for (const horizon of disqualifiedHorizons) {
      stateManager.disqualifyFromHorizon(
        modelId,
        horizon,
        phase,
        `Phase 0: Failed sanity check on ${horizon}`
      );
    }

    // Only fully eliminate if disqualified from ALL horizons
    if (disqualifiedHorizons.size === 4) {
      stateManager.eliminateModel(
        modelId,
        phase,
        'Failed sanity check on all horizons'
      );
    }
  }
}
```

**Step 2: Run benchmark in quick mode**

Run: `cd apps/agent_006 && pnpm benchmark --quick`
Expected: Phase 0 shows per-horizon disqualification, not global elimination

**Step 3: Commit**

```bash
git add apps/agent_006/src/benchmark.ts
git commit -m "feat(agent_006): benchmark uses per-horizon phase 0 disqualification"
```

---

## Task 7: Add Track B Timing Metrics

**Files:**
- Create: `apps/agent_006/src/scorers/timing-metrics.ts`

**Step 1: Create timing metrics module**

```typescript
import type { Horizon } from '../horizon-config.js';
import type { RoundScore } from '../state/model-state.js';

export interface TimingMetrics {
  /** Earliest correct prediction time relative to pivot (ms) */
  earliestCorrectPredictionMs: number | undefined;
  /** Mean detection time as ratio of horizon duration (0-1) */
  meanTimeToDetectionRatio: number;
  /** Timing error: predicted candlesBack vs actual pivot candle */
  timingError: number | undefined;
  /** Count of correct predictions after first correct */
  redundantConfirmations: number;
}

export interface TrackBMetrics {
  byHorizon: Record<Horizon, TimingMetrics>;
}

/**
 * Compute Track B timing metrics for a model
 * These metrics are for analysis only, NOT for elimination
 */
export function computeTrackBMetrics(
  rounds: RoundScore[],
  horizonDurations: Record<Horizon, number>
): TrackBMetrics {
  const horizons: Horizon[] = ['15m', '1h', '24h', '7d'];
  const byHorizon: Record<Horizon, TimingMetrics> = {} as Record<Horizon, TimingMetrics>;

  for (const horizon of horizons) {
    const horizonRounds = rounds.filter(r =>
      r.labels?.[horizon] !== undefined
    );

    // Find correct predictions (label=true, prediction confidence > 0.5)
    const correctRounds = horizonRounds.filter(r =>
      r.labels?.[horizon] === true &&
      (r.predictions?.[horizon] ?? 0) > 0.5
    );

    // Earliest correct prediction
    const timeToPivotRatios = correctRounds
      .map(r => r.timeToPivotRatio?.[horizon])
      .filter((v): v is number => v !== undefined);

    const earliestRatio = timeToPivotRatios.length > 0
      ? Math.min(...timeToPivotRatios)
      : undefined;

    const earliestCorrectPredictionMs = earliestRatio !== undefined
      ? earliestRatio * horizonDurations[horizon]
      : undefined;

    // Mean detection time
    const meanTimeToDetectionRatio = timeToPivotRatios.length > 0
      ? timeToPivotRatios.reduce((a, b) => a + b, 0) / timeToPivotRatios.length
      : 1; // Default to 1 (late) if no correct predictions

    // Timing error from candlesBack (if available)
    // TODO: Implement when we have actual pivot candle data
    const timingError = undefined;

    // Redundant confirmations: correct predictions after the first
    const redundantConfirmations = Math.max(0, correctRounds.length - 1);

    byHorizon[horizon] = {
      earliestCorrectPredictionMs,
      meanTimeToDetectionRatio,
      timingError,
      redundantConfirmations,
    };
  }

  return { byHorizon };
}
```

**Step 2: Run type check**

Run: `pnpm check-types --filter=agent_006`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/agent_006/src/scorers/timing-metrics.ts
git commit -m "feat(agent_006): add Track B timing metrics (analysis only)"
```

---

## Task 8: Add Timing Diagnostics Output Section

**Files:**
- Modify: `apps/agent_006/src/table.ts`
- Modify: `apps/agent_006/src/persist-results.ts`

**Step 1: Add printTimingDiagnosticsTable to table.ts**

Add after `printFinalSummaryTable`:

```typescript
import type { TrackBMetrics } from './scorers/timing-metrics.js';

export function printTimingDiagnosticsTable(
  modelMetrics: Array<{ modelId: string; metrics: TrackBMetrics }>
): void {
  const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

  for (const horizon of HORIZONS) {
    console.log(`\n${chalk.bold.cyan(`${horizon} Timing Diagnostics:`)}`);

    const table = new Table({
      chars: {
        'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
        'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
        'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
        'right': '│', 'right-mid': '┤', 'middle': '│'
      },
      style: { head: [], border: [] }
    });

    table.push([
      { content: chalk.dim('Model'), hAlign: 'center' },
      { content: chalk.dim('Earliest'), hAlign: 'center' },
      { content: chalk.dim('Mean TtD'), hAlign: 'center' },
      { content: chalk.dim('Redundant'), hAlign: 'center' },
    ]);

    // Sort by mean time to detection (earlier is better)
    const sorted = [...modelMetrics].sort((a, b) =>
      a.metrics.byHorizon[horizon].meanTimeToDetectionRatio -
      b.metrics.byHorizon[horizon].meanTimeToDetectionRatio
    );

    for (const { modelId, metrics } of sorted) {
      const m = metrics.byHorizon[horizon];
      const earliest = m.earliestCorrectPredictionMs !== undefined
        ? `${(m.earliestCorrectPredictionMs / 60000).toFixed(1)}m`
        : chalk.dim('-');
      const meanTtD = `${(m.meanTimeToDetectionRatio * 100).toFixed(0)}%`;
      const redundant = String(m.redundantConfirmations);

      table.push([
        { content: chalk.cyan(modelId), hAlign: 'left' },
        { content: earliest, hAlign: 'right' },
        { content: meanTtD, hAlign: 'right' },
        { content: redundant, hAlign: 'right' },
      ]);
    }

    console.log(table.toString());
  }
}
```

**Step 2: Add timing section to persist-results.ts**

Add a new section generator for timing diagnostics in the markdown output.

**Step 3: Run quick benchmark**

Run: `cd apps/agent_006 && pnpm benchmark --quick`
Expected: Timing diagnostics table appears in output

**Step 4: Commit**

```bash
git add apps/agent_006/src/table.ts apps/agent_006/src/persist-results.ts
git commit -m "feat(agent_006): add timing diagnostics output section"
```

---

## Task 9: Add Cross-Horizon Behavior Map

**Files:**
- Modify: `apps/agent_006/src/table.ts`
- Modify: `apps/agent_006/src/persist-results.ts`

**Step 1: Add printCrossHorizonBehaviorMap to table.ts**

```typescript
export function printCrossHorizonBehaviorMap(
  modelMetrics: Array<{
    modelId: string;
    qualifiedHorizons: Set<Horizon>;
    trackB: TrackBMetrics;
  }>
): void {
  console.log(`\n${chalk.bold.cyan('Cross-Horizon Behavior Map:')}`);

  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    style: { head: [], border: [] }
  });

  table.push([
    { content: chalk.dim('Model'), hAlign: 'center' },
    { content: chalk.dim('15m'), hAlign: 'center' },
    { content: chalk.dim('1h'), hAlign: 'center' },
    { content: chalk.dim('24h'), hAlign: 'center' },
    { content: chalk.dim('7d'), hAlign: 'center' },
    { content: chalk.dim('Profile'), hAlign: 'center' },
  ]);

  for (const { modelId, qualifiedHorizons, trackB } of modelMetrics) {
    const horizonCells = (['15m', '1h', '24h', '7d'] as Horizon[]).map(h => {
      if (!qualifiedHorizons.has(h)) {
        return chalk.dim('✗');
      }
      const ttd = trackB.byHorizon[h].meanTimeToDetectionRatio;
      if (ttd < 0.3) return chalk.green('E'); // Early detector
      if (ttd < 0.7) return chalk.yellow('M'); // Mid-range
      return chalk.red('L'); // Late confirmer
    });

    // Determine profile
    const profiles: string[] = [];
    const qualified = [...qualifiedHorizons];
    if (qualified.length === 4) profiles.push('Generalist');
    if (qualified.length === 1) profiles.push(`${qualified[0]} Specialist`);
    if (qualified.includes('15m') && qualified.includes('1h') && !qualified.includes('7d')) {
      profiles.push('Short-term');
    }
    if (qualified.includes('24h') && qualified.includes('7d') && !qualified.includes('15m')) {
      profiles.push('Long-term');
    }

    table.push([
      { content: chalk.cyan(modelId), hAlign: 'left' },
      { content: horizonCells[0], hAlign: 'center' },
      { content: horizonCells[1], hAlign: 'center' },
      { content: horizonCells[2], hAlign: 'center' },
      { content: horizonCells[3], hAlign: 'center' },
      { content: profiles.join(', ') || 'Mixed', hAlign: 'left' },
    ]);
  }

  console.log(table.toString());
  console.log(chalk.dim('\nLegend: E=Early detector (<30%), M=Mid-range, L=Late confirmer (>70%), ✗=Disqualified'));
}
```

**Step 2: Integrate into benchmark output**

Update benchmark.ts to call these new output functions after Phase 3.

**Step 3: Run quick benchmark**

Run: `cd apps/agent_006 && pnpm benchmark --quick`
Expected: Cross-horizon behavior map appears in output

**Step 4: Commit**

```bash
git add apps/agent_006/src/table.ts apps/agent_006/src/benchmark.ts
git commit -m "feat(agent_006): add cross-horizon behavior map output"
```

---

## Task 10: Final Integration and QA

**Files:**
- All modified files

**Step 1: Run full type check**

Run: `pnpm check-types --filter=agent_006`
Expected: PASS with no errors

**Step 2: Run linter**

Run: `pnpm lint --filter=agent_006`
Expected: PASS with no errors (fix any issues)

**Step 3: Run unit tests**

Run: `pnpm test:unit --filter=agent_006`
Expected: All tests pass

**Step 4: Run full benchmark (not quick mode)**

Run: `cd apps/agent_006 && pnpm benchmark`
Expected: Full output with all new sections

**Step 5: Verify output sections**

Check that output includes:
- [ ] Per-horizon charts in prompt (4 charts, not 2)
- [ ] candlesBack in prediction schema
- [ ] Phase 0 per-horizon disqualification
- [ ] Timing diagnostics table
- [ ] Cross-horizon behavior map
- [ ] No global elimination from Phase 0 unless all 4 horizons fail

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(agent_006): complete benchmark spec v2 implementation"
```

---

## Summary of Changes

| Component | Before | After |
|-----------|--------|-------|
| Charts | 2 generic (4h/5m, 24h/15m) | 4 per-horizon with spec timeframes |
| Predictions | `bottom-{horizon}: number` | `{horizon}: {hasBottomed, confidence, candlesBack}` |
| Phase 0 | Cross-horizon contamination | Horizon-isolated disqualification |
| Track A | Combined with timing | Correctness only (elimination) |
| Track B | N/A | Timing metrics (analysis only) |
| Output | Basic tables | + Timing diagnostics + Behavior map |
