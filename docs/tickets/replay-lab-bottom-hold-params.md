# Replay Lab: Compute/Store bottom_hold Annotations with Task Spec v1 Params

## Status

**Resolved - No changes needed**

## Priority

**Blocking** - Required for Phase 2+ of benchmark implementation

## Context

Replay Lab currently only computes bottom_hold annotations with a single parameter set:
- `{lookbackCandles: 12, horizonCandles: 24, maxDrawdownFrac: 0.005, candleTimeframe: 1m}`

For benchmarking across multiple prediction horizons, we need to compute and store annotations using the full Task Spec v1 parameter configurations. Each horizon has specific tuned parameters for lookback, prediction window, drawdown tolerance, and candle granularity.

## Required Parameters

| Horizon | lookbackCandles | horizonCandles | maxDrawdownFrac | candleTimeframe |
|---------|-----------------|----------------|-----------------|-----------------|
| 15m     | 24              | 3              | 0.005           | 5m              |
| 1h      | 32              | 4              | 0.01            | 15m             |
| 4h      | 32              | 4              | 0.02            | 1h              |
| 24h     | 48              | 6              | 0.04            | 4h              |

## Symbol

`btcusdt-binance-perp`

## Time Range

Historical data sufficient for benchmarking purposes.

## Acceptance Criteria

- [x] bottom_hold annotations computed for all 4 horizon configurations
- [x] Annotations stored and accessible for benchmark evaluation
- [x] Data covers required historical time range for btcusdt-binance-perp

## Resolution

### Replay Lab Team Response

The system already supports all Task Spec v1 parameters. Use the following endpoint and request format:

**Endpoint:** `POST /api/annotations/{symbolId}/compute`

**Request Format:**
```json
{
  "annotationType": "bottom_hold",
  "params": {
    "lookbackCandles": 24,
    "horizonCandles": 3,
    "maxDrawdownFrac": 0.005,
    "candleTimeframe": "5m"
  }
}
```

**Horizon Configurations:**

| Horizon | Request Body |
|---------|--------------|
| 15m     | `{"annotationType": "bottom_hold", "params": {"lookbackCandles": 24, "horizonCandles": 3, "maxDrawdownFrac": 0.005, "candleTimeframe": "5m"}}` |
| 1h      | `{"annotationType": "bottom_hold", "params": {"lookbackCandles": 32, "horizonCandles": 4, "maxDrawdownFrac": 0.01, "candleTimeframe": "15m"}}` |
| 4h      | `{"annotationType": "bottom_hold", "params": {"lookbackCandles": 32, "horizonCandles": 4, "maxDrawdownFrac": 0.02, "candleTimeframe": "1h"}}` |
| 24h     | `{"annotationType": "bottom_hold", "params": {"lookbackCandles": 48, "horizonCandles": 6, "maxDrawdownFrac": 0.04, "candleTimeframe": "4h"}}` |

**Available Symbols:**
- `COINBASE_SPOT_BTC_USD`
- `COINBASE_SPOT_ETH_USD`
- `COINBASE_SPOT_SOL_USD`
- `COINBASE_SPOT_AERO_USD`
- `COINBASE_SPOT_RECALL_USD`

**Data Availability:** ~12/20/2025 onwards
