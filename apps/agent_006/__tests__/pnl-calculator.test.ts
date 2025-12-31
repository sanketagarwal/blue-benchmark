import { describe, expect, it } from 'vitest';
import {
  calculatePnL,
  calculateAllPnL,
  aggregatePnL,
  FIXED_FEE_BPS,
  FIXED_FEE,
} from '../src/scorers/pnl-calculator';
import type { PnLInput, PnLResult } from '../src/scorers/pnl-calculator';

describe('PnL Calculator Constants', () => {
  it('FIXED_FEE_BPS equals 1 basis point', () => {
    expect(FIXED_FEE_BPS).toBe(1);
  });

  it('FIXED_FEE equals 0.0001 (0.01%)', () => {
    expect(FIXED_FEE).toBe(0.0001);
  });
});

describe('calculatePnL', () => {
  describe('unfilled orders', () => {
    it('returns pnl = 0 when order is not filled', () => {
      const input: PnLInput = {
        side: 'bid',
        horizon: '1m',
        filled: false,
      };
      const result = calculatePnL(input);
      expect(result.pnl).toBe(0);
      expect(result.filled).toBe(false);
      expect(result.side).toBe('bid');
      expect(result.horizon).toBe('1m');
    });

    it('returns pnl = 0 for ask when not filled', () => {
      const input: PnLInput = {
        side: 'ask',
        horizon: '5m',
        filled: false,
      };
      const result = calculatePnL(input);
      expect(result.pnl).toBe(0);
      expect(result.filled).toBe(false);
    });
  });

  describe('bid fills (buy low, sell at mid)', () => {
    it('returns positive PnL when price increases (bid filled, exit higher)', () => {
      // Bid fills at 100, exit mid at 110
      // PnL = exitMid - fillPrice - (fillPrice * FIXED_FEE)
      // PnL = 110 - 100 - (100 * 0.0001) = 10 - 0.01 = 9.99
      const input: PnLInput = {
        side: 'bid',
        horizon: '1m',
        filled: true,
        fillPrice: 100,
        exitMid: 110,
      };
      const result = calculatePnL(input);
      expect(result.pnl).toBeCloseTo(9.99);
      expect(result.filled).toBe(true);
      expect(result.fillPrice).toBe(100);
      expect(result.exitMid).toBe(110);
    });

    it('returns negative PnL when price decreases (bid filled, exit lower)', () => {
      // Bid fills at 100, exit mid at 90
      // PnL = 90 - 100 - (100 * 0.0001) = -10 - 0.01 = -10.01
      const input: PnLInput = {
        side: 'bid',
        horizon: '5m',
        filled: true,
        fillPrice: 100,
        exitMid: 90,
      };
      const result = calculatePnL(input);
      expect(result.pnl).toBeCloseTo(-10.01);
    });

    it('returns slightly negative PnL when price stays same (fee only)', () => {
      // Bid fills at 100, exit mid at 100
      // PnL = 100 - 100 - (100 * 0.0001) = 0 - 0.01 = -0.01
      const input: PnLInput = {
        side: 'bid',
        horizon: '15m',
        filled: true,
        fillPrice: 100,
        exitMid: 100,
      };
      const result = calculatePnL(input);
      expect(result.pnl).toBeCloseTo(-0.01);
    });
  });

  describe('ask fills (sell high, buy at mid)', () => {
    it('returns positive PnL when price decreases (ask filled, exit lower)', () => {
      // Ask fills at 100, exit mid at 90
      // PnL = fillPrice - exitMid - (fillPrice * FIXED_FEE)
      // PnL = 100 - 90 - (100 * 0.0001) = 10 - 0.01 = 9.99
      const input: PnLInput = {
        side: 'ask',
        horizon: '1m',
        filled: true,
        fillPrice: 100,
        exitMid: 90,
      };
      const result = calculatePnL(input);
      expect(result.pnl).toBeCloseTo(9.99);
    });

    it('returns negative PnL when price increases (ask filled, exit higher)', () => {
      // Ask fills at 100, exit mid at 110
      // PnL = 100 - 110 - (100 * 0.0001) = -10 - 0.01 = -10.01
      const input: PnLInput = {
        side: 'ask',
        horizon: '5m',
        filled: true,
        fillPrice: 100,
        exitMid: 110,
      };
      const result = calculatePnL(input);
      expect(result.pnl).toBeCloseTo(-10.01);
    });

    it('returns slightly negative PnL when price stays same (fee only)', () => {
      // Ask fills at 100, exit mid at 100
      // PnL = 100 - 100 - (100 * 0.0001) = 0 - 0.01 = -0.01
      const input: PnLInput = {
        side: 'ask',
        horizon: '15m',
        filled: true,
        fillPrice: 100,
        exitMid: 100,
      };
      const result = calculatePnL(input);
      expect(result.pnl).toBeCloseTo(-0.01);
    });
  });

  describe('fee calculation', () => {
    it('calculates fee as percentage of fill price for bid', () => {
      // Higher fill price = higher fee
      const input1: PnLInput = {
        side: 'bid',
        horizon: '1m',
        filled: true,
        fillPrice: 1000,
        exitMid: 1000, // Same price, so PnL is just -fee
      };
      const result1 = calculatePnL(input1);
      // Fee = 1000 * 0.0001 = 0.1
      expect(result1.pnl).toBeCloseTo(-0.1);

      const input2: PnLInput = {
        side: 'bid',
        horizon: '1m',
        filled: true,
        fillPrice: 10000,
        exitMid: 10000,
      };
      const result2 = calculatePnL(input2);
      // Fee = 10000 * 0.0001 = 1.0
      expect(result2.pnl).toBeCloseTo(-1.0);
    });

    it('calculates fee as percentage of fill price for ask', () => {
      const input: PnLInput = {
        side: 'ask',
        horizon: '1m',
        filled: true,
        fillPrice: 50000, // BTC-like price
        exitMid: 50000,
      };
      const result = calculatePnL(input);
      // Fee = 50000 * 0.0001 = 5.0
      expect(result.pnl).toBeCloseTo(-5.0);
    });
  });
});

