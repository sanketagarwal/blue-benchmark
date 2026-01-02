import { replayLabFetch } from '../src/replay-lab/client.js';

const SYMBOL = 'COINBASE_SPOT_BTC_USD';
const FROM = '2025-12-26T17:00:00Z';
const TO = '2025-12-26T20:00:00Z';

const TASK_SPEC_PARAMS = {
  '15m': { lookbackCandles: 24, horizonCandles: 3, maxDrawdownFrac: 0.005, candleTimeframe: '5m' },
  '1h': { lookbackCandles: 32, horizonCandles: 4, maxDrawdownFrac: 0.01, candleTimeframe: '15m' },
  '4h': { lookbackCandles: 32, horizonCandles: 4, maxDrawdownFrac: 0.02, candleTimeframe: '1h' },
  '24h': { lookbackCandles: 48, horizonCandles: 6, maxDrawdownFrac: 0.04, candleTimeframe: '4h' },
};

async function testHorizon(horizon: string, params: typeof TASK_SPEC_PARAMS['15m']) {
  console.log(`\nTesting ${horizon}...`);
  const path = `/api/annotations/${SYMBOL}/compute`;
  const body = {
    type: 'bottom_event',
    method: 'bottom-hold',
    params,
    from: FROM,
    to: TO,
    cachePolicy: 'persist',
  };
  
  try {
    const response = await replayLabFetch(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    console.log(`  ✓ ${horizon}: ${response.annotations?.length || 0} annotations`);
    if (response.annotations?.[0]) {
      console.log(`  Sample:`, JSON.stringify(response.annotations[0].payload, null, 2));
    }
  } catch (error) {
    console.log(`  ✗ ${horizon}: ${error.message}`);
  }
}

async function main() {
  console.log('Testing /compute endpoint with Task Spec v1 params...');
  for (const [horizon, params] of Object.entries(TASK_SPEC_PARAMS)) {
    await testHorizon(horizon, params);
  }
}

main();
