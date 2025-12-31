# Baseline Comparisons for Sanity Filtering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add baseline log loss comparisons (random, always-false, always-true) to Phase 0 sanity filtering, showing model performance relative to trivial strategies rather than absolute thresholds.

**Architecture:** Add `computeBaselineLogLoss()` function to compute baselines from observed label distribution, update `formatRoundScore()` to show LL vs baseline, update disqualification logic to use relative thresholds, and add baseline comparison output after scoring.

**Tech Stack:** TypeScript, Vitest, existing log-loss-scorer utilities.

---

### Task 1: Add computeBaselineLogLoss function with tests

**Files:**
- Modify: `/Users/andrewhill/Coding/nullagent/apps/agent_006/src/scorers/phase-0-scorer.ts`
- Modify: `/Users/andrewhill/Coding/nullagent/apps/agent_006/__tests__/phase-0-scorer.test.ts`

**Step 1: Write the failing tests**

Add these tests to the existing test file at the end of the `describe('phase-0-scorer', () => {` block:

```typescript
describe('computeBaselineLogLoss', () => {
  it('returns random baseline as log(2) for any distribution', () => {
    const result = computeBaselineLogLoss([true, false, true, false]);
    expect(result.random).toBeCloseTo(0.693, 3);
  });

  it('computes always-false baseline based on label frequency', () => {
    // All labels are false: always-false predicts 0, LL = 0
    const allFalse = computeBaselineLogLoss([false, false, false]);
    expect(allFalse.alwaysFalse).toBeCloseTo(0, 5);

    // All labels are true: always-false predicts 0, LL = very high
    const allTrue = computeBaselineLogLoss([true, true, true]);
    expect(allTrue.alwaysFalse).toBeGreaterThan(30); // log(epsilon) penalty
  });

  it('computes always-true baseline based on label frequency', () => {
    // All labels are true: always-true predicts 1, LL = 0
    const allTrue = computeBaselineLogLoss([true, true, true]);
    expect(allTrue.alwaysTrue).toBeCloseTo(0, 5);

    // All labels are false: always-true predicts 1, LL = very high
    const allFalse = computeBaselineLogLoss([false, false, false]);
    expect(allFalse.alwaysTrue).toBeGreaterThan(30);
  });

  it('computes mixed distribution baselines correctly', () => {
    // 3/4 are false, 1/4 are true
    const result = computeBaselineLogLoss([false, false, false, true]);

    // Always-false: 3 correct (LL=0) + 1 wrong (LL=high) / 4
    // Mean = high/4 = still significant penalty
    expect(result.alwaysFalse).toBeGreaterThan(8);

    // Always-true: 1 correct (LL=0) + 3 wrong (LL=high) / 4
    // Mean = 3*high/4 = larger penalty
    expect(result.alwaysTrue).toBeGreaterThan(result.alwaysFalse);
  });

  it('returns trivialBest as minimum of alwaysFalse and alwaysTrue', () => {
    const mostlyFalse = computeBaselineLogLoss([false, false, false, true]);
    expect(mostlyFalse.trivialBest).toBe(mostlyFalse.alwaysFalse);

    const mostlyTrue = computeBaselineLogLoss([true, true, true, false]);
    expect(mostlyTrue.trivialBest).toBe(mostlyTrue.alwaysTrue);
  });

  it('handles empty array gracefully', () => {
    const result = computeBaselineLogLoss([]);
    expect(result.random).toBeCloseTo(0.693, 3);
    expect(result.alwaysFalse).toBe(0);
    expect(result.alwaysTrue).toBe(0);
    expect(result.trivialBest).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 test -- --run phase-0-scorer`
Expected: FAIL with "computeBaselineLogLoss is not defined"

**Step 3: Write the implementation**

Add to `/Users/andrewhill/Coding/nullagent/apps/agent_006/src/scorers/phase-0-scorer.ts` after the existing imports and constants:

```typescript
import { logLoss } from './log-loss-scorer.js';

/**
 * Small epsilon to prevent log(0) in baseline calculations
 */
const BASELINE_EPSILON = 1e-15;

/**
 * Baseline log loss values for comparison
 */
export interface BaselineLogLoss {
  /** Random baseline: always 0.5 prediction = log(2) */
  random: number;
  /** Always-false baseline: predict 0 for all samples */
  alwaysFalse: number;
  /** Always-true baseline: predict 1 for all samples */
  alwaysTrue: number;
  /** Best trivial baseline: min(alwaysFalse, alwaysTrue) */
  trivialBest: number;
}

/**
 * Compute baseline log loss values for a set of labels
 * These baselines represent the performance of trivial strategies:
 * - Random: always predict 0.5
 * - Always-false: always predict 0 (epsilon)
 * - Always-true: always predict 1 (1-epsilon)
 *
 * @param labels - Array of observed boolean labels
 * @returns Baseline log loss values for comparison
 */
export function computeBaselineLogLoss(labels: boolean[]): BaselineLogLoss {
  // Random baseline is always log(2) regardless of label distribution
  const random = RANDOM_BASELINE;

  if (labels.length === 0) {
    return { random, alwaysFalse: 0, alwaysTrue: 0, trivialBest: 0 };
  }

  // Always-false: predict epsilon (near 0) for all samples
  let alwaysFalseSum = 0;
  for (const label of labels) {
    alwaysFalseSum += logLoss(BASELINE_EPSILON, label);
  }
  const alwaysFalse = alwaysFalseSum / labels.length;

  // Always-true: predict 1-epsilon (near 1) for all samples
  let alwaysTrueSum = 0;
  for (const label of labels) {
    alwaysTrueSum += logLoss(1 - BASELINE_EPSILON, label);
  }
  const alwaysTrue = alwaysTrueSum / labels.length;

  // Trivial best is the better of the two constant strategies
  const trivialBest = Math.min(alwaysFalse, alwaysTrue);

  return { random, alwaysFalse, alwaysTrue, trivialBest };
}
```

**Step 4: Update exports**

Add `computeBaselineLogLoss` to the export and add the import for logLoss at the top.

**Step 5: Run tests to verify they pass**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 test -- --run phase-0-scorer`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/agent_006/src/scorers/phase-0-scorer.ts apps/agent_006/__tests__/phase-0-scorer.test.ts
git commit -m "feat(agent_006): add computeBaselineLogLoss function"
```

---

### Task 2: Add baseline-aware disqualification with tests

**Files:**
- Modify: `/Users/andrewhill/Coding/nullagent/apps/agent_006/src/scorers/phase-0-scorer.ts`
- Modify: `/Users/andrewhill/Coding/nullagent/apps/agent_006/__tests__/phase-0-scorer.test.ts`

**Step 1: Write the failing tests**

Add new test group after the `computeBaselineLogLoss` describe block:

