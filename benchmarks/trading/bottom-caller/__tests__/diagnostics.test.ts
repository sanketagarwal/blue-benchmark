import { describe, expect, it } from 'vitest';
import {
  computeHorizonDatasetDiagnostics,
  computePredictionDiversity,
  createHashFromInputs,
} from '../src/diagnostics/index';

const LOG_2 = Math.log(2);

describe('computeHorizonDatasetDiagnostics', () => {
  describe('edge cases', () => {
    it('handles empty labels array', () => {
      const result = computeHorizonDatasetDiagnostics([]);

      expect(result.n).toBe(0);
      expect(result.countTrue).toBe(0);
      expect(result.countFalse).toBe(0);
      expect(result.pTrue).toBe(0);
      expect(result.baselineRandomLL).toBe(0);
      expect(result.baselinePrevalenceLL).toBe(0);
    });

    it('handles all true labels', () => {
      const labels = [true, true, true, true];
      const result = computeHorizonDatasetDiagnostics(labels);

      expect(result.n).toBe(4);
      expect(result.countTrue).toBe(4);
      expect(result.countFalse).toBe(0);
      expect(result.pTrue).toBe(1);
      expect(result.baselineRandomLL).toBeCloseTo(LOG_2);
      expect(result.baselinePrevalenceLL).toBeGreaterThan(0);
      expect(result.baselinePrevalenceLL).toBeLessThan(1e-14);
    });

    it('handles all false labels', () => {
      const labels = [false, false, false];
      const result = computeHorizonDatasetDiagnostics(labels);

      expect(result.n).toBe(3);
      expect(result.countTrue).toBe(0);
      expect(result.countFalse).toBe(3);
      expect(result.pTrue).toBe(0);
      expect(result.baselineRandomLL).toBeCloseTo(LOG_2);
      expect(result.baselinePrevalenceLL).toBeGreaterThan(0);
      expect(result.baselinePrevalenceLL).toBeLessThan(1e-14);
    });
  });

  describe('mixed distributions', () => {
    it('handles 50/50 distribution', () => {
      const labels = [true, false, true, false, true, false];
      const result = computeHorizonDatasetDiagnostics(labels);

      expect(result.n).toBe(6);
      expect(result.countTrue).toBe(3);
      expect(result.countFalse).toBe(3);
      expect(result.pTrue).toBeCloseTo(0.5);
      expect(result.baselineRandomLL).toBeCloseTo(LOG_2);
      expect(result.baselinePrevalenceLL).toBeCloseTo(LOG_2);
    });

    it('handles skewed distribution', () => {
      const labels = [true, true, true, true, false];
      const result = computeHorizonDatasetDiagnostics(labels);

      expect(result.n).toBe(5);
      expect(result.countTrue).toBe(4);
      expect(result.countFalse).toBe(1);
      expect(result.pTrue).toBeCloseTo(0.8);
      expect(result.baselineRandomLL).toBeCloseTo(LOG_2);
      expect(result.baselinePrevalenceLL).toBeLessThan(LOG_2);
    });
  });

  describe('baseline calculations', () => {
    it('baselineRandomLL is always log(2)', () => {
      const cases = [
        [true],
        [false],
        [true, false],
        [true, true, true, false],
        [false, false, false, true, true],
      ];

      for (const labels of cases) {
        const result = computeHorizonDatasetDiagnostics(labels);
        expect(result.baselineRandomLL).toBeCloseTo(LOG_2);
      }
    });

    it('baselinePrevalenceLL matches expected entropy for balanced data', () => {
      const labels = [true, false, true, false];
      const result = computeHorizonDatasetDiagnostics(labels);

      expect(result.baselinePrevalenceLL).toBeCloseTo(LOG_2);
    });

    it('baselinePrevalenceLL is near-zero when pTrue is 0 or 1 (clipped)', () => {
      const allTrue = computeHorizonDatasetDiagnostics([true, true, true]);
      const allFalse = computeHorizonDatasetDiagnostics([false, false, false]);

      expect(allTrue.baselinePrevalenceLL).toBeGreaterThan(0);
      expect(allTrue.baselinePrevalenceLL).toBeLessThan(1e-14);
      expect(allFalse.baselinePrevalenceLL).toBeGreaterThan(0);
      expect(allFalse.baselinePrevalenceLL).toBeLessThan(1e-14);
    });
  });
});

