# Horizon-Scoped Bottom Prediction: Implementation Plan

**Date:** 2026-01-02  
**Status:** Draft  
**Owner:** Agent Team  

## Executive Summary

The current bottom-caller benchmark has a **98% positive label rate bug** that makes it meaningless for model evaluation. This plan fixes the fundamental measurement problem by:

1. Switching from "any pivot low exists" to "bottom that holds within tolerance"
2. Enforcing candlesBack validation to prevent lookback drift
3. Aligning Task Spec across prompt, validation, ground truth, and scoring
4. Using Replay Lab's `bottom_hold` annotation as the authoritative label source

## Problem Statement

### Current Behavior (Broken)

```
Ground Truth: hasStructuralBottom = pivotLows.length > 0
```

This labels every window with at least one `local_extrema` LOW as positive. With dense fractals on fine bar sizes (1m/5m), nearly every horizon window contains a pivot low—even during sustained downtrends making lower lows.

### Root Causes

1. **No drawdown gating**: A pivot that precedes a 5-10% further drop still yields label=1
2. **Dense pivot detection**: 1m/5m fractals fire constantly
3. **No candlesBack validation**: Models can point to ancient bottoms outside visible chart
4. **Lookback windows too long**: 4-12h lookbacks when spec calls for 2-8h

### Target Behavior

```
Ground Truth: label = bottom_hold.payload.held === true
```

A bottom "holds" only if price does not undercut the identified low by more than the tolerance within the horizon window.

---

## Task Spec v1 (The Contract)

All components (prompt, chart, validation, ground truth, scoring, dashboard) must use these exact values:

| Horizon | Bar Size | Horizon Bars | Lookback (8×) | Lookback Time | Tolerance |
|---------|----------|--------------|---------------|---------------|-----------|
| 15m | 5m | 3 | 24 bars | 2h (120m) | 0.1% |
| 1h | 15m | 4 | 32 bars | 8h (480m) | 0.1% |
| 4h | 1h | 4 | 32 bars | 32h (1920m) | 0.1% |
| 24h | 4h | 6 | 48 bars | 8d (11520m) | 0.1% |

**Invariant:** `lookbackBars = 8 × horizonBars`

---

## Tolerance Philosophy (Corrected)

**Key insight from data science review:** Tolerance should NOT scale with horizon.

### What tolerance is for
Tolerance exists for ONE reason only: to ignore microscopic, mechanical noise such as a single tick, spread artifact, or rounding error.

### What tolerance is NOT for
- NOT for forgiving real price discovery
- NOT for allowing large adverse movement
- NOT for "volatility forgiveness"

### The rule
A bottom "holds" if price does not trade meaningfully below the identified low during the horizon window. If the low is broken by more than 0.1%, the bottom was NOT in.

### Why uniform across horizons
The task is: "Has the market already printed the low that will not be broken over the next H?"

Bottoms are binary events in hindsight. They are either the lowest low or they are not. The magnitude of how much lower only matters to filter tick noise, which is the same regardless of horizon.

### Fixed micro-tolerance: 0.1%
- Same for all horizons
- Purely technical, not economic
- Ignores ~$100 noise on $100k BTC

---

## Phase 1: Replay Lab Integration Testing

**Effort:** S-M  
**Priority:** Critical (blocks all other phases)  
**Goal:** Verify `bottom_hold` annotation works correctly before wiring into benchmark

### 1.1 Create Integration Test Suite

Create `__tests__/integration/replay-lab-bottom-hold.test.ts`:

```typescript
describe('Replay Lab bottom_hold integration', () => {
  describe('annotation availability', () => {
    it('returns bottom_hold annotations for valid time range');
    it('respects availableAt constraint (no lookahead)');
    it('returns empty array for future time ranges');
  });

  describe('payload structure', () => {
    it('includes held boolean');
    it('includes refLowPrice and refLowTime');
    it('includes forwardMinLowPrice and forwardMinLowTime');
    it('includes drawdownFrac and maxDrawdownFrac');
    it('includes brokeAt timestamp when held=false');
  });

  describe('hold semantics per horizon', () => {
    it('15m: held=true when drawdown <= 0.1%');
    it('15m: held=false when drawdown > 0.1%');
    it('1h: held=true when drawdown <= 0.1%');
    it('4h: held=true when drawdown <= 0.1%');
    it('24h: held=true when drawdown <= 0.1%');
  });

  describe('edge cases', () => {
    it('handles exact tolerance boundary correctly');
    it('returns consistent results for same query');
    it('handles missing data gracefully');
  });
});
```