```typescript
describe('getPhase0DisqualifiedHorizonsWithBaselines', () => {
  it('returns empty set when model significantly beats trivial baseline', () => {
    const score: Phase0AggregateScore = {
      meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '4h': 0.3 },
      meanBrier: { '15m': 0.15, '1h': 0.15, '24h': 0.15, '4h': 0.15 },
      extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '4h': 0 },
      degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '4h': false },
    };
    // All false labels: trivial baseline ≈ 0, model at 0.3 should pass
    // because it still beats random (0.693)
    const baselines: Record<TimeframeId, BaselineLogLoss> = {
      '15m': { random: 0.693, alwaysFalse: 0.05, alwaysTrue: 34, trivialBest: 0.05 },
      '1h': { random: 0.693, alwaysFalse: 0.05, alwaysTrue: 34, trivialBest: 0.05 },
      '4h': { random: 0.693, alwaysFalse: 0.05, alwaysTrue: 34, trivialBest: 0.05 },
      '24h': { random: 0.693, alwaysFalse: 0.05, alwaysTrue: 34, trivialBest: 0.05 },
    };

    const disqualified = getPhase0DisqualifiedHorizonsWithBaselines(score, baselines);
    expect(disqualified.size).toBe(0);
  });

  it('disqualifies when model matches trivial baseline (no skill)', () => {
    const score: Phase0AggregateScore = {
      meanLogLoss: { '15m': 0.05, '1h': 0.3, '24h': 0.3, '4h': 0.3 },
      meanBrier: { '15m': 0.02, '1h': 0.15, '24h': 0.15, '4h': 0.15 },
      extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '4h': 0 },
      degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '4h': false },
    };
    // 15m has LL of 0.05 but trivial baseline is also 0.05 - no skill demonstrated
    const baselines: Record<TimeframeId, BaselineLogLoss> = {
      '15m': { random: 0.693, alwaysFalse: 0.05, alwaysTrue: 34, trivialBest: 0.05 },
      '1h': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
      '4h': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
      '24h': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
    };

    const disqualified = getPhase0DisqualifiedHorizonsWithBaselines(score, baselines);
    expect(disqualified.has('15m')).toBe(true);
    expect(disqualified.has('1h')).toBe(false);
  });

  it('still disqualifies for degenerate patterns regardless of baseline', () => {
    const score: Phase0AggregateScore = {
      meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '4h': 0.3 },
      meanBrier: { '15m': 0.15, '1h': 0.15, '24h': 0.15, '4h': 0.15 },
      extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '4h': 0 },
      degenerateByHorizon: { '15m': true, '1h': false, '24h': false, '4h': false },
    };
    const baselines: Record<TimeframeId, BaselineLogLoss> = {
      '15m': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
      '1h': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
      '4h': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
      '24h': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
    };

    const disqualified = getPhase0DisqualifiedHorizonsWithBaselines(score, baselines);
    expect(disqualified.has('15m')).toBe(true);
  });

  it('still disqualifies for high extreme error rate', () => {
    const score: Phase0AggregateScore = {
      meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '4h': 0.3 },
      meanBrier: { '15m': 0.15, '1h': 0.15, '24h': 0.15, '4h': 0.15 },
      extremeErrorRate: { '15m': 0.25, '1h': 0, '24h': 0, '4h': 0 },
      degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '4h': false },
    };
    const baselines: Record<TimeframeId, BaselineLogLoss> = {
      '15m': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
      '1h': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
      '4h': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
      '24h': { random: 0.693, alwaysFalse: 8, alwaysTrue: 8, trivialBest: 8 },
    };

    const disqualified = getPhase0DisqualifiedHorizonsWithBaselines(score, baselines);
    expect(disqualified.has('15m')).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 test -- --run phase-0-scorer`
Expected: FAIL with "getPhase0DisqualifiedHorizonsWithBaselines is not defined"

**Step 3: Write the implementation**

Add after `getPhase0DisqualifiedHorizons` in phase-0-scorer.ts:

