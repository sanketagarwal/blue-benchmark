import { getCandles } from '../src/replay-lab/ohlcv.js';
import { resolveNoNewLowGroundTruth } from '../src/ground-truth/no-new-low.js';
import { getTimeframeConfig, TIMEFRAME_IDS } from '../src/timeframe-config.js';

const SYMBOL = 'COINBASE_SPOT_BTC_USD';
const SNAP_INTERVAL_MS = 15 * 60 * 1000;

// Find transition between Dec 18 (100% neg on 24h) and Dec 19 (0% neg)
const TEST_DATES = [
  '2025-12-18T18:00:00.000Z',
  '2025-12-18T20:00:00.000Z',
  '2025-12-18T22:00:00.000Z',
  '2025-12-18T23:00:00.000Z',
];

async function checkPeriod(startTime: Date, numSamples: number): Promise<Record<string, { zeros: number; ones: number }>> {
  const counts: Record<string, { zeros: number; ones: number }> = {
    '15m': { zeros: 0, ones: 0 },
    '1h': { zeros: 0, ones: 0 },
    '4h': { zeros: 0, ones: 0 },
    '24h': { zeros: 0, ones: 0 },
  };

  for (let i = 0; i < numSamples; i++) {
    const snapTime = new Date(startTime.getTime() + i * SNAP_INTERVAL_MS);

    for (const horizonId of TIMEFRAME_IDS) {
      const config = getTimeframeConfig(horizonId);
      const lookbackMs = config.chart.range.fromMinutesAgo * 60_000;
      const forwardMs = config.task.forwardWindowMinutes * 60_000;

      const lookbackFrom = new Date(snapTime.getTime() - lookbackMs);
      const forwardEnd = new Date(snapTime.getTime() + forwardMs);

      try {
        const lookback = await getCandles(SYMBOL, config.chart.barTimeframe, lookbackFrom, snapTime);
        const forward = await getCandles(SYMBOL, config.chart.barTimeframe, snapTime, forwardEnd);
        const result = resolveNoNewLowGroundTruth(lookback, forward);
        
        if (result.labelNoNewLow === 0) {
          counts[horizonId].zeros++;
        } else {
          counts[horizonId].ones++;
        }
      } catch {
        // Skip errors
      }
    }
  }
  return counts;
}

function scoreVariability(counts: Record<string, { zeros: number; ones: number }>): number {
  let score = 0;
  for (const h of TIMEFRAME_IDS) {
    const total = counts[h].zeros + counts[h].ones;
    if (total === 0) return -1;
    const pct = counts[h].zeros / total;
    score += 1 - Math.abs(0.5 - pct) * 2;
  }
  return score / 4;
}

async function main() {
  console.log('Finding 24h transition point...\n');
  
  let bestDate = '';
  let bestScore = -1;
  
  for (const dateStr of TEST_DATES) {
    const startTime = new Date(dateStr);
    console.log(`\n=== Testing ${dateStr} (14 samples) ===`);
    
    const counts = await checkPeriod(startTime, 14);
    
    for (const h of TIMEFRAME_IDS) {
      const c = counts[h];
      const total = c.zeros + c.ones;
      const pct = total > 0 ? (c.zeros / total * 100).toFixed(0) : 'N/A';
      console.log(`${h}: ${c.zeros}/${total} negative (${pct}%)`);
    }
    
    const score = scoreVariability(counts);
    console.log(`SCORE: ${score.toFixed(2)}`);
    
    if (score > bestScore) {
      bestScore = score;
      bestDate = dateStr;
    }
  }
  
  console.log(`\n=== BEST: ${bestDate} (score: ${bestScore.toFixed(2)}) ===`);
}

main().catch(console.error);
