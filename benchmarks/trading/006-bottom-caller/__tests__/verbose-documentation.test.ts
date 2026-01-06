import { describe, expect, it } from 'vitest';
import {
  generatePromptDocumentation,
  generateTaskSpecTable,
  generateScoringMethodology,
  generateGroundTruthMethodology,
} from '../src/verbose-documentation';

describe('Verbose Documentation', () => {
  describe('generatePromptDocumentation', () => {
    it('returns non-empty string', () => {
      const result = generatePromptDocumentation();

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains expected sections', () => {
      const result = generatePromptDocumentation();

      expect(result).toContain('# Bottom Caller Prompt Documentation');
      expect(result).toContain('## System Prompt');
      expect(result).toContain('## Multimodal Prompt Structure');
      expect(result).toContain('## Task Definition');
      expect(result).toContain('## Output Schema (Zod)');
    });

    it('documents all four horizons', () => {
      const result = generatePromptDocumentation();

      expect(result).toContain('15m');
      expect(result).toContain('1h');
      expect(result).toContain('4h');
      expect(result).toContain('24h');
    });
  });

  describe('generateTaskSpecTable', () => {
    it('returns markdown table', () => {
      const result = generateTaskSpecTable();

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result).toContain('# Task Spec');
      expect(result).toContain('|');
    });

    it('contains table headers', () => {
      const result = generateTaskSpecTable();

      expect(result).toContain('Horizon');
      expect(result).toContain('Bar Size');
      expect(result).toContain('Lookback Bars');
      expect(result).toContain('Lookback Time');
      expect(result).toContain('Forward Window');
    });

    it('contains all horizon rows', () => {
      const result = generateTaskSpecTable();

      expect(result).toContain('15m');
      expect(result).toContain('1h');
      expect(result).toContain('4h');
      expect(result).toContain('24h');
    });

    it('includes invariants section', () => {
      const result = generateTaskSpecTable();

      expect(result).toContain('## Invariants');
      expect(result).toContain('lookbackBars = 8 × horizonBars');
    });
  });

  describe('generateScoringMethodology', () => {
    it('returns non-empty string', () => {
      const result = generateScoringMethodology();

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('documents probability conversion', () => {
      const result = generateScoringMethodology();

      expect(result).toContain('Probability Conversion');
      expect(result).toContain('noNewLow');
      expect(result).toContain('confidence');
    });

    it('documents log loss', () => {
      const result = generateScoringMethodology();

      expect(result).toContain('Log Loss');
      expect(result).toContain('log-loss-scorer.ts');
    });

    it('documents brier score', () => {
      const result = generateScoringMethodology();

      expect(result).toContain('Brier Score');
      expect(result).toContain('brier-scorer.ts');
    });

    it('documents baselines', () => {
      const result = generateScoringMethodology();

      expect(result).toContain('Baselines');
      expect(result).toContain('random');
      expect(result).toContain('prevalence');
    });
  });

  describe('generateGroundTruthMethodology', () => {
    it('returns non-empty string', () => {
      const result = generateGroundTruthMethodology();

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('documents reference low computation', () => {
      const result = generateGroundTruthMethodology();

      expect(result).toContain('Reference Low');
      expect(result).toContain('computeReferenceLow');
    });

    it('documents forward window computation', () => {
      const result = generateGroundTruthMethodology();

      expect(result).toContain('Forward Window');
      expect(result).toContain('computeForwardWindow');
    });

    it('documents label assignment', () => {
      const result = generateGroundTruthMethodology();

      expect(result).toContain('Label Assignment');
      expect(result).toContain('labelNoNewLow');
    });

    it('includes window configuration table', () => {
      const result = generateGroundTruthMethodology();

      expect(result).toContain('Window Configuration');
      expect(result).toContain('Lookback Window');
      expect(result).toContain('Forward Window');
    });
  });
});
