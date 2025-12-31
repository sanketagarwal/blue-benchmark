import { describe, expect, it } from 'vitest';
import { loadModelMatrix, getModelIds, BENCHMARK_ROUNDS } from '../src/matrix.js';

describe('matrix', () => {
  describe('loadModelMatrix', () => {
    it('loads all vision models from models.json', () => {
      const models = loadModelMatrix();
      expect(models.length).toBeGreaterThan(20);
      expect(models.every(m => m.vision === true)).toBe(true);
    });

    it('includes required fields for each model', () => {
      const models = loadModelMatrix();
      for (const model of models) {
        expect(model.id).toBeDefined();
        expect(model.provider).toBeDefined();
        expect(model.tier).toBeDefined();
      }
    });
  });

  describe('getModelIds', () => {
    it('returns array of model ID strings', () => {
      const ids = getModelIds();
      expect(ids.length).toBeGreaterThan(20);
      expect(ids.every(id => typeof id === 'string')).toBe(true);
      expect(ids[0]).toMatch(/\//); // Format: provider/model
    });
  });

  describe('BENCHMARK_ROUNDS', () => {
    it('exports round count', () => {
      expect(BENCHMARK_ROUNDS).toBeGreaterThan(0);
    });
  });
});