### 1.2 Manual Smoke Tests

Run against known historical data where we can manually verify:

1. Pick 5 time points per horizon where we know ground truth
2. Query `bottom_hold` annotation
3. Compare payload values against manual OHLCV calculation
4. Document any discrepancies

### 1.3 Cross-Validation Script

Create `scripts/validate-bottom-hold.ts`:

```typescript
// For each test case:
// 1. Fetch bottom_hold annotation from Replay Lab
// 2. Fetch raw OHLCV data
// 3. Compute drawdown manually
// 4. Compare held flag and drawdownFrac
// 5. Report mismatches
```

### 1.4 Issue Tracking

If issues found, file tickets with Replay Lab team:

- [ ] Ticket template: `[bottom_hold] {description} - {horizon} - {timestamp}`
- [ ] Include: expected vs actual, raw OHLCV data, reproduction steps
- [ ] Priority: blocking (benchmark cannot proceed without fix)

### 1.5 Success Criteria

- [ ] All integration tests pass
- [ ] Manual smoke tests match expected values
- [ ] Cross-validation shows <1% discrepancy rate
- [ ] No blocking issues outstanding

---

## Phase 2: Task Spec Configuration Update

**Effort:** S  
**Files:** `src/timeframe-config.ts`  
**Depends on:** Phase 1 complete

### 2.1 Update TIMEFRAME_CONFIG

Current → Target changes:

```typescript
'15m': {
  chart: {
    range: { fromMinutesAgo: 240, ... },  // → 120 (2h)
  },
  task: {
    maxDrawdown: 0.004,  // → 0.001 (0.1%)
  },
  groundTruth: {
    pivot: {
      barTimeframe: '1m',  // → '5m' (match chart)
      annotationType: 'local_extrema',  // → 'bottom_hold'
    },
  },
}

'1h': {
  chart: {
    range: { fromMinutesAgo: 720, ... },  // → 480 (8h)
  },
  task: {
    maxDrawdown: ...,  // → 0.001 (0.1%)
  },
  groundTruth: {
    pivot: {
      barTimeframe: '5m',  // → '15m' (match chart)
    },
  },
}

'4h': {
  chart: {
    range: { fromMinutesAgo: 2880, ... },  // → 1920 (32h)
  },
  task: {
    maxDrawdown: 0.015,  // → 0.001 (0.1%)
  },
}

'24h': {
  chart: {
    range: { fromMinutesAgo: 10080, ... },  // → 11520 (8d)
  },
  task: {
    maxDrawdown: 0.025,  // → 0.001 (0.1%)
  },
}
```

### 2.2 Add Derived Fields

```typescript
interface TaskConfig {
  // ... existing fields
  /** Computed: lookback in bars (8 × horizon bars) */
  lookbackBars: number;
  /** Computed: horizon in bars */
  horizonBars: number;
}
```

### 2.3 Add Validation Invariants

Extend `validateTimeframeConfig()`:

```typescript
export function validateTimeframeConfig(): void {
  for (const id of TIMEFRAME_IDS) {
    const config = getTimeframeConfig(id);
    const barSize = config.chart.barSizeMinutes;
    const horizonBars = config.task.forwardWindowMinutes / barSize;
    const lookbackBars = config.chart.range.fromMinutesAgo / barSize;

    // Invariant: lookback = 8 × horizon
    if (lookbackBars !== 8 * horizonBars) {
      throw new Error(
        `Config invariant violation for ${id}: ` +
        `lookbackBars (${lookbackBars}) !== 8 × horizonBars (${horizonBars})`
      );
    }

    // Invariant: pivot bar size matches chart bar size
    if (config.groundTruth.pivot.barTimeframe !== config.chart.barTimeframe) {
      throw new Error(
        `Config mismatch for ${id}: pivot barTimeframe !== chart barTimeframe`
      );
    }
  }
}
```

### 2.4 Tests

Add to `__tests__/golden-config.test.ts`:

```typescript
describe('Task Spec v1 invariants', () => {
  for (const id of TIMEFRAME_IDS) {
    it(`${id}: lookbackBars === 8 × horizonBars`, () => { ... });
    it(`${id}: pivot barTimeframe matches chart barTimeframe`, () => { ... });
    it(`${id}: tolerance matches spec`, () => { ... });
  }
});
```

---

## Phase 3: candlesBack Validation

**Effort:** S-M  
**Files:** `src/bottom-caller.ts`, new `src/validation.ts`  
**Depends on:** Phase 2 complete