```typescript
/**
 * Minimum improvement required over trivial baseline to demonstrate skill
 * Model must beat trivial baseline by at least this margin
 */
const SKILL_MARGIN = 0.1;

/**
 * Get horizons that should be disqualified in Phase 0 using baseline comparison
 * This version uses relative thresholds: model must significantly beat trivial baseline
 *
 * A model that merely matches always-false when labels are mostly false shows no skill.
 *
 * @param aggregateScore - Aggregate Phase 0 score
 * @param baselines - Baseline log loss values for each horizon
 * @returns Set of horizons to disqualify
 */
export function getPhase0DisqualifiedHorizonsWithBaselines(
  aggregateScore: Phase0AggregateScore,
  baselines: Record<TimeframeId, BaselineLogLoss>
): Set<TimeframeId> {
  const disqualified = new Set<TimeframeId>();

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const meanLL = aggregateScore.meanLogLoss[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const degenerate = aggregateScore.degenerateByHorizon[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const extremeRate = aggregateScore.extremeErrorRate[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const baseline = baselines[horizon];

    // Disqualify if degenerate or high extreme error rate (unchanged)
    if (degenerate || extremeRate > 0.2) {
      disqualified.add(horizon);
      continue;
    }

    // Disqualify if not significantly better than trivial baseline
    // Model must beat trivialBest by SKILL_MARGIN, otherwise it's just luck
    const skillThreshold = baseline.trivialBest + SKILL_MARGIN;

    // Also still check random baseline (model shouldn't be worse than random)
    const randomThreshold = baseline.random * 1.1;

    if (meanLL > randomThreshold || meanLL >= skillThreshold) {
      disqualified.add(horizon);
    }
  }

  return disqualified;
}
```

**Step 4: Export the new function**

Add `getPhase0DisqualifiedHorizonsWithBaselines` and `BaselineLogLoss` type to exports.

**Step 5: Run tests to verify they pass**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 test -- --run phase-0-scorer`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/agent_006/src/scorers/phase-0-scorer.ts apps/agent_006/__tests__/phase-0-scorer.test.ts
git commit -m "feat(agent_006): add baseline-aware disqualification function"
```

---

### Task 3: Add formatRoundScoreWithBaseline function

**Files:**
- Modify: `/Users/andrewhill/Coding/nullagent/apps/agent_006/src/benchmark.ts`

**Step 1: Add the formatRoundScoreWithBaseline function**

Add after the existing `formatRoundScore` function in benchmark.ts:

```typescript
/**
 * Format round score with baseline comparison
 * Shows LL per horizon with delta vs baseline
 * @param roundScore - Phase 0 round score
 * @param baselines - Baseline log loss values per horizon
 * @returns Formatted string with baseline comparisons
 */
function formatRoundScoreWithBaseline(
  roundScore: Phase0RoundScore,
  baselines: Record<TimeframeId, BaselineLogLoss>
): string {
  const ll = roundScore.logLossByHorizon;
  const parts: string[] = [];

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const modelLL = ll[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const baseline = baselines[horizon];
    const baseLL = baseline.trivialBest;

    const formatted = formatLogLoss(modelLL);
    const baseFormatted = baseLL.toFixed(2);
    parts.push(`${horizon}:${formatted} vs ${baseFormatted}`);
  }

  return `LL[${parts.join(' ')}]`;
}
```

**Step 2: Add import for BaselineLogLoss**

Add `BaselineLogLoss` to the imports from phase-0-scorer.js.

**Step 3: Run typecheck to verify**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 check-types`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/agent_006/src/benchmark.ts
git commit -m "feat(agent_006): add formatRoundScoreWithBaseline function"
```

---

### Task 4: Update benchmark to compute and display baseline comparisons

**Files:**
- Modify: `/Users/andrewhill/Coding/nullagent/apps/agent_006/src/benchmark.ts`

**Step 1: Add baseline computation in runBenchmarkRound**

Update the `runBenchmarkRound` function to compute baselines from observed labels. Add after ground truth resolution:

```typescript
// Compute baselines from observed labels
const baselinesByHorizon: Record<TimeframeId, BaselineLogLoss> = {
  '15m': computeBaselineLogLoss([labels['15m']]),
  '1h': computeBaselineLogLoss([labels['1h']]),
  '4h': computeBaselineLogLoss([labels['4h']]),
  '24h': computeBaselineLogLoss([labels['24h']]),
};
```

But wait - we need baselines across ALL rounds for a horizon, not just one. Let me revise:

**Step 1a: Add accumulated labels tracking to ModelState interface**

In the `ModelState` interface, add:

```typescript
/** Accumulated labels per horizon for baseline computation */
labelsByHorizon: Record<TimeframeId, boolean[]>;
```

