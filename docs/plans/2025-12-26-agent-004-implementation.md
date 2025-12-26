# agent_004 Model Matrix Benchmark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a CLI benchmark tool that runs the same forecasting scenario across multiple LLM models and compares their performance.

**Architecture:** Copy agent_003 as base, replace API routes with CLI entry point. Each model uses its model ID as agentId for isolated message history. Round-by-round execution fetches data once, runs all models sequentially, then advances clock.

**Tech Stack:** tsx for CLI, same dependencies as agent_003 (Next.js removed), Zod for schemas, @nullagent/agent-core for LLM calls.

---

## Task 1: Create agent_004 Directory Structure

**Files:**
- Create: `apps/agent_004/package.json`
- Create: `apps/agent_004/tsconfig.json`

**Step 1: Create package.json**

```json
{
  "name": "agent_004",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "benchmark": "tsx src/benchmark.ts",
    "lint": "eslint src --ext .ts",
    "check-types": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@nullagent/agent-core": "workspace:*",
    "@nullagent/database": "workspace:*",
    "@nullagent/scorers": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@nullagent/eslint-config": "workspace:*",
    "@nullagent/typescript-config": "workspace:*",
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "eslint": "^9.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.9.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "@nullagent/typescript-config/library.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Copy .env.local from agent_003**

Run: `cp apps/agent_003/.env.local apps/agent_004/.env.local`

**Step 4: Commit**

```bash
git add apps/agent_004/package.json apps/agent_004/tsconfig.json apps/agent_004/.env.local
git commit -m "feat(agent_004): add package.json and tsconfig.json"
```

---

## Task 2: Create Matrix Configuration

**Files:**
- Create: `apps/agent_004/src/matrix.ts`

**Step 1: Write matrix.ts**

```typescript
export const MODEL_MATRIX = [
  'xai/grok-4-fast-reasoning',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5-nano',
] as const;

export type ModelId = (typeof MODEL_MATRIX)[number];

export const BENCHMARK_ROUNDS = 3;
```

**Step 2: Commit**

```bash
git add apps/agent_004/src/matrix.ts
git commit -m "feat(agent_004): add model matrix configuration"
```

---

## Task 3: Copy and Adapt replay-lab Clients

**Files:**
- Create: `apps/agent_004/src/replay-lab/client.ts`
- Create: `apps/agent_004/src/replay-lab/charts.ts`
- Create: `apps/agent_004/src/replay-lab/orderbook.ts`
- Create: `apps/agent_004/src/replay-lab/annotations.ts`

**Step 1: Copy client.ts (unchanged)**

```typescript
export interface ReplayLabConfig {
  apiKey: string;
  baseUrl: string;
}

export function getConfig(): ReplayLabConfig {
  const apiKey = process.env['REPLAY_LAB_API_KEY'];
  const baseUrl = process.env['REPLAY_LAB_BASE_URL'];

  if (apiKey === undefined || apiKey === '') {
    throw new Error('REPLAY_LAB_API_KEY environment variable is required');
  }

  if (baseUrl === undefined || baseUrl === '') {
    throw new Error('REPLAY_LAB_BASE_URL environment variable is required');
  }

  return { apiKey, baseUrl };
}