### 3.1 Schema Update

Update `HorizonPredictionSchema` per horizon:

```typescript
function createHorizonSchema(lookbackBars: number) {
  return z.object({
    hasBottomed: z.boolean(),
    confidence: z.number().min(0.5).max(1.0),
    candlesBack: z.number().int().min(0).max(lookbackBars - 1),
  });
}
```

### 3.2 Runtime Validation

Create `src/validation.ts`:

```typescript
export interface ValidationResult {
  valid: boolean;
  invalidReason?: string;
}

export function validatePrediction(
  prediction: HorizonPrediction,
  horizon: TimeframeId
): ValidationResult {
  const config = getTimeframeConfig(horizon);
  const lookbackBars = config.task.lookbackBars;

  // candlesBack required when hasBottomed=true
  if (prediction.hasBottomed && prediction.candlesBack === undefined) {
    return { valid: false, invalidReason: 'candlesBack required when hasBottomed=true' };
  }

  // candlesBack must be in valid range
  if (prediction.candlesBack !== undefined) {
    if (prediction.candlesBack < 0 || prediction.candlesBack >= lookbackBars) {
      return {
        valid: false,
        invalidReason: `candlesBack ${prediction.candlesBack} outside valid range [0, ${lookbackBars - 1}]`,
      };
    }
  }

  // confidence must be in [0.5, 1.0]
  if (prediction.confidence < 0.5 || prediction.confidence > 1.0) {
    return {
      valid: false,
      invalidReason: `confidence ${prediction.confidence} outside valid range [0.5, 1.0]`,
    };
  }

  return { valid: true };
}
```

### 3.3 Invalid Handling Policy

When prediction is invalid:

1. Record `invalidReason` in audit
2. Apply worst-case log loss: `ln(1e-6)` ≈ 13.8
3. Track invalid rate per model in diagnostics
4. Do NOT silently coerce values

### 3.4 Tests

```typescript
describe('prediction validation', () => {
  it('rejects candlesBack >= lookbackBars');
  it('rejects candlesBack < 0');
  it('rejects non-integer candlesBack');
  it('rejects missing candlesBack when hasBottomed=true');
  it('rejects confidence < 0.5');
  it('rejects confidence > 1.0');
  it('accepts valid prediction at boundary (candlesBack = lookbackBars - 1)');
  it('accepts valid prediction at zero (candlesBack = 0)');
});
```

---

## Phase 4: Ground Truth Overhaul

**Effort:** M  
**Files:** `src/ground-truth/bottom-checker.ts`, `src/replay-lab/annotations.ts`  
**Depends on:** Phase 1 complete (Replay Lab verified)

### 4.1 Add bottom_hold Client

In `src/replay-lab/annotations.ts`:

```typescript
export interface BottomHoldAnnotation {
  type: 'bottom_hold';
  method: 'drawdown_hold';
  time_start: string;
  time_end: string;
  payload: {
    held: boolean;
    refLowPrice: number;
    refLowTime: string;
    forwardMinLowPrice: number;
    forwardMinLowTime: string;
    drawdownFrac: number;
    maxDrawdownFrac: number;
    brokeAt: string | null;
  };
  availability: {
    availableAt: string;
  };
}

export async function getBottomHoldAnnotations(
  symbolId: string,
  horizonConfig: { horizonMinutes: number; tolerance: number },
  from: Date,
  to: Date,
  availableAt: Date
): Promise<BottomHoldAnnotation[]> {
  const path = `/api/annotations?` + new URLSearchParams({
    symbolId,
    type: 'bottom_hold',
    method: 'drawdown_hold',
    from: from.toISOString(),
    to: to.toISOString(),
    availableAt: availableAt.toISOString(),
    horizonMinutes: String(horizonConfig.horizonMinutes),
    tolerance: String(horizonConfig.tolerance),
  });

  const response = await replayLabFetch<{ annotations: BottomHoldAnnotation[] }>(path);
  return response.annotations;
}
```

### 4.2 Update bottom-checker.ts

Replace `resolveWithMethod`:

```typescript
async function resolveBottomHold(
  symbolId: string,
  config: TimeframeConfig,
  predictedAt: Date,
  closesAt: Date,
  durationMs: number
): Promise<BottomHoldResult> {
  const annotations = await getBottomHoldAnnotations(
    symbolId,
    {
      horizonMinutes: config.task.forwardWindowMinutes,
      tolerance: config.task.maxDrawdown,
    },
    predictedAt,
    closesAt,
    closesAt  // availableAt = closesAt (no lookahead)
  );

  // Find valid held bottoms
  const heldBottoms = annotations.filter(a => a.payload.held);
  const hasHeldBottom = heldBottoms.length > 0;
  const label: 0 | 1 = hasHeldBottom ? 1 : 0;

  if (hasHeldBottom) {
    const earliest = heldBottoms.reduce((min, a) =>
      new Date(a.payload.refLowTime) < new Date(min.payload.refLowTime) ? a : min
    );
    const bottomTime = new Date(earliest.payload.refLowTime);
    const timeToPivotRatio = (bottomTime.getTime() - predictedAt.getTime()) / durationMs;

    return {
      hasHeldBottom,
      label,
      timeToPivotRatio,
      firstBottomAt: bottomTime,
      drawdownFrac: earliest.payload.drawdownFrac,
    };
  }

  return { hasHeldBottom, label };
}
```

### 4.3 Tests

```typescript
describe('bottom_hold ground truth', () => {
  it('label=1 when held=true annotation exists');
  it('label=0 when only held=false annotations exist');
  it('label=0 when no annotations exist');
  it('uses availableAt=closesAt to prevent lookahead');
  it('timing uses refLowTime from annotation');
});
```

---

## Phase 5: Prompt Contract Update

**Effort:** S  
**Files:** `src/bottom-caller.ts`  
**Depends on:** Phase 2 complete

### 5.1 Problem

Current prompt embeds chart URLs in text, but images are attached as multimodal payload. URLs are noise—they add no value since the model sees the images directly as attachments.

### 5.2 Solution

Reference attached charts by description, not URL. Each chart description ties to:
- Bar size
- Lookback duration (bars and time)
- Prediction horizon
- Tolerance

### 5.3 New Prompt Template

```
You are given 4 attached candlestick chart images of the same market.
The images are ordered and used as follows:

1. **Image 1 – 15m horizon chart**
   - Bar size: **5-minute** candles
   - Lookback: **24 bars** (**2 hours**)
   - Prediction horizon: **next 15 minutes**
   - Tolerance: **0.1%**

2. **Image 2 – 1h horizon chart**
   - Bar size: **15-minute** candles
   - Lookback: **32 bars** (**8 hours**)
   - Prediction horizon: **next 1 hour**
   - Tolerance: **0.1%**

3. **Image 3 – 4h horizon chart**
   - Bar size: **1-hour** candles
   - Lookback: **32 bars** (**32 hours**)
   - Prediction horizon: **next 4 hours**
   - Tolerance: **0.1%**

4. **Image 4 – 24h horizon chart**
   - Bar size: **4-hour** candles
   - Lookback: **48 bars** (**8 days**)
   - Prediction horizon: **next 24 hours**
   - Tolerance: **0.1%**

### Task
For each horizon, decide whether the market has already put in a structural bottom within the visible lookback window.

### Definition of "hasBottomed"
- hasBottomed = true: The selected bottom's low will NOT be undercut by more than the tolerance within the prediction horizon
- hasBottomed = false: Price will make a new low beyond tolerance within the prediction horizon

### candlesBack constraints
- candlesBack = 0 → rightmost (most recent) bar
- Valid ranges:
  - 15m: 0 to 23
  - 1h: 0 to 31
  - 4h: 0 to 31
  - 24h: 0 to 47

### Confidence
- Range: 0.5 to 1.0
- 0.5 = uncertain/guess
- 1.0 = high conviction

### Output format
JSON only with 15m, 1h, 4h, 24h keys
```

### 5.4 Implementation Tasks

- [ ] Remove URL injection from `buildRoundPrompt`
- [ ] Attach images to payload without embedding URLs in text
- [ ] Build prompt text from `TIMEFRAME_CONFIG` (derive all values)
- [ ] Ensure chart image order matches prompt description order

### 5.5 Tests

- [ ] Verify prompt contains no URLs
- [ ] Verify `candlesBack` ranges derived from config
- [ ] Verify tolerance values match Task Spec v1

---

## Phase 6: Timing Metrics Alignment

**Effort:** S-M  
**Files:** `src/scorers/timing-metrics.ts`, `src/diagnostics/round-diagnostics.ts`  
**Depends on:** Phase 4 complete

### 6.1 Remove Hardcoded Values

Replace hardcoded `getCandlesPerHorizon()`:

