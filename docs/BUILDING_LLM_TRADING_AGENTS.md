# Building LLM Trading Agents: A Comprehensive Guide

This guide distills the architectural patterns, tools, and learnings from the Aerodrome Arena trading agent system into a reusable blueprint for building production-grade LLM-powered trading agents.

---

## Table of Contents

1. [Durable Workflows for LLM Calls](#1-durable-workflows-for-llm-calls)
2. [AI Gateway and AI SDK Integration](#2-ai-gateway-and-ai-sdk-integration)
3. [Message Log and Context Growth](#3-message-log-and-context-growth)
4. [Market Indicators and Technical Analysis](#4-market-indicators-and-technical-analysis)
5. [Prompt Engineering and Block Structure](#5-prompt-engineering-and-block-structure)
6. [Decision Making: K-Sampling, Gates, and Repair](#6-decision-making-k-sampling-gates-and-repair)
7. [The Living Theory System](#7-the-living-theory-system)
8. [Complete Architecture Overview](#8-complete-architecture-overview)
9. [Minimal Agent Framework: Package Design](#9-minimal-agent-framework-package-design)

---

## 1. Durable Workflows for LLM Calls

**The most critical architectural decision for production LLM agents is making LLM calls durable.**

LLM calls are expensive, slow, and can fail. A production trading agent should use **durable workflows** to ensure:

- **Automatic retries** on transient failures (rate limits, network issues)
- **State persistence** across restarts
- **Observability** of every step in the decision pipeline
- **Resumability** if the agent crashes mid-decision

### Recommended: Vercel Workflow DevKit

[Workflow DevKit](https://useworkflow.dev) provides the infrastructure to make your LLM calls durable with minimal code changes.

#### Installation

```bash
npm install workflow @workflow/ai
```

#### Configuration (Next.js)

```typescript
// next.config.ts
import { withWorkflow } from 'workflow/next';

export default withWorkflow({
  // your existing Next.js config
});
```

#### Converting an LLM Call to a Durable Workflow

**Before (fragile):**

```typescript
// This can fail silently, lose state, and won't retry
export async function POST(request: Request) {
  const openai = createOpenAI({ apiKey, baseURL });
  const result = await generateObject({
    model: openai.chat(modelId),
    prompt: buildTradingPrompt(marketData),
    schema: DecisionSchema,
  });
  return Response.json(result.object);
}
```

**After (durable):**

```typescript
// workflows/trading-decision.ts
import { DurableAgent } from '@workflow/ai/agent';
import { getWritable } from 'workflow';

async function tradingDecisionWorkflow(input: TradingInput) {
  'use workflow';

  const writable = getWritable();

  // Fetch market data as a durable step
  const marketData = await fetchMarketData(input.symbol);

  // Make LLM decision as a durable step
  const decision = await makeTradingDecision(marketData);

  // Execute trade as a durable step
  if (decision.shouldTrade) {
    await executeTrade(decision);
  }

  return decision;
}

// Each step has automatic retries and observability
async function fetchMarketData(symbol: string) {
  'use step';
  return await taapiClient.fetchIndicators(symbol);
}

async function makeTradingDecision(marketData: MarketData) {
  'use step';
  const openai = createOpenAI({ apiKey, baseURL });
  const result = await generateObject({
    model: openai.chat(modelId),
    prompt: buildTradingPrompt(marketData),
    schema: DecisionSchema,
  });
  return result.object;
}

async function executeTrade(decision: Decision) {
  'use step';
  // Trade execution with automatic retry on failure
  return await aerodromeClient.swap(decision);
}
```

#### Key Workflow Concepts

| Concept | Directive | Purpose |
|---------|-----------|---------|
| **Workflow** | `"use workflow"` | Orchestrates steps, maintains state, deterministic |
| **Step** | `"use step"` | Performs actual work, full Node.js access, automatic retries |
| **Sleep** | `sleep(duration)` | Suspend without compute cost (seconds to months) |
| **Webhook** | `createWebhook()` | Wait for external events |

#### Error Handling

```typescript
import { FatalError, RetryableError } from 'workflow';

async function makeTradingDecision(data: MarketData) {
  'use step';

  try {
    const result = await generateObject({ /* ... */ });
    return result.object;
  } catch (error) {
    // Don't retry on schema validation errors
    if (error instanceof ZodError) {
      throw new FatalError('Invalid LLM response schema');
    }

    // Retry with delay on rate limits
    if (error.status === 429) {
      throw new RetryableError('Rate limited', { retryAfter: 60_000 });
    }

    // Default: retry up to 3 times immediately
    throw error;
  }
}
```

#### Observability

```bash
# View all workflow runs and traces
npx workflow dev
```

This opens a local dashboard showing workflow runs, step execution times, retry attempts, and data flow.

---

## 2. AI Gateway and AI SDK Integration

The system uses **Vercel AI SDK v5** with **Vercel AI Gateway** for unified multi-provider LLM access.

### Package Versions

```json
{
  "dependencies": {
    "ai": "^5.0.113",
    "@ai-sdk/openai": "^2.0.86",
    "@ai-sdk/react": "^2.0.115"
  }
}
```

### Gateway Configuration

```typescript
// environment.ts
export const env = {
  AI_GATEWAY_BASE_URL: process.env.AI_GATEWAY_BASE_URL ?? 'https://ai-gateway.vercel.sh/v1',
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  MODEL_ID: process.env.MODEL_ID, // e.g., 'openai/gpt-5.2', 'anthropic/claude-sonnet-4.5'
};
```

### Creating an LLM Client

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText, streamText } from 'ai';

const openai = createOpenAI({
  apiKey: env.AI_GATEWAY_API_KEY,
  baseURL: env.AI_GATEWAY_BASE_URL,
});

// All models use provider/model format through the gateway
const model = openai.chat(env.MODEL_ID); // e.g., 'openai/gpt-5.2'
```

### Common Patterns

#### Structured Output with Schema Validation

```typescript
import { z } from 'zod';

const DecisionSchema = z.object({
  allocations: z.record(z.number()),
  confidence: z.number().min(0).max(1),
  rationale: z.object({
    summary: z.string(),
    factors: z.array(z.string()),
  }),
  intent: z.enum(['increase', 'decrease', 'hold']),
});

const result = await generateObject({
  model: openai.chat(modelId),
  schema: DecisionSchema,
  prompt: tradingPrompt,
});

// result.object is fully typed as z.infer<typeof DecisionSchema>
```

#### Streaming Chat (Server)

```typescript
import { streamText, convertToModelMessages } from 'ai';
import type { UIMessage } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json() as { messages: UIMessage[] };

  const streamResult = streamText({
    model: openai.chat(modelId),
    system: systemPrompt,
    messages: convertToModelMessages(messages),
  });

  return streamResult.toUIMessageStreamResponse();
}
```

#### Client-Side Chat Hook

```typescript
'use client';
import { useChat } from '@ai-sdk/react';

export function ChatInterface() {
  const { messages, sendMessage, status, error } = useChat({
    onError: (error) => console.error('Chat error:', error),
  });

  // ... render messages
}
```

### Model Configuration Table

| Model | Context Window | Reasoning Support |
|-------|---------------|-------------------|
| `openai/gpt-5.2` | 400k tokens | Yes |
| `anthropic/claude-sonnet-4.5` | 200k tokens | Yes |
| `xai/grok-4` | 256k tokens | No |
| `deepseek/deepseek-v3.2` | 128k tokens | Yes |

### Reasoning Mode (for supported models)

```typescript
// Direct gateway call for reasoning
const response = await fetch(`${AI_GATEWAY_BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-5.2',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
    reasoning: {
      enabled: true,
      max_tokens: 2000,
    },
  }),
});
```

---

## 3. Message Log and Context Growth

**The most powerful pattern for LLM learning: grow a message array over time, bounded by compaction events.**

### The Core Insight

Instead of templating all context into a single prompt string, maintain a **conversation history** that the LLM sees across multiple rounds:

```
Round 1: [user: prompt1] [assistant: decision1]
Round 2: [user: prompt2] [assistant: decision2]
Round 3: [user: prompt3] [assistant: decision3]
...
Round N: [compaction] → [assistant: meta_theory_summary]
Round N+1: [user: prompt] [assistant: decision] (fresh window)
```

### Why This Works

1. **Preserves exact conversation context** - The LLM sees its actual previous responses, not reconstructed summaries
2. **Enables temporal reasoning** - "Last round I said X, but now I see Y"
3. **Natural compaction boundary** - Insert a summary message to reset the window
4. **Simpler mental model** - Standard chat history format

### Database Schema

```sql
-- Message log table
CREATE TABLE v2_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'user' | 'assistant'
  kind TEXT,                    -- 'allocation_prompt', 'allocation', 'meta_theory', etc.
  content TEXT NOT NULL,
  prompt_version TEXT,
  model_id TEXT,
  reasoning_capture JSONB,
  metadata JSONB,
  mode TEXT,                    -- 'sim' | 'live'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Structured rounds table (for querying performance)
CREATE TABLE v2_rounds (
  id UUID PRIMARY KEY,
  job_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  round_number INTEGER,
  allocations JSONB NOT NULL,
  confidence REAL NOT NULL,
  intent TEXT NOT NULL,
  rationale JSONB NOT NULL,
  theory JSONB NOT NULL,
  return_pct REAL,
  excess_pct REAL,
  regret_pct REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Loading History for LLM Calls

```typescript
export async function loadMessageHistoryForLLM(
  conversationId: string,
  mode: 'sim' | 'live'
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  // 1. Find last compaction timestamp (meta_theory)
  const lastCompaction = await sql(`
    SELECT MAX(created_at) as last_compaction
    FROM v2_messages
    WHERE conversation_id = $1 AND kind = 'meta_theory'
  `, [conversationId]);

  const sinceTimestamp = lastCompaction[0]?.last_compaction ?? '1970-01-01';

  // 2. Load all messages since last compaction
  const rows = await sql(`
    SELECT kind, content
    FROM v2_messages
    WHERE conversation_id = $1
      AND created_at >= $2
      AND kind IN ('allocation_prompt', 'allocation', 'meta_theory')
      AND mode = $3
    ORDER BY created_at ASC
  `, [conversationId, sinceTimestamp, mode]);

  // 3. Map to chat format
  return rows.map(row => ({
    role: row.kind === 'allocation_prompt' ? 'user' : 'assistant',
    content: row.content,
  }));
}
```

### Building Messages for a New Decision

```typescript
async function makeDecision(currentPrompt: string) {
  // Load history since last compaction
  const history = await loadMessageHistoryForLLM(conversationId, mode);

  // Append current prompt
  const messages = [
    ...history,
    { role: 'user', content: currentPrompt },
  ];

  // Call LLM with full context
  const response = await generateObject({
    model: openai.chat(modelId),
    schema: DecisionSchema,
    messages,
  });

  // Persist both prompt and response
  await saveV2Message({
    kind: 'allocation_prompt',
    role: 'user',
    content: currentPrompt,
  });

  await saveV2Message({
    kind: 'allocation',
    role: 'assistant',
    content: JSON.stringify(response.object),
  });

  return response.object;
}
```

### Compaction: Summarizing the Window

```typescript
async function shouldRunCompaction(modelId: string): Promise<boolean> {
  const cadence = getCompactionCadence(modelId); // e.g., 10 rounds
  const roundsSinceCompaction = await countRoundsSinceLastCompaction(conversationId);
  return roundsSinceCompaction >= cadence;
}

async function runCompaction() {
  // Load recent theories/decisions
  const recentRounds = await loadRecentRounds(conversationId, 18);

  // Ask LLM to summarize into a meta-theory
  const result = await generateObject({
    model: openai.chat(modelId),
    schema: MetaTheorySchema,
    prompt: buildCompactionPrompt(recentRounds),
  });

  // Save meta_theory - this becomes the new "anchor" for history loading
  await saveV2Message({
    kind: 'meta_theory',
    role: 'assistant',
    content: result.object.meta_theory,
  });
}
```

### Compaction Cadence by Model

| Model | Context Window | Compaction Cadence | Safe Token Budget |
|-------|---------------|-------------------|-------------------|
| `openai/gpt-5.2` | 400k | 10 rounds | 320k (80%) |
| `anthropic/claude-sonnet-4.5` | 200k | 10 rounds | 160k (80%) |
| `deepseek/deepseek-v3.2` | 128k | 8 rounds | 102k (80%) |

### Token Guardrail

```typescript
function shouldForceCompaction(
  promptTokens: number,
  modelId: string
): boolean {
  const contextWindow = modelContextWindows[modelId] ?? 128_000;
  const safeBudget = contextWindow * 0.8;
  return promptTokens >= safeBudget;
}
```

---

## 4. Market Indicators and Technical Analysis

The system fetches a fixed set of technical indicators from TAAPI.io at two timeframes:

### Indicator Set

#### 15-Minute Indicators (Entry Signals)

| Indicator | Config | Purpose |
|-----------|--------|---------|
| RSI | period=14 | Momentum, oversold/overbought |
| StochRSI | period=14, K=3, D=3 | Momentum oscillator |
| MACD | fast=12, slow=26, signal=9 | Trend momentum |
| BBW | length=20, mult=2 | Volatility (Bollinger width) |
| CMF | period=20 | Money flow direction |
| ATR | period=14 | Volatility measure |
| Price | - | Current spot price |
| VWAP | - | Volume-weighted average price |

#### 4-Hour Indicators (Trend Context)

| Indicator | Config | Purpose |
|-----------|--------|---------|
| Supertrend | period=7, mult=3 | Trend direction (long/short) |
| ADX | period=14 | Trend strength |

### Fetching Indicators

```typescript
export async function fetchEnhancedMarketData(
  symbol: string
): Promise<EnhancedMarketData> {
  const payload = {
    secret: env.TAAPI_API_KEY,
    construct: [
      {
        exchange: 'binance',
        symbol,
        interval: '15m',
        indicators: [
          { indicator: 'rsi', period: 14 },
          { indicator: 'stochrsi', period: 14, kPeriod: 3, dPeriod: 3 },
          { indicator: 'macd', optInFastPeriod: 12, optInSlowPeriod: 26, optInSignalPeriod: 9 },
          { indicator: 'bbw', length: 20, multiplier: 2 },
          { indicator: 'cmf', period: 20 },
          { indicator: 'atr', period: 14 },
          { indicator: 'price' },
          { indicator: 'vwap' },
        ],
      },
      {
        exchange: 'binance',
        symbol,
        interval: '4h',
        indicators: [
          { indicator: 'supertrend', period: 7, multiplier: 3 },
          { indicator: 'adx', period: 14 },
        ],
      },
    ],
  };

  const response = await fetch('https://api.taapi.io/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  return normalizeToFeatures(data);
}
```

### Normalized Feature Type

```typescript
interface IndicatorFeatures {
  // 15m indicators
  rsi_15m: number;
  stochrsi_15m: number;
  stochrsi_k_15m: number;
  stochrsi_d_15m: number;
  macd_15m: number;
  macd_signal_15m: number;
  macd_hist_15m: number;
  bbw_15m: number;
  cmf_15m: number;
  atr_15m: number;

  // 4h indicators
  supertrend_4h_value: number;
  supertrend_4h_advice: 'long' | 'short';
  adx_4h: number;

  // Price
  price_usd: number;
  vwap_15m?: number;
  price_to_vwap_bp?: number; // basis points from VWAP
}

interface EnhancedMarketData {
  symbol: string;
  as_of_unix: number;
  features: IndicatorFeatures;
  feature_freshness_minutes: number;
}
```

### Additional Data Sources

#### OHLCV Candles (CoinAPI)

```typescript
const ohlcvData = await fetchOHLCV({ apiKey: coinapiKey }, 'ETH/USDC');
// Returns last 20 15m candles with OHLCV + VWAP
```

#### Context Tags (Derived)

```typescript
function deriveContextTags(features: IndicatorFeatures): string[] {
  const tags: string[] = [];

  if (features.stochrsi_15m < 20 && features.rsi_15m < 30) {
    tags.push('extreme_oversold');
  }
  if (features.macd_hist_15m > 0 && features.macd_15m > features.macd_signal_15m) {
    tags.push('momentum_turn');
  }
  if (features.supertrend_4h_advice === 'long' && features.adx_4h > 25) {
    tags.push('uptrend_context');
  }
  // ... more rules

  return tags;
}
```

---

## 5. Prompt Engineering and Block Structure

The system uses a structured block format for prompts that separates concerns and makes parsing easier.

### Prompt Block Structure

```
CORE (system instructions, persona, constraints)
[RUN CONTEXT] (simulation mode, agent ID, model)
[MEMORY] (accumulated learning, theories)
[COST_MODEL] (transaction costs, slippage)
[LIVE] (current market data, allocations)
[LOTS] (open/closed positions)
[LAST] (previous round outcome)
[OHLCV] (recent price candles)
[TASK] (what to output)
```

### Building the Complete Prompt

```typescript
export function buildRoundPromptV2(input: V2RoundPromptInput): string {
  const blocks = [
    buildRoundPromptV2Core(input.config),     // CORE
    buildRunContextBlock(input.context),      // [RUN CONTEXT]
    buildMemoryBlockV2(input.memory),         // [MEMORY]
    buildCostModelBlock(input.costModel),     // [COST_MODEL]
    buildLiveBlockV2(input.live),             // [LIVE]
    buildLotsBlockV2(input.lotsData),         // [LOTS]
    buildLastBlockV2(input.lastRound),        // [LAST]
    buildOhlcvBlockV2(input.ohlcv),           // [OHLCV]
    buildTaskBlock(),                         // [TASK]
  ];

  return blocks.filter(Boolean).join('\n\n');
}
```

### Key Block Examples

#### [MEMORY] Block

```
[MEMORY]
Your accumulated learning from previous rounds is available in the conversation history above.
```

Or for first round:
```
[MEMORY]
(First round - no prior learning yet)
```

#### [LIVE] Block

```
[LIVE]
previous_w: {"ETH":0.50,"USDC":0.50}
features: {"symbol":"ETH","f":{
  "rsi_15m":38.2,
  "stochrsi_15m":28.5,
  "macd_15m":-45.23,
  "macd_signal_15m":-52.18,
  "macd_hist_15m":6.95,
  "bbw_15m":0.0234,
  "cmf_15m":0.0892,
  "atr_15m":1523.45,
  "supertrend_4h_value":3500.12,
  "supertrend_4h_advice":"long",
  "adx_4h":28.4,
  "price_usd":3520.55
}}
position_cost: avg_cost=$3,200.00, current=$3,520.55, unrealized_pnl=+10.02%
```

#### [LAST] Block

```
[LAST]
timestamp: 2024-12-10T14:45:00Z
indicators: RSI=35.2 MACD_hist=0.0069 CMF=0.0892 BBW=0.0234 Supertrend=long
decision: ETH=60% intent=bottom_catch conf=0.78
outcome: GOOD return=+2.35% excess=+1.10% turnover=0.22
regret: +0.35%
theory_update: RSI bounce confirmed, accumulation phase active
```

#### [TASK] Block

```
[TASK]
Using the full message log plus the inputs above:
1) Internally build 2 competing explanations using the world model.
2) Select the best hypothesis and estimate which discrete allocation has best net edge after costs.
3) Output the JSON decision + updated theory.
```

### Decision Output Schema

```typescript
const DecisionOutputV2Schema = z.object({
  allocations: z.record(z.number()),
  confidence: z.number().min(0).max(1),
  intent: z.enum(['increase', 'decrease', 'hold']),
  rationale: z.object({
    summary: z.string(),
    factors: z.array(z.string()),
  }),
  theory: z.string().optional(),
  chart_prediction: z.string().optional(),
  flags: z.array(z.string()),
});
```

---

## 6. Decision Making: K-Sampling, Gates, and Repair

### K-Sampling (Self-Consistency)

Query the LLM K times and aggregate results for more robust decisions:

```typescript
interface KSamplingStats {
  mean_conf: number;        // Average confidence across K samples
  alloc_min: number;        // Minimum allocation
  alloc_max: number;        // Maximum allocation
  alloc_range: number;      // Range of allocations
  mode_base: number;        // Most frequent allocation (snapped to grid)
  vote_share: number;       // Fraction voting for mode
  all_samples_identical: boolean;
}

export function computeKSamplingStats(
  samples: readonly { allocations: Record<string, number>; confidence?: number }[]
): KSamplingStats {
  const baseAllocations = samples.map(s =>
    snapToNearestStep(s.allocations[baseTicker] ?? 0)
  );

  // Compute mode (most frequent)
  const frequency = new Map<number, number>();
  for (const alloc of baseAllocations) {
    frequency.set(alloc, (frequency.get(alloc) ?? 0) + 1);
  }

  let mode = 0;
  let maxCount = 0;
  for (const [alloc, count] of frequency) {
    if (count > maxCount) {
      mode = alloc;
      maxCount = count;
    }
  }

  return {
    mean_conf: samples.reduce((acc, s) => acc + (s.confidence ?? 0.5), 0) / samples.length,
    alloc_min: Math.min(...baseAllocations),
    alloc_max: Math.max(...baseAllocations),
    alloc_range: Math.max(...baseAllocations) - Math.min(...baseAllocations),
    mode_base: mode,
    vote_share: maxCount / samples.length,
    all_samples_identical: new Set(baseAllocations).size === 1,
  };
}
```

### Gate Logic (Non-Blocking Flags)

Gates compute warning flags but don't block execution:

```typescript
interface GatesConfig {
  step_vote: number;    // Min vote share for step changes
  step_conf: number;    // Min confidence for step changes
  extreme_vote: number; // Min vote share for extreme (0% or 100%)
  extreme_conf: number; // Min confidence for extreme
}

interface GateFlags {
  wouldBlock: boolean;
  reason?: string;
  lowVoteShare: boolean;
  lowConfidence: boolean;
  extremePosition: boolean;
  stepChange: boolean;
}

export function computeGateFlags(
  cfg: GatesConfig,
  context: GateContext
): GateFlags {
  if (context.is_extreme) {
    const voteOk = context.vote_share >= cfg.extreme_vote;
    const confOk = context.mean_conf >= cfg.extreme_conf;
    return {
      wouldBlock: !voteOk || !confOk,
      lowVoteShare: !voteOk,
      lowConfidence: !confOk,
      extremePosition: true,
      stepChange: false,
    };
  }

  if (context.is_step) {
    const voteOk = context.vote_share >= cfg.step_vote;
    const confOk = context.mean_conf >= cfg.step_conf;
    return {
      wouldBlock: !voteOk || !confOk,
      lowVoteShare: !voteOk,
      lowConfidence: !confOk,
      extremePosition: false,
      stepChange: true,
    };
  }

  return {
    wouldBlock: false,
    lowVoteShare: false,
    lowConfidence: false,
    extremePosition: false,
    stepChange: false,
  };
}
```

### Allocation Repair

When LLM outputs invalid allocations, make a minimal repair call:

```typescript
function needsRepair(alloc: Record<string, number>): boolean {
  const base = alloc[baseTicker] ?? 0;
  const quote = alloc[quoteTicker] ?? 0;

  // Check valid range
  if (base < 0 || base > 1 || quote < 0 || quote > 1) return true;

  // Check sum equals 1
  if (Math.abs(base + quote - 1) > 0.004) return true;

  return false;
}

export async function repairAllocationsIfNeeded(
  openai: OpenAI,
  modelId: string,
  alloc: Record<string, number>
): Promise<RepairResult> {
  if (!needsRepair(alloc)) {
    return { allocations: alloc, wasRepaired: false };
  }

  const result = await generateObject({
    model: openai.chat(modelId),
    schema: z.object({ allocations: z.record(z.number()) }),
    prompt: `Fix ONLY the allocations JSON so it satisfies constraints.
Original (INVALID): ${JSON.stringify(alloc)}
Violations: Sum=${Object.values(alloc).reduce((a,b)=>a+b, 0)} (must be 1.0 ±0.004)
Return: {"allocations":{"${baseTicker}":x,"${quoteTicker}":x}}`,
  });

  return {
    allocations: result.object.allocations,
    wasRepaired: true,
    usage: result.usage,
  };
}
```

---

## 7. The Living Theory System

The Living Theory system enables the agent to learn and adapt across rounds.

### Two-Level Theory Structure

1. **Working Theory** (every round): Free-form text describing current market thesis
2. **Meta-Theory** (every N rounds): Compressed summary of working theories

### Working Theory Generation

```typescript
async function askForWorkingTheory(input: WorkingTheoryInput) {
  const history = await loadMessageHistoryForLLM(conversationId, mode);

  const prompt = `[RECENT PERFORMANCE - Last 10 Rounds]
${formatRecentRounds(input.last10Rounds)}

${input.previousTheory ? `[PREVIOUS THEORY]\n${input.previousTheory}` : ''}

[CURRENT LIVE]
${input.currentLive}

Generate a theory explaining market behavior. End with:
POSTURE: risk-on | neutral | risk-off
DEFAULT_BAND: 0 | 0.25 | 0.5 | 0.75 | 1.0
CONFIDENCE: low | medium | high`;

  const result = await generateObject({
    model: openai.chat(modelId),
    schema: z.object({ theory: z.string().min(200).max(2500) }),
    messages: [...history, { role: 'user', content: prompt }],
  });

  return result.object.theory;
}
```

### Meta-Theory Compaction

```typescript
async function compactToMetaTheory(input: MetaTheoryInput) {
  const prompt = `[PREVIOUS META-THEORY]
${input.previousMetaTheory ?? '(None)'}

[RECENT WORKING THEORIES]
${input.recentTheories.map((t, i) =>
  `[Round ${i+1}] ${t.theory} | return=${t.performance.return_pct}%`
).join('\n')}

[PERFORMANCE COMPARISON]
Last 9 rounds: avg_return=${input.perfWindows.last9.avg_return}%
Prev 9 rounds: avg_return=${input.perfWindows.prev9.avg_return}%
Trend: ${input.perfWindows.trend}

Compress into a meta-theory with sections:
[WORLD_MODEL] [COMPETING_HYPOTHESES] [FAILURE MODES] [PLAYBOOK FOR NEXT 10 ROUNDS]`;

  const result = await generateObject({
    model: openai.chat(modelId),
    schema: z.object({ meta_theory: z.string().max(45_000) }),
    prompt,
  });

  // Save as new compaction anchor
  await saveV2Message({
    kind: 'meta_theory',
    role: 'assistant',
    content: result.object.meta_theory,
  });

  return result.object.meta_theory;
}
```

### Complete Round Flow

```
1. DECISION PHASE
   - Load market data (indicators, OHLCV)
   - Load history since last meta_theory
   - Build prompt with [MEMORY], [LIVE], [LAST], etc.
   - Call LLM K times (K-sampling)
   - Aggregate, compute gate flags, repair if needed
   - Execute trade

2. REFLECTION PHASE
   - Calculate realized returns, excess, regret
   - Generate lessons/tags (for significant rounds)
   - Update working theory

3. COMPACTION PHASE (every N rounds)
   - Load recent working theories
   - Generate meta_theory
   - Save as new compaction anchor
```

---

## 8. Complete Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      TRADING ROUND WORKFLOW                      │
└─────────────────────────────────────────────────────────────────┘
                                │
     ┌──────────────────────────┼──────────────────────────┐
     ▼                          ▼                          ▼
┌─────────────┐         ┌─────────────┐         ┌─────────────────┐
│   TAAPI     │         │  CoinAPI    │         │   icl-memory    │
│ Indicators  │         │   OHLCV     │         │  Message Log    │
└─────────────┘         └─────────────┘         └─────────────────┘
     │                          │                          │
     └──────────────────────────┼──────────────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │    icl-engine         │
                    │  buildRoundPromptV2   │
                    │  [MEMORY][LIVE][LAST] │
                    └───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   AI Gateway          │
                    │   (Vercel AI SDK)     │
                    │   generateObject()    │
                    └───────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        ┌──────────┐     ┌──────────┐     ┌──────────┐
        │ Sample 1 │     │ Sample 2 │     │ Sample K │
        └──────────┘     └──────────┘     └──────────┘
              │                 │                 │
              └─────────────────┼─────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │   K-Sampling Stats    │
                    │   computeKSamplingStats│
                    └───────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
           ┌─────────────┐         ┌─────────────┐
           │    Gates    │         │   Repair    │
           │(non-blocking)│        │ (if needed) │
           └─────────────┘         └─────────────┘
                    │                       │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │      Aerodrome        │
                    │    DEX Execution      │
                    └───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   icl-memory          │
                    │   Save Round +        │
                    │   Messages            │
                    └───────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
           ┌─────────────┐         ┌─────────────┐
           │  Reflection │         │ Compaction  │
           │  (lessons)  │         │(meta-theory)│
           └─────────────┘         └─────────────┘
```

### Package Dependency Graph

```
contracts (types only, zero deps)
    ↓
core ← db
    ↓
aerodrome, taapi, icl-memory, icl-engine
    ↓
agent-trading
    ↓
apps/* (eth, btc, aero, zora, sapien)
```

### Key Environment Variables

```bash
# AI Gateway
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
MODEL_ID=openai/gpt-5.2

# Agent Config
AGENT_ID=aerodrome-eth-gpt5
SIMULATION_MODE=false

# Market Data
TAAPI_API_KEY=your-key
COINAPI_API_KEY=your-key

# Database
DATABASE_URL=postgres://...

# Learning
HOLDOUT_ENABLED=false
REASONING_ENABLED=true
COMPACTION_CADENCE_OVERRIDE=10
SELF_CONSISTENCY_K=3
```

---

## 9. Minimal Agent Framework: Package Design

The patterns above can be extracted into a **reusable agent framework** that makes building new agents trivially simple. The goal: apps define only prompts and schemas; packages handle all plumbing.

### The Layered Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR APP                                │
│  • Round prompt (user-controlled, fully custom)                 │
│  • Output schema (Zod)                                          │
│  • Compaction prompt (user-controlled)                          │
│  • Data payload for each round                                  │
│  • Optional: tools, admin UI, output subscriptions              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      agent-core PACKAGE                         │
│  • Message history (load/save)                                  │
│  • Compaction detection & execution                             │
│  • Round orchestration workflow                                 │
│  • DB storage (messages, rounds)                                │
│  • OpenAI client passthrough                                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow DevKit                              │
│  • Durable execution                                            │
│  • Automatic retries                                            │
│  • Observability                                                │
│  • State persistence                                            │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight**: Workflow DevKit handles execution durability. The `agent-core` package handles the "learning agent" pattern (message arrays, compaction). They're complementary, not redundant.

### The `defineAgent` Interface

```typescript
// packages/agent-core/src/types.ts
import type { z } from 'zod';

export interface AgentDefinition<TOutput, TData = unknown> {
  /** Unique identifier for this agent (used as conversation_id) */
  id: string;

  /** Zod schema for structured output - package validates, stores as JSONB */
  outputSchema: z.ZodType<TOutput>;

  /**
   * Build the user prompt for each round.
   * Package provides NO additional prompts - this is 100% your content.
   * @param data - Whatever data your app fetches (market data, user input, etc.)
   * @param context - Round context (round number, previous output, etc.)
   */
  buildRoundPrompt: (data: TData, context: RoundContext<TOutput>) => string;

  /**
   * Build the compaction prompt.
   * Called every `compactionCadence` rounds.
   * Output becomes the first message in the new message array.
   * @param history - Recent outputs with their prompts
   */
  buildCompactionPrompt: (history: RoundHistory<TOutput>[]) => string;

  /**
   * Compaction trigger strategy. Pick ONE:
   *
   * 1. Message count: compact after N rounds
   *    { type: 'message-count', count: 10 }
   *
   * 2. Context window: compact at X% of model's context window
   *    { type: 'context-window', modelId: 'openai/gpt-4o', threshold: 0.75 }
   *
   * 3. App-driven: you decide when to compact
   *    { type: 'custom', shouldCompact: (ctx) => ctx.roundNumber % 5 === 0 }
   */
  compactionTrigger: CompactionTrigger;

  /** Optional: tools to give the LLM (AI SDK tool format) */
  tools?: Record<string, Tool>;

  /** Optional: system prompt (if you want one - package adds nothing) */
  systemPrompt?: string;

  /** Optional: callback when round completes */
  onRoundComplete?: (result: RoundResult<TOutput>) => Promise<void>;
}

export interface RoundContext<TOutput> {
  roundNumber: number;
  previousOutput?: TOutput;
  compactionSummary?: string;  // Latest compaction output, if any
  mode: 'sim' | 'live';
}

export interface RoundHistory<TOutput> {
  roundNumber: number;
  prompt: string;
  output: TOutput;
  timestamp: string;
}

export interface RoundResult<TOutput> {
  output: TOutput;
  roundNumber: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  wasCompacted: boolean;
}

// Compaction trigger types
export type CompactionTrigger =
  | { type: 'message-count'; count: number }
  | { type: 'context-window'; modelId: string; threshold: number }
  | { type: 'custom'; shouldCompact: (ctx: CompactionContext) => boolean | Promise<boolean> };

export interface CompactionContext {
  roundNumber: number;
  messageCount: number;
  estimatedTokens: number;
  contextWindowSize: number;
  lastCompactionRound?: number;
  previousOutput?: unknown;
}
```

### What You Need (7 Things)

To run an LLM agent that learns over time, you provide exactly **7 things**:

| # | What | Example |
|---|------|---------|
| 1 | **API Keys** | `AI_GATEWAY_API_KEY`, `DATABASE_URL` |
| 2 | **Data Payload** | `fetchGoldPrices()` → JSON |
| 3 | **Round Prompt** | "Analyze this data and predict..." |
| 4 | **Output Schema** | `z.object({ prediction: z.string() })` |
| 5 | **Compaction Trigger** | `{ type: 'message-count', count: 10 }` |
| 6 | **Compaction Prompt** | "Summarize your learnings from these rounds..." |
| 7 | **Run Trigger** | Vercel Cron: `*/15 * * * *` (every 15 min) |

**That's it.** The framework handles:
- ✅ Message history (growing array across rounds)
- ✅ Database storage (prompts, outputs, compaction summaries)
- ✅ Compaction execution (detecting trigger, calling LLM, seeding new array)
- ✅ Durable workflows (retries, persistence, observability)
- ✅ LLM client setup (AI Gateway, model routing)

### The Minimal App: ~30 Lines

```typescript
// apps/gold-predictor/src/agent.ts
import { defineAgent } from '@monorepo/agent-core';
import { z } from 'zod';

// Your output schema - stored as JSONB in the database
const OutputSchema = z.object({
  description: z.string(),
  prediction: z.string(),
});

export const agent = defineAgent({
  id: 'gold-predictor',

  outputSchema: OutputSchema,

  // 100% your prompt - package adds NOTHING
  buildRoundPrompt: (data: GoldMarketData, ctx) => `
Read this data payload and give a 2 line description of the market
and a 1 line prediction for the price of gold next.

${ctx.compactionSummary ? `Your accumulated learnings:\n${ctx.compactionSummary}\n` : ''}

Here is the data payload:
${JSON.stringify(data, null, 2)}

Output only: {"description": "...", "prediction": "..."}
  `,

  // Compaction prompt - summarize learnings
  buildCompactionPrompt: (history) => `
You have made ${history.length} predictions. Summarize your key learnings
about gold price movements. What patterns have you noticed? What works?

Recent predictions:
${history.map(h => `Round ${h.roundNumber}: ${h.output.prediction}`).join('\n')}

Provide a concise summary (2-3 paragraphs) of your trading insights.
  `,

  // OPTION 1: Compact every 10 rounds
  compactionTrigger: { type: 'message-count', count: 10 },

  // OPTION 2: Compact at 75% of context window
  // compactionTrigger: { type: 'context-window', modelId: 'openai/gpt-4o', threshold: 0.75 },

  // OPTION 3: Custom logic
  // compactionTrigger: {
  //   type: 'custom',
  //   shouldCompact: (ctx) => ctx.estimatedTokens > 50_000 || ctx.roundNumber % 20 === 0
  // },
});
```

```typescript
// apps/gold-predictor/src/app/api/cron/route.ts
import { agent } from '../../agent';
import { runRound } from '@monorepo/agent-core';
import { fetchGoldData } from '../../data';

export async function GET() {
  const data = await fetchGoldData();
  const result = await runRound(agent, data);
  return Response.json(result);
}
```

**That's the entire app.** Everything else is handled by packages.

### The `agent-core` Package Implementation

```typescript
// packages/agent-core/src/run-round.ts
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export async function runRound<TOutput, TData>(
  agent: AgentDefinition<TOutput, TData>,
  data: TData,
  options?: { openai?: OpenAIClient; modelId?: string }
): Promise<RoundResult<TOutput>> {
  'use workflow';  // Durable workflow

  const openai = options?.openai ?? createDefaultOpenAI();
  const modelId = options?.modelId ?? env.MODEL_ID;

  // Step 1: Load message history since last compaction
  const history = await loadMessageHistory(agent.id);

  // Step 2: Check if compaction needed (based on agent's trigger strategy)
  const shouldCompact = await evaluateCompactionTrigger(agent, history);
  if (shouldCompact) {
    await runCompaction(agent, openai, modelId);
    // Reload history - now starts fresh with compaction summary as first message
    history = await loadMessageHistory(agent.id);
  }

  // Step 3: Build context
  const context = await buildRoundContext(agent.id);

  // Step 4: Build prompt (100% user-controlled)
  const prompt = agent.buildRoundPrompt(data, context);

  // Step 5: Call LLM with message history
  const result = await callLLM(agent, prompt, history, openai, modelId);

  // Step 6: Save to database
  await saveRound(agent.id, prompt, result);

  // Step 7: Callback if provided
  if (agent.onRoundComplete) {
    await agent.onRoundComplete(result);
  }

  return result;
}

// Internal: Load message history
async function loadMessageHistory(agentId: string) {
  'use step';

  const lastCompaction = await sql(`
    SELECT MAX(created_at) as ts FROM agent_messages
    WHERE agent_id = $1 AND kind = 'compaction'
  `, [agentId]);

  const since = lastCompaction[0]?.ts ?? '1970-01-01';

  return sql(`
    SELECT role, content FROM agent_messages
    WHERE agent_id = $1 AND created_at >= $2
    ORDER BY created_at ASC
  `, [agentId, since]);
}

// Internal: Execute LLM call
async function callLLM<TOutput>(
  agent: AgentDefinition<TOutput>,
  prompt: string,
  history: Message[],
  openai: OpenAIClient,
  modelId: string
) {
  'use step';

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: prompt },
  ];

  const result = await generateObject({
    model: openai.chat(modelId),
    schema: agent.outputSchema,
    messages,
    ...(agent.systemPrompt && { system: agent.systemPrompt }),
  });

  return {
    output: result.object,
    usage: result.usage,
  };
}

// Internal: Evaluate compaction trigger
async function evaluateCompactionTrigger<TOutput>(
  agent: AgentDefinition<TOutput>,
  history: Message[]
): Promise<boolean> {
  'use step';

  const trigger = agent.compactionTrigger;
  const messageCount = history.length;

  switch (trigger.type) {
    case 'message-count':
      // Simple: compact every N messages (N rounds = 2N messages: prompt + response)
      return messageCount >= trigger.count * 2;

    case 'context-window': {
      // Token-based: compact at X% of context window
      const contextWindow = MODEL_CONTEXT_WINDOWS[trigger.modelId] ?? 128_000;
      const estimatedTokens = await estimateTokenCount(history);
      return estimatedTokens >= contextWindow * trigger.threshold;
    }

    case 'custom': {
      // App-driven: let the app decide
      const ctx: CompactionContext = {
        roundNumber: await getCurrentRoundNumber(agent.id),
        messageCount,
        estimatedTokens: await estimateTokenCount(history),
        contextWindowSize: MODEL_CONTEXT_WINDOWS[env.MODEL_ID] ?? 128_000,
        lastCompactionRound: await getLastCompactionRound(agent.id),
      };
      return trigger.shouldCompact(ctx);
    }
  }
}

// Model context windows (used for context-window trigger)
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'openai/gpt-4o': 128_000,
  'openai/gpt-4o-mini': 128_000,
  'openai/gpt-5.2': 400_000,
  'anthropic/claude-sonnet-4': 200_000,
  'anthropic/claude-sonnet-4.5': 200_000,
  'xai/grok-4': 256_000,
  'deepseek/deepseek-v3.2': 128_000,
};

// Internal: Estimate token count (rough: ~4 chars per token)
async function estimateTokenCount(history: Message[]): Promise<number> {
  const totalChars = history.reduce((acc, m) => acc + m.content.length, 0);
  return Math.ceil(totalChars / 4);
}

// Internal: Run compaction
async function runCompaction<TOutput>(
  agent: AgentDefinition<TOutput>,
  openai: OpenAIClient,
  modelId: string
) {
  'use step';

  const recentRounds = await loadRecentRounds(agent.id);
  const prompt = agent.buildCompactionPrompt(recentRounds);

  const result = await generateText({
    model: openai.chat(modelId),
    prompt,
  });

  // Save compaction as the new anchor - this becomes message[0] for future rounds
  await saveCompaction(agent.id, result.text);
}
```

### Compaction Trigger Strategies

The app controls when compaction happens. Choose the strategy that fits your use case:

#### Strategy 1: Message Count

Compact after a fixed number of rounds. Simple and predictable.

```typescript
compactionTrigger: { type: 'message-count', count: 10 }
```

- **Best for**: Fixed-cadence agents, predictable memory usage
- **Trade-off**: May compact too early (wasting context) or too late (hitting limits)

#### Strategy 2: Context Window

Compact when the message array reaches X% of the model's context window.

```typescript
compactionTrigger: {
  type: 'context-window',
  modelId: 'openai/gpt-4o',
  threshold: 0.75  // Compact at 75% full
}
```

- **Best for**: Maximizing context usage, multi-model setups
- **Trade-off**: Compaction timing varies based on prompt/response sizes

#### Strategy 3: Custom (App-Driven)

Full control. Your function decides when to compact.

```typescript
compactionTrigger: {
  type: 'custom',
  shouldCompact: async (ctx) => {
    // Compact if tokens are high OR every 20 rounds OR on specific conditions
    if (ctx.estimatedTokens > 80_000) return true;
    if (ctx.roundNumber % 20 === 0) return true;

    // Example: compact after a big market move
    const lastOutput = ctx.previousOutput as MyOutput;
    if (lastOutput?.significantEvent) return true;

    return false;
  }
}
```

- **Best for**: Complex conditions, event-driven compaction
- **Trade-off**: More code to maintain

#### Compaction Context (for custom triggers)

```typescript
interface CompactionContext {
  roundNumber: number;           // Current round
  messageCount: number;          // Messages in array
  estimatedTokens: number;       // Rough token estimate
  contextWindowSize: number;     // Model's context window
  lastCompactionRound?: number;  // When we last compacted
  previousOutput?: unknown;      // Last round's output (for event-driven)
}
```

### Database Schema (Generic)

```sql
-- Works for ANY agent with ANY output schema
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'user' | 'assistant'
  kind TEXT NOT NULL,           -- 'round_prompt' | 'round_output' | 'compaction'
  content TEXT NOT NULL,        -- Prompt text or JSON output
  output_json JSONB,            -- Parsed output (for querying)
  round_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_messages_agent ON agent_messages(agent_id, created_at);
CREATE INDEX idx_agent_messages_kind ON agent_messages(agent_id, kind);
```

### What the Package Handles vs What the App Handles

| Responsibility | Package | App |
|----------------|---------|-----|
| Message history loading | ✅ | |
| Message persistence | ✅ | |
| Compaction detection | ✅ | |
| Compaction execution | ✅ | |
| Workflow durability | ✅ | |
| Retries on failure | ✅ | |
| OpenAI client setup | ✅ (default) | Optional override |
| Round prompt content | | ✅ 100% |
| Output schema | | ✅ |
| Compaction prompt | | ✅ 100% |
| Data fetching | | ✅ |
| Tools definition | | ✅ |
| Admin UI | | ✅ |
| Output subscriptions | | ✅ |

### Advanced: Tools and Subscriptions

```typescript
// apps/research-agent/src/agent.ts
import { defineAgent, tool } from '@monorepo/agent-core';
import { z } from 'zod';

export const agent = defineAgent({
  id: 'research-agent',

  outputSchema: z.object({
    summary: z.string(),
    sources: z.array(z.string()),
    confidence: z.number(),
  }),

  buildRoundPrompt: (query: string) => `
Research this topic and provide a summary with sources: ${query}
  `,

  buildCompactionPrompt: (history) => `
Summarize research patterns and quality of sources across ${history.length} queries.
  `,

  // Tools passed to AI SDK
  tools: {
    webSearch: tool({
      description: 'Search the web for information',
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        // Your search implementation
        return await searchWeb(query);
      },
    }),
  },

  // Subscribe to outputs
  onRoundComplete: async (result) => {
    // Send to webhook, update dashboard, etc.
    await sendToSlack(`New research: ${result.output.summary}`);
  },
});
```

### Monorepo Structure

```
packages/
├── agent-core/           # The reusable agent framework
│   ├── src/
│   │   ├── index.ts      # Public API: defineAgent, runRound
│   │   ├── types.ts      # AgentDefinition, RoundContext, etc.
│   │   ├── run-round.ts  # Main workflow orchestration
│   │   ├── history.ts    # Message loading/saving
│   │   ├── compaction.ts # Compaction logic
│   │   └── db.ts         # Database operations
│   └── package.json
│
├── agent-db/             # Database client (postgres)
└── agent-types/          # Shared types (zero deps)

apps/
├── gold-predictor/       # ~30 lines of custom code
│   ├── src/
│   │   ├── agent.ts      # defineAgent + prompts + schema
│   │   ├── data.ts       # fetchGoldData()
│   │   └── app/api/cron/route.ts
│   └── package.json
│
├── research-agent/       # Another agent, same pattern
└── trading-bot/          # Another agent, same pattern
```

### Why This Isn't Just Replicating Workflow DevKit

| Workflow DevKit | agent-core |
|-----------------|------------|
| Durable execution | ❌ Not its job |
| Automatic retries | ❌ Not its job |
| Step orchestration | ❌ Not its job |
| **Message arrays** | ✅ Core feature |
| **Compaction** | ✅ Core feature |
| **Round abstraction** | ✅ Core feature |
| **Learning over time** | ✅ Core feature |

They're **complementary layers**. Workflow DevKit makes each step reliable. `agent-core` implements the learning agent pattern on top of that reliability.

### The Power of Minimal Apps

With this framework, creating a new agent takes **5 minutes**:

1. Create `apps/my-agent/src/agent.ts`
2. Define your output schema (Zod)
3. Write your round prompt function
4. Write your compaction prompt function
5. Create a cron route that calls `runRound()`

**No DB setup. No message history code. No compaction logic. No workflow boilerplate.**

The package handles all of that, and the underlying Workflow DevKit ensures it never fails silently.

---

## Summary: Key Takeaways

1. **Make LLM calls durable** using Workflow DevKit's `"use workflow"` and `"use step"` directives
2. **Use Vercel AI Gateway** for unified multi-provider access with `provider/model` format
3. **Grow message arrays** instead of templating everything into prompts; bound with compaction
4. **Fetch standardized indicators** at multiple timeframes (15m for entry, 4h for trend context)
5. **Use structured prompt blocks** (`[MEMORY]`, `[LIVE]`, `[LAST]`, etc.) for clarity
6. **K-sample for robustness**: Query K times, aggregate, and use vote share for confidence
7. **Non-blocking gates**: Compute warning flags but don't prevent execution
8. **Living Theory**: Enable learning through working theories + periodic meta-theory compaction
9. **Extract into a minimal framework**: Apps should be ~30 lines (prompts + schema); packages handle all plumbing

This architecture has been battle-tested in production with real trading decisions every 15 minutes across multiple agents and models.

---

## Quick Start: Building Your First Agent

```typescript
// 1. Define your agent (apps/my-agent/src/agent.ts)
import { defineAgent } from '@monorepo/agent-core';
import { z } from 'zod';

export const agent = defineAgent({
  id: 'my-agent',
  outputSchema: z.object({ answer: z.string() }),
  buildRoundPrompt: (data) => `Analyze: ${JSON.stringify(data)}`,
  buildCompactionPrompt: (history) => `Summarize ${history.length} rounds...`,
});

// 2. Create a trigger (apps/my-agent/src/app/api/cron/route.ts)
import { agent } from '../../agent';
import { runRound } from '@monorepo/agent-core';

export async function GET() {
  const data = await fetchMyData();
  return Response.json(await runRound(agent, data));
}
```

That's it. The framework handles message history, compaction, durability, and persistence.
