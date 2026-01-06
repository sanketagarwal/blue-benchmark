# JSONL Audit Artifact Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a per-round JSONL audit file that writes even in quick mode, serving as the source of truth for benchmark debugging.

**Architecture:** New `audit-writer.ts` module in `diagnostics/` that appends one JSON line per model per horizon per round. The benchmark loop calls `writeAuditRecord()` after scoring each prediction. Unlike the markdown results file, this writes in all modes.

**Tech Stack:** Node.js fs (appendFileSync), TypeScript interfaces, existing scorers

---

### Task 1: Create audit-writer.ts with interface and stubs

**Files:**
- Create: `apps/agent_006/src/diagnostics/audit-writer.ts`

**Step 1: Create the file with interface and function stubs**

```typescript
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TimeframeId } from '../timeframe-config.js';

/**
 * Single audit record - one line per model per horizon per round
 */
export interface AuditRecord {
  /** ISO timestamp of prediction */
  timestamp: string;
  /** Round number (1-indexed) */
  roundNumber: number;
  /** Model identifier */
  modelId: string;
  /** Horizon being predicted */
  horizon: TimeframeId;

  // Prediction fields
  /** Probability of bottom (0-1) */
  prediction: number;
  /** Whether model predicts bottom occurred */
  hasBottomed: boolean;
  /** Model's confidence in prediction */
  confidence: number;
  /** Optional: candles back to claimed bottom */
  candlesBack?: number;

  // Ground truth fields
  /** Actual label (did bottom occur?) */
  label: boolean;
  /** ISO timestamp of first pivot (if any) */
  firstPivotAt?: string;
  /** Time-to-pivot ratio (0-1, if pivot exists) */
  timeToPivotRatio?: number;

  // Score fields
  /** Log loss for this prediction */
  logLoss: number;
  /** Brier score for this prediction */
  brier: number;

  // Baseline comparisons (computed from observed label)
  /** Log loss for random baseline (always 0.5 prediction) */
  baselineRandom: number;
  /** Log loss for trivial baseline (always predict label's base rate) */
  baselineTrivial: number;
  /** Model log loss minus random baseline (negative = better than random) */
  deltaVsRandom: number;
  /** Model log loss minus trivial baseline (negative = better than trivial) */
  deltaVsTrivial: number;
}

const AUDIT_FILE = 'benchmark-audit.jsonl';

/**
 * Initialize audit file (creates empty file, does NOT truncate existing)
 * Call at benchmark start to ensure file exists
 *
 * @param outputPath - Optional custom path (defaults to cwd/benchmark-audit.jsonl)
 */
export function initAuditFile(outputPath?: string): void {
  const filePath = outputPath ?? join(process.cwd(), AUDIT_FILE);
  // Create file if it doesn't exist, but don't truncate
  // We use 'a' flag to append, then immediately close
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from constant or parameter
  appendFileSync(filePath, '', 'utf8');
}

/**
 * Write a single audit record as a JSON line
 *
 * @param record - Audit record to write
 * @param outputPath - Optional custom path (defaults to cwd/benchmark-audit.jsonl)
 */
export function writeAuditRecord(record: AuditRecord, outputPath?: string): void {
  const filePath = outputPath ?? join(process.cwd(), AUDIT_FILE);
  const line = JSON.stringify(record) + '\n';
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from constant or parameter
  appendFileSync(filePath, line, 'utf8');
}

/**
 * Get the default audit file path
 *
 * @returns Absolute path to audit file
 */
export function getAuditFilePath(): string {
  return join(process.cwd(), AUDIT_FILE);
}
```