```typescript
// Before
function getCandlesPerHorizon(horizon: TimeframeId): number {
  const map = { '15m': 3, '1h': 4, '4h': 4, '24h': 6 };
  return map[horizon];
}

// After
function getCandlesPerHorizon(horizon: TimeframeId): number {
  const config = getTimeframeConfig(horizon);
  return config.task.horizonBars;
}

function getLookbackBars(horizon: TimeframeId): number {
  const config = getTimeframeConfig(horizon);
  return config.task.lookbackBars;
}
```

### 6.2 Timing Based on Held Bottom

```typescript
export function computeTimingError(
  claimedCandlesBack: number,
  bottomHoldResult: BottomHoldResult,
  horizon: TimeframeId,
  predictedAt: Date
): number | undefined {
  if (!bottomHoldResult.firstBottomAt) return undefined;

  const config = getTimeframeConfig(horizon);
  const barSizeMs = config.chart.barSizeMinutes * 60_000;
  const actualCandlesBack = Math.round(
    (predictedAt.getTime() - bottomHoldResult.firstBottomAt.getTime()) / barSizeMs
  );

  return claimedCandlesBack - actualCandlesBack;
}
```

---

## Phase 7: Test Suite Updates

**Effort:** M  
**Files:** `__tests__/*.test.ts`  
**Depends on:** Phases 2-6 complete

### 7.1 Golden Config Tests

Update `golden-config.test.ts` with Task Spec v1 invariants.

### 7.2 Validation Tests

New `validation.test.ts` for candlesBack bounds.

### 7.3 Ground Truth Tests

Update `bottom-checker.test.ts` for bottom_hold semantics.

### 7.4 Timing Tests

Update/create `timing-metrics.test.ts`.

### 7.5 Integration Tests

New `integration/benchmark-flow.test.ts`:

```typescript
describe('benchmark end-to-end', () => {
  it('runs Phase 0 with valid label distribution');
  it('tracks invalid predictions correctly');
  it('computes timing metrics from held bottoms');
});
```

---

## Phase 8: Verification & Validation

**Effort:** S  
**Depends on:** All previous phases complete

### 8.1 Label Distribution Check

Run benchmark and verify:

- [ ] Label positive rate < 50% (not 98%)
- [ ] Distribution varies by horizon (15m may differ from 24h)
- [ ] Missing label rate documented

### 8.2 Diagnostics Review

Check dashboard/logs for:

- [ ] Invalid prediction rates tracked per model
- [ ] Timing metrics populated when label=true
- [ ] Base rates shown per horizon

### 8.3 Regression Test

Compare against known historical period:

- [ ] Label counts match manual verification
- [ ] Top/bottom models are sensible
- [ ] No crashes or silent failures

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                    Phase 1: Replay Lab Testing                  │
│                    (Blocks everything else)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Phase 2: Config │ │ Phase 4: Ground │ │ Phase 5: Prompt │
│ Update          │ │ Truth Overhaul  │ │ Contract        │
└─────────────────┘ └─────────────────┘ └─────────────────┘
        │                   │
        ▼                   ▼
┌─────────────────┐ ┌─────────────────┐
│ Phase 3:        │ │ Phase 6: Timing │
│ Validation      │ │ Metrics         │
└─────────────────┘ └─────────────────┘
        │                   │
        └─────────┬─────────┘
                  ▼
        ┌─────────────────┐
        │ Phase 7: Tests  │
        └─────────────────┘
                  │
                  ▼
        ┌─────────────────┐
        │ Phase 8: Verify │
        └─────────────────┘
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Replay Lab bottom_hold has bugs | Phase 1 catches early; file tickets before proceeding |
| Label distribution still skewed | Tolerance values may need tuning; document and iterate |
| Breaking change breaks CI | Feature flag or branch until stable |
| Models fail validation en masse | Review validation thresholds; may indicate prompt issues |

---

## Success Criteria

1. **Label sanity**: Positive rate per horizon is reasonable (10-60%, not 98%)
2. **Validation working**: Invalid predictions tracked, penalized correctly
3. **Config consistency**: All components use same Task Spec values
4. **Tests passing**: All new and existing tests green
5. **Benchmark runnable**: Full run completes without crashes

---

## Open Questions

1. **Replay Lab API shape**: Does `bottom_hold` use the exact payload structure assumed above?
2. **Missing annotation policy**: Should "no annotation returned" be label=0 or skip?
3. **Tolerance tuning**: Are the spec v1 tolerances optimal, or should we A/B test?

---

## Next Steps

1. [ ] Create Phase 1 integration test suite
2. [ ] Run smoke tests against Replay Lab bottom_hold
3. [ ] File any blocking tickets
4. [ ] Proceed to Phase 2 once Phase 1 passes