**Step 1b: Update createModelState**

Add initialization:

```typescript
labelsByHorizon: { '15m': [], '1h': [], '4h': [], '24h': [] },
```

**Step 1c: Update recordModelScore to track labels**

Add to the `recordModelScore` function:

```typescript
for (const horizon of HORIZONS) {
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  state.labelsByHorizon[horizon].push(labels[horizon]);
}
```

**Step 2: Update formatRoundScore calls to use baseline version**

In `runBenchmarkRound`, after recording the score, compute and use baselines:

```typescript
// Compute baselines from accumulated labels for this model
const baselinesByHorizon: Record<TimeframeId, BaselineLogLoss> = {
  '15m': computeBaselineLogLoss(state.labelsByHorizon['15m']),
  '1h': computeBaselineLogLoss(state.labelsByHorizon['1h']),
  '4h': computeBaselineLogLoss(state.labelsByHorizon['4h']),
  '24h': computeBaselineLogLoss(state.labelsByHorizon['24h']),
};
const scoreSummary = formatRoundScoreWithBaseline(roundScore, baselinesByHorizon);
```

**Step 3: Add import for computeBaselineLogLoss**

Add `computeBaselineLogLoss` to the imports from phase-0-scorer.js.

**Step 4: Run typecheck to verify**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 check-types`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/agent_006/src/benchmark.ts
git commit -m "feat(agent_006): compute and display baselines in round output"
```

---

### Task 5: Add baseline comparison summary after Phase 0

**Files:**
- Modify: `/Users/andrewhill/Coding/nullagent/apps/agent_006/src/benchmark.ts`

**Step 1: Add printBaselineComparisonSummary function**

Add this new function:

```typescript
/**
 * Print baseline comparison summary for all models
 * Shows per-horizon baselines and how models compare to them
 * @param models - Map of model states
 */
function printBaselineComparisonSummary(models: Map<string, ModelState>): void {
  logger.newline();
  logger.log('=== Baseline Comparisons ===');

  for (const horizon of HORIZONS) {
    // Collect all labels for this horizon across all models (they should be the same)
    let allLabels: boolean[] = [];
    for (const state of models.values()) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const labels = state.labelsByHorizon[horizon];
      if (labels.length > allLabels.length) {
        allLabels = labels;
      }
    }

    if (allLabels.length === 0) {
      continue;
    }

    const baseline = computeBaselineLogLoss(allLabels);
    const trueCount = allLabels.filter(Boolean).length;
    const falseCount = allLabels.length - trueCount;

    logger.log(`  ${horizon}: Random=${baseline.random.toFixed(3)}, ` +
      `Always-false=${baseline.alwaysFalse.toFixed(3)} (${String(falseCount)}/${String(allLabels.length)} labels false), ` +
      `Always-true=${baseline.alwaysTrue.toFixed(3)} (${String(trueCount)}/${String(allLabels.length)} labels true), ` +
      `TrivialBest=${baseline.trivialBest.toFixed(3)}`
    );
  }
}
```

**Step 2: Call it after Phase 0**

Add after `runPhase0(models);`:

```typescript
printBaselineComparisonSummary(models);
```

**Step 3: Run typecheck to verify**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 check-types`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/agent_006/src/benchmark.ts
git commit -m "feat(agent_006): add baseline comparison summary after Phase 0"
```

---

### Task 6: Update Phase 0 disqualification to use baselines

**Files:**
- Modify: `/Users/andrewhill/Coding/nullagent/apps/agent_006/src/benchmark.ts`

**Step 1: Update runPhase0 function signature and implementation**

Change `runPhase0` to accept models and compute baselines internally, then use the new baseline-aware disqualification:

