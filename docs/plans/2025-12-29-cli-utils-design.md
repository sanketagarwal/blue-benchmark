# CLI Utils Package Design

**Date:** 2025-12-29
**Status:** Design

## Overview

Shared CLI utilities for benchmark verbose mode across agents 000-004.

## Dependencies

- `ora` - Spinners
- `chalk` - Colored output

## API

```typescript
// packages/cli-utils/src/index.ts

export interface BenchmarkLogger {
  verbose: boolean;

  // Spinners
  startSpinner(text: string): void;
  updateSpinner(text: string): void;
  succeedSpinner(text?: string): void;
  failSpinner(text?: string): void;

  // Logging (only outputs if verbose)
  log(message: string): void;
  logPredictions(predictions: Record<string, number>): void;
  logGroundTruth(actuals: Record<string, boolean>): void;
  logScores(scores: { brier: number; logLoss: number; accuracy: number }): void;

  // Always outputs
  header(title: string): void;
  summary(data: Record<string, string | number>): void;
}

export function createBenchmarkLogger(verbose?: boolean): BenchmarkLogger;
```

## Usage in Benchmarks

```typescript
import { createBenchmarkLogger } from '@nullagent/cli-utils';

const logger = createBenchmarkLogger(process.argv.includes('--verbose'));

logger.header('agent_004 Benchmark');

for (let round = 1; round <= BENCHMARK_ROUNDS; round++) {
  logger.startSpinner(`Round ${round}: Fetching market data...`);
  const orderbook = await getOrderbookSnapshot(...);

  logger.updateSpinner(`Round ${round}: Calling LLM...`);
  const result = await runRound(marketMaker);

  logger.succeedSpinner(`Round ${round}: Complete`);

  logger.logPredictions(result.output.predictions);
  logger.logGroundTruth(groundTruth);
  logger.logScores({ brier, logLoss, accuracy });
}

logger.summary({ 'Average Brier': avgBrier, ... });
```

## Output Examples

**Normal mode:**
```
agent_004 Benchmark
===================
✓ Round 1: Complete (Brier=0.234)
✓ Round 2: Complete (Brier=0.187)
✓ Round 3: Complete (Brier=0.201)

Results: Avg Brier=0.207, Accuracy=73.3%
```

**Verbose mode:**
```
agent_004 Benchmark
===================
Round 1/3
─────────
Predictions:
  bid-fill-1m:  0.35
  bid-fill-5m:  0.52
  bid-fill-15m: 0.71
  ask-fill-1m:  0.28
  ask-fill-5m:  0.45
  ask-fill-15m: 0.63

Ground Truth:
  bid-fill-1m:  ✗ (predicted 0.35)
  bid-fill-5m:  ✓ (predicted 0.52)
  ...

Scores: Brier=0.234, LogLoss=0.891, Accuracy=66.7%
✓ Round 1: Complete

[... rounds 2-3 ...]

Results: Avg Brier=0.207, Accuracy=73.3%
```

## Implementation Plan

1. Create `packages/cli-utils` with package.json, tsconfig
2. Add `ora` and `chalk` dependencies
3. Implement `BenchmarkLogger` class
4. Add tests
5. Update each benchmark to use the logger
