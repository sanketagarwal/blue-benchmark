# Agents 001-003 CLI Refactor

## Overview

Refactor agents 001, 002, and 003 from Next.js API servers to CLI benchmark tools matching the agent_004 pattern.

## Agent 001 & 002: Puzzle Games

**Current:** Next.js server with `POST /api/play` endpoint
**Target:** CLI via `pnpm benchmark` that runs 3 complete games

### Benchmark Flow

```
FOR game = 1 to 3:
  1. Create puzzle (Puzzle Master agent)
  2. LOOP until solved or failed (max 26 guesses):
     - Run Player agent
     - Process guess (letter or phrase)
     - Track moves
  3. Record: won/lost, moves taken, score (002 only)

Print summary table
Exit cleanly
```

### Output Format (001)

```
┌─────────────────────────────────────────────────────────────┐
│            agent_001 Benchmark Results (3 games)            │
├─────────┬────────────┬───────────┬─────────────────────────┤
│  Game   │   Result   │   Moves   │         Phrase          │
├─────────┼────────────┼───────────┼─────────────────────────┤
│    1    │    WON     │     8     │ HELLO WORLD             │
│    2    │    WON     │    12     │ FORTUNE FAVORS THE BOLD │
│    3    │   LOST     │    26     │ XYLOPHONE SYMPHONY      │
├─────────┴────────────┴───────────┴─────────────────────────┤
│ Summary: 2/3 won (66.7%), avg 15.3 moves                    │
└─────────────────────────────────────────────────────────────┘
```

### Output Format (002)

Same as 001 but summary includes average score:
```
│ Summary: 2/3 won (66.7%), avg 15.3 moves, avg score 0.72    │
```

## Agent 003: Forecaster

**Current:** Next.js server with `POST /api/play` endpoint
**Target:** CLI via `pnpm benchmark` that runs 3 forecast rounds

### Benchmark Flow

```
Initialize clock from SIMULATION_START_TIME

FOR round = 1 to 3:
  1. Fetch charts and orderbook
  2. Run forecaster agent
  3. Get ground truth
  4. Score predictions
  5. Advance clock +1 hour

Print summary table
Exit cleanly
```

### Output Format

```
┌───────────────────────────────────────────────────────────────┐
│              agent_003 Benchmark Results (3 rounds)           │
├─────────────────────────────────┬─────────┬─────────┬─────────┤
│ Model                           │  Brier  │ LogLoss │Accuracy │
├─────────────────────────────────┼─────────┼─────────┼─────────┤
│ xai/grok-4.1-fast-reasoning     │   0.142 │   0.431 │   77.8% │
└───────────────────────────────────────────────────────────────┘
```

## Common Changes

For all three agents:

1. **Remove:** `src/app/` directory (API routes)
2. **Remove from package.json:**
   - `next` dependency
   - `react`, `react-dom` dependencies
   - `@types/react` devDependency
   - `dev`, `build`, `start` scripts
3. **Add to package.json:**
   - `tsx` devDependency
   - `"benchmark": "tsx src/benchmark.ts"` script
4. **Add:** `src/benchmark.ts` CLI entry point
5. **Add:** Explicit `process.exit(0)` on completion
6. **Update:** `tsconfig.json` to library config (not nextjs)
