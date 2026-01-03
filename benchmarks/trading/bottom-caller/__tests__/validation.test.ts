import { describe, it, expect } from 'vitest';
import { validateHorizonPrediction, validateAllPredictions } from '../src/validation.js';

describe('validateHorizonPrediction', () => {
  describe('confidence validation', () => {
    it('rejects confidence < 0.5', () => {
      const result = validateHorizonPrediction(
        { noNewLow: true, confidence: 0.4 },
        '15m'
      );
      expect(result.valid).toBe(false);
      expect(result.invalidReason).toContain('confidence');
    });

    it('rejects confidence > 1.0', () => {
      const result = validateHorizonPrediction(
        { noNewLow: true, confidence: 1.1 },
        '15m'
      );
      expect(result.valid).toBe(false);
    });

    it('accepts confidence = 0.5', () => {
      const result = validateHorizonPrediction(
        { noNewLow: false, confidence: 0.5 },
        '15m'
      );
      expect(result.valid).toBe(true);
    });

    it('accepts confidence = 1.0', () => {
      const result = validateHorizonPrediction(
        { noNewLow: false, confidence: 1.0 },
        '15m'
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('noNewLow validation', () => {
    it('accepts noNewLow = true', () => {
      const result = validateHorizonPrediction(
        { noNewLow: true, confidence: 0.8 },
        '15m'
      );
      expect(result.valid).toBe(true);
    });

    it('accepts noNewLow = false', () => {
      const result = validateHorizonPrediction(
        { noNewLow: false, confidence: 0.6 },
        '15m'
      );
      expect(result.valid).toBe(true);
    });
  });
});

describe('validateAllPredictions', () => {
  it('validates all horizons', () => {
    const predictions = {
      '15m': { noNewLow: true, confidence: 0.8 },
      '1h': { noNewLow: false, confidence: 0.6 },
      '4h': { noNewLow: true, confidence: 0.9 },
      '24h': { noNewLow: false, confidence: 0.55 },
    };
    const results = validateAllPredictions(predictions);
    expect(results['15m'].valid).toBe(true);
    expect(results['1h'].valid).toBe(true);
    expect(results['4h'].valid).toBe(true);
    expect(results['24h'].valid).toBe(true);
  });

  it('returns invalid for failing horizons', () => {
    const predictions = {
      '15m': { noNewLow: true, confidence: 0.3 }, // invalid - confidence too low
      '1h': { noNewLow: false, confidence: 0.6 },
      '4h': { noNewLow: true, confidence: 0.9 },
      '24h': { noNewLow: false, confidence: 1.5 }, // invalid - confidence too high
    };
    const results = validateAllPredictions(predictions);
    expect(results['15m'].valid).toBe(false);
    expect(results['1h'].valid).toBe(true);
    expect(results['4h'].valid).toBe(true);
    expect(results['24h'].valid).toBe(false);
  });
});
