# Agent_004: Limit Order Value Prediction

**Date:** 2025-12-29
**Status:** Design
**Author:** Claude + Andrew

## Overview

Agent_004 simulates an HFT market-maker's core competency: predicting the expected value of placing limit orders. This is the "crown jewel" of market-making—capturing spread while avoiding adverse selection.

The agent predicts:
1. **Fill Probability** - Will my limit order get filled?
2. **Fair Price Movement** - If filled, will price move against me?
3. **Expected Value** - Combining the above into P&L prediction

## Why This Matters

From the research brief:
> "The real-time model that estimates the expected value of placing, keeping, or canceling a limit order right now."

This directly maps to how HFT market-makers win. Capturing spread is easy. Capturing spread without being adversely selected is hard.

## Data Available (Replay Lab API)

### Inputs (what agent sees at time T)

| Endpoint | Data | Use |
|----------|------|-----|
| `/api/orderbook/{symbolId}` | mid_price, spread, spread_bps, imbalance, bid_depth, ask_depth | Current market state |
| `/api/charts/{symbolId}/image` | Candlestick charts with indicators | Visual pattern recognition |
| `/api/indicators/{symbolId}` | RSI, MACD, BBW, ATR, etc. | Technical signals |
| `/api/ohlcv/{symbolId}` | Recent candles | Price history |

### Ground Truth (what we check after)

| Endpoint | Data | Use |
|----------|------|-----|
| `/api/trades/{symbolId}` | timestamp, price, size, **taker_side** | Fill simulation |
| `/api/orderbook/{symbolId}` | Future mid_price | Price movement |

### Key Insight: taker_side Enables Real Fill Simulation

```
Limit BUY at best_bid fills when:  trade.taker_side = SELL AND trade.price <= best_bid

Limit SELL at best_ask fills when: trade.taker_side = BUY AND trade.price >= best_ask
```

This is exactly how real exchanges work.

---

## Prediction Contracts

### Phase 1: Fill Probability (6 contracts)

Boolean predictions scored with Brier score and log-loss.

| Contract ID | Description | Ground Truth |
|-------------|-------------|--------------|
| `bid-fill-1m` | Limit buy at best_bid fills in 1 min | Any SELL trade at ≤ best_bid |
| `bid-fill-5m` | Limit buy at best_bid fills in 5 min | Any SELL trade at ≤ best_bid |
| `bid-fill-15m` | Limit buy at best_bid fills in 15 min | Any SELL trade at ≤ best_bid |
| `ask-fill-1m` | Limit sell at best_ask fills in 1 min | Any BUY trade at ≥ best_ask |
| `ask-fill-5m` | Limit sell at best_ask fills in 5 min | Any BUY trade at ≥ best_ask |
| `ask-fill-15m` | Limit sell at best_ask fills in 15 min | Any BUY trade at ≥ best_ask |

**Monotonicity Constraints:**
- `bid-fill-15m >= bid-fill-5m >= bid-fill-1m` (more time = more fill chances)
- `ask-fill-15m >= ask-fill-5m >= ask-fill-1m`

### Phase 2: Fair Price Direction (4 contracts)

Boolean predictions for price movement direction.

| Contract ID | Description | Ground Truth |
|-------------|-------------|--------------|
| `price-up-1m` | Mid-price higher in 1 min | mid_price(T+1m) > mid_price(T) |
| `price-up-5m` | Mid-price higher in 5 min | mid_price(T+5m) > mid_price(T) |
| `price-down-1m` | Mid-price lower in 1 min | mid_price(T+1m) < mid_price(T) |
| `price-down-5m` | Mid-price lower in 5 min | mid_price(T+5m) < mid_price(T) |

### Phase 3: Expected Value (4 contracts)

Numeric predictions in basis points, scored with MSE.

| Contract ID | Description | Ground Truth |
|-------------|-------------|--------------|
| `bid-ev-1m` | EV of limit buy at best_bid, 1m hold | If filled: (mid_T+1m - fill_price) bps; else: 0 |
| `bid-ev-5m` | EV of limit buy at best_bid, 5m hold | If filled: (mid_T+5m - fill_price) bps; else: 0 |
| `ask-ev-1m` | EV of limit sell at best_ask, 1m hold | If filled: (fill_price - mid_T+1m) bps; else: 0 |
| `ask-ev-5m` | EV of limit sell at best_ask, 5m hold | If filled: (fill_price - mid_T+5m) bps; else: 0 |

**Note:** EV is from the market-maker's perspective:
- Buy low, sell higher = positive EV
- Filled then price moves against you = negative EV (adverse selection)

