#!/usr/bin/env npx tsx
/**
 * 009 Learning Loop - STATEFUL Test
 * 
 * Properly maintains conversation history between rounds so the model
 * actually "sees" what it said before and can learn from feedback.
 * 
 * Conversation flow:
 * Turn 1: [user: analyze chart] → [assistant: prediction]
 * Turn 2: [user: analyze] → [assistant: prediction] → [user: feedback + try again] → [assistant: new prediction]
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { getSignedChartUrl, STANDARD_CHART_LAYERS } from './replay-lab/charts.js';
import { getCandles } from './replay-lab/ohlcv.js';
import { computeGroundTruth } from './ground-truth/index.js';
import { scoreChartReading } from './scorers/index.js';
import type { ChartReadingOutput } from './output-schema.js';
import type { IndicatorValues } from './ground-truth/index.js';

// Types for conversation
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

function computeIndicators(candles: { open: number; high: number; low: number; close: number; volume: number }[]): IndicatorValues {
  if (candles.length === 0) {
    return { vwap: null, bb_upper: null, bb_lower: null, bb_mid: null, sma20: null, ema20: null };
  }
  const last20 = candles.slice(-20);
  const sma20 = last20.length >= 20 ? last20.reduce((sum, c) => sum + c.close, 0) / 20 : null;
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
  return { vwap, bb_upper, bb_lower, bb_mid, sma20, ema20: sma20 };
}

function generateFeedback(prediction: ChartReadingOutput, groundTruth: ChartReadingOutput): string {
  const fields = Object.keys(groundTruth.multi_step) as Array<keyof typeof groundTruth.multi_step>;
  let fb = 'Here is feedback on your analysis:\n\n';
  let correct = 0;
  for (const field of fields) {
    const pred = prediction.multi_step[field];
    const gt = groundTruth.multi_step[field];
    const isCorrect = pred === gt;
    if (isCorrect) correct++;
    fb += isCorrect 
      ? `✅ ${field}: Correct (${String(pred)})\n`
      : `❌ ${field}: WRONG. You said "${String(pred)}", but the correct answer is "${String(gt)}"\n`;
  }
  fb += `\nYou got ${correct}/6 correct.\n`;
  fb += '\nPlease analyze the chart again and correct your mistakes based on this feedback.';
  return fb;
}

// Call the AI Gateway directly with full conversation history
async function callModel(
  modelId: string,
  messages: Message[]
): Promise<string> {
  const baseUrl = process.env['AI_GATEWAY_BASE_URL'] || 'https://ai-gateway.vercel.sh/v1';
  const apiKey = process.env['AI_GATEWAY_API_KEY'];
  
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY not set');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: 2000,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}

function parseJsonFromResponse(response: string): ChartReadingOutput | null {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  try {
    return JSON.parse(jsonMatch[0]) as ChartReadingOutput;
  } catch {
    return null;
  }
}

async function main() {
  const modelId = process.argv.find(a => a.startsWith('--model='))?.split('=')[1] || 'google/gemini-3-pro-preview';
  const symbolId = process.env['SYMBOL_ID'] || 'COINBASE_SPOT_BTC_USD';
  const timeOffset = parseInt(process.argv.find(a => a.startsWith('--offset='))?.split('=')[1] || '14', 10);
  
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║       009 LEARNING LOOP - STATEFUL Conversation Test              ║');
  console.log('╠═══════════════════════════════════════════════════════════════════╣');
  console.log('║  Now properly maintains conversation history!                     ║');
  console.log('║  Model sees: [its prediction] → [feedback] → [try again]          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Model: ${modelId}`);
  console.log(`Symbol: ${symbolId}`);
  console.log(`Time Offset: ${timeOffset} days back\n`);

  // Get chart
  const now = new Date();
  const baseOffset = (7 + timeOffset) * 24 * 60 * 60 * 1000;
  const to = new Date(now.getTime() - baseOffset);
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  
  console.log('📊 Fetching chart and ground truth...');
  
  let chartUrl: string;
  let groundTruth: ChartReadingOutput;
  
  try {
    chartUrl = await getSignedChartUrl({
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

  console.log('\n📋 Ground Truth:');
  console.log(JSON.stringify(groundTruth.multi_step, null, 2));

  // System message
  const systemMessage: Message = {
    role: 'system',
    content: `You are an expert technical analyst. Analyze candlestick charts and extract structured information.

Return ONLY valid JSON in this exact format:
{
  "meta": { "base_quote": "...", "venue": "...", "timeframe": "..." },
  "active_readout": { "open": 0, "high": 0, "low": 0, "close": 0 },
  "multi_step": {
    "uptrend_pullback_to_vwap": true/false,
    "volatility_direction_combo": "high_vol_bullish" | "high_vol_bearish" | "low_vol_drift_up" | "low_vol_drift_down" | "consolidation",
    "tested_and_held_support": true/false,
    "breakout_with_volume": true/false,
    "potential_reversal_at_support": true/false,
    "overall_bias": "bullish" | "mildly_bullish" | "neutral" | "mildly_bearish" | "bearish"
  }
}

No explanations. Only JSON.`
  };

  // Build conversation history
  const conversation: Message[] = [systemMessage];

  // =========================================================================
  // ROUND 1: Initial analysis
  // =========================================================================
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('🔵 ROUND 1: Initial Analysis');
  console.log('════════════════════════════════════════════════════════════\n');

  const userMessage1: Message = {
    role: 'user',
    content: [
      { type: 'text', text: 'Analyze this 1h chart for COINBASE_SPOT_BTC_USD. Return only JSON.' },
      { type: 'image_url', image_url: { url: chartUrl } },
    ],
  };
  conversation.push(userMessage1);

  console.log('Sending to model...');
  let response1: string;
  let baseline: ChartReadingOutput | null;
  
  try {
    response1 = await callModel(modelId, conversation);
    console.log('\nModel response:');
    console.log(response1.slice(0, 500));
    
    baseline = parseJsonFromResponse(response1);
    if (!baseline) throw new Error('Could not parse JSON from response');
    
    console.log('\nParsed multi_step:');
    console.log(JSON.stringify(baseline.multi_step, null, 2));
    
    const score1 = scoreChartReading(baseline, groundTruth);
    console.log(`\n📊 Round 1 Score: ${(score1.accuracy * 100).toFixed(1)}% (${score1.exactMatchCount}/6)`);
    
    // Add assistant response to conversation
    conversation.push({ role: 'assistant', content: response1 });
    
  } catch (err) {
    console.error(`❌ Round 1 failed: ${err}`);
    process.exit(1);
  }

  // =========================================================================
  // ROUND 2: Feedback + Try Again (WITH CONVERSATION HISTORY)
  // =========================================================================
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('🟢 ROUND 2: Feedback + Same Chart (WITH HISTORY)');
  console.log('════════════════════════════════════════════════════════════\n');

  const feedback = generateFeedback(baseline, groundTruth);
  console.log('📝 Feedback:');
  console.log(feedback);

  // Add feedback as a new user message (model now sees its previous response + feedback)
  const userMessage2: Message = {
    role: 'user',
    content: [
      { type: 'text', text: feedback + '\n\nHere is the same chart again. Please correct your analysis.' },
      { type: 'image_url', image_url: { url: chartUrl } },
    ],
  };
  conversation.push(userMessage2);

  console.log('\n📨 Conversation now has', conversation.length, 'messages:');
  console.log('  1. System prompt');
  console.log('  2. User: Analyze this chart');
  console.log('  3. Assistant: [Round 1 prediction]');
  console.log('  4. User: Feedback + try again');
  console.log('');

  let round2: ChartReadingOutput | null;
  
  try {
    const response2 = await callModel(modelId, conversation);
    console.log('Model response:');
    console.log(response2.slice(0, 500));
    
    round2 = parseJsonFromResponse(response2);
    if (!round2) throw new Error('Could not parse JSON from response');
    
    console.log('\nParsed multi_step:');
    console.log(JSON.stringify(round2.multi_step, null, 2));
    
    const score2 = scoreChartReading(round2, groundTruth);
    console.log(`\n📊 Round 2 Score: ${(score2.accuracy * 100).toFixed(1)}% (${score2.exactMatchCount}/6)`);
    
  } catch (err) {
    console.error(`❌ Round 2 failed: ${err}`);
    process.exit(1);
  }

  // =========================================================================
  // RESULTS
  // =========================================================================
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                      FINAL RESULTS                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  const score1 = scoreChartReading(baseline, groundTruth);
  const score2 = scoreChartReading(round2!, groundTruth);
  const delta = (score2.accuracy - score1.accuracy) * 100;

  console.log(`Round 1 (Baseline):      ${(score1.accuracy * 100).toFixed(1)}% (${score1.exactMatchCount}/6)`);
  console.log(`Round 2 (With History):  ${(score2.accuracy * 100).toFixed(1)}% (${score2.exactMatchCount}/6)`);
  console.log(`Learning Delta:          ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%\n`);

  console.log('Field Changes:');
  const fields = Object.keys(groundTruth.multi_step) as Array<keyof typeof groundTruth.multi_step>;
  for (const f of fields) {
    const gt = groundTruth.multi_step[f];
    const b = baseline.multi_step[f];
    const r = round2!.multi_step[f];
    let s = '';
    if (b !== gt && r === gt) s = '✅ FIXED';
    else if (b === gt && r !== gt) s = '❌ BROKE';
    else if (b === gt) s = '✓ already correct';
    else s = '✗ still wrong';
    console.log(`  ${f}: ${s}`);
    if (b !== r) {
      console.log(`      Changed: "${String(b)}" → "${String(r)}"`);
    }
  }

  console.log('');
  if (delta > 0) {
    console.log('✅ Model LEARNED from feedback with proper conversation history!');
  } else if (delta === 0) {
    console.log('⚠️ No improvement despite seeing its previous response');
  } else {
    console.log('❌ Model got worse despite seeing its previous response');
  }

  console.log('\n✅ Test complete!\n');
}

main().catch(console.error);