**Step 2: Verify file compiles**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm check-types --filter=agent_006`
Expected: No errors

---

### Task 2: Create audit-writer test file

**Files:**
- Create: `apps/agent_006/__tests__/audit-writer.test.ts`

**Step 1: Write tests for audit-writer**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  initAuditFile,
  writeAuditRecord,
  getAuditFilePath,
} from '../src/diagnostics/audit-writer.js';

import type { AuditRecord } from '../src/diagnostics/audit-writer.js';

function createTestRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    timestamp: '2024-01-15T10:00:00.000Z',
    roundNumber: 1,
    modelId: 'gpt-4-turbo',
    horizon: '15m',
    prediction: 0.75,
    hasBottomed: true,
    confidence: 0.75,
    candlesBack: 2,
    label: true,
    firstPivotAt: '2024-01-15T10:05:00.000Z',
    timeToPivotRatio: 0.33,
    logLoss: 0.287,
    brier: 0.0625,
    baselineRandom: 0.693,
    baselineTrivial: 0.693,
    deltaVsRandom: -0.406,
    deltaVsTrivial: -0.406,
    ...overrides,
  };
}

describe('audit-writer', () => {
  const testDir = tmpdir();
  let testFilePath: string;

  beforeEach(() => {
    testFilePath = join(testDir, `audit-test-${Date.now()}.jsonl`);
  });

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  describe('initAuditFile', () => {
    it('should create file if it does not exist', () => {
      expect(existsSync(testFilePath)).toBe(false);

      initAuditFile(testFilePath);

      expect(existsSync(testFilePath)).toBe(true);
      expect(readFileSync(testFilePath, 'utf8')).toBe('');
    });

    it('should not truncate existing file', () => {
      // Write some content first
      writeAuditRecord(createTestRecord(), testFilePath);
      const beforeContent = readFileSync(testFilePath, 'utf8');

      // Init should not truncate
      initAuditFile(testFilePath);

      const afterContent = readFileSync(testFilePath, 'utf8');
      expect(afterContent).toBe(beforeContent);
    });
  });

  describe('writeAuditRecord', () => {
    it('should write valid JSON line', () => {
      const record = createTestRecord();

      writeAuditRecord(record, testFilePath);

      const content = readFileSync(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0] as string);
      expect(parsed.timestamp).toBe('2024-01-15T10:00:00.000Z');
      expect(parsed.roundNumber).toBe(1);
      expect(parsed.modelId).toBe('gpt-4-turbo');
      expect(parsed.horizon).toBe('15m');
      expect(parsed.prediction).toBe(0.75);
    });

    it('should append multiple records', () => {
      writeAuditRecord(createTestRecord({ roundNumber: 1 }), testFilePath);
      writeAuditRecord(createTestRecord({ roundNumber: 2 }), testFilePath);
      writeAuditRecord(createTestRecord({ roundNumber: 3 }), testFilePath);

      const content = readFileSync(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      expect(JSON.parse(lines[0] as string).roundNumber).toBe(1);
      expect(JSON.parse(lines[1] as string).roundNumber).toBe(2);
      expect(JSON.parse(lines[2] as string).roundNumber).toBe(3);
    });

    it('should handle optional fields correctly', () => {
      const record = createTestRecord({
        candlesBack: undefined,
        firstPivotAt: undefined,
        timeToPivotRatio: undefined,
      });

      writeAuditRecord(record, testFilePath);

      const content = readFileSync(testFilePath, 'utf8');
      const parsed = JSON.parse(content.trim());

      expect(parsed.candlesBack).toBeUndefined();
      expect(parsed.firstPivotAt).toBeUndefined();
      expect(parsed.timeToPivotRatio).toBeUndefined();
    });

    it('should write all four horizons for a round', () => {
      const horizons = ['15m', '1h', '4h', '24h'] as const;

      for (const horizon of horizons) {
        writeAuditRecord(
          createTestRecord({ roundNumber: 1, horizon }),
          testFilePath
        );
      }

      const content = readFileSync(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(4);

      const parsedHorizons = lines.map(
        (line) => JSON.parse(line).horizon as string
      );
      expect(parsedHorizons).toEqual(['15m', '1h', '4h', '24h']);
    });

    it('should include baseline deltas', () => {
      const record = createTestRecord({
        logLoss: 0.5,
        baselineRandom: 0.693,
        baselineTrivial: 0.6,
        deltaVsRandom: -0.193,
        deltaVsTrivial: -0.1,
      });

      writeAuditRecord(record, testFilePath);

      const content = readFileSync(testFilePath, 'utf8');
      const parsed = JSON.parse(content.trim());

      expect(parsed.baselineRandom).toBe(0.693);
      expect(parsed.baselineTrivial).toBe(0.6);
      expect(parsed.deltaVsRandom).toBe(-0.193);
      expect(parsed.deltaVsTrivial).toBe(-0.1);
    });
  });

  describe('getAuditFilePath', () => {
    it('should return path in current working directory', () => {
      const path = getAuditFilePath();

      expect(path).toContain('benchmark-audit.jsonl');
      expect(path.startsWith('/')).toBe(true);
    });
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm test:unit --filter=agent_006 -- audit-writer`
Expected: All tests pass

