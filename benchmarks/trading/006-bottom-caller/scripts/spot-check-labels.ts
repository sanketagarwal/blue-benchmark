import { getCandles } from '../src/replay-lab/ohlcv.js';
import { resolveNoNewLowGroundTruth } from '../src/ground-truth/no-new-low.js';
import { getTimeframeConfig, TIMEFRAME_IDS } from '../src/timeframe-config.js';

const SYMBOL = 'COINBASE_SPOT_BTC_USD';
const NUM_TIMESTAMPS = 14;
const SNAP_INTERVAL_MS = 15 * 60 * 1000;
const START_TIME = new Date('2025-12-21T00:00:00.000Z');

async function main() {
  const rows: string[] = [];
  
  for (let i = 0; i < NUM_TIMESTAMPS; i++) {
    const snapTime = new Date(START_TIME.getTime() + i * SNAP_INTERVAL_MS);
    console.log(`\n=== ${snapTime.toISOString()} ===`);
    
    const labels: Record<string, number> = {};

    for (const horizonId of TIMEFRAME_IDS) {
      const config = getTimeframeConfig(horizonId);
      const lookbackMs = config.chart.range.fromMinutesAgo * 60_000;
      const forwardMs = config.task.forwardWindowMinutes * 60_000;

      const lookbackFrom = new Date(snapTime.getTime() - lookbackMs);
      const forwardEnd = new Date(snapTime.getTime() + forwardMs);

      const lookback = await getCandles(SYMBOL, config.chart.barTimeframe, lookbackFrom, snapTime);
      const forward = await getCandles(SYMBOL, config.chart.barTimeframe, snapTime, forwardEnd);

      const result = resolveNoNewLowGroundTruth(lookback, forward);
      labels[horizonId] = result.labelNoNewLow;
      
      console.log(`${horizonId}: refLow=${result.refLowPrice.toFixed(2)}, fwdLow=${result.forwardLow.toFixed(2)}, label=${result.labelNoNewLow}`);
    }
    
    rows.push(`| ${snapTime.toISOString()} | ${labels['15m']} | ${labels['1h']} | ${labels['4h']} | ${labels['24h']} |`);
  }
  
  console.log('\n\n| Timestamp | 15m | 1h | 4h | 24h |');
  console.log('|-----------|-----|----|----|-----|');
  rows.forEach(r => console.log(r));
}

main().catch(console.error);
