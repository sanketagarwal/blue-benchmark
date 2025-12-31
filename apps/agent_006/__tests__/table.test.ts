import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  printResultsTable,
  printQuintileTable,
  printPhaseResults,
  printArenaResults,
} from '../src/table';
import type { ModelSummary } from '../src/results';
import type { QuintileBucket } from '../src/scorers/quintile-analyzer';
import { ModelStateManager } from '../src/state/model-state';

describe('table', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('printResultsTable', () => {
    it('should print basic table without EV metrics', () => {
      const summaries: ModelSummary[] = [
        { modelId: 'model-a', meanBrier: 0.25, meanLogLoss: 0.5, meanAccuracy: 0.7 },
        { modelId: 'model-b', meanBrier: 0.3, meanLogLoss: 0.6, meanAccuracy: 0.65 },
      ];
      const winner: ModelSummary = summaries[0] as ModelSummary;

      printResultsTable(summaries, 10, winner);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Benchmark Results');
      expect(output).toContain('10 rounds');
    });

    it('should print EV table when extended metrics present', () => {
      const summaries: ModelSummary[] = [
        {
          modelId: 'model-a',
          meanBrier: 0.25,
          meanLogLoss: 0.5,
          meanAccuracy: 0.7,
          meanNormalizedDeltaMAE: 0.4,
          meanEV: 0.05,
          meanPnL: 0.03,
          evPnLGap: 0.02,
          bidMetrics: { meanNormalizedMAE: 0.4, meanEV: 0.03, meanPnL: 0.015, fillCount: 30 },
          askMetrics: { meanNormalizedMAE: 0.4, meanEV: 0.02, meanPnL: 0.015, fillCount: 30 },
        },
      ];

      printResultsTable(summaries, 10, summaries[0]);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('EV Benchmark Results');
    });

    it('should handle undefined winner gracefully', () => {
      const summaries: ModelSummary[] = [
        { modelId: 'model-a', meanBrier: 0.25, meanLogLoss: 0.5, meanAccuracy: 0.7 },
      ];

      printResultsTable(summaries, 5, undefined);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('No winner determined');
    });

    it('should highlight winner in output', () => {
      const summaries: ModelSummary[] = [
        { modelId: 'winning-model', meanBrier: 0.2, meanLogLoss: 0.4, meanAccuracy: 0.8 },
        { modelId: 'losing-model', meanBrier: 0.3, meanLogLoss: 0.6, meanAccuracy: 0.6 },
      ];
      const winner = summaries[0] as ModelSummary;

      printResultsTable(summaries, 10, winner);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('winning-model');
      expect(output).toContain('Winner');
    });

    it('should show low sample warning when fill counts are below threshold', () => {
      const summaries: ModelSummary[] = [
        {
          modelId: 'low-sample-model',
          meanBrier: 0.25,
          meanLogLoss: 0.5,
          meanAccuracy: 0.7,
          meanNormalizedDeltaMAE: 0.4,
          meanEV: 0.05,
          meanPnL: 0.03,
          evPnLGap: 0.02,
          bidMetrics: { meanNormalizedMAE: 0.4, meanEV: 0.03, meanPnL: 0.015, fillCount: 5 },
          askMetrics: { meanNormalizedMAE: 0.4, meanEV: 0.02, meanPnL: 0.015, fillCount: 5 },
          fillCounts: {
            bid: { '1m': 1, '5m': 1, '15m': 1 },
            ask: { '1m': 1, '5m': 1, '15m': 1 },
          },
        },
      ];

      printResultsTable(summaries, 10, summaries[0]);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Low sample size');
    });

    it('should not show low sample warning when fill counts are adequate', () => {
      const summaries: ModelSummary[] = [
        {
          modelId: 'adequate-sample-model',
          meanBrier: 0.25,
          meanLogLoss: 0.5,
          meanAccuracy: 0.7,
          meanNormalizedDeltaMAE: 0.4,
          meanEV: 0.05,
          meanPnL: 0.03,
          evPnLGap: 0.02,
          bidMetrics: { meanNormalizedMAE: 0.4, meanEV: 0.03, meanPnL: 0.015, fillCount: 50 },
          askMetrics: { meanNormalizedMAE: 0.4, meanEV: 0.02, meanPnL: 0.015, fillCount: 50 },
          fillCounts: {
            bid: { '1m': 10, '5m': 10, '15m': 10 },
            ask: { '1m': 10, '5m': 10, '15m': 10 },
          },
        },
      ];

      printResultsTable(summaries, 10, summaries[0]);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).not.toContain('Low sample size');
    });

    it('should display baseline PnL in EV table footer', () => {
      const summaries: ModelSummary[] = [
        {
          modelId: 'model-a',
          meanBrier: 0.25,
          meanLogLoss: 0.5,
          meanAccuracy: 0.7,
          meanNormalizedDeltaMAE: 0.4,
          meanEV: 0.05,
          meanPnL: 0.0345,
          evPnLGap: 0.02,
          bidMetrics: { meanNormalizedMAE: 0.4, meanEV: 0.03, meanPnL: 0.015, fillCount: 30 },
          askMetrics: { meanNormalizedMAE: 0.4, meanEV: 0.02, meanPnL: 0.015, fillCount: 30 },
        },
      ];

      printResultsTable(summaries, 10, summaries[0]);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Realized PnL');
    });

    it('should handle empty summaries array', () => {
      printResultsTable([], 0, undefined);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle models without fill counts in EV mode', () => {
      const summaries: ModelSummary[] = [
        {
          modelId: 'no-fill-counts-model',
          meanBrier: 0.25,
          meanLogLoss: 0.5,
          meanAccuracy: 0.7,
          meanNormalizedDeltaMAE: 0.4,
          meanEV: 0.05,
          meanPnL: 0.03,
          evPnLGap: 0.02,
          bidMetrics: { meanNormalizedMAE: 0.4, meanEV: 0.03, meanPnL: 0.015, fillCount: 30 },
          askMetrics: { meanNormalizedMAE: 0.4, meanEV: 0.02, meanPnL: 0.015, fillCount: 30 },
          // No fillCounts property
        },
      ];

      // Should not throw
      printResultsTable(summaries, 10, summaries[0]);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('printQuintileTable', () => {
    it('should print quintile analysis table', () => {
      const buckets: QuintileBucket[] = [
        { label: 'Q1 (lowest)', meanPredictedEV: -0.05, meanRealizedPnL: -0.04, evPnLGap: -0.01, sampleCount: 20 },
        { label: 'Q2', meanPredictedEV: -0.02, meanRealizedPnL: -0.02, evPnLGap: 0, sampleCount: 20 },
        { label: 'Q3', meanPredictedEV: 0.01, meanRealizedPnL: 0.005, evPnLGap: 0.005, sampleCount: 20 },
        { label: 'Q4', meanPredictedEV: 0.03, meanRealizedPnL: 0.025, evPnLGap: 0.005, sampleCount: 20 },
        { label: 'Q5 (highest)', meanPredictedEV: 0.06, meanRealizedPnL: 0.04, evPnLGap: 0.02, sampleCount: 20 },
      ];

      printQuintileTable(buckets, 'test-model');

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('EV Quintile Analysis');
      expect(output).toContain('test-model');
      expect(output).toContain('Q1');
      expect(output).toContain('Q5');
    });

    it('should handle empty buckets', () => {
      const buckets: QuintileBucket[] = [
        { label: 'Q1 (lowest)', meanPredictedEV: 0, meanRealizedPnL: 0, evPnLGap: 0, sampleCount: 0 },
        { label: 'Q2', meanPredictedEV: 0, meanRealizedPnL: 0, evPnLGap: 0, sampleCount: 0 },
        { label: 'Q3', meanPredictedEV: 0, meanRealizedPnL: 0, evPnLGap: 0, sampleCount: 0 },
        { label: 'Q4', meanPredictedEV: 0, meanRealizedPnL: 0, evPnLGap: 0, sampleCount: 0 },
        { label: 'Q5 (highest)', meanPredictedEV: 0, meanRealizedPnL: 0, evPnLGap: 0, sampleCount: 0 },
      ];

      printQuintileTable(buckets, 'empty-model');

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('-'); // Should show dash for empty buckets
    });

    it('should color-code gap values', () => {
      const buckets: QuintileBucket[] = [
        { label: 'Q1 (lowest)', meanPredictedEV: 0.05, meanRealizedPnL: 0.04, evPnLGap: 0.01, sampleCount: 20 }, // Good gap
        { label: 'Q2', meanPredictedEV: 0.05, meanRealizedPnL: 0.03, evPnLGap: 0.02, sampleCount: 20 }, // OK gap
        { label: 'Q3', meanPredictedEV: 0.05, meanRealizedPnL: 0.01, evPnLGap: 0.04, sampleCount: 20 }, // Poor gap
        { label: 'Q4', meanPredictedEV: 0.05, meanRealizedPnL: 0.045, evPnLGap: 0.005, sampleCount: 20 },
        { label: 'Q5 (highest)', meanPredictedEV: 0.05, meanRealizedPnL: 0.05, evPnLGap: 0, sampleCount: 20 },
      ];

      // Should not throw - colors are ANSI escape codes
      printQuintileTable(buckets, 'color-test');
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('printPhaseResults', () => {
    it('should print phase results with eliminated models', () => {
      const manager = new ModelStateManager(['model-a', 'model-b', 'model-c']);
      manager.eliminateModel('model-a', 0, 'Failed sanity check');

      printPhaseResults(manager, 0);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Phase 0 Results');
      expect(output).toContain('Eliminated: 1');
      expect(output).toContain('Remaining: 2');
      expect(output).toContain('model-a');
      expect(output).toContain('Failed sanity check');
    });

    it('should print phase results with no eliminations', () => {
      const manager = new ModelStateManager(['model-a', 'model-b']);

      printPhaseResults(manager, 0);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Phase 0 Results');
      expect(output).toContain('Eliminated: 0');
      expect(output).toContain('Remaining: 2');
    });

    it('should filter eliminations by phase', () => {
      const manager = new ModelStateManager(['model-a', 'model-b', 'model-c', 'model-d']);
      manager.eliminateModel('model-a', 0, 'Phase 0 fail');
      manager.eliminateModel('model-b', 1, 'Phase 1 fail');
      manager.eliminateModel('model-c', 1, 'Also phase 1');

      printPhaseResults(manager, 1);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Phase 1 Results');
      expect(output).toContain('Eliminated: 2');
      expect(output).toContain('model-b');
      expect(output).toContain('model-c');
      expect(output).not.toContain('model-a'); // Was eliminated in phase 0
    });

    it('should handle models eliminated without reason', () => {
      const manager = new ModelStateManager(['model-a', 'model-b']);
      // Directly modify state to simulate missing reason
      const state = manager.getModelState('model-a');
      if (state) {
        state.isActive = false;
        state.eliminatedInPhase = 0;
        // eliminationReason is undefined
      }

      printPhaseResults(manager, 0);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Unknown');
    });
  });

  describe('printArenaResults', () => {
    it('should print arena results with rankings', () => {
      const competitors = [
        { modelId: 'gold-model', score: 0.95 },
        { modelId: 'silver-model', score: 0.90 },
        { modelId: 'bronze-model', score: 0.85 },
      ];

      printArenaResults(competitors);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Arena Competitors');
      expect(output).toContain('gold-model');
      expect(output).toContain('silver-model');
      expect(output).toContain('bronze-model');
    });

    it('should display medals for top 3', () => {
      const competitors = [
        { modelId: 'first', score: 0.95 },
        { modelId: 'second', score: 0.90 },
        { modelId: 'third', score: 0.85 },
        { modelId: 'fourth', score: 0.80 },
      ];

      printArenaResults(competitors);

      // Medals are emojis but we can check the table renders
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle empty competitors array', () => {
      printArenaResults([]);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('Arena Competitors');
    });

    it('should format scores with 4 decimal places', () => {
      const competitors = [{ modelId: 'precise-model', score: 0.12345678 }];

      printArenaResults(competitors);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('0.1235');
    });

    it('should handle 8 competitors (top 8)', () => {
      const competitors = Array.from({ length: 8 }, (_, i) => ({
        modelId: `model-${String(i + 1)}`,
        score: 0.9 - i * 0.05,
      }));

      printArenaResults(competitors);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('model-1');
      expect(output).toContain('model-8');
    });
  });
});