---

### Task 3: Add helper to build AuditRecord from benchmark data

**Files:**
- Modify: `apps/agent_006/src/diagnostics/audit-writer.ts`

**Step 1: Add buildAuditRecord helper function**

Add after the existing functions:

```typescript
import { logLoss } from '../scorers/log-loss-scorer.js';
import { brierScore } from '../scorers/brier-scorer.js';
import { RANDOM_BASELINE } from '../scorers/phase-0-scorer.js';

/**
 * Parameters for building an audit record
 */
export interface BuildAuditRecordParams {
  timestamp: Date;
  roundNumber: number;
  modelId: string;
  horizon: TimeframeId;
  /** Model's prediction object for this horizon */
  prediction: {
    hasBottomed: boolean;
    confidence: number;
    candlesBack?: number;
  };
  /** Ground truth for this horizon */
  groundTruth: {
    label: boolean;
    firstPivotAt?: Date;
    timeToPivotRatio?: number;
  };
  /** Base rate of positive labels observed so far (for trivial baseline) */
  labelBaseRate: number;
}

/**
 * Convert prediction to probability of bottom occurring
 *
 * @param pred - Prediction object
 * @returns Probability (0-1)
 */
function predictionToProbability(pred: { hasBottomed: boolean; confidence: number }): number {
  return pred.hasBottomed ? pred.confidence : (1 - pred.confidence);
}

/**
 * Build an audit record from benchmark data
 *
 * @param params - Parameters containing prediction and ground truth
 * @returns Complete audit record ready for writing
 */
export function buildAuditRecord(params: BuildAuditRecordParams): AuditRecord {
  const { timestamp, roundNumber, modelId, horizon, prediction, groundTruth, labelBaseRate } = params;

  const prob = predictionToProbability(prediction);
  const ll = logLoss(prob, groundTruth.label);
  const brier = brierScore(prob, groundTruth.label);

  // Baselines
  const baselineRandom = RANDOM_BASELINE; // log(2) = 0.693
  const baselineTrivial = logLoss(labelBaseRate, groundTruth.label);

  return {
    timestamp: timestamp.toISOString(),
    roundNumber,
    modelId,
    horizon,
    prediction: prob,
    hasBottomed: prediction.hasBottomed,
    confidence: prediction.confidence,
    candlesBack: prediction.candlesBack,
    label: groundTruth.label,
    firstPivotAt: groundTruth.firstPivotAt?.toISOString(),
    timeToPivotRatio: groundTruth.timeToPivotRatio,
    logLoss: ll,
    brier,
    baselineRandom,
    baselineTrivial,
    deltaVsRandom: ll - baselineRandom,
    deltaVsTrivial: ll - baselineTrivial,
  };
}
```

**Step 2: Verify file compiles**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm check-types --filter=agent_006`
Expected: No errors

---

### Task 4: Add tests for buildAuditRecord

**Files:**
- Modify: `apps/agent_006/__tests__/audit-writer.test.ts`

**Step 1: Add tests for buildAuditRecord**

Add to the test file after existing describe blocks:

```typescript
import { buildAuditRecord } from '../src/diagnostics/audit-writer.js';

import type { BuildAuditRecordParams } from '../src/diagnostics/audit-writer.js';