describe('calculateAllPnL', () => {
  it('maps contract IDs to correct side and horizon', () => {
    const fillDetails: Record<string, { filled: boolean; fillPrice?: number }> = {
      'bid-fill-1m': { filled: true, fillPrice: 100 },
      'bid-fill-5m': { filled: true, fillPrice: 100 },
      'bid-fill-15m': { filled: true, fillPrice: 100 },
      'ask-fill-1m': { filled: true, fillPrice: 100 },
      'ask-fill-5m': { filled: true, fillPrice: 100 },
      'ask-fill-15m': { filled: true, fillPrice: 100 },
    };
    const exitMids: Record<string, number | undefined> = {
      'bid-fill-1m': 105,
      'bid-fill-5m': 105,
      'bid-fill-15m': 105,
      'ask-fill-1m': 95,
      'ask-fill-5m': 95,
      'ask-fill-15m': 95,
    };

    const results = calculateAllPnL(fillDetails, exitMids);

    expect(results).toHaveLength(6);

    // Check bid results
    const bid1m = results.find((r) => r.side === 'bid' && r.horizon === '1m');
    expect(bid1m).toBeDefined();
    expect(bid1m?.filled).toBe(true);

    const bid5m = results.find((r) => r.side === 'bid' && r.horizon === '5m');
    expect(bid5m).toBeDefined();

    const bid15m = results.find((r) => r.side === 'bid' && r.horizon === '15m');
    expect(bid15m).toBeDefined();

    // Check ask results
    const ask1m = results.find((r) => r.side === 'ask' && r.horizon === '1m');
    expect(ask1m).toBeDefined();

    const ask5m = results.find((r) => r.side === 'ask' && r.horizon === '5m');
    expect(ask5m).toBeDefined();

    const ask15m = results.find((r) => r.side === 'ask' && r.horizon === '15m');
    expect(ask15m).toBeDefined();
  });

  it('handles mixed filled/unfilled correctly', () => {
    const fillDetails: Record<string, { filled: boolean; fillPrice?: number }> = {
      'bid-fill-1m': { filled: true, fillPrice: 100 },
      'bid-fill-5m': { filled: false },
      'bid-fill-15m': { filled: true, fillPrice: 100 },
      'ask-fill-1m': { filled: false },
      'ask-fill-5m': { filled: true, fillPrice: 100 },
      'ask-fill-15m': { filled: false },
    };
    const exitMids: Record<string, number | undefined> = {
      'bid-fill-1m': 110,
      'bid-fill-5m': undefined,
      'bid-fill-15m': 110,
      'ask-fill-1m': undefined,
      'ask-fill-5m': 90,
      'ask-fill-15m': undefined,
    };

    const results = calculateAllPnL(fillDetails, exitMids);

    const filledResults = results.filter((r) => r.filled);
    const unfilledResults = results.filter((r) => !r.filled);

    expect(filledResults).toHaveLength(3);
    expect(unfilledResults).toHaveLength(3);

    // All unfilled should have pnl = 0
    for (const r of unfilledResults) {
      expect(r.pnl).toBe(0);
    }

    // Filled should have non-zero pnl
    for (const r of filledResults) {
      expect(r.pnl).not.toBe(0);
    }
  });

  it('calculates correct PnL for each contract', () => {
    const fillDetails: Record<string, { filled: boolean; fillPrice?: number }> = {
      'bid-fill-1m': { filled: true, fillPrice: 100 },
      'bid-fill-5m': { filled: true, fillPrice: 100 },
      'bid-fill-15m': { filled: true, fillPrice: 100 },
      'ask-fill-1m': { filled: true, fillPrice: 100 },
      'ask-fill-5m': { filled: true, fillPrice: 100 },
      'ask-fill-15m': { filled: true, fillPrice: 100 },
    };
    // Bids: exit higher (+PnL), Asks: exit lower (+PnL)
    const exitMids: Record<string, number | undefined> = {
      'bid-fill-1m': 110,
      'bid-fill-5m': 110,
      'bid-fill-15m': 110,
      'ask-fill-1m': 90,
      'ask-fill-5m': 90,
      'ask-fill-15m': 90,
    };

    const results = calculateAllPnL(fillDetails, exitMids);

    // All should have positive PnL (price moved favorably)
    for (const r of results) {
      expect(r.pnl).toBeGreaterThan(0);
      // PnL should be close to 9.99 (10 - 0.01 fee)
      expect(r.pnl).toBeCloseTo(9.99);
    }
  });

  it('returns results for all 6 contracts even when some are missing', () => {
    // Partial fill details - only some contracts provided
    const fillDetails: Record<string, { filled: boolean; fillPrice?: number }> = {
      'bid-fill-1m': { filled: true, fillPrice: 100 },
      'ask-fill-15m': { filled: true, fillPrice: 100 },
    };
    const exitMids: Record<string, number | undefined> = {
      'bid-fill-1m': 110,
      'ask-fill-15m': 90,
    };

    const results = calculateAllPnL(fillDetails, exitMids);

    // Should still return 6 results
    expect(results).toHaveLength(6);

    // Missing contracts should be treated as unfilled with pnl = 0
    const missingContracts = results.filter(
      (r) => !(r.side === 'bid' && r.horizon === '1m') && !(r.side === 'ask' && r.horizon === '15m')
    );
    for (const r of missingContracts) {
      expect(r.filled).toBe(false);
      expect(r.pnl).toBe(0);
    }
  });
});

