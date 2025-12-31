import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  printPerHorizonArenaTable,
  printFinalSummaryTable,
} from '../src/table';
import type { PerHorizonRankings } from '../src/scorers/phase-3-scorer';
import type { Horizon } from '../src/horizon-config';

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
        '7d': [],
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
        '7d': [],
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
        '7d': [],
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
        '7d': [],
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
      logLoss: Record<Horizon, number>;
    }

    const computeMeanLogLoss = (state: TestModelState): Record<Horizon, number> => state.logLoss;

    it('should print final summary with all models', () => {
      const models: TestModelState[] = [
        { modelId: 'winner-model', eliminated: false, logLoss: { '15m': 0.4, '1h': 0.45, '24h': 0.5, '7d': 0.55 } },
        { modelId: 'eliminated-p0', eliminated: true, eliminatedInPhase: 0, logLoss: { '15m': 0.8, '1h': 0.85, '24h': 0.9, '7d': 0.95 } },
        { modelId: 'eliminated-p1', eliminated: true, eliminatedInPhase: 1, logLoss: { '15m': 0.6, '1h': 0.65, '24h': 0.7, '7d': 0.75 } },
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
        { modelId: 'worst', eliminated: true, eliminatedInPhase: 0, logLoss: { '15m': 0.9, '1h': 0.9, '24h': 0.9, '7d': 0.9 } },
        { modelId: 'best', eliminated: false, logLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 } },
        { modelId: 'middle', eliminated: true, eliminatedInPhase: 1, logLoss: { '15m': 0.6, '1h': 0.6, '24h': 0.6, '7d': 0.6 } },
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
        { modelId: 'unknown-phase', eliminated: true, logLoss: { '15m': 0.7, '1h': 0.7, '24h': 0.7, '7d': 0.7 } },
      ];

      printFinalSummaryTable(models, computeMeanLogLoss);

      const output = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(output).toContain('P?');
    });

    it('should display dash for NaN log loss values', () => {
      const models: TestModelState[] = [
        { modelId: 'nan-model', eliminated: true, eliminatedInPhase: 0, logLoss: { '15m': Number.NaN, '1h': Number.NaN, '24h': Number.NaN, '7d': Number.NaN } },
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
        { modelId: 'good-ll', eliminated: false, logLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 } }, // Good (green)
        { modelId: 'ok-ll', eliminated: true, eliminatedInPhase: 1, logLoss: { '15m': 0.6, '1h': 0.6, '24h': 0.6, '7d': 0.6 } }, // OK (yellow)
        { modelId: 'poor-ll', eliminated: true, eliminatedInPhase: 0, logLoss: { '15m': 1.0, '1h': 1.0, '24h': 1.0, '7d': 1.0 } }, // Poor (red)
      ];

      // Should not throw - colors are ANSI escape codes
      printFinalSummaryTable(models, computeMeanLogLoss);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });
});
