#!/usr/bin/env npx tsx
/**
 * Test script to check what annotations are available from Replay Labs.
 * Run: npx tsx src/test-annotations.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { listAnnotators, getAnnotations, getLocalExtrema, getRegime, getIndicatorSignals } from './replay-lab/annotations.js';

const SYMBOL_ID = 'COINBASE_SPOT_BTC_USD';

async function main() {
  console.log('🔍 Checking Replay Labs Annotations API...\n');

  // Test time range (last 24 hours)
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

  console.log(`Symbol: ${SYMBOL_ID}`);
  console.log(`From: ${from.toISOString()}`);
  console.log(`To: ${to.toISOString()}\n`);

  // 1. List available annotators
  console.log('=' .repeat(60));
  console.log('1. AVAILABLE ANNOTATORS');
  console.log('=' .repeat(60));
  
  try {
    const annotators = await listAnnotators();
    console.log(`Found ${annotators.length} annotators:\n`);
    
    for (const ann of annotators) {
      console.log(`  📌 ${ann.name}`);
      console.log(`     Type: ${ann.type}`);
      console.log(`     Description: ${ann.description}`);
      if (ann.parameters) {
        console.log(`     Params: ${JSON.stringify(ann.parameters)}`);
      }
      console.log('');
    }
  } catch (err) {
    console.log(`❌ Failed to list annotators: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // 2. Try to fetch local extrema
  console.log('=' .repeat(60));
  console.log('2. LOCAL EXTREMA (swing highs/lows)');
  console.log('=' .repeat(60));
  
  try {
    const extrema = await getLocalExtrema(SYMBOL_ID, from, to);
    console.log(`Found ${extrema.length} local extrema:\n`);
    
    for (const e of extrema.slice(0, 5)) {
      console.log(`  ${e.payload.kind === 'top' ? '📈' : '📉'} ${e.payload.kind.toUpperCase()}`);
      console.log(`     Time: ${e.time_start}`);
      console.log(`     Price: $${e.payload.price.toLocaleString()}`);
      console.log(`     Source: ${e.source}`);
      console.log('');
    }
    
    if (extrema.length > 5) {
      console.log(`  ... and ${extrema.length - 5} more\n`);
    }
  } catch (err) {
    console.log(`❌ Failed to fetch local extrema: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // 3. Try to fetch regime
  console.log('=' .repeat(60));
  console.log('3. REGIME (trending/ranging/volatile)');
  console.log('=' .repeat(60));
  
  try {
    const regimes = await getRegime(SYMBOL_ID, from, to);
    console.log(`Found ${regimes.length} regime annotations:\n`);
    
    for (const r of regimes.slice(0, 5)) {
      console.log(`  🎯 ${r.payload.regime_type}`);
      console.log(`     Time: ${r.time_start}`);
      console.log(`     Source: ${r.source}`);
      console.log('');
    }
  } catch (err) {
    console.log(`❌ Failed to fetch regime: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // 4. Try to fetch indicator signals
  console.log('=' .repeat(60));
  console.log('4. INDICATOR SIGNALS (RSI, MACD, VWAP, BB)');
  console.log('=' .repeat(60));
  
  try {
    const signals = await getIndicatorSignals(SYMBOL_ID, from, to);
    console.log(`Found ${signals.length} indicator signals:\n`);
    
    // Group by indicator
    const byIndicator = new Map<string, typeof signals>();
    for (const s of signals) {
      const key = s.payload.indicator;
      if (!byIndicator.has(key)) {
        byIndicator.set(key, []);
      }
      byIndicator.get(key)!.push(s);
    }
    
    for (const [indicator, sigs] of byIndicator) {
      console.log(`  📊 ${indicator.toUpperCase()}: ${sigs.length} signals`);
      const first = sigs[0];
      if (first) {
        console.log(`     Example: ${first.payload.signal_type} at $${first.payload.price_at_signal}`);
      }
    }
    console.log('');
  } catch (err) {
    console.log(`❌ Failed to fetch indicator signals: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // 5. Try to fetch all annotation types
  console.log('=' .repeat(60));
  console.log('5. ALL ANNOTATION TYPES');
  console.log('=' .repeat(60));
  
  const allTypes = [
    'dump_event',
    'pump_event', 
    'local_extrema',
    'sweep_reclaim',
    'bottom_event',
  ];
  
  for (const type of allTypes) {
    try {
      const annotations = await getAnnotations(SYMBOL_ID, [type], from, to);
      const status = annotations.length > 0 ? '✅' : '⚠️';
      console.log(`  ${status} ${type}: ${annotations.length} found`);
      
      // Show sample payload for available types
      if (annotations.length > 0) {
        const sample = annotations[0];
        console.log(`     Sample payload: ${JSON.stringify(sample, null, 2).split('\n').slice(0, 15).join('\n     ')}`);
        console.log('');
      }
    } catch (err) {
      console.log(`  ❌ ${type}: Error - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('SUMMARY: What we can use from Replay Labs');
  console.log('=' .repeat(60));
}

main().catch(console.error);

