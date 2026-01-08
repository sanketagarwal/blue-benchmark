# CLAUDE.md – 007 Chart Reader Benchmark

## Purpose

This benchmark tests whether vision LLMs can **accurately extract structured information from candlestick charts**. Unlike prediction benchmarks, this tests the fundamental skill of chart reading—OCR, visual comparison, and structured extraction.

Reference: https://gist.github.com/andrewxhill/cbde7d80e91b332f5d97085c9cfed8f0

## Commands

```bash
pnpm benchmark            # Full benchmark
pnpm benchmark --quick    # Quick mode (fewer samples)
pnpm benchmark --model <id>  # Single model test
pnpm test                 # Run tests
pnpm test:watch           # Watch mode
pnpm test:coverage        # With coverage
pnpm lint                 # ESLint
pnpm check-types          # TypeScript check
```

## Architecture

- **`src/chart-reader.ts`** – Agent definition with chart reading prompt
- **`src/output-schema.ts`** – Zod schema for structured chart readings
- **`src/benchmark.ts`** – Main CLI entrypoint
- **`src/matrix.ts`** – Loads model matrix from `models.json`
- **`src/ground-truth/`** – Compute ground truth from OHLCV data
- **`src/scorers/`** – Scoring logic for each category
- **`src/replay-lab/`** – API client for charts and OHLCV data

## Test Categories

1. **Direct Text Readouts** – OHLC values, indicator readings (exact match)
2. **Derived Fields** – Candle direction, range, body, wicks (computed accuracy)
3. **Ordinal Tasks** – Which candle has max high, min low, etc. (argmax correctness)
4. **Sequence Tasks** – Bull/bear sequence for last N candles (Hamming accuracy)
5. **Annotations** – Marker counts for local extrema

## Environment

Requires `.env.local`:
```bash
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
REPLAY_LAB_API_KEY=rn_...
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
```

## Key Differences from 006-bottom-caller

- **No phases** – Simple single-pass evaluation
- **No predictions** – Tests extraction, not forecasting
- **Different scoring** – Exact match, Hamming distance, ordinal accuracy
- **Simpler structure** – No ensemble, no extension triggers