describe('buildAuditRecord', () => {
  const baseParams: BuildAuditRecordParams = {
    timestamp: new Date('2024-01-15T10:00:00Z'),
    roundNumber: 5,
    modelId: 'claude-3-opus',
    horizon: '1h',
    prediction: {
      hasBottomed: true,
      confidence: 0.8,
      candlesBack: 2,
    },
    groundTruth: {
      label: true,
      firstPivotAt: new Date('2024-01-15T10:30:00Z'),
      timeToPivotRatio: 0.5,
    },
    labelBaseRate: 0.4,
  };

  it('should build record with correct metadata', () => {
    const record = buildAuditRecord(baseParams);

    expect(record.timestamp).toBe('2024-01-15T10:00:00.000Z');
    expect(record.roundNumber).toBe(5);
    expect(record.modelId).toBe('claude-3-opus');
    expect(record.horizon).toBe('1h');
  });

  it('should convert prediction to probability correctly when hasBottomed is true', () => {
    const record = buildAuditRecord(baseParams);

    // hasBottomed=true, confidence=0.8 => probability = 0.8
    expect(record.prediction).toBe(0.8);
    expect(record.hasBottomed).toBe(true);
    expect(record.confidence).toBe(0.8);
  });

  it('should convert prediction to probability correctly when hasBottomed is false', () => {
    const params: BuildAuditRecordParams = {
      ...baseParams,
      prediction: {
        hasBottomed: false,
        confidence: 0.7,
        candlesBack: undefined,
      },
    };

    const record = buildAuditRecord(params);

    // hasBottomed=false, confidence=0.7 => probability = 1 - 0.7 = 0.3
    expect(record.prediction).toBe(0.3);
    expect(record.hasBottomed).toBe(false);
    expect(record.confidence).toBe(0.7);
  });

  it('should include ground truth fields', () => {
    const record = buildAuditRecord(baseParams);

    expect(record.label).toBe(true);
    expect(record.firstPivotAt).toBe('2024-01-15T10:30:00.000Z');
    expect(record.timeToPivotRatio).toBe(0.5);
  });

  it('should handle undefined ground truth fields', () => {
    const params: BuildAuditRecordParams = {
      ...baseParams,
      groundTruth: {
        label: false,
        firstPivotAt: undefined,
        timeToPivotRatio: undefined,
      },
    };

    const record = buildAuditRecord(params);

    expect(record.label).toBe(false);
    expect(record.firstPivotAt).toBeUndefined();
    expect(record.timeToPivotRatio).toBeUndefined();
  });

  it('should compute log loss correctly', () => {
    // p=0.8, label=true => LL = -log(0.8) = 0.223
    const record = buildAuditRecord(baseParams);

    expect(record.logLoss).toBeCloseTo(0.223, 2);
  });

  it('should compute brier score correctly', () => {
    // p=0.8, label=true => Brier = (0.8 - 1)^2 = 0.04
    const record = buildAuditRecord(baseParams);

    expect(record.brier).toBeCloseTo(0.04, 3);
  });

  it('should compute baseline comparisons', () => {
    const record = buildAuditRecord(baseParams);

    // Random baseline is log(2) = 0.693
    expect(record.baselineRandom).toBeCloseTo(0.693, 3);

    // Trivial baseline: logLoss(0.4, true) = -log(0.4) = 0.916
    expect(record.baselineTrivial).toBeCloseTo(0.916, 2);

    // Delta vs random: 0.223 - 0.693 = -0.470 (better than random)
    expect(record.deltaVsRandom).toBeCloseTo(-0.470, 2);

    // Delta vs trivial: 0.223 - 0.916 = -0.693 (better than trivial)
    expect(record.deltaVsTrivial).toBeCloseTo(-0.693, 2);
  });

  it('should handle high confidence wrong prediction', () => {
    const params: BuildAuditRecordParams = {
      ...baseParams,
      prediction: {
        hasBottomed: true,
        confidence: 0.95,
        candlesBack: 1,
      },
      groundTruth: {
        label: false,
        firstPivotAt: undefined,
        timeToPivotRatio: undefined,
      },
    };

    const record = buildAuditRecord(params);

    // p=0.95, label=false => LL = -log(1-0.95) = -log(0.05) = 2.996
    expect(record.logLoss).toBeCloseTo(2.996, 2);

    // Brier = (0.95 - 0)^2 = 0.9025
    expect(record.brier).toBeCloseTo(0.9025, 3);

    // Should be worse than random
    expect(record.deltaVsRandom).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm test:unit --filter=agent_006 -- audit-writer`
Expected: All tests pass

---

### Task 5: Integrate audit writer into benchmark.ts

**Files:**
- Modify: `apps/agent_006/src/benchmark.ts`

**Step 1: Add imports at top of file**

Add after existing imports:

```typescript
import {
  initAuditFile,
  writeAuditRecord,
  buildAuditRecord,
} from './diagnostics/audit-writer.js';
```

**Step 2: Initialize audit file at benchmark start**

In the `main()` function, after `logger.header('agent_006 Bitcoin Bottom Arena Benchmark');` add:

```typescript
  // Initialize audit file (writes even in quick mode)
  initAuditFile();
```

**Step 3: Track label base rates for trivial baseline**

After `const models = new Map<string, ModelState>();` initialization, add:

```typescript
  // Track label counts for trivial baseline calculation
  const labelCounts: Record<TimeframeId, { total: number; positive: number }> = {
    '15m': { total: 0, positive: 0 },
    '1h': { total: 0, positive: 0 },
    '4h': { total: 0, positive: 0 },
    '24h': { total: 0, positive: 0 },
  };
```

**Step 4: Modify runBenchmarkRound to write audit records**

In the `runBenchmarkRound` function, after `const { labels, timeToPivotRatios, secondaryLabels: _secondaryLabels } = await resolveAllHorizonsGroundTruth(symbolId, currentTime);`, add:

```typescript
  // Update label counts for base rate calculation
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    labelCounts[horizon].total++;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    if (labels[horizon]) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      labelCounts[horizon].positive++;
    }
  }
```

Then, inside the model loop after `recordModelScore(state, roundScore, labels, timeToPivotRatios, roundNumber);`, add:

```typescript
      // Write audit records for each horizon (writes even in quick mode)
      for (const horizon of HORIZONS) {
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        const counts = labelCounts[horizon];
        const labelBaseRate = counts.total > 0 ? counts.positive / counts.total : 0.5;

        const auditRecord = buildAuditRecord({
          timestamp: currentTime,
          roundNumber,
          modelId: state.modelId,
          horizon,
          // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
          prediction: output.predictions[horizon],
          groundTruth: {
            // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
            label: labels[horizon],
            firstPivotAt: undefined, // We don't have firstPivotAt in this scope
            // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
            timeToPivotRatio: timeToPivotRatios[horizon],
          },
          labelBaseRate,
        });
        writeAuditRecord(auditRecord);
      }
```

**Step 5: Verify file compiles**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm check-types --filter=agent_006`
Expected: No errors

---

### Task 6: Pass labelCounts to runBenchmarkRound

**Files:**
- Modify: `apps/agent_006/src/benchmark.ts`

**Step 1: Update runBenchmarkRound function signature**

Change the function signature to accept labelCounts:

```typescript
async function runBenchmarkRound(
  models: Map<string, ModelState>,
  roundNumber: number,
  totalRounds: number,
  symbolId: string,
  currentTime: Date,
  currentPhase: number,
  startTime: string,
  labelCounts: Record<TimeframeId, { total: number; positive: number }>
): Promise<void> {
```

**Step 2: Move labelCounts update into runBenchmarkRound**

The label counting and audit writing is already in runBenchmarkRound from Task 5.

**Step 3: Update all call sites**

Update all calls to runBenchmarkRound to pass labelCounts:

In Phase 0 loop:
```typescript
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 0, startTime, labelCounts);
```

In Phase 1 loop:
```typescript
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 1, startTime, labelCounts);
```

In Phase 2 loop:
```typescript
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 2, startTime, labelCounts);
```

**Step 4: Verify file compiles**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm check-types --filter=agent_006`
Expected: No errors

---

### Task 7: Run full QA

**Step 1: Run lint**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm lint --filter=agent_006`
Expected: No errors

**Step 2: Run type check**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm check-types --filter=agent_006`
Expected: No errors

**Step 3: Run tests with coverage**

Run: `cd /Users/andrewhill/Coding/nullagent && pnpm test:coverage --filter=agent_006`
Expected: All tests pass, coverage thresholds met

---

### Task 8: Commit

**Step 1: Stage and commit**

```bash
cd /Users/andrewhill/Coding/nullagent
git add -A
git commit -m "$(cat <<'EOF'
feat(agent_006): add JSONL audit artifact for all benchmark runs

Add per-round audit trail that writes even in quick mode:
- New audit-writer.ts with AuditRecord interface
- Writes one JSON line per model per horizon per round
- Includes prediction, ground truth, scores, and baseline deltas
- Append-only to benchmark-audit.jsonl in app directory
- Audit artifact is the source of truth; CLI output is just a view
EOF
)"
```

Expected: Commit succeeds, pre-commit hooks pass

---

## Summary

This plan adds a JSONL audit artifact that:
1. Writes one line per model per horizon per round
2. Writes even in quick mode (unlike the markdown results file)
3. Includes all scoring data plus baseline comparisons
4. Is append-only (runs accumulate in the same file)
5. Serves as the source of truth for debugging
