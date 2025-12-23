# NullAgent Implementation Plan

This document outlines the implementation plan for the nullagent LLM agent framework.

## Reference Documentation

- **Architecture Guide**: [docs/BUILDING_LLM_TRADING_AGENTS.md](./BUILDING_LLM_TRADING_AGENTS.md)
- **Workflow DevKit**: https://useworkflow.dev/docs/getting-started/next
- **AI Gateway**: https://vercel.com/ai-gateway

---

## Core Concepts

### Framework Philosophy

Apps provide **two things**:
1. **Prompt** (string) - Apps handle all data fetching and inject it into the prompt string themselves
2. **Output Schema** (Zod) - Structured output validated by AI SDK

The framework handles:
- Message history (growing array across rounds)
- Compaction (summarizing history when context window fills)
- Durable execution (via Workflow DevKit)
- Database persistence

### Compaction Default

- **Trigger**: `context-window` at `0.75` threshold
- Apps can override with `message-count` or `custom` triggers

---

## Phase 1: Foundation (Serial)

### 1.1 Database Package `@nullagent/database`

**Purpose**: Drizzle ORM setup with postgres for message storage

**Files**:
```
packages/database/
├── src/
│   ├── index.ts           # Public exports
│   ├── client.ts          # Drizzle client setup
│   └── schema/
│       └── agent-messages.ts  # Message table schema
├── drizzle.config.ts      # Drizzle config
├── package.json
└── tsconfig.json
```

**Schema** (from BUILDING_LLM_TRADING_AGENTS.md Section 9):
```sql
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
```

**Scripts**:
- `db:generate` - Generate migrations
- `db:migrate` - Apply migrations
- `db:push` - Push schema directly
- `db:studio` - Open Drizzle Studio
- `db:check` - Validate schema matches DB

**Dependencies**:
- `drizzle-orm`
- `drizzle-kit`
- `postgres` (pg driver)
- `dotenv`

---

## Phase 2: Agent Core (Serial, depends on Phase 1)

### 2.1 Agent Core Package `@nullagent/agent-core`

**Purpose**: The reusable agent framework - defineAgent, runRound, message history, compaction

**Files**:
```
packages/agent-core/
├── src/
│   ├── index.ts           # Public API: defineAgent, runRound
│   ├── types.ts           # AgentDefinition, RoundContext, etc.
│   ├── run-round.ts       # Main workflow orchestration
│   ├── history.ts         # Message loading/saving
│   ├── compaction.ts      # Compaction detection & execution
│   └── llm.ts             # OpenAI client setup via AI Gateway
├── package.json
└── tsconfig.json
```

**Public API**:

```typescript
// defineAgent - define an agent's behavior
export function defineAgent<TOutput>(
  definition: AgentDefinition<TOutput>
): Agent<TOutput>;

// runRound - execute a single round
export async function runRound<TOutput>(
  agent: Agent<TOutput>
): Promise<RoundResult<TOutput>>;
```

**AgentDefinition Interface** (updated from doc):

```typescript
interface AgentDefinition<TOutput> {
  /** Unique identifier for this agent (used as conversation_id) */
  id: string;

  /** Zod schema for structured output */
  outputSchema: z.ZodType<TOutput>;

  /**
   * Build the user prompt for each round.
   * 100% app-controlled - framework adds NOTHING.
   * Apps handle their own data fetching and inject into the string.
   */
  buildRoundPrompt: (context: RoundContext<TOutput>) => string;

  /**
   * Build the compaction prompt.
   * Called when context window threshold reached.
   */
  buildCompactionPrompt: (history: RoundHistory<TOutput>[]) => string;

  /**
   * Compaction trigger strategy.
   * Default: { type: 'context-window', modelId: env.MODEL_ID, threshold: 0.75 }
   */
  compactionTrigger?: CompactionTrigger;

  /** Optional system prompt */
  systemPrompt?: string;

  /** Optional callback when round completes */
  onRoundComplete?: (result: RoundResult<TOutput>) => Promise<void>;
}
```

**Key Clarifications**:
- `buildRoundPrompt` receives `context` only (no data parameter)
- Apps fetch their own data and build it into the prompt string
- Prompts are always strings, outputs are always structured (Zod)

**Dependencies**:
- `@nullagent/database`
- `ai` (AI SDK v5)
- `@ai-sdk/openai`
- `workflow` (Workflow DevKit)
- `zod`

---

## Phase 3: Example App (Serial, depends on Phase 2)

### 3.1 Example App `apps/agent_000`

**Purpose**: Minimal example app demonstrating the framework. No external data, no persistence, just phrase guessing (Wheel of Fortune style).

**Game Rules**:
- Agent receives: `{ category: string, board: string }` (e.g., `{ category: "Phrase", board: "H_LL_ W_RLD" }`)
- Agent returns: `{ letter?: string, guess?: string }`
- One letter at a time, or a full guess
- Wrong guess = automatic failure