export async function replayLabFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;

  const headers: HeadersInit = {
    'x-api-key': config.apiKey,
  };

  if (options?.headers !== undefined) {
    Object.assign(headers, options.headers);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Replay Lab API error (${String(response.status)}): ${body}`);
  }

  return await (response.json() as Promise<T>);
}
```

**Step 2: Copy charts.ts (unchanged)**

Copy exact content from `apps/agent_003/src/replay-lab/charts.ts`

**Step 3: Copy orderbook.ts (unchanged)**

Copy exact content from `apps/agent_003/src/replay-lab/orderbook.ts`

**Step 4: Copy annotations.ts (unchanged)**

Copy exact content from `apps/agent_003/src/replay-lab/annotations.ts`

**Step 5: Commit**

```bash
git add apps/agent_004/src/replay-lab/
git commit -m "feat(agent_004): add replay-lab API clients"
```

---

## Task 4: Copy Clock State Module

**Files:**
- Create: `apps/agent_004/src/clock-state.ts`

**Step 1: Copy clock-state.ts (unchanged)**

Copy exact content from `apps/agent_003/src/clock-state.ts`

**Step 2: Commit**

```bash
git add apps/agent_004/src/clock-state.ts
git commit -m "feat(agent_004): add clock state management"
```

---

## Task 5: Create Scorers (Without Monotonicity)

**Files:**
- Create: `apps/agent_004/src/scorers/types.ts`
- Create: `apps/agent_004/src/scorers/brier-scorer.ts`
- Create: `apps/agent_004/src/scorers/log-loss-scorer.ts`
- Create: `apps/agent_004/src/scorers/aggregate-scorer.ts`

**Step 1: Write types.ts (no monotonicity)**

```typescript
import type { ScorerResult } from '@nullagent/scorers';

export type ContractId =
  | 'dump-simple-15m-1pct'
  | 'dump-simple-15m-3pct'
  | 'dump-simple-15m-5pct'
  | 'dump-simple-1h-0.5pct'
  | 'dump-simple-1h-1pct'
  | 'dump-vol-adjusted-15m-z2'
  | 'dump-vol-adjusted-1h-z2'
  | 'dump-drawdown-1pct'
  | 'dump-drawdown-3pct';

export interface ForecastScorerInput {
  predictions: Record<ContractId, number>;
  actuals: Record<ContractId, boolean>;
  predictionTime: Date;
  symbolId: string;
}

export interface ContractScore {
  contractId: ContractId;
  predicted: number;
  actual: boolean;
  brierScore: number;
  logLoss: number;
}

export interface ForecastScoreResult extends ScorerResult {
  score: number;
  aggregates: {
    meanBrierScore: number;
    meanLogLoss: number;
    accuracy: number;
    eventsOccurred: number;
  };
  perContract: ContractScore[];
}
```

**Step 2: Copy brier-scorer.ts (unchanged)**

Copy exact content from `apps/agent_003/src/scorers/brier-scorer.ts`

**Step 3: Copy log-loss-scorer.ts (unchanged)**

Copy exact content from `apps/agent_003/src/scorers/log-loss-scorer.ts`

**Step 4: Write aggregate-scorer.ts (no monotonicity)**

```typescript
import { defineScorer } from '@nullagent/scorers';

import { brierScore, meanBrierScore } from './brier-scorer.js';
import { logLoss, meanLogLoss } from './log-loss-scorer.js';

import type { ContractId, ForecastScorerInput, ForecastScoreResult, ContractScore } from './types.js';

export const CONTRACT_IDS: ContractId[] = [
  'dump-simple-15m-1pct',
  'dump-simple-15m-3pct',
  'dump-simple-15m-5pct',
  'dump-simple-1h-0.5pct',
  'dump-simple-1h-1pct',
  'dump-vol-adjusted-15m-z2',
  'dump-vol-adjusted-1h-z2',
  'dump-drawdown-1pct',
  'dump-drawdown-3pct',
];

function scorePerContract(
  predictions: Record<ContractId, number>,
  actuals: Record<ContractId, boolean>
): { perContract: ContractScore[]; predictionArray: number[]; actualArray: boolean[] } {
  const perContract: ContractScore[] = [];
  const predictionArray: number[] = [];
  const actualArray: boolean[] = [];

  for (const contractId of CONTRACT_IDS) {
    // eslint-disable-next-line security/detect-object-injection -- ContractId is a controlled enum type, not user input
    const predicted = predictions[contractId];
    // eslint-disable-next-line security/detect-object-injection -- ContractId is a controlled enum type, not user input
    const actual = actuals[contractId];

    if (typeof predicted !== 'number') {
      throw new TypeError(`Missing prediction for contract ${contractId}`);
    }
    if (typeof actual !== 'boolean') {
      throw new TypeError(`Missing actual for contract ${contractId}`);
    }

    predictionArray.push(predicted);
    actualArray.push(actual);

    perContract.push({
      contractId,
      predicted,
      actual,
      brierScore: brierScore(predicted, actual),
      logLoss: logLoss(predicted, actual),
    });
  }

  return { perContract, predictionArray, actualArray };
}

export const forecastScorer = defineScorer<ForecastScorerInput, ForecastScoreResult>({
  id: 'forecast_scorer',
  name: 'Forecast Scorer',
  score(input): ForecastScoreResult {
    const { predictions, actuals } = input;

    const { perContract, predictionArray, actualArray } = scorePerContract(predictions, actuals);

    const meanBrier = meanBrierScore(predictionArray, actualArray);
    const meanLL = meanLogLoss(predictionArray, actualArray);

    let correctPredictions = 0;
    for (const contractScore of perContract) {
      const predictedOutcome = contractScore.predicted >= 0.5;
      if (predictedOutcome === contractScore.actual) {
        correctPredictions += 1;
      }
    }
    const accuracy = correctPredictions / CONTRACT_IDS.length;

    let eventsOccurred = 0;
    for (const contractScore of perContract) {
      if (contractScore.actual) {
        eventsOccurred += 1;
      }
    }

    return {
      score: meanBrier,
      aggregates: {
        meanBrierScore: meanBrier,
        meanLogLoss: meanLL,
        accuracy,
        eventsOccurred,
      },
      perContract,
    };
  },
});
```

**Step 5: Commit**

```bash
git add apps/agent_004/src/scorers/
git commit -m "feat(agent_004): add scorers without monotonicity"
```

---

## Task 6: Create Dynamic Forecaster Factory

**Files:**
- Create: `apps/agent_004/src/forecaster.ts`

**Step 1: Write forecaster.ts with factory function**

The key difference from agent_003: the forecaster factory takes a modelId and uses it as both the agent ID (for isolated history) and sets MODEL_ID env var.

```typescript
import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

import type { ModelId } from './matrix.js';

export interface ForecastContext {
  chart4h5mUrl: string;
  chart24h15mUrl: string;
  orderbookData: string;
  currentTime: string;
  symbolId: string;
}

let currentForecastContext: ForecastContext | undefined;

export function setForecastContext(context: ForecastContext): void {
  currentForecastContext = context;
}

export function clearForecastContext(): void {
  currentForecastContext = undefined;
}

const PredictionSchema = z.object({
  'dump-simple-15m-1pct': z.number().min(0).max(1),
  'dump-simple-15m-3pct': z.number().min(0).max(1),
  'dump-simple-15m-5pct': z.number().min(0).max(1),
  'dump-simple-1h-0.5pct': z.number().min(0).max(1),
  'dump-simple-1h-1pct': z.number().min(0).max(1),
  'dump-vol-adjusted-15m-z2': z.number().min(0).max(1),
  'dump-vol-adjusted-1h-z2': z.number().min(0).max(1),
  'dump-drawdown-1pct': z.number().min(0).max(1),
  'dump-drawdown-3pct': z.number().min(0).max(1),
});

const OutputSchema = z.object({
  reasoning: z.string().describe('Brief explanation of your analysis'),
  predictions: PredictionSchema,
});

export type ForecastOutput = z.infer<typeof OutputSchema>;

/**
 * Create a forecaster agent for a specific model.
 * Uses the modelId as the agentId for isolated message history.
 */
export function createForecaster(modelId: ModelId) {
  return defineAgent({
    // Use model ID as agent ID for isolated history per model
    id: modelId,

    outputSchema: OutputSchema,

    compactionTrigger: {
      type: 'custom',
      shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 10 === 0,
    },

    buildRoundPrompt: (context) => {
      if (currentForecastContext === undefined) {
        throw new Error('Forecast context not set. Call setForecastContext() before runRound().');
      }

      const { chart4h5mUrl, chart24h15mUrl, orderbookData, currentTime, symbolId } = currentForecastContext;

      const compactionSection =
        context.compactionSummary !== undefined && context.compactionSummary !== ''
          ? `\n\nYour past learnings:\n${context.compactionSummary}\n`
          : '';

      return `Simulate a cryptocurrency price movement forecaster for ${symbolId}.

Current Time: ${currentTime}
Orderbook: ${orderbookData}

Chart Analysis (IMPORTANT: Analyze these chart images for technical signals):
- 4-Hour Chart (5m candles): ${chart4h5mUrl}
- 24-Hour Chart (15m candles): ${chart24h15mUrl}

Both charts include: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, SuperTrend(10,3), RSI(14), MACD(12,26,9), Stochastic RSI(14,3,3), ADX(14), CMF(20), Choppiness(14), Volume, and Volume Ratio(20).

Analyze the charts and orderbook data to forecast the probability of the following price movements occurring within the NEXT HOUR:

**Simple Dump Contracts (absolute price change):**
- dump-simple-15m-1pct: Price drops ≥1% within next 15 minutes
- dump-simple-15m-3pct: Price drops ≥3% within next 15 minutes
- dump-simple-15m-5pct: Price drops ≥5% within next 15 minutes
- dump-simple-1h-0.5pct: Price drops ≥0.5% within next 1 hour
- dump-simple-1h-1pct: Price drops ≥1% within next 1 hour

**Volatility-Adjusted Contracts (z-score based):**
- dump-vol-adjusted-15m-z2: Price drops ≥2 standard deviations within next 15 minutes
- dump-vol-adjusted-1h-z2: Price drops ≥2 standard deviations within next 1 hour

**Drawdown Contracts (from recent peak):**
- dump-drawdown-1pct: Price falls ≥1% from highest point in next hour
- dump-drawdown-3pct: Price falls ≥3% from highest point in next hour

${compactionSection}
Respond with a JSON object containing:
- "reasoning": brief explanation of your analysis
- "predictions": an object with a probability (0.0 to 1.0) for each contract ID

Example:
{
  "reasoning": "Market showing bearish signals with declining volume...",
  "predictions": {
    "dump-simple-15m-1pct": 0.15,
    "dump-simple-15m-3pct": 0.05,
    ...
  }
}`;
    },

    buildCompactionPrompt: (history) => `
You've completed ${String(history.length)} rounds of cryptocurrency price forecasting.

Review your past predictions and the actual outcomes. Summarize:
- What patterns or indicators proved most reliable?
- What market conditions led to false positives/negatives?
- What strategies should you adjust going forward?

Keep it concise and actionable for future forecasting rounds.
`,
  });
}
```

**Step 2: Commit**

```bash
git add apps/agent_004/src/forecaster.ts
git commit -m "feat(agent_004): add forecaster factory with model-based agentId"
```

---

## Task 7: Create Results Tracking Types

**Files:**
- Create: `apps/agent_004/src/results.ts`

**Step 1: Write results.ts**

```typescript
import type { ModelId } from './matrix.js';
import type { ForecastScoreResult } from './scorers/types.js';

export interface RoundResult {
  roundNumber: number;
  score: ForecastScoreResult;
}

export interface ModelResults {
  modelId: ModelId;
  rounds: RoundResult[];
}

export interface BenchmarkResults {
  startTime: string;
  endTime: string;
  totalRounds: number;
  models: ModelResults[];
}

export interface ModelSummary {
  modelId: ModelId;
  meanBrier: number;
  meanLogLoss: number;
  meanAccuracy: number;
}

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

  for (const round of rounds) {
    totalBrier += round.score.aggregates.meanBrierScore;
    totalLogLoss += round.score.aggregates.meanLogLoss;
    totalAccuracy += round.score.aggregates.accuracy;
  }

  return {
    modelId,
    meanBrier: totalBrier / rounds.length,
    meanLogLoss: totalLogLoss / rounds.length,
    meanAccuracy: totalAccuracy / rounds.length,
  };
}

export function findWinner(summaries: ModelSummary[]): ModelSummary | undefined {
  if (summaries.length === 0) {
    return undefined;
  }

  let winner = summaries[0];
  if (winner === undefined) {
    return undefined;
  }

  for (const summary of summaries) {
    if (summary.meanBrier < winner.meanBrier) {
      winner = summary;
    }
  }

  return winner;
}
```

**Step 2: Commit**

```bash
git add apps/agent_004/src/results.ts
git commit -m "feat(agent_004): add results tracking and summary calculation"
```

---

## Task 8: Create Console Table Formatter

**Files:**
- Create: `apps/agent_004/src/table.ts`

**Step 1: Write table.ts**

```typescript
import type { ModelSummary } from './results.js';

const COL_WIDTH_MODEL = 33;
const COL_WIDTH_METRIC = 9;
const BORDER_CHAR = '─';
const CORNER_TL = '┌';
const CORNER_TR = '┐';
const CORNER_BL = '└';
const CORNER_BR = '┘';
const T_DOWN = '┬';
const T_UP = '┴';
const T_RIGHT = '├';
const T_LEFT = '┤';
const CROSS = '┼';
const VERTICAL = '│';

function padCenter(text: string, width: number): string {
  const padding = width - text.length;
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

function padLeft(text: string, width: number): string {
  return text.padStart(width);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDecimal(value: number): string {
  return value.toFixed(3);
}

export function printResultsTable(
  summaries: ModelSummary[],
  totalRounds: number,
  winner: ModelSummary | undefined
): void {
  const totalWidth = COL_WIDTH_MODEL + 1 + COL_WIDTH_METRIC * 3 + 4;

  // Title
  const title = `agent_004 Benchmark Results (${String(totalRounds)} rounds)`;
  const titleLine = VERTICAL + padCenter(title, totalWidth - 2) + VERTICAL;

  // Top border
  const topBorder =
    CORNER_TL +
    BORDER_CHAR.repeat(totalWidth - 2) +
    CORNER_TR;

  // Title separator
  const titleSep =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_LEFT;

  // Header
  const header =
    VERTICAL +
    padCenter('Model', COL_WIDTH_MODEL) +
    VERTICAL +
    padCenter('Brier', COL_WIDTH_METRIC) +
    VERTICAL +
    padCenter('LogLoss', COL_WIDTH_METRIC) +
    VERTICAL +
    padCenter('Accuracy', COL_WIDTH_METRIC) +
    VERTICAL;

  // Header separator
  const headerSep =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_LEFT;

  // Data rows
  const dataRows = summaries.map((s) =>
    VERTICAL +
    ' ' + s.modelId.padEnd(COL_WIDTH_MODEL - 1) +
    VERTICAL +
    padLeft(formatDecimal(s.meanBrier), COL_WIDTH_METRIC - 1) + ' ' +
    VERTICAL +
    padLeft(formatDecimal(s.meanLogLoss), COL_WIDTH_METRIC - 1) + ' ' +
    VERTICAL +
    padLeft(formatPercent(s.meanAccuracy), COL_WIDTH_METRIC - 1) + ' ' +
    VERTICAL
  );

  // Footer separator
  const footerSep =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_LEFT;

  // Winner line
  const winnerText = winner
    ? `Winner: ${winner.modelId} (lowest Brier score)`
    : 'No winner determined';
  const winnerLine = VERTICAL + ' ' + winnerText.padEnd(totalWidth - 3) + VERTICAL;

  // Bottom border
  const bottomBorder =
    CORNER_BL +
    BORDER_CHAR.repeat(totalWidth - 2) +
    CORNER_BR;

  // Print everything
  console.log(topBorder);
  console.log(titleLine);
  console.log(titleSep);
  console.log(header);
  console.log(headerSep);
  for (const row of dataRows) {
    console.log(row);
  }
  console.log(footerSep);
  console.log(winnerLine);
  console.log(bottomBorder);
}
```

**Step 2: Commit**

```bash
git add apps/agent_004/src/table.ts
git commit -m "feat(agent_004): add console table formatter"
```

---

## Task 9: Create Main Benchmark CLI

**Files:**
- Create: `apps/agent_004/src/benchmark.ts`

**Step 1: Write benchmark.ts**

```typescript
import { runRound } from '@nullagent/agent-core';

import {
  initializeClock,
  advanceClock,
  getPredictionWindow,
  resetClockState,
} from './clock-state.js';
import { createForecaster, setForecastContext, clearForecastContext } from './forecaster.js';
import { MODEL_MATRIX, BENCHMARK_ROUNDS } from './matrix.js';
import { getGroundTruthBatch } from './replay-lab/annotations.js';
import { getForecastingCharts } from './replay-lab/charts.js';
import { getOrderbookSnapshot, formatOrderbookForPrompt } from './replay-lab/orderbook.js';
import { calculateModelSummary, findWinner } from './results.js';
import { forecastScorer } from './scorers/aggregate-scorer.js';
import { printResultsTable } from './table.js';

import type { ModelId } from './matrix.js';
import type { ForecastOutput } from './forecaster.js';
import type { BenchmarkResults, ModelResults, RoundResult } from './results.js';
import type { ContractId } from './scorers/types.js';

async function runModelRound(
  modelId: ModelId,
  symbolId: string,
  roundNumber: number
): Promise<RoundResult> {
  // Set MODEL_ID env var for this model
  process.env['MODEL_ID'] = modelId;

  const forecaster = createForecaster(modelId);
  const result = await runRound(forecaster);
  const output = result.output as ForecastOutput;

  const predictionWindow = getPredictionWindow();
  const groundTruth = await getGroundTruthBatch(
    symbolId,
    predictionWindow.from,
    predictionWindow.to
  );

  const scoreResult = forecastScorer.score({
    predictions: output.predictions as Record<ContractId, number>,
    actuals: groundTruth as Record<ContractId, boolean>,
    predictionTime: predictionWindow.from,
    symbolId,
  });

  console.log(`  ${modelId}: Brier=${scoreResult.aggregates.meanBrierScore.toFixed(3)}, Accuracy=${(scoreResult.aggregates.accuracy * 100).toFixed(1)}%`);

  return {
    roundNumber,
    score: scoreResult,
  };
}

async function main(): Promise<void> {
  console.log('agent_004 Model Matrix Benchmark');
  console.log('================================\n');

  const startTime = new Date().toISOString();

  // Get symbol from env
  const symbolId = process.env['SYMBOL_ID'];
  if (symbolId === undefined || symbolId === '') {
    throw new Error('SYMBOL_ID environment variable is required');
  }

  // Initialize clock
  resetClockState();
  let clockState = initializeClock();

  console.log(`Symbol: ${symbolId}`);
  console.log(`Start Time: ${clockState.currentTime.toISOString()}`);
  console.log(`Models: ${MODEL_MATRIX.join(', ')}`);
  console.log(`Rounds: ${String(BENCHMARK_ROUNDS)}\n`);

  // Initialize results tracking
  const modelResults: Map<ModelId, RoundResult[]> = new Map();
  for (const modelId of MODEL_MATRIX) {
    modelResults.set(modelId, []);
  }

  // Run benchmark rounds
  for (let round = 1; round <= BENCHMARK_ROUNDS; round++) {
    console.log(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)} (${clockState.currentTime.toISOString()})`);

    // Fetch data once for this round
    const charts = await getForecastingCharts(symbolId, clockState.currentTime);
    const orderbook = await getOrderbookSnapshot(symbolId, clockState.currentTime);
    const orderbookData = formatOrderbookForPrompt(orderbook);

    // Set context for all models
    setForecastContext({
      chart4h5mUrl: charts.chart4h5m,
      chart24h15mUrl: charts.chart24h15m,
      orderbookData,
      currentTime: clockState.currentTime.toISOString(),
      symbolId,
    });

    // Run each model sequentially
    for (const modelId of MODEL_MATRIX) {
      const roundResult = await runModelRound(modelId, symbolId, round);
      modelResults.get(modelId)?.push(roundResult);
    }

    // Clear context
    clearForecastContext();

    // Advance clock for next round
    clockState = advanceClock();
    console.log('');
  }

  const endTime = new Date().toISOString();

  // Build results
  const results: BenchmarkResults = {
    startTime,
    endTime,
    totalRounds: BENCHMARK_ROUNDS,
    models: MODEL_MATRIX.map((modelId): ModelResults => ({
      modelId,
      rounds: modelResults.get(modelId) ?? [],
    })),
  };

  // Calculate summaries
  const summaries = results.models.map((m) => calculateModelSummary(m));
  const winner = findWinner(summaries);

  // Print results table
  console.log('');
  printResultsTable(summaries, BENCHMARK_ROUNDS, winner);
}

