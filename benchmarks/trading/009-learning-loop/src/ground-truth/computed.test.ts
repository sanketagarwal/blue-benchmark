/**
 * Unit tests for computed ground truth values.
 * 
 * These test the calculations we do ourselves (not from Replay Labs):
 * - VWAP (Volume Weighted Average Price)
 * - Bollinger Bands (20-period SMA ± 2 std dev)
 * - Trend direction
 * - Volatility classification
 * 
 * Run: npx tsx src/ground-truth/computed.test.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import type { Candle } from '../replay-lab/ohlcv.js';

// ============================================================================
// Implementations to test (extracted for testing)
// ============================================================================

/**
 * Compute VWAP from raw candle data.
 * Formula: Σ(Typical Price × Volume) / Σ(Volume)
 * where Typical Price = (High + Low + Close) / 3
 */
export function computeVWAP(candles: Candle[]): number {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
  }
  
  if (cumulativeVolume === 0) {
    return candles[candles.length - 1]?.close ?? 0;
  }
  
  return cumulativeTPV / cumulativeVolume;
}

/**
 * Compute Bollinger Bands from raw candle data.
 * - Middle: 20-period SMA of close prices
 * - Upper: Middle + (2 × standard deviation)
 * - Lower: Middle - (2 × standard deviation)
 */
export function computeBollingerBands(
  candles: Candle[], 
  period = 20, 
  stdDevMultiplier = 2
): { upper: number; lower: number; mid: number } {
  if (candles.length < period) {
    // Fallback for insufficient data
    const closes = candles.map(c => c.close);
    const mid = closes.reduce((a, b) => a + b, 0) / closes.length;
    const range = Math.max(...candles.map(c => c.high)) - Math.min(...candles.map(c => c.low));
    return { upper: mid + range * 0.5, lower: mid - range * 0.5, mid };
  }

  const relevantCandles = candles.slice(-period);
  const closes = relevantCandles.map(c => c.close);
  
  // SMA
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  
  // Standard deviation (population)
  const squaredDiffs = closes.map(c => Math.pow(c - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: sma + (stdDev * stdDevMultiplier),
    lower: sma - (stdDev * stdDevMultiplier),
    mid: sma,
  };
}

/**
 * Compute trend direction from price change.
 * @returns 'up' if >0.5% gain, 'down' if >0.5% loss, 'flat' otherwise
 */
export function computeTrendDirection(
  candles: Candle[],
  lookback = 10,
  threshold = 0.005
): 'up' | 'down' | 'flat' {
  if (candles.length < 2) return 'flat';
  
  const relevantCandles = candles.slice(-lookback);
  const firstClose = relevantCandles[0]?.close ?? candles[0]!.close;
  const lastClose = candles[candles.length - 1]!.close;
  
  const priceChange = (lastClose - firstClose) / firstClose;
  
  if (priceChange > threshold) return 'up';
  if (priceChange < -threshold) return 'down';
  return 'flat';
}

/**
 * Compute volatility level from average range.
 * @returns 'high' if avg range >1.5% of price, 'low' if <0.8%, 'medium' otherwise
 */
export function computeVolatilityLevel(
  candles: Candle[],
  lookback = 10
): 'high' | 'medium' | 'low' {
  if (candles.length === 0) return 'medium';
  
  const relevantCandles = candles.slice(-lookback);
  const avgRange = relevantCandles.reduce((sum, c) => sum + (c.high - c.low), 0) / relevantCandles.length;
  const avgPrice = relevantCandles.reduce((sum, c) => sum + c.close, 0) / relevantCandles.length;
  
  const volatilityPct = avgRange / avgPrice;
  
  if (volatilityPct > 0.015) return 'high';
  if (volatilityPct < 0.008) return 'low';
  return 'medium';
}

// ============================================================================
// Test utilities
// ============================================================================

function createCandle(
  timestamp: Date,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
): Candle {
  return { timestamp, open, high, low, close, volume };
}

function assertApproxEqual(actual: number, expected: number, tolerance: number, message: string): void {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual} (diff: ${diff}, tolerance: ${tolerance})`);
  }
  console.log(`  ✅ ${message}: ${actual.toFixed(4)} ≈ ${expected.toFixed(4)}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
  console.log(`  ✅ ${message}: ${actual} === ${expected}`);
}