---

## Tutorial Scope

For the initial tutorial, implement **Phase 1 only** (6 fill probability contracts). This is:
- Clearly scorable with existing Brier/log-loss infrastructure
- Genuinely aligned with HFT core competency
- Simple enough to explain in a tutorial
- Extensible to Phase 2 and 3 later

---

## Architecture

### Directory Structure

```
apps/agent_004/
├── src/
│   ├── market-maker.ts          # Agent definition (like forecaster.ts)
│   ├── clock-state.ts           # Copy from agent_003
│   ├── replay-lab/
│   │   ├── client.ts            # Copy from agent_003
│   │   ├── orderbook.ts         # Copy from agent_003
│   │   ├── charts.ts            # Copy from agent_003
│   │   └── trades.ts            # NEW: Fetch tick-by-tick trades
│   ├── ground-truth/
│   │   └── fill-checker.ts      # NEW: Check if hypothetical orders filled
│   ├── scorers/
│   │   ├── types.ts             # Contract type definitions
│   │   ├── brier-scorer.ts      # Copy from agent_003
│   │   ├── log-loss-scorer.ts   # Copy from agent_003
│   │   ├── monotonicity-scorer.ts # Adapt for fill constraints
│   │   └── aggregate-scorer.ts  # Combine scorers
│   └── app/
│       └── api/
│           └── play/
│               └── route.ts     # Main endpoint
├── __tests__/
│   ├── trades.test.ts
│   ├── fill-checker.test.ts
│   └── market-maker.test.ts
├── package.json
├── tsconfig.json
└── .env.local
```

### New Components

#### 1. `trades.ts` - Fetch Tick-by-Tick Trades

```typescript
interface Trade {
  timestamp: Date;
  price: number;
  size: number;
  takerSide: 'BUY' | 'SELL';
  uuid: string;
}

interface TradesResponse {
  symbolId: string;
  trades: Trade[];
}

export async function getTrades(
  symbolId: string,
  from: Date,
  to: Date
): Promise<Trade[]>;
```

#### 2. `fill-checker.ts` - Ground Truth for Fill Probability

```typescript
interface FillCheckResult {
  filled: boolean;
  fillTime?: Date;
  fillPrice?: number;
}

export function checkBidFill(
  trades: Trade[],
  bidPrice: number,
  horizon: Date
): FillCheckResult;

export function checkAskFill(
  trades: Trade[],
  askPrice: number,
  horizon: Date
): FillCheckResult;
```

#### 3. `market-maker.ts` - Agent Definition

```typescript
const OutputSchema = z.object({
  reasoning: z.string(),
  predictions: z.object({
    'bid-fill-1m': z.number().min(0).max(1),
    'bid-fill-5m': z.number().min(0).max(1),
    'bid-fill-15m': z.number().min(0).max(1),
    'ask-fill-1m': z.number().min(0).max(1),
    'ask-fill-5m': z.number().min(0).max(1),
    'ask-fill-15m': z.number().min(0).max(1),
  }),
});

export const marketMaker = defineAgent({
  id: 'market_maker_001',
  outputSchema: OutputSchema,
  // ...
});
```

---

## Prompt Design

The agent receives:

1. **Current orderbook state:**
   - Mid-price, spread (absolute and bps)
   - Order book imbalance (-1 to +1)
   - Bid/ask depths

2. **Charts:**
   - 4-hour chart with 5m candles (short-term patterns)
   - 24-hour chart with 15m candles (context)

3. **Task:**
   Predict fill probabilities for hypothetical limit orders

### Example Prompt

```
You are a market-making algorithm predicting fill probabilities.

Current Time: 2025-12-22T14:00:00Z
Symbol: COINBASE_SPOT_ETH_USD

Orderbook State:
- Mid Price: $3,055.56
- Spread: $0.12 (0.39 bps)
- Imbalance: +0.37 (more bid depth)
- Best Bid: $3,055.50
- Best Ask: $3,055.62

Charts (analyze for momentum, volatility, support/resistance):
- 4-Hour Chart: [URL]
- 24-Hour Chart: [URL]

PREDICT: If you placed a limit order RIGHT NOW, what's the probability it fills?

Contracts:
- bid-fill-1m: Limit BUY at $3,055.50 fills within 1 minute
- bid-fill-5m: Limit BUY at $3,055.50 fills within 5 minutes
- bid-fill-15m: Limit BUY at $3,055.50 fills within 15 minutes
- ask-fill-1m: Limit SELL at $3,055.62 fills within 1 minute
- ask-fill-5m: Limit SELL at $3,055.62 fills within 5 minutes
- ask-fill-15m: Limit SELL at $3,055.62 fills within 15 minutes

CONSTRAINTS:
- Longer horizons must have equal or higher fill probability
- bid-fill-15m >= bid-fill-5m >= bid-fill-1m
- ask-fill-15m >= ask-fill-5m >= ask-fill-1m

Consider:
- Imbalance > 0 suggests buying pressure (asks more likely to fill)
- Tight spread means prices are stable (lower fill probability)
- High volatility periods have higher fill probabilities
```