describe('computePredictionDiversity', () => {
  describe('edge cases', () => {
    it('handles empty predictions array', () => {
      const result = computePredictionDiversity([]);

      expect(result.uniquePCount).toBe(0);
      expect(result.pMin).toBe(0);
      expect(result.pMax).toBe(0);
      expect(result.pStdDev).toBe(0);
      expect(result.confidenceStdDev).toBe(0);
      expect(result.noNewLowTrueRate).toBe(0);
    });

    it('handles all same predictions (uniquePCount = 1)', () => {
      const predictions = [0.7, 0.7, 0.7, 0.7];
      const result = computePredictionDiversity(predictions);

      expect(result.uniquePCount).toBe(1);
      expect(result.pMin).toBeCloseTo(0.7);
      expect(result.pMax).toBeCloseTo(0.7);
      expect(result.pStdDev).toBeCloseTo(0);
    });

    it('handles all different predictions', () => {
      const predictions = [0.1, 0.2, 0.3, 0.4, 0.5];
      const result = computePredictionDiversity(predictions);

      expect(result.uniquePCount).toBe(5);
      expect(result.pMin).toBeCloseTo(0.1);
      expect(result.pMax).toBeCloseTo(0.5);
    });
  });

  describe('statistical calculations', () => {
    it('calculates pMin and pMax correctly', () => {
      const predictions = [0.2, 0.5, 0.8, 0.3, 0.9];
      const result = computePredictionDiversity(predictions);

      expect(result.pMin).toBeCloseTo(0.2);
      expect(result.pMax).toBeCloseTo(0.9);
    });

    it('calculates pStdDev correctly', () => {
      const predictions = [0.4, 0.5, 0.6];
      const result = computePredictionDiversity(predictions);

      const expectedMean = 0.5;
      const expectedVariance =
        ((0.4 - expectedMean) ** 2 +
          (0.5 - expectedMean) ** 2 +
          (0.6 - expectedMean) ** 2) /
        3;
      const expectedStdDev = Math.sqrt(expectedVariance);

      expect(result.pStdDev).toBeCloseTo(expectedStdDev, 5);
    });

    it('calculates noNewLowTrueRate correctly', () => {
      const predictions = [0.5, 0.5, 0.5, 0.5];
      const noNewLowPredictions = [true, true, false, true];
      const result = computePredictionDiversity(predictions, noNewLowPredictions);

      expect(result.noNewLowTrueRate).toBeCloseTo(0.75);
    });

    it('noNewLowTrueRate is 0 when no predictions provided', () => {
      const predictions = [0.5, 0.5, 0.5];
      const result = computePredictionDiversity(predictions);

      expect(result.noNewLowTrueRate).toBe(0);
    });

    it('noNewLowTrueRate is 0 when empty noNewLowPredictions provided', () => {
      const predictions = [0.5, 0.5, 0.5];
      const result = computePredictionDiversity(predictions, []);

      expect(result.noNewLowTrueRate).toBe(0);
    });
  });
});

