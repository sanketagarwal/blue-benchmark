/**
 * Deterministic model runner for provider-independent testing.
 * Simulates model responses for golden path testing without network calls.
 */

import type { BottomCallerOutput, BottomPredictions } from '../../src/bottom-caller.js';

/**
 * Configuration for a single horizon prediction
 */
export interface HorizonPredictionConfig {
  noNewLow: boolean;
  confidence: number;
}

/**
 * Configuration interface for the deterministic runner
 */
export interface DeterministicRunnerConfig {
  predictions: {
    '15m': HorizonPredictionConfig;
    '1h': HorizonPredictionConfig;
    '4h': HorizonPredictionConfig;
    '24h': HorizonPredictionConfig;
  };
  includeReasoning?: boolean;
  reasoning?: string;
}

/**
 * Result returned by the deterministic runner
 */
export interface DeterministicRunnerResult {
  text: string;
  parsed: BottomCallerOutput;
}

/**
 * Calculate expected log loss for a prediction
 * Log loss = -ln(p) when prediction is correct
 * Log loss = -ln(1-p) when prediction is incorrect
 *
 * @param correct - Whether the prediction was correct
 * @param confidence - The confidence level (0.5 to 1.0)
 * @returns The log loss value
 */
export function getExpectedLogLoss(correct: boolean, confidence: number): number {
  if (correct) {
    return -Math.log(confidence);
  }
  return -Math.log(1 - confidence);
}

/**
 * DeterministicModelRunner simulates LLM responses for testing.
 * Returns properly formatted JSON that can be parsed by production parsers.
 */
export class DeterministicModelRunner {
  private readonly config: DeterministicRunnerConfig;
  private readonly wrapInCodeFences: boolean;

  constructor(config: DeterministicRunnerConfig, options?: { wrapInCodeFences?: boolean }) {
    this.config = config;
    this.wrapInCodeFences = options?.wrapInCodeFences ?? false;
  }

  /**
   * Run the deterministic model, returning a formatted response
   *
   * @param _prompt - Ignored, for interface compatibility
   * @param _images - Ignored, for interface compatibility
   * @returns The deterministic result with text and parsed output
   */
  run(_prompt?: string, _images?: Uint8Array[]): DeterministicRunnerResult {
    const output = this.buildOutput();
    const text = this.formatResponse(output);

    return {
      text,
      parsed: output,
    };
  }

  /**
   * Get just the text response (for simpler integration)
   */
  getText(_prompt?: string, _images?: Uint8Array[]): string {
    return this.run(_prompt, _images).text;
  }

  /**
   * Get the parsed output directly
   */
  getParsedOutput(): BottomCallerOutput {
    return this.buildOutput();
  }

  /**
   * Get just the predictions object
   */
  getPredictions(): BottomPredictions {
    return this.config.predictions;
  }

  private buildOutput(): BottomCallerOutput {
    const output: BottomCallerOutput = {
      predictions: this.config.predictions,
    };

    if (this.config.includeReasoning && this.config.reasoning !== undefined) {
      output.reasoning = this.config.reasoning;
    }

    return output;
  }

  private formatResponse(output: BottomCallerOutput): string {
    const json = JSON.stringify(output, null, 2);

    if (this.wrapInCodeFences) {
      return `\`\`\`json\n${json}\n\`\`\``;
    }

    return json;
  }
}

/**
 * Golden test predictions matching the expected labels
 * 15m (label=false): noNewLow=false with 0.80 confidence
 * 1h (label=true): noNewLow=true with 0.90 confidence
 * 4h (label=false): noNewLow=false with 0.80 confidence
 * 24h (label=true): noNewLow=true with 0.90 confidence
 */
export const GOLDEN_TEST_PREDICTIONS: DeterministicRunnerConfig['predictions'] = {
  '15m': { noNewLow: false, confidence: 0.80 },
  '1h': { noNewLow: true, confidence: 0.90 },
  '4h': { noNewLow: false, confidence: 0.80 },
  '24h': { noNewLow: true, confidence: 0.90 },
};

/**
 * Create a preconfigured runner for golden path tests.
 * Uses predictions that match ground truth labels with known confidences.
 *
 * Expected log loss values when predictions match labels:
 * - 0.90 confidence: -ln(0.90) ≈ 0.10536...
 * - 0.80 confidence: -ln(0.80) ≈ 0.22314...
 *
 * @param options - Optional configuration overrides
 * @returns A configured DeterministicModelRunner
 */
export function createGoldenTestRunner(
  options?: { wrapInCodeFences?: boolean }
): DeterministicModelRunner {
  return new DeterministicModelRunner(
    {
      predictions: GOLDEN_TEST_PREDICTIONS,
      includeReasoning: false,
    },
    options
  );
}

/**
 * Create a runner with custom predictions
 *
 * @param predictions - Custom predictions for each horizon
 * @param options - Optional configuration
 * @returns A configured DeterministicModelRunner
 */
export function createCustomRunner(
  predictions: DeterministicRunnerConfig['predictions'],
  options?: {
    wrapInCodeFences?: boolean;
    includeReasoning?: boolean;
    reasoning?: string;
  }
): DeterministicModelRunner {
  return new DeterministicModelRunner(
    {
      predictions,
      includeReasoning: options?.includeReasoning,
      reasoning: options?.reasoning,
    },
    { wrapInCodeFences: options?.wrapInCodeFences }
  );
}

/**
 * Expected log loss for correct prediction with 0.90 confidence
 * -ln(0.90) ≈ 0.10536051565...
 */
export const LOG_LOSS_CONFIDENCE_90 = -Math.log(0.90);

/**
 * Expected log loss for correct prediction with 0.80 confidence
 * -ln(0.80) ≈ 0.22314355131...
 */
export const LOG_LOSS_CONFIDENCE_80 = -Math.log(0.80);
