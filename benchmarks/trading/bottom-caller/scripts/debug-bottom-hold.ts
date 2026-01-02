// Debug script - run with: npx tsx scripts/debug-bottom-hold.ts

import { replayLabFetch } from '../src/replay-lab/client.js';

interface Annotation {
  payload?: {
    params?: Record<string, unknown>;
  };
}

interface AnnotationsResponse {
  annotations?: Annotation[];
}

const symbolId = 'COINBASE_SPOT_BTC_USD';
const from = '2025-12-26T17:00:00.000Z';
const to = '2025-12-26T20:00:00.000Z';

// Query without param filters to see ALL bottom_event annotations
const path = `/api/annotations/${symbolId}?type=bottom_event&method=bottom-hold&from=${from}&to=${to}`;

const response = await replayLabFetch<AnnotationsResponse>(path);
console.log('Total annotations:', response.annotations?.length || 0);
console.log(
  'Sample params:',
  JSON.stringify(response.annotations?.[0]?.payload?.params, null, 2)
);
console.log('Unique param combinations:');
const paramCombos = new Set(
  response.annotations?.map((a) => JSON.stringify(a.payload?.params))
);
for (const combo of paramCombos) {
  console.log('  ', combo);
}