describe('createHashFromInputs', () => {
  const mockImages = {
    '15m': new Uint8Array([1, 2, 3]),
    '1h': new Uint8Array([4, 5, 6]),
    '4h': new Uint8Array([7, 8, 9]),
    '24h': new Uint8Array([10, 11, 12]),
  } as const;

  const mockLabelInfo = {
    refLowPrice: 100.5,
    candlesBack: 10,
    forwardLowPrice: 99.0,
    label: true,
  };

  const mockSnapTime = new Date('2024-01-01T00:00:00Z');

  describe('hash format', () => {
    it('returns valid SHA-256 hex strings (64 chars)', () => {
      const result = createHashFromInputs(
        'test prompt',
        mockImages,
        mockLabelInfo,
        mockSnapTime
      );

      expect(result.promptHash).toHaveLength(64);
      expect(result.promptHash).toMatch(/^[a-f0-9]{64}$/);

      expect(result.labelHash).toHaveLength(64);
      expect(result.labelHash).toMatch(/^[a-f0-9]{64}$/);

      for (const tfId of ['15m', '1h', '4h', '24h'] as const) {
        expect(result.imageHashes[tfId]).toHaveLength(64);
        expect(result.imageHashes[tfId]).toMatch(/^[a-f0-9]{64}$/);
      }
    });
  });

  describe('determinism', () => {
    it('same inputs produce same hashes', () => {
      const result1 = createHashFromInputs(
        'identical prompt',
        mockImages,
        mockLabelInfo,
        mockSnapTime
      );
      const result2 = createHashFromInputs(
        'identical prompt',
        mockImages,
        mockLabelInfo,
        mockSnapTime
      );

      expect(result1.promptHash).toBe(result2.promptHash);
      expect(result1.labelHash).toBe(result2.labelHash);
      expect(result1.imageHashes['15m']).toBe(result2.imageHashes['15m']);
      expect(result1.imageHashes['1h']).toBe(result2.imageHashes['1h']);
      expect(result1.imageHashes['4h']).toBe(result2.imageHashes['4h']);
      expect(result1.imageHashes['24h']).toBe(result2.imageHashes['24h']);
    });
  });

  describe('uniqueness', () => {
    it('different prompts produce different promptHash', () => {
      const result1 = createHashFromInputs(
        'prompt A',
        mockImages,
        mockLabelInfo,
        mockSnapTime
      );
      const result2 = createHashFromInputs(
        'prompt B',
        mockImages,
        mockLabelInfo,
        mockSnapTime
      );

      expect(result1.promptHash).not.toBe(result2.promptHash);
    });

    it('different label info produces different labelHash', () => {
      const labelInfo1 = { ...mockLabelInfo, label: true };
      const labelInfo2 = { ...mockLabelInfo, label: false };

      const result1 = createHashFromInputs(
        'same prompt',
        mockImages,
        labelInfo1,
        mockSnapTime
      );
      const result2 = createHashFromInputs(
        'same prompt',
        mockImages,
        labelInfo2,
        mockSnapTime
      );

      expect(result1.labelHash).not.toBe(result2.labelHash);
    });

    it('different images produce different imageHashes', () => {
      const images1 = { ...mockImages, '15m': new Uint8Array([1, 2, 3]) };
      const images2 = { ...mockImages, '15m': new Uint8Array([4, 5, 6]) };

      const result1 = createHashFromInputs(
        'same prompt',
        images1,
        mockLabelInfo,
        mockSnapTime
      );
      const result2 = createHashFromInputs(
        'same prompt',
        images2,
        mockLabelInfo,
        mockSnapTime
      );

      expect(result1.imageHashes['15m']).not.toBe(result2.imageHashes['15m']);
      expect(result1.imageHashes['1h']).toBe(result2.imageHashes['1h']);
    });
  });

  describe('record structure', () => {
    it('includes snapTime in result', () => {
      const result = createHashFromInputs(
        'test',
        mockImages,
        mockLabelInfo,
        mockSnapTime
      );

      expect(result.snapTime).toBe(mockSnapTime);
    });

    it('includes all timeframe hashes', () => {
      const result = createHashFromInputs(
        'test',
        mockImages,
        mockLabelInfo,
        mockSnapTime
      );

      expect(result.imageHashes).toHaveProperty('15m');
      expect(result.imageHashes).toHaveProperty('1h');
      expect(result.imageHashes).toHaveProperty('4h');
      expect(result.imageHashes).toHaveProperty('24h');
    });
  });
});
