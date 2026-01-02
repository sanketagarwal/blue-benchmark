// Cross-validate bottom_hold annotations against raw OHLCV data
// Run with: npx tsx scripts/validate-bottom-hold.ts

import {
  getBottomHoldAnnotations,
  didBottomHold,
  type BottomHoldAnnotation,
} from '../src/replay-lab/annotations.js';
import { getCandles, computeMaxDrawdownFromCandles, type CandleTimeframe } from '../src/replay-lab/ohlcv.js';

const SYMBOL_ID = 'COINBASE_SPOT_BTC_USD';
const FROM = new Date('2025-12-26T17:00:00Z');
const TO = new Date('2025-12-26T20:00:00Z');
const PARAMS = {
  lookbackCandles: 12,
  horizonCandles: 24,
  maxDrawdownFrac: 0.005,
  candleTimeframe: '1m' as CandleTimeframe,
};

interface Discrepancy {
  annotationId: string;
  timeStart: string;
  annotationRefLow: number;
  annotationFwdLow: number;
  annotationDrawdown: number;
  computedDrawdown: number;
  drawdownDelta: number;
  annotationHeld: boolean;
  computedHeld: boolean;
  mismatch: boolean;
}

function parseTimeframe(timeframe: string): number {
  const match = timeframe.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`Invalid timeframe: ${timeframe}`);
  const [, value, unit] = match;
  const num = parseInt(value ?? '1', 10);
  switch (unit) {
    case 'm':
      return num * 60 * 1000;
    case 'h':
      return num * 60 * 60 * 1000;
    case 'd':
      return num * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown unit: ${unit}`);
  }
}

async function validateAnnotation(annotation: BottomHoldAnnotation): Promise<Discrepancy> {
  const refLow = annotation.payload.refLow;
  const annotationFwdLow = annotation.payload.fwdLow;
  const annotationDrawdown = annotation.payload.drawdownFrac;
  const params = annotation.payload.params;

  const timeframeMs = parseTimeframe(params.candleTimeframe);
  const horizonMs = params.horizonCandles * timeframeMs;

  const candleStart = new Date(annotation.time_start);
  const candleEnd = new Date(candleStart.getTime() + horizonMs);

  const candles = await getCandles(
    SYMBOL_ID,
    params.candleTimeframe as CandleTimeframe,
    candleStart,
    candleEnd,
    params.horizonCandles + 1
  );

  const computedFwdLow = candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : refLow;
  const computedDrawdown = computeMaxDrawdownFromCandles(candles, refLow);

  const annotationHeld = didBottomHold(annotation);
  const computedHeld = computedDrawdown <= params.maxDrawdownFrac;
  const drawdownDelta = Math.abs(computedDrawdown - annotationDrawdown);
  const mismatch = annotationHeld !== computedHeld || drawdownDelta > 0.0001;

  return {
    annotationId: annotation.id,
    timeStart: annotation.time_start,
    annotationRefLow: refLow,
    annotationFwdLow,
    annotationDrawdown,
    computedDrawdown,
    drawdownDelta,
    annotationHeld,
    computedHeld,
    mismatch,
  };
}

async function main(): Promise<void> {
  console.log('Fetching bottom_hold annotations...');
  console.log(`  Symbol: ${SYMBOL_ID}`);
  console.log(`  From: ${FROM.toISOString()}`);
  console.log(`  To: ${TO.toISOString()}`);
  console.log(`  Params:`, PARAMS);

  const availableAt = new Date();
  const annotations = await getBottomHoldAnnotations(SYMBOL_ID, PARAMS, FROM, TO, availableAt);

  console.log(`\nFound ${annotations.length} annotations to validate\n`);

  if (annotations.length === 0) {
    console.log('No annotations found for the given parameters.');
    return;
  }

  const discrepancies: Discrepancy[] = [];

  for (const annotation of annotations) {
    const result = await validateAnnotation(annotation);
    discrepancies.push(result);

    const status = result.mismatch ? '❌ MISMATCH' : '✓ OK';
    console.log(
      `${status} | ${result.timeStart} | refLow=${result.annotationRefLow.toFixed(2)} | ` +
        `annotation: dd=${(result.annotationDrawdown * 100).toFixed(4)}% held=${result.annotationHeld} | ` +
        `computed: dd=${(result.computedDrawdown * 100).toFixed(4)}% held=${result.computedHeld}`
    );
  }

  const mismatches = discrepancies.filter((d) => d.mismatch);

  console.log('\n--- Summary ---');
  console.log(`Total annotations: ${annotations.length}`);
  console.log(`Matching: ${annotations.length - mismatches.length}`);
  console.log(`Mismatches: ${mismatches.length}`);

  if (mismatches.length > 0) {
    console.log('\nDiscrepancies:');
    for (const d of mismatches) {
      console.log(`  ${d.timeStart}:`);
      console.log(`    Annotation: refLow=${d.annotationRefLow}, fwdLow=${d.annotationFwdLow}, dd=${d.annotationDrawdown}, held=${d.annotationHeld}`);
      console.log(`    Computed:   dd=${d.computedDrawdown}, held=${d.computedHeld}`);
      console.log(`    Delta: ${d.drawdownDelta}`);
    }
    process.exit(1);
  }

  console.log('\nAll annotations validated successfully.');
}

main().catch((error: unknown) => {
  console.error('Validation failed:', error);
  process.exit(1);
});
