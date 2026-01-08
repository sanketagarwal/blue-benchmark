#!/usr/bin/env npx tsx
/**
 * 009 Learning Loop Test - Using 007's exact setup
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { runRound, defineAgent } from '@nullagent/agent-core';
import { ChartReadingOutputSchema } from './output-schema.js';
import { getSignedChartUrl, STANDARD_CHART_LAYERS } from './replay-lab/charts.js';
import { getCandles } from './replay-lab/ohlcv.js';
import { computeGroundTruth } from './ground-truth/index.js';
import { scoreChartReading } from './scorers/index.js';
import type { ChartReadingOutput } from './output-schema.js';
import type { IndicatorValues } from './ground-truth/index.js';

// Global context
let currentChartUrl = '';
let currentFeedback = '';
let currentTimeframe = '1h';
let currentSymbolId = '';

function computeIndicators(candles: { open: number; high: number; low: number; close: number; volume: number }[]): IndicatorValues {
  if (candles.length === 0) {
    return { vwap: null, bb_upper: null, bb_lower: null, bb_mid: null, sma20: null, ema20: null };
  }
  const last20 = candles.slice(-20);
  const sma20 = last20.length >= 20 ? last20.reduce((sum, c) => sum + c.close, 0) / 20 : null;
  const ema20 = sma20;
  const totalVolume = candles.reduce((sum, c) => sum + c.volume, 0);
  const vwap = totalVolume > 0
    ? candles.reduce((sum, c) => sum + ((c.high + c.low + c.close) / 3) * c.volume, 0) / totalVolume
    : null;
  let bb_upper: number | null = null, bb_lower: number | null = null, bb_mid: number | null = null;
  if (sma20 !== null && last20.length >= 20) {
    const stdDev = Math.sqrt(last20.reduce((sum, c) => sum + Math.pow(c.close - sma20, 2), 0) / 20);
    bb_mid = sma20;
    bb_upper = sma20 + 2 * stdDev;
    bb_lower = sma20 - 2 * stdDev;
  }
  return { vwap, bb_upper, bb_lower, bb_mid, sma20, ema20 };
}

function generateFeedback(prediction: ChartReadingOutput, groundTruth: ChartReadingOutput): string {
  const fields = Object.keys(groundTruth.multi_step) as Array<keyof typeof groundTruth.multi_step>;
  let fb = '═══════════════════════════════════════════════════════════════\n';
  fb += '                FEEDBACK ON YOUR PREVIOUS ANALYSIS\n';
  fb += '═══════════════════════════════════════════════════════════════\n\n';
  let correct = 0;
  for (const field of fields) {
    const pred = prediction.multi_step[field];
    const gt = groundTruth.multi_step[field];
    const isCorrect = pred === gt;
    if (isCorrect) correct++;
    fb += isCorrect 
      ? `✅ ${field}: Correct (${String(pred)})\n`
      : `❌ ${field}: WRONG. You said "${String(pred)}", correct is "${String(gt)}"\n`;
  }
  fb += `\nYour Score: ${correct}/6\n\n`;
  fb += 'Now analyze the same chart again. Apply these corrections.\n';
  fb += '═══════════════════════════════════════════════════════════════\n';
  return fb;
}

// Create agent that uses global context
function createAgent(modelId: string) {
  return defineAgent({
    id: `learning_loop_${modelId.replace(/\//g, '_')}`,
    systemPrompt: `You are an expert technical analyst. Analyze candlestick charts and extract structured information.
Return ONLY valid JSON matching the schema. No explanations.`,
    outputSchema: ChartReadingOutputSchema,
    stateless: true,
    buildRoundPrompt: () => {
      let text = '';
      if (currentFeedback) {
        text += currentFeedback + '\n\n';
      }
      text += `Analyze this ${currentTimeframe} chart for ${currentSymbolId}.\n\n`;
      text += `Extract:\n`;
      text += `- meta: base_quote, venue, timeframe from chart title\n`;
      text += `- active_readout: OHLC of last candle\n`;
      text += `- multi_step: Answer these 6 questions:\n`;
      text += `  1. uptrend_pullback_to_vwap (true/false)\n`;
      text += `  2. volatility_direction_combo (high_vol_bullish/high_vol_bearish/low_vol_drift_up/low_vol_drift_down/consolidation)\n`;
      text += `  3. tested_and_held_support (true/false)\n`;
      text += `  4. breakout_with_volume (true/false)\n`;
      text += `  5. potential_reversal_at_support (true/false)\n`;
      text += `  6. overall_bias (bullish/mildly_bullish/neutral/mildly_bearish/bearish)\n\n`;
      text += `Return ONLY JSON.`;
      return {
        content: [
          { type: 'text' as const, text },
          { type: 'image' as const, image: currentChartUrl },
        ],
      };
    },
    buildCompactionPrompt: () => { throw new Error('Not implemented'); },
  });
}

async function main() {
  const modelId = process.argv.find(a => a.startsWith('--model='))?.split('=')[1] || 'google/gemini-3-pro-preview';
  const symbolId = process.env['SYMBOL_ID'] || 'COINBASE_SPOT_BTC_USD';
  const timeOffset = parseInt(process.argv.find(a => a.startsWith('--offset='))?.split('=')[1] || '14', 10);
  
  currentSymbolId = symbolId;
  currentTimeframe = '1h';
  
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║           009 LEARNING LOOP - Same Setup as 007                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Model: ${modelId}`);
  console.log(`Symbol: ${symbolId}`);
  console.log(`Time Offset: ${timeOffset} days back\n`);

  // Get chart
  console.log('📊 Step 1: Fetching chart and ground truth...');
  const now = new Date();
  const baseOffset = (7 + timeOffset) * 24 * 60 * 60 * 1000;
  const to = new Date(now.getTime() - baseOffset);
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  console.log(`  Time: ${from.toISOString()} to ${to.toISOString()}`);
  
  let groundTruth: ChartReadingOutput;
  try {
    currentChartUrl = await getSignedChartUrl({
      symbolId, timeframe: '1h', from, to, layers: STANDARD_CHART_LAYERS,
    });
    console.log('  ✅ Chart URL obtained');
    
    const candles = await getCandles(symbolId, '1h', from, to, 30);
    console.log(`  ✅ Fetched ${candles.length} candles`);
    
    const indicators = computeIndicators(candles);
    groundTruth = computeGroundTruth({
      candles,
      meta: { base_quote: 'Bitcoin / U.S. Dollar', venue: 'Coinbase', timeframe: '1h' },
      indicators,
      timeframeMinutes: 60,
    });
    console.log('  ✅ Ground truth computed');
  } catch (err) {
    console.error(`❌ Setup failed: ${err}`);
    process.exit(1);
  }

  console.log('\n📋 Ground Truth (multi_step):');
  console.log(JSON.stringify(groundTruth.multi_step, null, 2));

  // ROUND 1: Baseline
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('🔵 ROUND 1: Baseline (no feedback)');
  console.log('────────────────────────────────────────────────────────────\n');
  
  process.env['MODEL_ID'] = modelId;
  currentFeedback = '';
  const agent = createAgent(modelId);
  
  let baseline: ChartReadingOutput;
  try {
    const result = await runRound(agent, '');
    baseline = result.output as ChartReadingOutput;
    console.log('Model prediction:');
    console.log(JSON.stringify(baseline.multi_step, null, 2));
    const score = scoreChartReading(baseline, groundTruth);
    console.log(`\n📊 Baseline: ${(score.accuracy * 100).toFixed(1)}% (${score.exactMatchCount}/6 exact)\n`);
  } catch (err) {
    console.error(`❌ Round 1 failed: ${err}`);
    process.exit(1);
  }

  // Generate feedback
  console.log('────────────────────────────────────────────────────────────');
  console.log('📝 Feedback');
  console.log('────────────────────────────────────────────────────────────\n');
  currentFeedback = generateFeedback(baseline, groundTruth);
  console.log(currentFeedback);

  // ROUND 2: With feedback
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('🟢 ROUND 2: Same chart WITH feedback');
  console.log('────────────────────────────────────────────────────────────\n');
  
  let round2: ChartReadingOutput;
  try {
    const result2 = await runRound(agent, '');
    round2 = result2.output as ChartReadingOutput;
    console.log('Model prediction after feedback:');
    console.log(JSON.stringify(round2.multi_step, null, 2));
    const score2 = scoreChartReading(round2, groundTruth);
    console.log(`\n📊 After Feedback: ${(score2.accuracy * 100).toFixed(1)}% (${score2.exactMatchCount}/6 exact)\n`);
  } catch (err) {
    console.error(`❌ Round 2 failed: ${err}`);
    process.exit(1);
  }

  // Results
  console.log('════════════════════════════════════════════════════════════');
  console.log('                      FINAL RESULTS');
  console.log('════════════════════════════════════════════════════════════\n');
  
  const score1 = scoreChartReading(baseline, groundTruth);
  const score2 = scoreChartReading(round2, groundTruth);
  const delta = (score2.accuracy - score1.accuracy) * 100;
  
  console.log(`Baseline:       ${(score1.accuracy * 100).toFixed(1)}% (${score1.exactMatchCount}/6)`);
  console.log(`After Feedback: ${(score2.accuracy * 100).toFixed(1)}% (${score2.exactMatchCount}/6)`);
  console.log(`Delta:          ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%\n`);
  
  console.log('Field Changes:');
  const fields = Object.keys(groundTruth.multi_step) as Array<keyof typeof groundTruth.multi_step>;
  for (const f of fields) {
    const gt = groundTruth.multi_step[f];
    const b = baseline.multi_step[f];
    const r = round2.multi_step[f];
    let s = '';
    if (b !== gt && r === gt) s = '✅ FIXED';
    else if (b === gt && r !== gt) s = '❌ BROKE';
    else if (b === gt) s = '✓ correct';
    else s = '✗ still wrong';
    console.log(`  ${f}: ${s}`);
  }
  
  console.log('');
  if (delta > 0) console.log('✅ Model IMPROVED!');
  else if (delta === 0) console.log('⚠️ No change');
  else console.log('❌ Model got WORSE');
  
  console.log('\n✅ Done!\n');
}

main().catch(console.error);
