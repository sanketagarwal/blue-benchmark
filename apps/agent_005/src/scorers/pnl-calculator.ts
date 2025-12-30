/**
 * PnL Calculator for trading simulations
 *
 * Calculates profit and loss for limit order fills across different
 * sides (bid/ask) and horizons (1m/5m/15m).
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Fixed trading fee in basis points (1 bp = 0.01%)
 */
export const FIXED_FEE_BPS = 1;

/**
 * Fixed trading fee as decimal (1 bp = 0.0001)
 */
export const FIXED_FEE = 0.0001;

// ============================================================================
// Types
// ============================================================================

export type Side = 'bid' | 'ask';
export type Horizon = '1m' | '5m' | '15m';

export interface PnLInput {
  side: Side;
  horizon: Horizon;
  filled: boolean;
  fillPrice?: number;
  exitMid?: number;
}

export interface PnLResult {
  side: Side;
  horizon: Horizon;
  filled: boolean;
  fillPrice?: number;
  exitMid?: number;
  pnl: number;
}

export interface AggregatedPnL {
  meanPnL: number;
  totalPnL: number;
  filledCount: number;
  pnlBySide: Record<Side, number>;
  pnlByHorizon: Record<Horizon, number>;
}

// ============================================================================
// Contract ID Mapping
// ============================================================================

interface ContractMapping {
  contractId: string;
  side: Side;
  horizon: Horizon;
}

const CONTRACT_MAPPING: ContractMapping[] = [
  { contractId: 'bid-fill-1m', side: 'bid', horizon: '1m' },
  { contractId: 'bid-fill-5m', side: 'bid', horizon: '5m' },
  { contractId: 'bid-fill-15m', side: 'bid', horizon: '15m' },
  { contractId: 'ask-fill-1m', side: 'ask', horizon: '1m' },
  { contractId: 'ask-fill-5m', side: 'ask', horizon: '5m' },
  { contractId: 'ask-fill-15m', side: 'ask', horizon: '15m' },
];

// ============================================================================
// Functions
// ============================================================================

/**
 * Calculate PnL for a single trade
 *
 * If not filled: pnl = 0
 * If bid fills at price p, exit at mid: pnl = exitMid - p - (p * FIXED_FEE)
 * If ask fills at price p, exit at mid: pnl = p - exitMid - (p * FIXED_FEE)
 *
 * @param input - The PnL input containing side, horizon, filled status, and prices
 * @returns The PnL result with calculated profit/loss
 */
export function calculatePnL(input: PnLInput): PnLResult {
  const { side, horizon, filled, fillPrice, exitMid } = input;

  // If not filled, pnl is 0
  if (!filled) {
    return {
      side,
      horizon,
      filled: false,
      pnl: 0,
    };
  }

  // Filled trades require fillPrice and exitMid
  if (fillPrice === undefined || exitMid === undefined) {
    throw new Error('Filled trades require fillPrice and exitMid');
  }

  const fee = fillPrice * FIXED_FEE;

  // Bid: buy at fillPrice, sell at exitMid
  // Ask: sell at fillPrice, buy at exitMid
  const pnl = side === 'bid' ? exitMid - fillPrice - fee : fillPrice - exitMid - fee;

  return {
    side,
    horizon,
    filled: true,
    fillPrice,
    exitMid,
    pnl,
  };
}

/**
 * Calculate PnL for all 6 contracts
 *
 * Maps contract IDs like 'bid-fill-1m' to side='bid', horizon='1m'
 *
 * @param fillDetails - Record mapping contract IDs to fill status and price
 * @param exitMids - Record mapping contract IDs to exit mid prices
 * @returns Array of PnL results for all 6 contracts
 */
export function calculateAllPnL(
  fillDetails: Record<string, { filled: boolean; fillPrice?: number }>,
  exitMids: Record<string, number | undefined>
): PnLResult[] {
  return CONTRACT_MAPPING.map(({ contractId, side, horizon }) => {
    // eslint-disable-next-line security/detect-object-injection -- contractId is from controlled CONTRACT_MAPPING
    const details = fillDetails[contractId];

    // If contract not in fillDetails, treat as unfilled
    if (details === undefined) {
      return {
        side,
        horizon,
        filled: false,
        pnl: 0,
      };
    }

    const { filled, fillPrice } = details;
    // eslint-disable-next-line security/detect-object-injection -- contractId is from controlled CONTRACT_MAPPING
    const exitMid = exitMids[contractId];

    // Handle the case where fillPrice might be undefined
    const input: PnLInput = {
      side,
      horizon,
      filled,
    };

    if (fillPrice !== undefined) {
      input.fillPrice = fillPrice;
    }

    if (exitMid !== undefined) {
      input.exitMid = exitMid;
    }

    return calculatePnL(input);
  });
}

/**
 * Aggregate PnL results
 *
 * Computes mean and total PnL, breaks down by side and horizon
 *
 * @param results - Array of PnL results to aggregate
 * @returns Aggregated PnL with mean, total, and breakdowns
 */
export function aggregatePnL(results: PnLResult[]): AggregatedPnL {
  if (results.length === 0) {
    return {
      meanPnL: 0,
      totalPnL: 0,
      filledCount: 0,
      pnlBySide: { bid: 0, ask: 0 },
      pnlByHorizon: { '1m': 0, '5m': 0, '15m': 0 },
    };
  }

  const totalPnL = results.reduce((sum, r) => sum + r.pnl, 0);
  const meanPnL = totalPnL / results.length;
  const filledCount = results.filter((r) => r.filled).length;

  const pnlBySide: Record<Side, number> = { bid: 0, ask: 0 };
  const pnlByHorizon: Record<Horizon, number> = { '1m': 0, '5m': 0, '15m': 0 };

  for (const result of results) {
    pnlBySide[result.side] += result.pnl;
    pnlByHorizon[result.horizon] += result.pnl;
  }

  return {
    meanPnL,
    totalPnL,
    filledCount,
    pnlBySide,
    pnlByHorizon,
  };
}
