import { describe, it, expect } from 'vitest';

import { brierScore, meanBrierScore } from '../src/scorers/brier-scorer.js';
import { logLoss, meanLogLoss } from '../src/scorers/log-loss-scorer.js';
import { forecastScorer, CONTRACT_IDS } from '../src/scorers/aggregate-scorer.js';

import type { ContractId } from '../src/scorers/types.js';

describe('Brier scorer', () => {
  it('calculates perfect prediction score as 0', () => {
    expect(brierScore(1, true)).toBe(0);
    expect(brierScore(0, false)).toBe(0);
  });

  it('calculates worst prediction score as 1', () => {
    expect(brierScore(0, true)).toBe(1);
    expect(brierScore(1, false)).toBe(1);
  });

  it('calculates 50% probability as 0.25', () => {
    expect(brierScore(0.5, true)).toBe(0.25);
    expect(brierScore(0.5, false)).toBe(0.25);
  });

  it('calculates mean brier score correctly', () => {
    const predictions = [1, 0, 0.5];
    const actuals = [true, false, true];
    // (0 + 0 + 0.25) / 3 = 0.0833...
    expect(meanBrierScore(predictions, actuals)).toBeCloseTo(0.0833, 3);
  });

  it('throws on mismatched array lengths', () => {
    expect(() => meanBrierScore([0.5], [true, false])).toThrow();
  });
});

describe('Log loss scorer', () => {
  it('calculates near-perfect prediction as low loss', () => {
    // epsilon prevents -Infinity
    expect(logLoss(0.99, true)).toBeLessThan(0.02);
    expect(logLoss(0.01, false)).toBeLessThan(0.02);
  });

  it('calculates worst prediction as high loss', () => {
    // Clamped at epsilon, so not Infinity
    expect(logLoss(0.01, true)).toBeGreaterThan(4);
    expect(logLoss(0.99, false)).toBeGreaterThan(4);
  });

  it('calculates 50% probability as ~0.693 (ln(2))', () => {
    expect(logLoss(0.5, true)).toBeCloseTo(0.693, 2);
    expect(logLoss(0.5, false)).toBeCloseTo(0.693, 2);
  });

  it('calculates mean log loss correctly', () => {
    const predictions = [0.9, 0.1, 0.5];
    const actuals = [true, false, true];
    const expectedMean = (logLoss(0.9, true) + logLoss(0.1, false) + logLoss(0.5, true)) / 3;
    expect(meanLogLoss(predictions, actuals)).toBeCloseTo(expectedMean, 5);
  });
});

describe('Forecast aggregate scorer', () => {
  it('has correct scorer id and name', () => {
    expect(forecastScorer.id).toBe('forecast_scorer');
    expect(forecastScorer.name).toBe('Forecast Scorer');
  });

  it('scores perfect predictions correctly', () => {
    const predictions: Record<ContractId, number> = {} as Record<ContractId, number>;
    const actuals: Record<ContractId, boolean> = {} as Record<ContractId, boolean>;

    // All predictions match actuals
    for (const id of CONTRACT_IDS) {
      predictions[id] = 1;
      actuals[id] = true;
    }

    const result = forecastScorer.score({
      predictions,
      actuals,
      predictionTime: new Date(),
      symbolId: 'BTC-USD',
    });

    expect(result.score).toBe(0); // Brier score
    expect(result.aggregates.meanBrierScore).toBe(0);
    expect(result.aggregates.accuracy).toBe(1);
    expect(result.perContract).toHaveLength(CONTRACT_IDS.length);
  });

  it('scores worst predictions correctly', () => {
    const predictions: Record<ContractId, number> = {} as Record<ContractId, number>;
    const actuals: Record<ContractId, boolean> = {} as Record<ContractId, boolean>;

    // All predictions are opposite of actuals
    for (const id of CONTRACT_IDS) {
      predictions[id] = 0;
      actuals[id] = true;
    }

    const result = forecastScorer.score({
      predictions,
      actuals,
      predictionTime: new Date(),
      symbolId: 'BTC-USD',
    });

    expect(result.score).toBe(1); // Worst Brier score
    expect(result.aggregates.meanBrierScore).toBe(1);
    expect(result.aggregates.accuracy).toBe(0);
  });

  it('calculates accuracy based on 0.5 threshold', () => {
    const predictions: Record<ContractId, number> = {} as Record<ContractId, number>;
    const actuals: Record<ContractId, boolean> = {} as Record<ContractId, boolean>;

    // Set up 50% correct: first half correct, second half wrong
    const halfIndex = Math.floor(CONTRACT_IDS.length / 2);
    for (let i = 0; i < CONTRACT_IDS.length; i++) {
      const id = CONTRACT_IDS[i];
      if (id === undefined) continue;

      if (i < halfIndex) {
        predictions[id] = 0.8; // predicts true
        actuals[id] = true; // correct
      } else {
        predictions[id] = 0.8; // predicts true
        actuals[id] = false; // wrong
      }
    }

    const result = forecastScorer.score({
      predictions,
      actuals,
      predictionTime: new Date(),
      symbolId: 'ETH-USD',
    });

    // Accuracy should be close to half
    expect(result.aggregates.accuracy).toBeCloseTo(halfIndex / CONTRACT_IDS.length, 2);
  });

  it('throws on missing predictions', () => {
    const predictions: Record<ContractId, number> = {} as Record<ContractId, number>;
    const actuals: Record<ContractId, boolean> = {} as Record<ContractId, boolean>;

    // Only set one prediction
    predictions['dump-simple-15m-1pct'] = 0.5;
    for (const id of CONTRACT_IDS) {
      actuals[id] = false;
    }

    expect(() =>
      forecastScorer.score({
        predictions,
        actuals,
        predictionTime: new Date(),
        symbolId: 'BTC-USD',
      })
    ).toThrow(/Missing prediction/);
  });

  it('throws on missing actuals', () => {
    const predictions: Record<ContractId, number> = {} as Record<ContractId, number>;
    const actuals: Record<ContractId, boolean> = {} as Record<ContractId, boolean>;

    for (const id of CONTRACT_IDS) {
      predictions[id] = 0.5;
    }
    // Only set one actual
    actuals['dump-simple-15m-1pct'] = true;

    expect(() =>
      forecastScorer.score({
        predictions,
        actuals,
        predictionTime: new Date(),
        symbolId: 'BTC-USD',
      })
    ).toThrow(/Missing actual/);
  });
});
