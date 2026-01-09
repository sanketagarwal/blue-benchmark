#!/usr/bin/env npx tsx
/**
 * 009 Learning Loop Test - Full 3-Round Test
 * 
 * Round 1: Baseline (original timeframe)
 * Round 2: Same chart with feedback (memorization test)
 * Round 3: Different timeframe, same time period (abstraction test)
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
import type { CandleTimeframe } from './replay-lab/ohlcv.js';

// Global context
let currentChartUrl = '';
let currentFeedback = '';
let currentTimeframe = '4h';
let currentSymbolId = '';

// Timeframe drill-down for abstraction test
const TIMEFRAME_DRILLDOWN: Record<string, CandleTimeframe> = {
  '4h': '1h',
  '1h': '15m',
  '15m': '5m',
  '5m': '1m',
};

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
  fb += 'Apply these corrections to improve your analysis.\n';
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
  const originalTimeframe: CandleTimeframe = (process.argv.find(a => a.startsWith('--tf='))?.split('=')[1] as CandleTimeframe) || '4h';
  const drilldownTimeframe = TIMEFRAME_DRILLDOWN[originalTimeframe] || '1h';
  
  currentSymbolId = symbolId;
  currentTimeframe = originalTimeframe;
  
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║           009 LEARNING LOOP - Full 3-Round Test                   ║');
  console.log('╠═══════════════════════════════════════════════════════════════════╣');
  console.log('║  Round 1: Baseline (original timeframe)                           ║');
  console.log('║  Round 2: Same chart + feedback (memorization)                    ║');
  console.log('║  Round 3: Different timeframe + feedback (abstraction)            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Model: ${modelId}`);
  console.log(`Symbol: ${symbolId}`);
  console.log(`Original TF: ${originalTimeframe} → Drilldown TF: ${drilldownTimeframe}`);
  console.log(`Time Offset: ${timeOffset} days back\n`);

  // Calculate time range
  const now = new Date();
  const baseOffset = (7 + timeOffset) * 24 * 60 * 60 * 1000;
  const to = new Date(now.getTime() - baseOffset);
  const from = new Date(to.getTime() - 48 * 60 * 60 * 1000); // 48 hours of data
  
  console.log(`Time Range: ${from.toISOString()} to ${to.toISOString()}\n`);

  // =========================================================================
  // SETUP: Get charts and ground truth for both timeframes
  // =========================================================================
  console.log('📊 Setting up charts and ground truth...\n');
  
  let originalChartUrl: string;
  let drilldownChartUrl: string;
  let groundTruth: ChartReadingOutput;
  let drilldownGroundTruth: ChartReadingOutput;
  
  try {
    // Original timeframe chart
    originalChartUrl = await getSignedChartUrl({
      symbolId, timeframe: originalTimeframe, from, to, layers: STANDARD_CHART_LAYERS,
    });
    console.log(`  ✅ Original chart (${originalTimeframe}) URL obtained`);
    
    const candles = await getCandles(symbolId, originalTimeframe, from, to, 30);
    console.log(`  ✅ Fetched ${candles.length} candles (${originalTimeframe})`);
    
    const indicators = computeIndicators(candles);
    groundTruth = computeGroundTruth({
      candles,
      meta: { base_quote: 'Bitcoin / U.S. Dollar', venue: 'Coinbase', timeframe: originalTimeframe },
      indicators,
      timeframeMinutes: originalTimeframe === '4h' ? 240 : originalTimeframe === '1h' ? 60 : 15,
    });
    console.log(`  ✅ Ground truth computed (${originalTimeframe})`);
    
    // Drilldown timeframe chart (same time period, more granular)
    drilldownChartUrl = await getSignedChartUrl({
      symbolId, timeframe: drilldownTimeframe, from, to, layers: STANDARD_CHART_LAYERS,
    });
    console.log(`  ✅ Drilldown chart (${drilldownTimeframe}) URL obtained`);
    
    const drilldownCandles = await getCandles(symbolId, drilldownTimeframe, from, to, 100);
    console.log(`  ✅ Fetched ${drilldownCandles.length} candles (${drilldownTimeframe})`);
    
    const drilldownIndicators = computeIndicators(drilldownCandles);
    drilldownGroundTruth = computeGroundTruth({
      candles: drilldownCandles,
      meta: { base_quote: 'Bitcoin / U.S. Dollar', venue: 'Coinbase', timeframe: drilldownTimeframe },
      indicators: drilldownIndicators,
      timeframeMinutes: drilldownTimeframe === '1h' ? 60 : drilldownTimeframe === '15m' ? 15 : 5,
    });
    console.log(`  ✅ Ground truth computed (${drilldownTimeframe})`);
    
  } catch (err) {
    console.error(`❌ Setup failed: ${err}`);
    process.exit(1);
  }

  console.log('\n📋 Ground Truth (original timeframe):');
  console.log(JSON.stringify(groundTruth.multi_step, null, 2));

  // =========================================================================
  // ROUND 1: Baseline (original timeframe, no feedback)
  // =========================================================================
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`🔵 ROUND 1: Baseline (${originalTimeframe}, no feedback)`);
  console.log('════════════════════════════════════════════════════════════\n');
  
  process.env['MODEL_ID'] = modelId;
  currentChartUrl = originalChartUrl;
  currentTimeframe = originalTimeframe;
  currentFeedback = '';
  const agent = createAgent(modelId);
  
  let baseline: ChartReadingOutput;
  try {
    const result = await runRound(agent);
    baseline = result.output as ChartReadingOutput;
    console.log('Model prediction:');
    console.log(JSON.stringify(baseline.multi_step, null, 2));
    const score = scoreChartReading(baseline, groundTruth);
    console.log(`\n📊 Round 1 Score: ${(score.accuracy * 100).toFixed(1)}% (${score.exactMatchCount}/6)\n`);
  } catch (err) {
    console.error(`❌ Round 1 failed: ${err}`);
    process.exit(1);
  }

  // Generate feedback
  currentFeedback = generateFeedback(baseline, groundTruth);
  console.log('────────────────────────────────────────────────────────────');
  console.log('📝 Feedback Generated');
  console.log('────────────────────────────────────────────────────────────');
  console.log(currentFeedback);

  // =========================================================================
  // ROUND 2: Same chart WITH feedback (memorization test)
  // =========================================================================
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`🟢 ROUND 2: Same chart + feedback (${originalTimeframe})`);
  console.log('════════════════════════════════════════════════════════════\n');
  
  let round2: ChartReadingOutput;
  try {
    const result2 = await runRound(agent);
    round2 = result2.output as ChartReadingOutput;
    console.log('Model prediction:');
    console.log(JSON.stringify(round2.multi_step, null, 2));
    const score2 = scoreChartReading(round2, groundTruth);
    console.log(`\n📊 Round 2 Score: ${(score2.accuracy * 100).toFixed(1)}% (${score2.exactMatchCount}/6)\n`);
  } catch (err) {
    console.error(`❌ Round 2 failed: ${err}`);
    process.exit(1);
  }

  // =========================================================================
  // ROUND 3: Different timeframe WITH feedback (abstraction test)
  // =========================================================================
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`🟣 ROUND 3: Different timeframe + feedback (${drilldownTimeframe})`);
  console.log('════════════════════════════════════════════════════════════\n');
  
  console.log(`Switching from ${originalTimeframe} to ${drilldownTimeframe} (same time period)`);
  console.log('This tests if the model can ABSTRACT the learning to a different view.\n');
  
  currentChartUrl = drilldownChartUrl;
  currentTimeframe = drilldownTimeframe;
  // Keep the same feedback from Round 1
  
  let round3: ChartReadingOutput;
  try {
    const result3 = await runRound(agent);
    round3 = result3.output as ChartReadingOutput;
    console.log('Model prediction:');
    console.log(JSON.stringify(round3.multi_step, null, 2));
    
    // Score against drilldown ground truth
    const score3 = scoreChartReading(round3, drilldownGroundTruth);
    console.log(`\n📊 Round 3 Score: ${(score3.accuracy * 100).toFixed(1)}% (${score3.exactMatchCount}/6)\n`);
    
    console.log('📋 Ground Truth (drilldown timeframe):');
    console.log(JSON.stringify(drilldownGroundTruth.multi_step, null, 2));
  } catch (err) {
    console.error(`❌ Round 3 failed: ${err}`);
    process.exit(1);
  }

  // =========================================================================
  // FINAL RESULTS
  // =========================================================================
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                      FINAL RESULTS                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  
  const score1 = scoreChartReading(baseline, groundTruth);
  const score2 = scoreChartReading(round2, groundTruth);
  const score3 = scoreChartReading(round3, drilldownGroundTruth);
  
  const memorizationDelta = (score2.accuracy - score1.accuracy) * 100;
  const abstractionDelta = (score3.accuracy - score1.accuracy) * 100;
  
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│ Round                     │ Accuracy    │ Delta                │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log(`│ 1. Baseline (${originalTimeframe})          │ ${(score1.accuracy * 100).toFixed(1).padStart(5)}%     │ -                    │`);
  console.log(`│ 2. Same Chart + FB        │ ${(score2.accuracy * 100).toFixed(1).padStart(5)}%     │ ${memorizationDelta >= 0 ? '+' : ''}${memorizationDelta.toFixed(1).padStart(5)}% (memorize)  │`);
  console.log(`│ 3. Diff TF (${drilldownTimeframe}) + FB      │ ${(score3.accuracy * 100).toFixed(1).padStart(5)}%     │ ${abstractionDelta >= 0 ? '+' : ''}${abstractionDelta.toFixed(1).padStart(5)}% (abstract)  │`);
  console.log('└─────────────────────────────────────────────────────────────────┘\n');
  
  // Field-by-field for Round 2
  console.log('📊 Round 2 Field Changes (Memorization):');
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
  
  // Field-by-field for Round 3
  console.log('\n📊 Round 3 Field Changes (Abstraction):');
  for (const f of fields) {
    const gt = drilldownGroundTruth.multi_step[f];
    const b = baseline.multi_step[f];
    const r = round3.multi_step[f];
    let s = '';
    if (b !== gt && r === gt) s = '✅ FIXED';
    else if (b === gt && r !== gt) s = '❌ BROKE';
    else if (b === gt) s = '✓ correct';
    else s = '✗ still wrong';
    console.log(`  ${f}: ${s}`);
  }
  
  // Verdict
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('VERDICT:');
  if (memorizationDelta > 0) {
    console.log(`✅ Memorization: Model improved ${memorizationDelta.toFixed(1)}% on same chart`);
  } else {
    console.log(`⚠️ Memorization: No improvement on same chart`);
  }
  
  if (abstractionDelta > 0) {
    console.log(`✅ Abstraction: Model improved ${abstractionDelta.toFixed(1)}% on different timeframe`);
  } else if (abstractionDelta === 0) {
    console.log(`⚠️ Abstraction: No change on different timeframe`);
  } else {
    console.log(`❌ Abstraction: Model got worse on different timeframe`);
  }
  
  console.log('\n✅ Test complete!\n');
}

main().catch(console.error);
