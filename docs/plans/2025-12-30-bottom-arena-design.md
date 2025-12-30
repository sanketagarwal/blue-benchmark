# agent_006: Bitcoin Bottom Arena Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Multi-phase selection protocol for vision-capable LLMs predicting structural market bottoms at multiple horizons.

**Architecture:** Progressive sieve that filters on pathology early, skill later. Same inputs for all models, ground truth from Replay Lab annotations, log loss scoring with drawdown validation.

**Tech Stack:** Vercel AI Gateway, Replay Lab API, Zod schemas, in-memory state

---

## 1. Core Concept

### What Agents Predict

Agents predict: *"Has downside been structurally exhausted at this scale?"*

This is **not**:
- Predicting the exact pivot candle
- Predicting price will go up
- Reverse-engineering annotation algorithms

Agents assess whether current price action represents a structurally meaningful bottom at each timeframe.

### Prediction Schema

```typescript
const PredictionSchema = z.object({
  'bottom-15m': z.number().min(0).max(1),
  'bottom-1h': z.number().min(0).max(1),
  'bottom-24h': z.number().min(0).max(1),
  'bottom-7d': z.number().min(0).max(1),
});

const OutputSchema = z.object({
  reasoning: z.string().max(500).optional(),
  predictions: PredictionSchema,
});
```

---

## 2. Ground Truth Resolution

### Canonical Definition

A prediction is **valid** (label = 1) if:
1. A `local_extrema` pivot LOW exists within `[predictedAt, closesAt]`
2. Max drawdown from `predictedAt` does not exceed the horizon threshold

### Label Logic

```typescript
interface PredictionWindow {
  predictedAt: Date;
  closesAt: Date;  // predictedAt + horizon duration
  horizon: '15m' | '1h' | '24h' | '7d';
}

interface GroundTruthResult {
  hasStructuralBottom: boolean;
  maxDrawdownPct: number;      // Positive magnitude
  isValid: boolean;
  timeToPivotRatio?: number;   // For Phase 3 early bonus
}

async function resolveGroundTruth(
  symbolId: string,
  window: PredictionWindow
): Promise<GroundTruthResult> {

  // 1. Fetch local_extrema annotations confirmed by closesAt
  const annotations = await getAnnotations({
    symbolId,
    type: 'local_extrema',
    method: HORIZON_CONFIG[window.horizon].method,
    from: window.predictedAt,
    to: window.closesAt,
    availableAt: window.closesAt,  // Prevents lookahead
  });

  // 2. Check for pivot LOW
  const pivotLows = annotations.filter(a => a.payload.direction === 'low');
  const hasStructuralBottom = pivotLows.length > 0;

  // 3. Compute max adverse excursion (positive magnitude)
  const trades = await getTrades(symbolId, window.predictedAt, window.closesAt);
  const entryPrice = getMidPriceAtTime(trades, window.predictedAt);
  const lowestPrice = Math.min(...trades.map(t => t.price));
  const maxDrawdownPct = (entryPrice - lowestPrice) / entryPrice;

  // 4. Apply threshold
  const maxAllowed = MAX_DRAWDOWN[window.horizon];
  const isValid = hasStructuralBottom && maxDrawdownPct <= maxAllowed;

  // 5. Track pivot timing for Phase 3
  let timeToPivotRatio: number | undefined;
  if (hasStructuralBottom && pivotLows.length > 0) {
    const earliestPivot = new Date(Math.min(...pivotLows.map(p => new Date(p.time_start).getTime())));
    const timeToPivot = earliestPivot.getTime() - window.predictedAt.getTime();
    const horizonDuration = window.closesAt.getTime() - window.predictedAt.getTime();
    timeToPivotRatio = timeToPivot / horizonDuration;
  }

  return { hasStructuralBottom, maxDrawdownPct, isValid, timeToPivotRatio };
}
```

### Horizon Configuration

```typescript
const HORIZON_CONFIG = {
  '15m': {
    duration: 15 * 60_000,
    method: 'fractal',
    params: { L: 3, candleTimeframe: '1m' }
  },
  '1h': {
    duration: 60 * 60_000,
    method: 'fractal',
    params: { L: 3, candleTimeframe: '5m' }
  },
  '24h': {
    duration: 24 * 60 * 60_000,
    method: 'zigzag',
    params: { deviationPct: 0.025, candleTimeframe: '15m' }
  },
  '7d': {
    duration: 7 * 24 * 60 * 60_000,
    method: 'zigzag',
    params: { deviationPct: 0.05, candleTimeframe: '1h' }
  },
} as const;

// Positive magnitudes - max allowed drawdown
const MAX_DRAWDOWN = {
  '15m': 0.004,   // 0.4%
  '1h':  0.01,    // 1%
  '24h': 0.025,   // 2.5%
  '7d':  0.06,    // 6%
} as const;
```

### Scoring

