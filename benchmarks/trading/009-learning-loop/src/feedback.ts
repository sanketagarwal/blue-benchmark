/**
 * 009 Learning Loop - Feedback Generator
 * 
 * Generates detailed, actionable feedback explaining WHY a prediction was wrong.
 */

import type { ChartReadingOutput } from './output-schema.js';

interface FeedbackContext {
  /** Ground truth values */
  groundTruth: ChartReadingOutput;
  /** Model's prediction */
  prediction: ChartReadingOutput;
  /** Additional context for explanation */
  context: {
    vwap: number;
    lastClose: number;
    avgVolume: number;
    lastVolume: number;
    priceChangePct: number;
    volatilityPct: number;
  };
}

interface FieldFeedback {
  field: string;
  predicted: string | boolean;
  actual: string | boolean;
  correct: boolean;
  explanation: string;
}

/**
 * Generate detailed feedback for a single field.
 */
function generateFieldFeedback(
  field: keyof ChartReadingOutput['multi_step'],
  predicted: string | boolean,
  actual: string | boolean,
  context: FeedbackContext['context']
): FieldFeedback {
  const correct = predicted === actual;
  let explanation = '';

  if (!correct) {
    switch (field) {
      case 'uptrend_pullback_to_vwap': {
        const vwapDistance = Math.abs(context.lastClose - context.vwap) / context.vwap * 100;
        const isNearVwap = vwapDistance < 0.3;
        const isUptrend = context.priceChangePct > 0.5;
        
        if (actual === false) {
          if (!isUptrend) {
            explanation = `The price change over the period was ${context.priceChangePct.toFixed(2)}%, which is NOT above the 0.5% threshold for an uptrend.`;
          } else if (!isNearVwap) {
            explanation = `Price ($${context.lastClose.toFixed(2)}) is ${vwapDistance.toFixed(2)}% away from VWAP ($${context.vwap.toFixed(2)}). This is NOT within the 0.3% threshold for "near VWAP".`;
          }
        } else {
          explanation = `Price IS in an uptrend (${context.priceChangePct.toFixed(2)}% change) AND IS near VWAP (${vwapDistance.toFixed(2)}% distance).`;
        }
        break;
      }

      case 'volatility_direction_combo': {
        const isHighVol = context.volatilityPct > 1.5;
        const isLowVol = context.volatilityPct < 0.8;
        const isUptrend = context.priceChangePct > 0.5;
        const isDowntrend = context.priceChangePct < -0.5;
        
        explanation = `Volatility: ${context.volatilityPct.toFixed(2)}% (${isHighVol ? 'HIGH' : isLowVol ? 'LOW' : 'MEDIUM'}). `;
        explanation += `Direction: ${context.priceChangePct.toFixed(2)}% (${isUptrend ? 'UP' : isDowntrend ? 'DOWN' : 'FLAT'}). `;
        explanation += `Combined, this gives: "${String(actual)}".`;
        break;
      }

      case 'tested_and_held_support': {
        explanation = `This requires price to: (1) touch a known support level, AND (2) bounce back up. `;
        if (actual === false) {
          explanation += `The chart did NOT show this pattern. Look for wicks touching support followed by bullish candles.`;
        } else {
          explanation += `The chart DID show this pattern - price tested support and held.`;
        }
        break;
      }

      case 'breakout_with_volume': {
        const volumeRatio = context.lastVolume / context.avgVolume;
        const isHighVolume = volumeRatio > 1.2;
        
        explanation = `This requires: (1) price breaking above resistance, AND (2) volume > 1.2x average. `;
        explanation += `Volume ratio: ${volumeRatio.toFixed(2)}x (${isHighVolume ? 'HIGH' : 'NOT HIGH'}). `;
        if (actual === false) {
          explanation += `Either resistance wasn't broken OR volume wasn't high enough.`;
        }
        break;
      }

      case 'potential_reversal_at_support': {
        explanation = `This requires: (1) price near support, AND (2) bullish reversal candle pattern (hammer, engulfing, etc.). `;
        if (actual === false) {
          explanation += `The chart did NOT show a clear reversal pattern at support.`;
        } else {
          explanation += `The chart showed a reversal forming at support.`;
        }
        break;
      }

      case 'overall_bias': {
        const bullishSignals: string[] = [];
        const bearishSignals: string[] = [];
        
        if (context.priceChangePct > 0.5) bullishSignals.push('uptrend');
        if (context.priceChangePct < -0.5) bearishSignals.push('downtrend');
        if (context.lastClose > context.vwap) bullishSignals.push('above VWAP');
        if (context.lastClose < context.vwap) bearishSignals.push('below VWAP');
        
        explanation = `Bullish signals: ${bullishSignals.length > 0 ? bullishSignals.join(', ') : 'none'}. `;
        explanation += `Bearish signals: ${bearishSignals.length > 0 ? bearishSignals.join(', ') : 'none'}. `;
        explanation += `Net signal count determines bias: "${String(actual)}".`;
        break;
      }
    }
  }

  return {
    field,
    predicted,
    actual,
    correct,
    explanation,
  };
}

/**
 * Generate complete feedback message for all fields.
 * 
 * IMPROVEMENTS:
 * 1. High accuracy (>=80%): Confidence retention - reinforce that methodology is correct
 * 2. Field-specific only: Only provide feedback on WRONG fields, not general analysis
 */