---

## Ground Truth Flow

```
Time T: Agent sees orderbook, makes predictions
         best_bid = $3,055.50
         best_ask = $3,055.62

Time T to T+15m: Fetch all trades

Check bid-fill-1m:
  Any trade where taker_side=SELL AND price <= $3,055.50 in [T, T+1m]?

Check bid-fill-5m:
  Any trade where taker_side=SELL AND price <= $3,055.50 in [T, T+5m]?

... etc for all contracts

Score: Brier, LogLoss, Monotonicity
```

---

## Scoring

### Per-Contract Scores (same as agent_003)

| Metric | Formula | Range | Better |
|--------|---------|-------|--------|
| Brier Score | (prediction - actual)² | 0-1 | Lower |
| Log Loss | -[actual×log(p) + (1-actual)×log(1-p)] | 0-∞ | Lower |

### Aggregate Scores

- Mean Brier Score across all contracts
- Mean Log Loss across all contracts
- Accuracy (% of correct directional predictions)
- Monotonicity violations count

### Calibration (Future Enhancement)

Track: "When I predict 70% fill, does it fill ~70% of the time?"

---

## Implementation Plan

### Phase 1: Scaffold (Copy agent_003)
1. Copy `apps/agent_003` to `apps/agent_004`
2. Rename references: forecaster → marketMaker
3. Update package.json name and port (3005)

### Phase 2: Add Trades API
1. Create `src/replay-lab/trades.ts`
2. Add tests for trades fetching
3. Handle same-day constraint (CoinAPI limitation)

### Phase 3: Fill Checker
1. Create `src/ground-truth/fill-checker.ts`
2. Implement `checkBidFill()` and `checkAskFill()`
3. Add comprehensive tests

### Phase 4: Agent Definition
1. Update output schema for fill predictions
2. Write new prompt in `market-maker.ts`
3. Update compaction prompt for market-making context

### Phase 5: Scoring Adaptation
1. Adapt monotonicity scorer for fill constraints
2. Update aggregate scorer
3. Add fill-specific metrics

### Phase 6: Play Route
1. Wire up trades fetching
2. Integrate fill checker for ground truth
3. Complete scoring pipeline

### Phase 7: Testing & Verification
1. Run multiple rounds
2. Verify scoring accuracy
3. Check monotonicity enforcement

---

## Success Criteria

1. **Functional:** Agent makes predictions, gets scored, learns via compaction
2. **Accurate Ground Truth:** Fill checker correctly identifies fills from trade data
3. **Proper Scoring:** Brier and log-loss match expected values
4. **Monotonicity:** Agent respects fill probability constraints
5. **Tutorial Ready:** Code is clean, well-commented, easy to follow

---

## Future Extensions

### Phase 2: Price Direction
Add `price-up-Xm` contracts using future orderbook mid-price.

### Phase 3: Expected Value
Add `bid-ev-Xm` contracts combining fill probability with price movement.

### Phase 4: Adverse Selection Scoring
Track: "When filled, how often does price move against me?"

### Phase 5: Queue Position Modeling
Estimate queue position effects on fill probability (requires order book depth data).

---

## Open Questions

1. **Clock advancement:** Should we use 1-minute steps (like agent_003's 1-hour) or shorter?
   - *Recommendation:* 1-minute steps for more data points, but configurable

2. **Same-day constraint:** CoinAPI requires from/to on same UTC day. Handle edge cases?
   - *Recommendation:* Keep prediction windows short (<1 day) initially

3. **Fill price assumption:** Use first fill or average if multiple fills?
   - *Recommendation:* First fill (conservative, simpler)

---

## References

- [Microprice Paper (SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2970694)
- [Queue Position Valuation (Moallemi)](https://moallemi.com/ciamac/papers/queue-value-2016.pdf)
- [Fill Probability Deep Learning (Taylor & Francis)](https://www.tandfonline.com/doi/full/10.1080/14697688.2022.2124189)
- [ABIDES Market Simulator (arXiv)](https://arxiv.org/abs/1904.12066)