```typescript
/**
 * Run Phase 0 elimination - sanity filter with per-horizon disqualification using baselines
 * @param models - Map of model states
 */
function runPhase0(models: Map<string, ModelState>): void {
  logger.newline();
  logger.log('=== Phase 0: Sanity Filter (Per-Horizon Disqualification) ===');

  // Compute baselines from observed labels (same across all models)
  let sampleLabels: Record<TimeframeId, boolean[]> = { '15m': [], '1h': [], '4h': [], '24h': [] };
  for (const state of models.values()) {
    if (!state.eliminated) {
      sampleLabels = state.labelsByHorizon;
      break;
    }
  }

  const baselines: Record<TimeframeId, BaselineLogLoss> = {
    '15m': computeBaselineLogLoss(sampleLabels['15m']),
    '1h': computeBaselineLogLoss(sampleLabels['1h']),
    '4h': computeBaselineLogLoss(sampleLabels['4h']),
    '24h': computeBaselineLogLoss(sampleLabels['24h']),
  };

  let eliminated = 0;
  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }

    const aggregate = aggregatePhase0Scores(state.roundScores);
    const disqualifiedHorizons = getPhase0DisqualifiedHorizonsWithBaselines(aggregate, baselines);

    // Disqualify from specific horizons
    for (const horizon of disqualifiedHorizons) {
      disqualifyFromHorizon(
        state,
        horizon,
        0 as Phase,
        `Phase 0: Failed sanity check on ${horizon}`
      );
    }

    // Only fully eliminate if disqualified from ALL horizons (all 4)
    if (disqualifiedHorizons.size === 4) {
      state.eliminated = true;
      state.eliminatedInPhase = 0;
      state.eliminationReason = 'Failed sanity check on all horizons';
      eliminated++;
      logger.log(`  ${chalk.cyan(state.modelId)}: disqualified from [${[...disqualifiedHorizons].join(', ')}] -> ${chalk.red('ELIMINATED')} (all horizons)`);
    } else if (disqualifiedHorizons.size > 0) {
      const qualifiedList = [...state.qualifiedHorizons].join(', ');
      logger.log(`  ${chalk.cyan(state.modelId)}: disqualified from [${[...disqualifiedHorizons].join(', ')}] -> qualified for [${chalk.green(qualifiedList)}]`);
    } else {
      logger.log(`  ${chalk.cyan(state.modelId)}: passed sanity check -> qualified for [${chalk.green([...state.qualifiedHorizons].join(', '))}]`);
    }
  }

  const remaining = [...models.values()].filter((model) => !model.eliminated).length;
  logger.log(`Phase 0 complete: ${String(eliminated)} fully eliminated, ${String(remaining)} remaining`);
}
```

**Step 2: Add import for getPhase0DisqualifiedHorizonsWithBaselines**

Update imports from phase-0-scorer.js to include `getPhase0DisqualifiedHorizonsWithBaselines`.

**Step 3: Run typecheck to verify**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 check-types`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/agent_006/src/benchmark.ts
git commit -m "feat(agent_006): use baseline-aware disqualification in Phase 0"
```

---

### Task 7: Run full QA and final commit

**Step 1: Run lint**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 lint`
Expected: PASS (fix any issues)

**Step 2: Run typecheck**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 check-types`
Expected: PASS

**Step 3: Run tests**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm --filter agent_006 test`
Expected: PASS

**Step 4: Run build**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm build`
Expected: PASS

**Step 5: Squash commits if needed, or create final summary commit**

If there were incremental commits, squash them into one clean commit:

```bash
git add -A
git commit -m "feat(agent_006): add baseline comparisons to sanity filtering

- Add computeBaselineLogLoss() to compute random, always-false, always-true baselines
- Add getPhase0DisqualifiedHorizonsWithBaselines() for relative threshold checks
- Update round output to show model LL vs baseline
- Print baseline comparison summary after Phase 0
- Models must now beat trivial baseline by margin, not just absolute threshold

Key principle: Log loss is only meaningful relative to a baseline."
```