main().catch((error: unknown) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
```

**Step 2: Commit**

```bash
git add apps/agent_004/src/benchmark.ts
git commit -m "feat(agent_004): add main benchmark CLI entry point"
```

---

## Task 10: Create ESLint Config

**Files:**
- Create: `apps/agent_004/eslint.config.js`

**Step 1: Write eslint.config.js**

```javascript
import baseConfig from '@nullagent/eslint-config/library';

export default [...baseConfig];
```

**Step 2: Commit**

```bash
git add apps/agent_004/eslint.config.js
git commit -m "feat(agent_004): add ESLint configuration"
```

---

## Task 11: Install Dependencies and Verify

**Step 1: Install dependencies**

Run: `pnpm install`
Expected: Successful installation with no errors

**Step 2: Type check**

Run: `pnpm --filter agent_004 check-types`
Expected: No type errors

**Step 3: Lint**

Run: `pnpm --filter agent_004 lint`
Expected: No lint errors

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(agent_004): resolve lint and type errors"
```

---

## Task 12: Add Context Window Entries for New Models

**Files:**
- Modify: `packages/agent-core/src/llm.ts`

**Step 1: Add new model context windows**

Add these entries to `MODEL_CONTEXT_WINDOWS`:

```typescript
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'openai/gpt-4o': 128_000,
  'openai/gpt-4o-mini': 128_000,
  'openai/gpt-5-nano': 128_000, // Add this
  'deepseek/deepseek-v3.2': 128_000,
  'anthropic/claude-sonnet-4': 200_000,
  'anthropic/claude-haiku-4.5': 200_000, // Add this
  'xai/grok-4.1-fast-reasoning': 2_000_000,
  'xai/grok-4-fast-reasoning': 2_000_000, // Add this
};
```

**Step 2: Commit**

```bash
git add packages/agent-core/src/llm.ts
git commit -m "feat(agent-core): add context windows for benchmark models"
```

---

## Task 13: Run Full QA

**Step 1: Run full QA**

Run: `pnpm qa`
Expected: All checks pass (lint, types, tests, build)

**Step 2: Fix any issues discovered**

If any issues, fix and commit:
```bash
git add -A
git commit -m "fix: resolve QA issues"
```

---

## Task 14: Test Benchmark Execution

**Step 1: Run the benchmark**

Run: `cd apps/agent_004 && pnpm benchmark`

Expected output format:
```
agent_004 Model Matrix Benchmark
================================

Symbol: COINBASE_SPOT_ETH_USD
Start Time: 2025-12-22T14:00:00.000Z
Models: xai/grok-4-fast-reasoning, anthropic/claude-haiku-4.5, openai/gpt-5-nano
Rounds: 3

Round 1/3 (2025-12-22T14:00:00.000Z)
  xai/grok-4-fast-reasoning: Brier=0.142, Accuracy=77.8%
  anthropic/claude-haiku-4.5: Brier=0.168, Accuracy=70.4%
  openai/gpt-5-nano: Brier=0.201, Accuracy=63.0%

...

┌───────────────────────────────────────────────────────────────────┐
│              agent_004 Benchmark Results (3 rounds)               │
├─────────────────────────────────┬─────────┬─────────┬─────────────┤
│ Model                           │  Brier  │ LogLoss │  Accuracy   │
├─────────────────────────────────┼─────────┼─────────┼─────────────┤
│ xai/grok-4-fast-reasoning       │  0.142  │  0.431  │    77.8%    │
│ anthropic/claude-haiku-4.5      │  0.168  │  0.502  │    70.4%    │
│ openai/gpt-5-nano               │  0.201  │  0.589  │    63.0%    │
├─────────────────────────────────┴─────────┴─────────┴─────────────┤
│ Winner: xai/grok-4-fast-reasoning (lowest Brier score)            │
└───────────────────────────────────────────────────────────────────┘
```

**Step 2: Document any runtime issues**

If benchmark fails, investigate and fix root cause.

---

## Task 15: Final Commit

**Step 1: Stage all changes**

Run: `git add -A`

**Step 2: Final commit**

```bash
git commit -m "feat(agent_004): complete model matrix benchmark implementation"
```

---

## Summary

This plan creates agent_004 with:
- CLI-based execution via `pnpm benchmark`
- 3 models in matrix with isolated message histories
- Round-by-round execution with shared data fetching
- Scoring without monotonicity (Brier, LogLoss, Accuracy only)
- Console table output with winner determination