export function generateFeedback(input: FeedbackContext): string {
  const multiStepFields: Array<keyof ChartReadingOutput['multi_step']> = [
    'uptrend_pullback_to_vwap',
    'volatility_direction_combo',
    'tested_and_held_support',
    'breakout_with_volume',
    'potential_reversal_at_support',
    'overall_bias',
  ];

  const fieldFeedbacks = multiStepFields.map(field => 
    generateFieldFeedback(
      field,
      input.prediction.multi_step[field],
      input.groundTruth.multi_step[field],
      input.context
    )
  );

  const correctCount = fieldFeedbacks.filter(f => f.correct).length;
  const wrongFields = fieldFeedbacks.filter(f => !f.correct);
  const correctFields = fieldFeedbacks.filter(f => f.correct);
  const accuracy = correctCount / 6;

  let feedback = `═══════════════════════════════════════════════════════════════\n`;
  feedback += `                    FEEDBACK ON YOUR ANALYSIS\n`;
  feedback += `═══════════════════════════════════════════════════════════════\n\n`;
  
  feedback += `You got ${correctCount}/6 fields correct (${(accuracy * 100).toFixed(0)}% accuracy).\n\n`;

  // HIGH ACCURACY PATH: Confidence retention
  if (accuracy >= 0.8) {
    feedback += `🎯 EXCELLENT ANALYSIS! Your methodology is working well.\n\n`;
    feedback += `✅ TRUST YOUR APPROACH for these fields (you got them RIGHT):\n`;
    for (const f of correctFields) {
      feedback += `   • ${f.field}: Your answer "${String(f.predicted)}" was CORRECT\n`;
    }
    feedback += `\n`;
    
    if (wrongFields.length > 0) {
      feedback += `⚠️ MINOR CORRECTION needed for ${wrongFields.length} field(s) only:\n\n`;
      for (const f of wrongFields) {
        feedback += `   ${f.field}:\n`;
        feedback += `      You said: ${String(f.predicted)}\n`;
        feedback += `      Should be: ${String(f.actual)}\n`;
        feedback += `      Tip: ${f.explanation}\n\n`;
      }
    }
    
    feedback += `📌 KEY REMINDER: Your overall methodology is CORRECT.\n`;
    feedback += `   On future charts, continue using the SAME analytical approach.\n`;
    feedback += `   Only adjust the specific field(s) mentioned above.\n`;
  }
  // MEDIUM/LOW ACCURACY PATH: Field-specific corrections only
  else if (wrongFields.length > 0) {
    feedback += `📋 FIELD-SPECIFIC CORRECTIONS:\n\n`;
    feedback += `Focus ONLY on fixing these ${wrongFields.length} specific fields:\n\n`;
    
    for (const f of wrongFields) {
      feedback += `❌ ${f.field}\n`;
      feedback += `   Your prediction: ${String(f.predicted)}\n`;
      feedback += `   Correct answer:  ${String(f.actual)}\n`;
      feedback += `   How to identify: ${f.explanation}\n\n`;
    }
    
    feedback += `✅ These fields were CORRECT (keep using same methodology):\n`;
    for (const f of correctFields) {
      feedback += `   • ${f.field}: "${String(f.predicted)}" ✓\n`;
    }
    feedback += `\n`;
  }
  // PERFECT ACCURACY
  else {
    feedback += `✅ PERFECT! All predictions were correct.\n`;
    feedback += `Your analytical methodology is working excellently.\n`;
    feedback += `Continue using the SAME approach on future charts.\n`;
  }

  feedback += `───────────────────────────────────────────────────────────────\n`;
  feedback += `REFERENCE DATA (from this specific chart):\n`;
  feedback += `  • VWAP: $${input.context.vwap.toFixed(2)}\n`;
  feedback += `  • Last Close: $${input.context.lastClose.toFixed(2)}\n`;
  feedback += `  • Price Change: ${input.context.priceChangePct.toFixed(2)}%\n`;
  feedback += `  • Volatility: ${input.context.volatilityPct.toFixed(2)}%\n`;
  feedback += `  • Volume Ratio: ${(input.context.lastVolume / input.context.avgVolume).toFixed(2)}x average\n`;
  feedback += `───────────────────────────────────────────────────────────────\n`;

  return feedback;
}

/**
 * Generate a simplified feedback message (for testing).
 */
export function generateSimpleFeedback(
  prediction: ChartReadingOutput['multi_step'],
  groundTruth: ChartReadingOutput['multi_step']
): string {
  const fields: Array<keyof ChartReadingOutput['multi_step']> = [
    'uptrend_pullback_to_vwap',
    'volatility_direction_combo',
    'tested_and_held_support',
    'breakout_with_volume',
    'potential_reversal_at_support',
    'overall_bias',
  ];

  let feedback = `Here is feedback on your previous analysis:\n\n`;

  for (const field of fields) {
    const pred = prediction[field];
    const actual = groundTruth[field];
    const correct = pred === actual;

    if (correct) {
      feedback += `✅ ${field}: Correct (${String(pred)})\n`;
    } else {
      feedback += `❌ ${field}: Wrong. You said "${String(pred)}", but correct answer is "${String(actual)}".\n`;
    }
  }

  feedback += `\nPlease use this feedback to improve your analysis.\n`;

  return feedback;
}