```typescript
const label = groundTruth.isValid ? 1 : 0;
const loss = logLoss(prediction, label);
```

---

## 3. Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        pnpm benchmark                                │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Load models.json (56 vision models)                                │
│  Initialize: activeModels = all, eliminatedModels = []              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   Phase 0               Phase 1                 Phase 2 → Phase 3
   (sanity)         (horizon competence)      (stability)  (ranking)
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Each phase runs N rounds on same chart images:                     │
│  1. Fetch chart image + orderbook from Replay Lab                   │
│  2. All active models predict: {bottom-15m, bottom-1h, ...}         │
│  3. Wait for horizons to resolve                                    │
│  4. Fetch local_extrema annotations (with availableAt filter)       │
│  5. Score: log loss + drawdown validation                           │
│  6. Apply phase-specific elimination rules                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Phase Elimination Criteria

### Phase 0: Sanity Filter

**Goal:** Kill broken, degenerate, or trivially wrong models.

**Rounds:** 6-12

**Metrics:**
- `meanLogLoss` per horizon
- `extremeErrorRate` per horizon (confident wrong: p > 0.8 when label = 0)
- `degeneratePattern` (always > 0.9 or always < 0.1)

**Elimination:**
```typescript
const RANDOM_BASELINE = 0.693;  // ln(2)

eliminate if:
  - meanLogLoss > RANDOM_BASELINE * 1.1 on 2+ horizons
  - degeneratePattern = true
  - extremeErrorRate > 0.2 on any horizon
```

**Expected:** 56 → 28-40 models

---

### Phase 1: Horizon Competence Filter

**Goal:** Keep specialists, eliminate models that fail across the board.

**Rounds:** 12-24

**Metrics:**
- `percentileRank` per horizon (0-100, relative to Phase 0 survivors)

**Elimination:**
```typescript
eliminate if:
  - percentileRank < 25 on 2+ horizons (bottom quartile)
  - no horizon has percentileRank >= 75 (no strength)
```

**Expected:** ~35 → 20-25 models

---

### Phase 2: Stability and Regret Filter

**Goal:** Find consistent models, not lucky ones.

**Rounds:** 24-48

**Metrics:**
- `rollingLogLoss` per horizon (per-round values)
- `bestWindow` per horizon (best 6-round average)
- `worstWindow` per horizon (worst 6-round average)
- `stability` per horizon (variance of rolling performance)
- `regret` per horizon (worstWindow / median of all worstWindows)
- `meanTimeToPivotRatio` per horizon (stored for Phase 3)

**Elimination:**
```typescript
eliminate if:
  - regret > 1.5 on 2+ horizons
  - stability > 2x median on 3+ horizons
```

**Expected:** ~22 → 10-12 models

---

### Phase 3: Arena Fitness Ranking

**Goal:** Select final arena competitors. No elimination.

**Composite Score:**
```typescript
// Winsorize to 5th-95th percentile before averaging
// Normalize relative to Phase 2 survivor cohort

composite =
  0.40 * (avgPercentileRank / 100) +
  0.30 * (1 - normalize(avgBestWindow)) +
  0.20 * (1 - normalize(avgStability)) +
  0.10 * (1 - avgTimeToPivotRatio);  // Early bonus

// Select top 8
arenaCompetitors = sortByComposite(survivors).slice(0, 8);
```

**Weights rationale:**
- 40% percentile rank: Anchors in relative performance
- 30% best window: Preserves high-ceiling agents
- 20% stability: Protects from luck-driven volatility
- 10% early detection: Rewards insight without rewarding recklessness

---

## 5. Implementation Files

| File | Purpose |
|------|---------|
| `src/bottom-caller.ts` | Agent definition with vision prompt |
| `src/matrix.ts` | Load models.json dynamically |
| `src/ground-truth/bottom-checker.ts` | Resolve labels via local_extrema + drawdown |
| `src/replay-lab/annotations.ts` | Fetch local_extrema with availableAt filter |
| `src/scorers/phase-scorers.ts` | Per-phase scoring logic |
| `src/selection/elimination.ts` | Phase 0-2 elimination rules |
| `src/selection/ranking.ts` | Phase 3 composite ranking |
| `src/benchmark.ts` | Orchestrate phases, run models |
| `src/table.ts` | Output formatting |

---

## 6. Key Invariants

1. **Same inputs for all models** - Same chart image, same moment, same ground truth
2. **No lookahead** - `availableAt` filter on annotations
3. **Structure over direction** - Scoring validates pivots, not price drift
4. **Drawdown as risk gate** - Bounded downside required for validity
5. **Specialists preserved** - Multi-axis filtering, not single-score elimination
6. **Early phases filter pathology, late phases filter skill**

---

## 7. What This Is Not

- Not predicting exact pivot candles
- Not rewarding trend following
- Not punishing early correct calls
- Not a single-score tournament
- Not production trading signals

This is a **selection protocol** for maintaining a high-quality frontier of interesting arena competitors.
