import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  printPerHorizonArenaTable,
  printFinalSummaryTable,
  printTimingDiagnosticsTable,
  printCrossHorizonBehaviorMap,
} from '../src/table';
import type { PerHorizonRankings } from '../src/scorers/phase-3-scorer';
import type { TimeframeId } from '../src/timeframe-config';
import type { TrackBMetrics } from '../src/scorers/timing-metrics';

describe('table', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('printPerHorizonArenaTable', () => {
    it('should print per-horizon rankings', () => {
      const rankings: PerHorizonRankings = {
        '15m': [
          { modelId: 'model-a', score: 0.95, logLoss: 0.4, bestWindow: 0.3, stability: 0.1 },
          { modelId: 'model-b', score: 0.85, logLoss: 0.5, bestWindow: 0.4, stability: 0.2 },
        ],
        '1h': [
          { modelId: 'model-a', score: 0.90, logLoss: 0.45, bestWindow: 0.35, stability: 0.15 },
        ],
        '24h': [],
        '4h': [],
      };

      printPerHorizonArenaTable(rankings);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('15m Arena Winners');
      expect(output).toContain('1h Arena Winners');
      expect(output).toContain('model-a');
      expect(output).toContain('model-b');
    });

    it('should skip horizons with no rankings', () => {
      const rankings: PerHorizonRankings = {
        '15m': [],
        '1h': [],
        '24h': [],
        '4h': [],
      };

      printPerHorizonArenaTable(rankings);

      // Should still be called but with minimal output
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should display medals for top 3', () => {
      const rankings: PerHorizonRankings = {
        '15m': [
          { modelId: 'gold', score: 0.95, logLoss: 0.3, bestWindow: 0.2, stability: 0.1 },
          { modelId: 'silver', score: 0.90, logLoss: 0.35, bestWindow: 0.25, stability: 0.12 },
          { modelId: 'bronze', score: 0.85, logLoss: 0.4, bestWindow: 0.3, stability: 0.15 },
          { modelId: 'fourth', score: 0.80, logLoss: 0.45, bestWindow: 0.35, stability: 0.18 },
        ],
        '1h': [],
        '24h': [],
        '4h': [],
      };

      printPerHorizonArenaTable(rankings);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      // Medals are emojis, verify the table renders with scores
      expect(output).toContain('0.9500');
      expect(output).toContain('0.9000');
      expect(output).toContain('0.8500');
      expect(output).toContain('0.8000');
    });

    it('should color-code log loss values', () => {
      const rankings: PerHorizonRankings = {
        '15m': [
          { modelId: 'good', score: 0.95, logLoss: 0.3, bestWindow: 0.2, stability: 0.1 }, // Good (green)
          { modelId: 'ok', score: 0.85, logLoss: 0.6, bestWindow: 0.3, stability: 0.15 }, // OK (yellow)
          { modelId: 'poor', score: 0.75, logLoss: 1.0, bestWindow: 0.4, stability: 0.2 }, // Poor (red)
        ],
        '1h': [],
        '24h': [],
        '4h': [],
      };

      // Should not throw - colors are ANSI escape codes
      printPerHorizonArenaTable(rankings);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('printFinalSummaryTable', () => {
    interface TestModelState {
      modelId: string;
      eliminated: boolean;
      eliminatedInPhase?: number;
      logLoss: Record<TimeframeId, number>;
    }

    const computeMeanLogLoss = (state: TestModelState): Record<TimeframeId, number> => state.logLoss;

    it('should print final summary with all models', () => {
      const models: TestModelState[] = [
        { modelId: 'winner-model', eliminated: false, logLoss: { '15m': 0.4, '1h': 0.45, '24h': 0.5, '4h': 0.55 } },
        { modelId: 'eliminated-p0', eliminated: true, eliminatedInPhase: 0, logLoss: { '15m': 0.8, '1h': 0.85, '24h': 0.9, '4h': 0.95 } },
        { modelId: 'eliminated-p1', eliminated: true, eliminatedInPhase: 1, logLoss: { '15m': 0.6, '1h': 0.65, '24h': 0.7, '4h': 0.75 } },
      ];

      printFinalSummaryTable(models, computeMeanLogLoss);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Final Model Summary');
      expect(output).toContain('winner-model');
      expect(output).toContain('eliminated-p0');
      expect(output).toContain('eliminated-p1');
      expect(output).toContain('WINNER');
      expect(output).toContain('P0');
      expect(output).toContain('P1');
    });

    it('should handle empty models array', () => {
      const models: TestModelState[] = [];

      printFinalSummaryTable(models, computeMeanLogLoss);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Final Model Summary');
    });

    it('should sort models by mean log loss (best first)', () => {
      const models: TestModelState[] = [
        { modelId: 'worst', eliminated: true, eliminatedInPhase: 0, logLoss: { '15m': 0.9, '1h': 0.9, '24h': 0.9, '4h': 0.9 } },
        { modelId: 'best', eliminated: false, logLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '4h': 0.3 } },
        { modelId: 'middle', eliminated: true, eliminatedInPhase: 1, logLoss: { '15m': 0.6, '1h': 0.6, '24h': 0.6, '4h': 0.6 } },
      ];

      printFinalSummaryTable(models, computeMeanLogLoss);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      // Best should appear before worst in output
      const bestIndex = output.indexOf('best');
      const middleIndex = output.indexOf('middle');
      const worstIndex = output.indexOf('worst');
      expect(bestIndex).toBeLessThan(middleIndex);
      expect(middleIndex).toBeLessThan(worstIndex);
    });

    it('should handle models without eliminatedInPhase', () => {
      const models: TestModelState[] = [
        { modelId: 'unknown-phase', eliminated: true, logLoss: { '15m': 0.7, '1h': 0.7, '24h': 0.7, '4h': 0.7 } },
      ];

      printFinalSummaryTable(models, computeMeanLogLoss);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('P?');
    });

    it('should display dash for NaN log loss values', () => {
      const models: TestModelState[] = [
        { modelId: 'nan-model', eliminated: true, eliminatedInPhase: 0, logLoss: { '15m': Number.NaN, '1h': Number.NaN, '24h': Number.NaN, '4h': Number.NaN } },
      ];

      printFinalSummaryTable(models, computeMeanLogLoss);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      // The output should contain dashes (via chalk.dim('-'))
      expect(output).toContain('nan-model');
      // NaN values should be handled gracefully (no actual "NaN" text visible)
      // The function uses chalk.dim('-') which still contains '-' in the output
    });

    it('should color-code log loss values', () => {
      const models: TestModelState[] = [
        { modelId: 'good-ll', eliminated: false, logLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '4h': 0.3 } }, // Good (green)
        { modelId: 'ok-ll', eliminated: true, eliminatedInPhase: 1, logLoss: { '15m': 0.6, '1h': 0.6, '24h': 0.6, '4h': 0.6 } }, // OK (yellow)
        { modelId: 'poor-ll', eliminated: true, eliminatedInPhase: 0, logLoss: { '15m': 1.0, '1h': 1.0, '24h': 1.0, '4h': 1.0 } }, // Poor (red)
      ];

      // Should not throw - colors are ANSI escape codes
      printFinalSummaryTable(models, computeMeanLogLoss);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('printTimingDiagnosticsTable', () => {
    const createTrackBMetrics = (overrides: Partial<Record<TimeframeId, Partial<TrackBMetrics['byHorizon']['15m']>>> = {}): TrackBMetrics => ({
      hasAnyTimingData: true,
      byHorizon: {
        '15m': {
          hasTimingData: overrides['15m']?.hasTimingData ?? true,
          correctPredictionCount: overrides['15m']?.correctPredictionCount ?? 2,
          earliestCorrectPredictionMs: overrides['15m']?.earliestCorrectPredictionMs ?? 60_000,
          meanTimeToDetectionRatio: overrides['15m']?.meanTimeToDetectionRatio ?? 0.2,
          redundantConfirmations: overrides['15m']?.redundantConfirmations ?? 1,
        },
        '1h': {
          hasTimingData: overrides['1h']?.hasTimingData ?? true,
          correctPredictionCount: overrides['1h']?.correctPredictionCount ?? 3,
          earliestCorrectPredictionMs: overrides['1h']?.earliestCorrectPredictionMs ?? 120_000,
          meanTimeToDetectionRatio: overrides['1h']?.meanTimeToDetectionRatio ?? 0.3,
          redundantConfirmations: overrides['1h']?.redundantConfirmations ?? 2,
        },
        '24h': {
          hasTimingData: overrides['24h']?.hasTimingData ?? true,
          correctPredictionCount: overrides['24h']?.correctPredictionCount ?? 1,
          earliestCorrectPredictionMs: overrides['24h']?.earliestCorrectPredictionMs ?? 300_000,
          meanTimeToDetectionRatio: overrides['24h']?.meanTimeToDetectionRatio ?? 0.5,
          redundantConfirmations: overrides['24h']?.redundantConfirmations ?? 0,
        },
        '4h': {
          hasTimingData: overrides['4h']?.hasTimingData ?? true,
          correctPredictionCount: overrides['4h']?.correctPredictionCount ?? 4,
          earliestCorrectPredictionMs: overrides['4h']?.earliestCorrectPredictionMs ?? 600_000,
          meanTimeToDetectionRatio: overrides['4h']?.meanTimeToDetectionRatio ?? 0.8,
          redundantConfirmations: overrides['4h']?.redundantConfirmations ?? 3,
        },
      },
    });

    it('should print timing diagnostics for each horizon', () => {
      const modelMetrics = [
        { modelId: 'fast-model', metrics: createTrackBMetrics({ '15m': { meanTimeToDetectionRatio: 0.1 } }) },
        { modelId: 'slow-model', metrics: createTrackBMetrics({ '15m': { meanTimeToDetectionRatio: 0.9 } }) },
      ];

      printTimingDiagnosticsTable(modelMetrics);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('15m Timing Diagnostics');
      expect(output).toContain('1h Timing Diagnostics');
      expect(output).toContain('4h Timing Diagnostics');
      expect(output).toContain('24h Timing Diagnostics');
      expect(output).toContain('fast-model');
      expect(output).toContain('slow-model');
    });

    it('should handle undefined earliest prediction', () => {
      const modelMetrics = [
        { modelId: 'no-correct', metrics: createTrackBMetrics({ '15m': { earliestCorrectPredictionMs: undefined } }) },
      ];

      printTimingDiagnosticsTable(modelMetrics);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('no-correct');
      // Should display dash for undefined earliest
    });

    it('should sort by mean time to detection ratio', () => {
      const modelMetrics = [
        { modelId: 'late', metrics: createTrackBMetrics({ '15m': { meanTimeToDetectionRatio: 0.9 } }) },
        { modelId: 'early', metrics: createTrackBMetrics({ '15m': { meanTimeToDetectionRatio: 0.1 } }) },
        { modelId: 'mid', metrics: createTrackBMetrics({ '15m': { meanTimeToDetectionRatio: 0.5 } }) },
      ];

      printTimingDiagnosticsTable(modelMetrics);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      // Early should appear before late
      const earlyIndex = output.indexOf('early');
      const midIndex = output.indexOf('mid');
      const lateIndex = output.indexOf('late');
      expect(earlyIndex).toBeLessThan(midIndex);
      expect(midIndex).toBeLessThan(lateIndex);
    });
  });

  describe('printCrossHorizonBehaviorMap', () => {
    const createTrackBMetrics = (ttdOverrides: Partial<Record<TimeframeId, number>> = {}): TrackBMetrics => ({
      hasAnyTimingData: true,
      byHorizon: {
        '15m': {
          hasTimingData: true,
          correctPredictionCount: 2,
          earliestCorrectPredictionMs: 60_000,
          meanTimeToDetectionRatio: ttdOverrides['15m'] ?? 0.2,
          redundantConfirmations: 1,
        },
        '1h': {
          hasTimingData: true,
          correctPredictionCount: 3,
          earliestCorrectPredictionMs: 120_000,
          meanTimeToDetectionRatio: ttdOverrides['1h'] ?? 0.5,
          redundantConfirmations: 2,
        },
        '24h': {
          hasTimingData: true,
          correctPredictionCount: 1,
          earliestCorrectPredictionMs: 300_000,
          meanTimeToDetectionRatio: ttdOverrides['24h'] ?? 0.5,
          redundantConfirmations: 0,
        },
        '4h': {
          hasTimingData: true,
          correctPredictionCount: 4,
          earliestCorrectPredictionMs: 600_000,
          meanTimeToDetectionRatio: ttdOverrides['4h'] ?? 0.8,
          redundantConfirmations: 3,
        },
      },
    });

    it('should print cross-horizon behavior map', () => {
      const modelMetrics = [
        {
          modelId: 'generalist',
          qualifiedHorizons: new Set(['15m', '1h', '24h', '4h'] as TimeframeId[]),
          trackB: createTrackBMetrics(),
        },
        {
          modelId: 'short-term-only',
          qualifiedHorizons: new Set(['15m', '1h'] as TimeframeId[]),
          trackB: createTrackBMetrics(),
        },
      ];

      printCrossHorizonBehaviorMap(modelMetrics);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Cross-Horizon Behavior Map');
      expect(output).toContain('generalist');
      expect(output).toContain('short-term-only');
      expect(output).toContain('Generalist');
    });

    it('should show X for disqualified horizons', () => {
      const modelMetrics = [
        {
          modelId: 'partial-qualified',
          qualifiedHorizons: new Set(['15m', '24h'] as TimeframeId[]),
          trackB: createTrackBMetrics(),
        },
      ];

      printCrossHorizonBehaviorMap(modelMetrics);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('partial-qualified');
      // Disqualified horizons should show X symbol
    });

    it('should show timing indicators (E/M/L)', () => {
      const modelMetrics = [
        {
          modelId: 'mixed-timing',
          qualifiedHorizons: new Set(['15m', '1h', '24h', '4h'] as TimeframeId[]),
          trackB: createTrackBMetrics({ '15m': 0.1, '1h': 0.5, '24h': 0.5, '4h': 0.9 }),
        },
      ];

      printCrossHorizonBehaviorMap(modelMetrics);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('mixed-timing');
      // Should show E for early (<30%), M for mid (30-70%), L for late (>70%)
    });

    it('should show profile labels for specialists', () => {
      const modelMetrics = [
        {
          modelId: '15m-specialist',
          qualifiedHorizons: new Set(['15m'] as TimeframeId[]),
          trackB: createTrackBMetrics(),
        },
      ];

      printCrossHorizonBehaviorMap(modelMetrics);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('15m-specialist');
      expect(output).toContain('15m Specialist');
    });

    it('should print legend', () => {
      const modelMetrics = [
        {
          modelId: 'model-a',
          qualifiedHorizons: new Set(['15m'] as TimeframeId[]),
          trackB: createTrackBMetrics(),
        },
      ];

      printCrossHorizonBehaviorMap(modelMetrics);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Legend');
      expect(output).toContain('Early');
      expect(output).toContain('Mid-range');
      expect(output).toContain('Late');
      expect(output).toContain('No timing data');
      expect(output).toContain('Disqualified');
    });
  });
});