// ============================================================================
// Test cases
// ============================================================================

async function testVWAP() {
  console.log('\n📊 Testing VWAP Calculation\n');
  
  // Test 1: Simple case with equal volumes
  // VWAP should equal average of typical prices when volumes are equal
  const candles1: Candle[] = [
    createCandle(new Date(), 100, 105, 95, 102, 1000),  // TP = (105+95+102)/3 = 100.67
    createCandle(new Date(), 102, 110, 100, 108, 1000), // TP = (110+100+108)/3 = 106.00
    createCandle(new Date(), 108, 112, 105, 110, 1000), // TP = (112+105+110)/3 = 109.00
  ];
  const vwap1 = computeVWAP(candles1);
  // Expected: (100.67 + 106 + 109) / 3 = 105.22
  assertApproxEqual(vwap1, 105.22, 0.1, 'Equal volume VWAP');

  // Test 2: Volume-weighted case
  // Higher volume on higher prices should pull VWAP up
  const candles2: Candle[] = [
    createCandle(new Date(), 100, 105, 95, 100, 100),   // TP = 100, low volume
    createCandle(new Date(), 100, 120, 100, 120, 1000), // TP = 113.33, HIGH volume
  ];
  const vwap2 = computeVWAP(candles2);
  // Expected: (100*100 + 113.33*1000) / 1100 = 112.12
  assertApproxEqual(vwap2, 112.12, 0.1, 'Volume-weighted VWAP');

  // Test 3: Verify formula manually
  // TP1 = (105+95+100)/3 = 100
  // TP2 = (120+100+120)/3 = 113.33
  // VWAP = (100*100 + 113.33*1000) / (100+1000) = 112.12
  const tp1 = (105 + 95 + 100) / 3;
  const tp2 = (120 + 100 + 120) / 3;
  const expectedVwap = (tp1 * 100 + tp2 * 1000) / 1100;
  assertApproxEqual(vwap2, expectedVwap, 0.01, 'Manual VWAP verification');

  // Test 4: Single candle
  const candles3: Candle[] = [
    createCandle(new Date(), 100, 110, 90, 105, 500),
  ];
  const vwap3 = computeVWAP(candles3);
  // TP = (110+90+105)/3 = 101.67
  assertApproxEqual(vwap3, 101.67, 0.1, 'Single candle VWAP');
  
  console.log('\n  All VWAP tests passed! ✅');
}

