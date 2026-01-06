import { getCandles } from '../src/replay-lab/ohlcv.js';
import { resolveNoNewLowGroundTruth } from '../src/ground-truth/no-new-low.js';
import { getTimeframeConfig, TIMEFRAME_IDS } from '../src/timeframe-config.js';

const SYMBOL = 'COINBASE_SPOT_BTC_USD';
const SNAP_INTERVAL_MS = 15 * 60 * 1000;

// Search within the good full benchmark period for best 3-sample window
const BASE_TIME = new Date('2025-12-18T18:00:00.000Z');

async function getLabel(snapTime: Date, horizonId: string): Promise<number> {
  const config = getTimeframeConfig(horizonId as any);
  const lookbackMs = config.chart.range.fromMinutesAgo * 60_000;
  const forwardMs = config.task.forwardWindowMinutes * 60_000;

  const lookbackFrom = new Date(snapTime.getTime() - lookbackMs);
  const forwardEnd = new Date(snapTime.getTime() + forwardMs);

  const lookback = await getCandles(SYMBOL, config.chart.barTimeframe, lookbackFrom, snapTime);
  const forward = await getCandles(SYMBOL, config.chart.barTimeframe, snapTime, forwardEnd);
  const result = resolveNoNewLowGroundTruth(lookback, forward);
  return result.labelNoNewLow;
}

async function main() {
  console.log('Finding best 3-sample window for quick mode...\n');
  
  // Get all 14 labels first
  const allLabels: Record<string, number[]> = { '15m': [], '1h': [], '4h': [], '24h': [] };
  const timestamps: Date[] = [];
  
  for (let i = 0; i < 14; i++) {
    const snapTime = new Date(BASE_TIME.getTime() + i * SNAP_INTERVAL_MS);
    timestamps.push(snapTime);
    
    for (const h of TIMEFRAME_IDS) {
      const label = await getLabel(snapTime, h);
      allLabels[h].push(label);
    }
  }
  
  // Find best 3-sample window
  let bestStart = 0;
  let bestScore = -1;
  
  for (let start = 0; start <= 11; start++) {
    let score = 0;
    console.log(`\n=== Window starting at ${timestamps[start].toISOString()} ===`);
    
    for (const h of TIMEFRAME_IDS) {
      const window = allLabels[h].slice(start, start + 3);
      const zeros = window.filter(l => l === 0).length;
      const ones = 3 - zeros;
      console.log(`${h}: [${window.join(',')}] = ${zeros} zeros, ${ones} ones`);
      
      // Score: prefer at least 1 of each
      if (zeros > 0 && ones > 0) score += 2;
      else if (zeros > 0 || ones > 0) score += 1;
    }
    
    console.log(`SCORE: ${score}`);
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  
  console.log(`\n\n=== BEST QUICK MODE START: ${timestamps[bestStart].toISOString()} (score: ${bestScore}) ===`);
  console.log(`=== FULL BENCHMARK START: ${BASE_TIME.toISOString()} ===`);
}

main().catch(console.error);
