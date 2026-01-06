/**
 * Generate signed chart URLs for README documentation
 * Usage: cd apps/agent_003 && node --env-file=.env.local --import tsx scripts/generate-chart-urls.ts
 */

const REPLAY_LAB_API_KEY = process.env['REPLAY_LAB_API_KEY'];
const REPLAY_LAB_BASE_URL = process.env['REPLAY_LAB_BASE_URL'];
const SYMBOL_ID = process.env['SYMBOL_ID'] ?? 'COINBASE_SPOT_ETH_USD';

if (!REPLAY_LAB_API_KEY || !REPLAY_LAB_BASE_URL) {
  console.error('Missing REPLAY_LAB_API_KEY or REPLAY_LAB_BASE_URL');
  process.exit(1);
}

const CHART_LAYERS = 'candles,sma:20,ema:20,bb:20:2,vwap,volume';
const SIX_MONTHS_SECONDS = 6 * 30 * 24 * 60 * 60; // ~6 months

interface SignedUrlResponse {
  url: string;
  expiresAt: string;
}

async function getSignedUrl(chartPath: string): Promise<SignedUrlResponse> {
  const response = await fetch(`${REPLAY_LAB_BASE_URL}/api/signed-url`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': REPLAY_LAB_API_KEY!,
    },
    body: JSON.stringify({
      path: chartPath,
      expiresIn: SIX_MONTHS_SECONDS,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const now = new Date();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  console.log('Generating signed chart URLs for README...');
  console.log(`Current time: ${now.toISOString()}`);
  console.log(`Symbol: ${SYMBOL_ID}`);
  console.log();

  // Chart 1: 4-hour chart with 5m candles
  const chart4hPath = `/api/charts/${SYMBOL_ID}/image?timeframe=5m&from=${fourHoursAgo.toISOString()}&to=${now.toISOString()}&layers=${CHART_LAYERS}&width=1200&height=800`;

  // Chart 2: 24-hour chart with 15m candles
  const chart24hPath = `/api/charts/${SYMBOL_ID}/image?timeframe=15m&from=${twentyFourHoursAgo.toISOString()}&to=${now.toISOString()}&layers=${CHART_LAYERS}&width=1200&height=800`;

  const [chart4h, chart24h] = await Promise.all([
    getSignedUrl(chart4hPath),
    getSignedUrl(chart24hPath),
  ]);

  console.log('=== 4-Hour Chart (5m candles) ===');
  console.log(`URL: ${chart4h.url}`);
  console.log(`Expires: ${chart4h.expiresAt}`);
  console.log();

  console.log('=== 24-Hour Chart (15m candles) ===');
  console.log(`URL: ${chart24h.url}`);
  console.log(`Expires: ${chart24h.expiresAt}`);
  console.log();

  console.log('=== Markdown for README ===');
  console.log('```markdown');
  console.log('### Example Charts');
  console.log();
  console.log('**4-Hour Chart (5-minute candles):**');
  console.log(`![4h Chart](${chart4h.url})`);
  console.log();
  console.log('**24-Hour Chart (15-minute candles):**');
  console.log(`![24h Chart](${chart24h.url})`);
  console.log('```');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