**Files**:
```
apps/agent_000/
├── src/
│   ├── agent.ts           # defineAgent + prompts + schema
│   ├── game.ts            # Game logic (generate puzzle, check answer)
│   └── app/
│       └── api/
│           └── play/
│               └── route.ts  # POST endpoint to run one round
├── next.config.ts         # withWorkflow() wrapper
├── package.json
└── tsconfig.json
```

**Agent Definition** (~30 lines):

```typescript
import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';
import { generatePuzzle, getCurrentBoard } from './game';

const OutputSchema = z.object({
  letter: z.string().length(1).optional(),
  guess: z.string().optional(),
});

export const agent = defineAgent({
  id: 'agent_000',

  outputSchema: OutputSchema,

  buildRoundPrompt: (ctx) => {
    const puzzle = generatePuzzle(); // Or get from game state
    const board = getCurrentBoard(puzzle);

    return `You are playing a word guessing game.

Category: ${puzzle.category}
Board: ${board}

${ctx.compactionSummary ? `Your past learnings:\n${ctx.compactionSummary}\n` : ''}

Choose ONE action:
- Guess a letter (a-z) you think is in the puzzle
- Guess the full phrase if you're confident

Respond with either:
{"letter": "e"} - to guess a letter
{"guess": "HELLO WORLD"} - to guess the phrase

A wrong phrase guess loses the game immediately.`;
  },

  buildCompactionPrompt: (history) => `
You've played ${history.length} rounds.
Summarize patterns you've noticed about puzzle categories and common phrases.
What strategies have worked? What letter frequencies have you observed?
`,
});
```

**API Route**:

```typescript
// apps/agent_000/src/app/api/play/route.ts
import { agent } from '../../../agent';
import { runRound } from '@nullagent/agent-core';

export async function POST() {
  const result = await runRound(agent);
  return Response.json(result);
}
```

**No cron, no scheduling** - just hit the API to play one round.

**Dependencies**:
- `@nullagent/agent-core`
- `next`
- `workflow`

---

## Execution Plan (Subagent Parallelization)

### Batch 1: Foundation (SERIAL)

| Task | Subagent | Depends On | Notes |
|------|----------|------------|-------|
| 1.1 Create `@nullagent/database` package | Agent A | - | Must complete before Phase 2 |
| 1.2 Create postgres database locally | Human | - | `createdb nullagent` |

**Why serial**: agent-core depends on database package existing.

### Batch 2: Core Framework (CAN PARALLELIZE within batch)

| Task | Subagent | Depends On | Notes |
|------|----------|------------|-------|
| 2.1 Create `@nullagent/agent-core` types | Agent B | 1.1 | types.ts only |
| 2.2 Create `@nullagent/agent-core` history | Agent C | 1.1 | history.ts - DB queries |
| 2.3 Create `@nullagent/agent-core` compaction | Agent D | 1.1 | compaction.ts |

**Then serial**:
| Task | Subagent | Depends On | Notes |
|------|----------|------------|-------|
| 2.4 Create `@nullagent/agent-core` run-round | Agent E | 2.1, 2.2, 2.3 | Orchestrates all |
| 2.5 Create `@nullagent/agent-core` llm client | Agent E | - | Can be parallel with 2.4 |

### Batch 3: Example App (SERIAL, depends on Batch 2)

| Task | Subagent | Depends On | Notes |
|------|----------|------------|-------|
| 3.1 Create `apps/agent_000` | Agent F | 2.4 | Full app |
| 3.2 Test end-to-end | Agent G | 3.1 | Verify it works |

### Batch 4: QA & Commit (SERIAL)

| Task | Subagent | Depends On | Notes |
|------|----------|------------|-------|
| 4.1 Run `pnpm qa` | Agent H | 3.2 | Must pass |
| 4.2 `git add -A && git commit` | Agent H | 4.1 | Rule #1 |

---

## Key Decisions Made

1. **Prompts are strings** - Apps handle all data fetching and build strings
2. **Outputs are Zod schemas** - Always structured
3. **Default compaction**: `context-window` at `0.75`
4. **No data parameter** in `buildRoundPrompt` - apps capture data in closures or fetch inside the function
5. **First app**: `agent_000` - word guessing game, no external APIs, no persistence, minimal complexity
6. **Run trigger**: Manual API call only (no cron for now)

---

## Environment Variables

```bash
# .env.local
DATABASE_URL=postgresql://localhost:5432/nullagent
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=<your-key>
MODEL_ID=deepseek/deepseek-v3.2
```

---

## Dependencies to Install

**Root** (already have most):
- `workflow` (Workflow DevKit)
- `@workflow/ai` (if using DurableAgent)

**packages/database**:
- `drizzle-orm`
- `drizzle-kit`
- `postgres`
- `dotenv`

**packages/agent-core**:
- `ai` (^5.0.0)
- `@ai-sdk/openai`
- `zod`
- `workflow`

**apps/agent_000**:
- `next`
- `react`
- `react-dom`