describe('aggregatePnL', () => {
  it('computes correct mean PnL', () => {
    const results: PnLResult[] = [
      { side: 'bid', horizon: '1m', filled: true, fillPrice: 100, exitMid: 110, pnl: 9.99 },
      { side: 'bid', horizon: '5m', filled: true, fillPrice: 100, exitMid: 90, pnl: -10.01 },
      { side: 'bid', horizon: '15m', filled: false, pnl: 0 },
      { side: 'ask', horizon: '1m', filled: true, fillPrice: 100, exitMid: 95, pnl: 4.99 },
      { side: 'ask', horizon: '5m', filled: false, pnl: 0 },
      { side: 'ask', horizon: '15m', filled: false, pnl: 0 },
    ];

    const aggregate = aggregatePnL(results);

    // Mean = (9.99 + -10.01 + 0 + 4.99 + 0 + 0) / 6 = 4.97 / 6 = 0.8283...
    expect(aggregate.meanPnL).toBeCloseTo(4.97 / 6);
  });

  it('computes correct total PnL', () => {
    const results: PnLResult[] = [
      { side: 'bid', horizon: '1m', filled: true, fillPrice: 100, exitMid: 110, pnl: 10 },
      { side: 'bid', horizon: '5m', filled: true, fillPrice: 100, exitMid: 105, pnl: 5 },
      { side: 'bid', horizon: '15m', filled: true, fillPrice: 100, exitMid: 95, pnl: -5 },
      { side: 'ask', horizon: '1m', filled: false, pnl: 0 },
      { side: 'ask', horizon: '5m', filled: false, pnl: 0 },
      { side: 'ask', horizon: '15m', filled: false, pnl: 0 },
    ];

    const aggregate = aggregatePnL(results);

    expect(aggregate.totalPnL).toBe(10);
  });

  it('counts filled trades correctly', () => {
    const results: PnLResult[] = [
      { side: 'bid', horizon: '1m', filled: true, fillPrice: 100, exitMid: 110, pnl: 10 },
      { side: 'bid', horizon: '5m', filled: false, pnl: 0 },
      { side: 'bid', horizon: '15m', filled: true, fillPrice: 100, exitMid: 105, pnl: 5 },
      { side: 'ask', horizon: '1m', filled: true, fillPrice: 100, exitMid: 95, pnl: 5 },
      { side: 'ask', horizon: '5m', filled: false, pnl: 0 },
      { side: 'ask', horizon: '15m', filled: false, pnl: 0 },
    ];

    const aggregate = aggregatePnL(results);

    expect(aggregate.filledCount).toBe(3);
  });

  it('breaks down PnL by side', () => {
    const results: PnLResult[] = [
      { side: 'bid', horizon: '1m', filled: true, fillPrice: 100, exitMid: 110, pnl: 10 },
      { side: 'bid', horizon: '5m', filled: true, fillPrice: 100, exitMid: 105, pnl: 5 },
      { side: 'bid', horizon: '15m', filled: false, pnl: 0 },
      { side: 'ask', horizon: '1m', filled: true, fillPrice: 100, exitMid: 90, pnl: 10 },
      { side: 'ask', horizon: '5m', filled: true, fillPrice: 100, exitMid: 105, pnl: -5 },
      { side: 'ask', horizon: '15m', filled: false, pnl: 0 },
    ];

    const aggregate = aggregatePnL(results);

    expect(aggregate.pnlBySide.bid).toBe(15); // 10 + 5 + 0
    expect(aggregate.pnlBySide.ask).toBe(5); // 10 + -5 + 0
  });

  it('breaks down PnL by horizon', () => {
    const results: PnLResult[] = [
      { side: 'bid', horizon: '1m', filled: true, fillPrice: 100, exitMid: 110, pnl: 10 },
      { side: 'bid', horizon: '5m', filled: true, fillPrice: 100, exitMid: 105, pnl: 5 },
      { side: 'bid', horizon: '15m', filled: true, fillPrice: 100, exitMid: 102, pnl: 2 },
      { side: 'ask', horizon: '1m', filled: true, fillPrice: 100, exitMid: 95, pnl: 5 },
      { side: 'ask', horizon: '5m', filled: true, fillPrice: 100, exitMid: 98, pnl: 2 },
      { side: 'ask', horizon: '15m', filled: true, fillPrice: 100, exitMid: 99, pnl: 1 },
    ];

    const aggregate = aggregatePnL(results);

    expect(aggregate.pnlByHorizon['1m']).toBe(15); // 10 + 5
    expect(aggregate.pnlByHorizon['5m']).toBe(7); // 5 + 2
    expect(aggregate.pnlByHorizon['15m']).toBe(3); // 2 + 1
  });

  it('handles empty results array', () => {
    const results: PnLResult[] = [];
    const aggregate = aggregatePnL(results);

    expect(aggregate.meanPnL).toBe(0);
    expect(aggregate.totalPnL).toBe(0);
    expect(aggregate.filledCount).toBe(0);
    expect(aggregate.pnlBySide.bid).toBe(0);
    expect(aggregate.pnlBySide.ask).toBe(0);
    expect(aggregate.pnlByHorizon['1m']).toBe(0);
    expect(aggregate.pnlByHorizon['5m']).toBe(0);
    expect(aggregate.pnlByHorizon['15m']).toBe(0);
  });

  it('handles all unfilled results', () => {
    const results: PnLResult[] = [
      { side: 'bid', horizon: '1m', filled: false, pnl: 0 },
      { side: 'bid', horizon: '5m', filled: false, pnl: 0 },
      { side: 'bid', horizon: '15m', filled: false, pnl: 0 },
      { side: 'ask', horizon: '1m', filled: false, pnl: 0 },
      { side: 'ask', horizon: '5m', filled: false, pnl: 0 },
      { side: 'ask', horizon: '15m', filled: false, pnl: 0 },
    ];

    const aggregate = aggregatePnL(results);

    expect(aggregate.meanPnL).toBe(0);
    expect(aggregate.totalPnL).toBe(0);
    expect(aggregate.filledCount).toBe(0);
  });
});
