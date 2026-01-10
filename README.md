# NullAgent Benchmark Suite

**A framework for benchmarking LLM agents on trading and financial tasks.**

Built on the [NullAgent](https://github.com/recallnet/nullagent-tutorial) minimal agent framework with [Replay Labs](https://replay-lab-delta.preview.recall.network) market data APIs.

---

## Benchmarks

### 009 In-Context Learning ⭐ NEW

**Test whether vision LLMs can LEARN from feedback and improve accuracy.**

Models receive feedback on their mistakes and are re-tested to measure learning:

```
Round 1: Baseline  →  Model analyzes chart  →  Score accuracy
                            ↓
                      FEEDBACK PROVIDED
                            ↓
Round 2: Same Chart  →  Re-analyze with feedback  →  Memorization test
Round 3: Similar Chart  →  New chart, same conditions  →  Transfer test
```

Tests in-context learning capabilities:
- **Memorization**: Can model apply specific feedback to the same chart?
- **Transfer**: Can model generalize learning to similar charts?

📁 Location: `benchmarks/trading/009-learning-loop/`
📖 [Full Documentation](benchmarks/trading/009-learning-loop/README.md)

**Quick Run:**
```bash
cd benchmarks/trading/009-learning-loop
cp env.example .env.local  # Add your API keys
pnpm icl --quick --model=google/gemini-2.0-flash
```

**Sample Results:**
| Model | Baseline | After Feedback | Learning Gain |
|-------|----------|----------------|---------------|
| gemini-2.0-flash | 58.3% | 100% | **+41.7%** |

---

### 008 Chart Predictor

**Test vision LLMs' ability to PREDICT future chart patterns.**

Models see a chart at time T and predict what patterns will appear at T+1:

```
Chart at T  →  Model Predicts T+1  →  Validate vs Actual T+1
  (input)        (prediction)           (ground truth)
```

Tests across multiple configurations:
- **Chart lengths**: 20, 50, 100 candles
- **Timeframes**: 5m, 15m, 1h, 4h

📁 Location: `benchmarks/trading/008-chart-predictor/`
📖 [Full Documentation](benchmarks/trading/008-chart-predictor/README.md)

**Quick Run:**
```bash
cd benchmarks/trading/008-chart-predictor
cp env.example .env.local  # Add your API keys
pnpm benchmark --cheap --quick
```

---

### 007 Chart Reader

**Test vision LLMs' ability to see and understand candlestick charts.**

Tests 3 levels of visual understanding:

```
Level 1: PERCEPTION   →  Can models SEE the chart?
Level 2: ANALYSIS     →  Can models identify INDIVIDUAL patterns?
Level 3: SYNTHESIS    →  Can models COMBINE multiple signals?  ← Tested here
```

📁 Location: `benchmarks/trading/007-chart-reader/`
📖 [Full Documentation](benchmarks/trading/007-chart-reader/README.md)

**Quick Run:**
```bash
cd benchmarks/trading/007-chart-reader
cp env.example .env.local  # Add your API keys
pnpm benchmark --cheap --quick
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL running locally
- [Vercel AI Gateway](https://vercel.com/ai-gateway) API key
- [Replay Labs](https://replay-lab-delta.preview.recall.network) API key

### Installation

```bash
# Clone the repo
git clone https://github.com/sanketagarwal/blue-benchmark.git
cd blue-benchmark

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Database Setup

```bash
# Create database
createdb nullagent_007

# Run migrations
cd packages/database
pnpm drizzle-kit push
cd ../..
```

### Run a Benchmark

```bash
# Navigate to benchmark
cd benchmarks/trading/007-chart-reader

# Configure environment
cp env.example .env.local
# Edit .env.local with your API keys

# Run benchmark
pnpm benchmark --cheap --quick
```

---

## Architecture

```
blue-benchmark/
├── packages/
│   ├── agent-core/      # Core agent framework
│   ├── cli-utils/       # CLI utilities
│   ├── database/        # Drizzle ORM + PostgreSQL
│   └── eslint-config/   # Shared linting rules
├── benchmarks/
│   └── trading/
│       ├── 007-chart-reader/     ← Chart reading (observation)
│       ├── 008-chart-predictor/  ← Chart prediction (forecasting)
│       └── 009-learning-loop/    ← In-context learning (NEW)
└── apps/                # Example agent apps
```

---

## API Dependencies

| API | Purpose | Get Access |
|-----|---------|------------|
| **Vercel AI Gateway** | Unified multi-provider LLM access | [vercel.com/ai-gateway](https://vercel.com/ai-gateway) |
| **Replay Labs** | Chart images + OHLCV data | [replay-lab-delta.preview.recall.network](https://replay-lab-delta.preview.recall.network) |

---

## License

MIT

