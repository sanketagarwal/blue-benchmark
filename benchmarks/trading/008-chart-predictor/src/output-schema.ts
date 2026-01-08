/**
 * Output schema for chart PREDICTION benchmark.
 * 
 * Same fields as 007 Chart Reader, but models predict NEXT period values.
 * 
 * DETERMINISTIC: All fields have definite values, no nulls.
 * Tests: Can models predict future patterns based on current chart?
 */
import { z } from 'zod';

// =============================================================================
// CONTEXT: Minimal info for model to understand the chart
// =============================================================================

export const MetaSchema = z.object({
  base_quote: z.string().describe('Trading pair, e.g., "Bitcoin / U.S. Dollar"'),
  venue: z.string().describe('Exchange name, e.g., "Coinbase"'),
  timeframe: z.string().describe('Candle timeframe, e.g., "4h"'),
});

export const ActiveReadoutSchema = z.object({
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});

// =============================================================================
// MULTI-STEP REASONING (6 fields) — THE MAIN TEST
// Tests: Compound observations requiring multiple signals to be combined
// ALL FIELDS ARE DETERMINISTIC - must always provide a definite answer
// =============================================================================

export const MultiStepReasoningSchema = z.object({
  // 1. Trend + Position combination (BOOLEAN - must answer true or false)
  uptrend_pullback_to_vwap: z.boolean().describe(
    'Is price in an uptrend AND currently pulling back to VWAP? True only if BOTH conditions are met.'
  ),

  // 2. Volatility + Direction combination  
  volatility_direction_combo: z.enum([
    'high_vol_bullish',      // High volatility with bullish bias
    'high_vol_bearish',      // High volatility with bearish bias
    'low_vol_drift_up',      // Low volatility, slowly grinding up
    'low_vol_drift_down',    // Low volatility, slowly grinding down
    'consolidation',         // Low volatility, no clear direction
  ]).describe('Combined volatility and direction assessment - must pick one'),

  // 3. Support test evaluation (BOOLEAN - must answer true or false)
  tested_and_held_support: z.boolean().describe(
    'Did price test lower Bollinger Band AND bounce back above it in the last 5 candles?'
  ),

  // 4. Breakout with confirmation (BOOLEAN - must answer true or false)
  breakout_with_volume: z.boolean().describe(
    'Did the last candle break above upper Bollinger Band WITH above-average volume?'
  ),

  // 5. Reversal pattern identification (BOOLEAN - must answer true or false)
  potential_reversal_at_support: z.boolean().describe(
    'Is there a bullish candle following a touch of lower BB support?'
  ),

  // 6. Overall market bias (synthesis of all signals)
  overall_bias: z.enum([
    'bullish',           // Multiple bullish signals aligned (3+ net bullish)
    'mildly_bullish',    // Some bullish signals (1-2 net bullish)
    'neutral',           // Mixed or balanced signals (net 0)
    'mildly_bearish',    // Some bearish signals (1-2 net bearish)
    'bearish',           // Multiple bearish signals aligned (3+ net bearish)
  ]).describe('Overall market bias synthesized from all visible signals'),
});

// =============================================================================
// COMPLETE OUTPUT SCHEMA
// =============================================================================

export const ChartPredictionOutputSchema = z.object({
  meta: MetaSchema,
  active_readout: ActiveReadoutSchema,
  multi_step: MultiStepReasoningSchema,
});

// Alias for backwards compatibility with shared code
export const ChartReadingOutputSchema = ChartPredictionOutputSchema;

// Type exports
export type Meta = z.infer<typeof MetaSchema>;
export type ActiveReadout = z.infer<typeof ActiveReadoutSchema>;
export type MultiStepReasoning = z.infer<typeof MultiStepReasoningSchema>;
export type ChartPredictionOutput = z.infer<typeof ChartPredictionOutputSchema>;
// Alias for shared code
export type ChartReadingOutput = ChartPredictionOutput;