async function testBollingerBands() {
  console.log('\n📈 Testing Bollinger Bands Calculation\n');
  
  // Test 1: Constant price (std dev = 0)
  const constantCandles: Candle[] = Array.from({ length: 20 }, (_, i) => 
    createCandle(new Date(Date.now() + i * 60000), 100, 100, 100, 100, 1000)
  );
  const bb1 = computeBollingerBands(constantCandles);
  assertEqual(bb1.mid, 100, 'Constant price - middle band');
  assertEqual(bb1.upper, 100, 'Constant price - upper band (no volatility)');
  assertEqual(bb1.lower, 100, 'Constant price - lower band (no volatility)');

  // Test 2: Linear increasing prices
  // 100, 101, 102, ..., 119 (20 values)
  const linearCandles: Candle[] = Array.from({ length: 20 }, (_, i) => 
    createCandle(new Date(Date.now() + i * 60000), 100 + i, 100 + i, 100 + i, 100 + i, 1000)
  );
  const bb2 = computeBollingerBands(linearCandles);
  // SMA = (100+101+...+119)/20 = 109.5
  assertApproxEqual(bb2.mid, 109.5, 0.01, 'Linear increase - middle band (SMA)');
  
  // Std dev of 100-119: sqrt(sum((x-109.5)^2)/20) ≈ 5.77
  // Upper = 109.5 + 2*5.77 = 121.04
  // Lower = 109.5 - 2*5.77 = 97.96
  assertApproxEqual(bb2.upper, 121.04, 0.1, 'Linear increase - upper band');
  assertApproxEqual(bb2.lower, 97.96, 0.1, 'Linear increase - lower band');

  // Test 3: Verify std dev calculation manually
  const closes = linearCandles.map(c => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / 20;
  const variance = closes.map(c => Math.pow(c - mean, 2)).reduce((a, b) => a + b, 0) / 20;
  const stdDev = Math.sqrt(variance);
  assertApproxEqual(stdDev, 5.77, 0.01, 'Manual std dev verification');

  // Test 4: With only 5 candles (fallback mode)
  const shortCandles: Candle[] = Array.from({ length: 5 }, (_, i) => 
    createCandle(new Date(Date.now() + i * 60000), 100, 110, 90, 100 + i * 5, 1000)
  );
  const bb3 = computeBollingerBands(shortCandles);
  // Fallback: mid = avg close, bands = mid ± half range
  // Closes: 100, 105, 110, 115, 120 → avg = 110
  // Range: 110 - 90 = 20 (using all candles high/low)
  assertApproxEqual(bb3.mid, 110, 0.1, 'Fallback mode - middle');
  
  console.log('\n  All Bollinger Bands tests passed! ✅');
}

async function testTrendDirection() {
  console.log('\n📉 Testing Trend Direction Calculation\n');
  
  // Test 1: Clear uptrend (>0.5% gain)
  const uptrendCandles: Candle[] = [
    createCandle(new Date(), 100, 101, 99, 100, 1000),
    createCandle(new Date(), 100, 102, 100, 101, 1000),
    createCandle(new Date(), 101, 103, 101, 102, 1000),
    createCandle(new Date(), 102, 104, 102, 103, 1000),
    createCandle(new Date(), 103, 105, 103, 104, 1000),
    createCandle(new Date(), 104, 106, 104, 105, 1000),
    createCandle(new Date(), 105, 107, 105, 106, 1000),
    createCandle(new Date(), 106, 108, 106, 107, 1000),
    createCandle(new Date(), 107, 109, 107, 108, 1000),
    createCandle(new Date(), 108, 110, 108, 110, 1000), // 10% gain
  ];
  assertEqual(computeTrendDirection(uptrendCandles), 'up', 'Clear uptrend');

  // Test 2: Clear downtrend (>0.5% loss)
  const downtrendCandles: Candle[] = [
    createCandle(new Date(), 100, 101, 99, 100, 1000),
    createCandle(new Date(), 100, 100, 98, 98, 1000),
    createCandle(new Date(), 98, 98, 96, 96, 1000),
    createCandle(new Date(), 96, 96, 94, 94, 1000),
    createCandle(new Date(), 94, 94, 92, 92, 1000),
    createCandle(new Date(), 92, 92, 90, 90, 1000),
    createCandle(new Date(), 90, 90, 88, 88, 1000),
    createCandle(new Date(), 88, 88, 86, 86, 1000),
    createCandle(new Date(), 86, 86, 84, 84, 1000),
    createCandle(new Date(), 84, 84, 82, 80, 1000), // 20% loss
  ];
  assertEqual(computeTrendDirection(downtrendCandles), 'down', 'Clear downtrend');

  // Test 3: Flat (within 0.5% threshold)
  const flatCandles: Candle[] = [
    createCandle(new Date(), 100, 101, 99, 100, 1000),
    createCandle(new Date(), 100, 101, 99, 100.1, 1000),
    createCandle(new Date(), 100, 101, 99, 100.2, 1000),
    createCandle(new Date(), 100, 101, 99, 100.1, 1000),
    createCandle(new Date(), 100, 101, 99, 100, 1000),
    createCandle(new Date(), 100, 101, 99, 100.3, 1000),
    createCandle(new Date(), 100, 101, 99, 100.2, 1000),
    createCandle(new Date(), 100, 101, 99, 100.1, 1000),
    createCandle(new Date(), 100, 101, 99, 100.2, 1000),
    createCandle(new Date(), 100, 101, 99, 100.4, 1000), // 0.4% gain < 0.5%
  ];
  assertEqual(computeTrendDirection(flatCandles), 'flat', 'Flat/sideways');

  // Test 4: Just above threshold (0.6% gain)
  const thresholdCandles: Candle[] = Array.from({ length: 10 }, (_, i) => 
    createCandle(new Date(Date.now() + i * 60000), 100, 101, 99, i === 9 ? 100.6 : 100, 1000)
  );
  assertEqual(computeTrendDirection(thresholdCandles), 'up', 'Just above 0.5% threshold (0.6% gain)');
  
  // Test 5: Exactly at threshold is flat (using > not >=)
  const exactThresholdCandles: Candle[] = Array.from({ length: 10 }, (_, i) => 
    createCandle(new Date(Date.now() + i * 60000), 100, 101, 99, i === 9 ? 100.5 : 100, 1000)
  );
  assertEqual(computeTrendDirection(exactThresholdCandles), 'flat', 'Exactly at 0.5% is flat (using > not >=)');

  console.log('\n  All Trend Direction tests passed! ✅');
}

async function testVolatilityLevel() {
  console.log('\n🌊 Testing Volatility Level Calculation\n');
  
  // Test 1: High volatility (>1.5% range)
  const highVolCandles: Candle[] = Array.from({ length: 10 }, (_, i) => 
    createCandle(
      new Date(Date.now() + i * 60000), 
      100, 
      108,  // 8% range
      92, 
      100, 
      1000
    )
  );
  // Range = 16, Price = 100, Range% = 16%
  assertEqual(computeVolatilityLevel(highVolCandles), 'high', 'High volatility (8% range)');

  // Test 2: Low volatility (<0.8% range)
  const lowVolCandles: Candle[] = Array.from({ length: 10 }, (_, i) => 
    createCandle(
      new Date(Date.now() + i * 60000), 
      100, 
      100.3,  // 0.5% range
      99.8, 
      100, 
      1000
    )
  );
  // Range = 0.5, Price = 100, Range% = 0.5%
  assertEqual(computeVolatilityLevel(lowVolCandles), 'low', 'Low volatility (0.5% range)');

  // Test 3: Medium volatility (between 0.8% and 1.5%)
  const medVolCandles: Candle[] = Array.from({ length: 10 }, (_, i) => 
    createCandle(
      new Date(Date.now() + i * 60000), 
      100, 
      101,  // 1% range
      100, 
      100.5, 
      1000
    )
  );
  // Range = 1, Price = 100.5, Range% = ~1%
  assertEqual(computeVolatilityLevel(medVolCandles), 'medium', 'Medium volatility (1% range)');

  console.log('\n  All Volatility Level tests passed! ✅');
}

// ============================================================================
// Main test runner
// ============================================================================

async function main() {
  console.log('=' .repeat(60));
  console.log('🧪 UNIT TESTS FOR COMPUTED GROUND TRUTH VALUES');
  console.log('=' .repeat(60));
  
  let passed = 0;
  let failed = 0;

  try {
    await testVWAP();
    passed++;
  } catch (err) {
    console.error(`\n❌ VWAP tests failed: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }

  try {
    await testBollingerBands();
    passed++;
  } catch (err) {
    console.error(`\n❌ Bollinger Bands tests failed: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }

  try {
    await testTrendDirection();
    passed++;
  } catch (err) {
    console.error(`\n❌ Trend Direction tests failed: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }

  try {
    await testVolatilityLevel();
    passed++;
  } catch (err) {
    console.error(`\n❌ Volatility Level tests failed: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }

  console.log('\n' + '=' .repeat(60));
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
  console.log('=' .repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);

