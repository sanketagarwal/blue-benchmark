import { describe, it, expect } from 'vitest';
import { validateHorizonPrediction, validateAllPredictions } from '../src/validation.js';

describe('validateHorizonPrediction', () => {
  describe('confidence validation', () => {
    it('rejects confidence < 0.5', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.4, candlesBack: 5 },
        '15m'
      );
      expect(result.valid).toBe(false);
      expect(result.invalidReason).toContain('confidence');
    });

    it('rejects confidence > 1.0', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 1.1, candlesBack: 5 },
        '15m'
      );
      expect(result.valid).toBe(false);
    });

    it('accepts confidence = 0.5', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: false, confidence: 0.5 },
        '15m'
      );
      expect(result.valid).toBe(true);
    });

    it('accepts confidence = 1.0', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: false, confidence: 1.0 },
        '15m'
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('candlesBack validation', () => {
    it('rejects missing candlesBack when hasBottomed=true', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8 },
        '15m'
      );
      expect(result.valid).toBe(false);
      expect(result.invalidReason).toContain('candlesBack required');
    });

    it('accepts missing candlesBack when hasBottomed=false', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: false, confidence: 0.6 },
        '15m'
      );
      expect(result.valid).toBe(true);
    });

    it('rejects candlesBack < 0', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: -1 },
        '15m'
      );
      expect(result.valid).toBe(false);
    });

    it('rejects non-integer candlesBack', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: 5.5 },
        '15m'
      );
      expect(result.valid).toBe(false);
      expect(result.invalidReason).toContain('integer');
    });

    // 15m horizon: lookback=24, valid range 0-23
    it('15m: accepts candlesBack=0', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: 0 },
        '15m'
      );
      expect(result.valid).toBe(true);
    });

    it('15m: accepts candlesBack=23 (max)', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: 23 },
        '15m'
      );
      expect(result.valid).toBe(true);
    });

    it('15m: rejects candlesBack=24 (out of range)', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: 24 },
        '15m'
      );
      expect(result.valid).toBe(false);
      expect(result.invalidReason).toContain('> max 23');
    });

    // 1h horizon: lookback=32, valid range 0-31
    it('1h: accepts candlesBack=31 (max)', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: 31 },
        '1h'
      );
      expect(result.valid).toBe(true);
    });

    it('1h: rejects candlesBack=32', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: 32 },
        '1h'
      );
      expect(result.valid).toBe(false);
    });

    // 4h horizon: lookback=32, valid range 0-31
    it('4h: accepts candlesBack=31 (max)', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: 31 },
        '4h'
      );
      expect(result.valid).toBe(true);
    });

    it('4h: rejects candlesBack=32', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: 32 },
        '4h'
      );
      expect(result.valid).toBe(false);
    });

    // 24h horizon: lookback=48, valid range 0-47
    it('24h: accepts candlesBack=47 (max)', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: 47 },
        '24h'
      );
      expect(result.valid).toBe(true);
    });

    it('24h: rejects candlesBack=48', () => {
      const result = validateHorizonPrediction(
        { hasBottomed: true, confidence: 0.8, candlesBack: 48 },
        '24h'
      );
      expect(result.valid).toBe(false);
    });
  });
});

describe('validateAllPredictions', () => {
  it('validates all horizons', () => {
    const predictions = {
      '15m': { hasBottomed: true, confidence: 0.8, candlesBack: 5 },
      '1h': { hasBottomed: false, confidence: 0.6 },
      '4h': { hasBottomed: true, confidence: 0.9, candlesBack: 20 },
      '24h': { hasBottomed: false, confidence: 0.55 },
    };
    const results = validateAllPredictions(predictions);
    expect(results['15m'].valid).toBe(true);
    expect(results['1h'].valid).toBe(true);
    expect(results['4h'].valid).toBe(true);
    expect(results['24h'].valid).toBe(true);
  });

  it('returns invalid for failing horizons', () => {
    const predictions = {
      '15m': { hasBottomed: true, confidence: 0.8, candlesBack: 100 }, // invalid
      '1h': { hasBottomed: false, confidence: 0.6 },
      '4h': { hasBottomed: true, confidence: 0.9, candlesBack: 20 },
      '24h': { hasBottomed: true, confidence: 0.7 }, // missing candlesBack
    };
    const results = validateAllPredictions(predictions);
    expect(results['15m'].valid).toBe(false);
    expect(results['1h'].valid).toBe(true);
    expect(results['4h'].valid).toBe(true);
    expect(results['24h'].valid).toBe(false);
  });
});
