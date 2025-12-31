import { describe, expect, it } from 'vitest';
import {
  runPhase0,
  runPhase1,
  runPhase2,
  runPhase3,
} from '../src/phases/phase-runner.js';
import { ModelStateManager } from '../src/state/model-state.js';

describe('phase-runner', () => {
  describe('runPhase0', () => {
    it('eliminates models that fail sanity checks', () => {
      const manager = new ModelStateManager(['model-a', 'model-b']);

      // Add failing scores for model-a (degenerate pattern - always high predictions)
      for (let i = 1; i <= 6; i++) {
        manager.addRoundScore('model-a', {
          roundNumber: i,
          logLoss: 0.9,
          logLossByHorizon: { '15m': 0.9, '1h': 0.9, '24h': 0.9, '7d': 0.9 },
          predictions: { '15m': 0.95, '1h': 0.95, '24h': 0.95, '7d': 0.95 },
          labels: { '15m': false, '1h': false, '24h': false, '7d': false },
        });
      }

      // Add passing scores for model-b
      for (let i = 1; i <= 6; i++) {
        manager.addRoundScore('model-b', {
          roundNumber: i,
          logLoss: 0.4,
          logLossByHorizon: { '15m': 0.4, '1h': 0.4, '24h': 0.4, '7d': 0.4 },
          predictions: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
          labels: { '15m': true, '1h': false, '24h': true, '7d': false },
        });
      }

      runPhase0(manager);

      expect(manager.isEliminated('model-a')).toBe(true);
      expect(manager.isEliminated('model-b')).toBe(false);
    });

    it('skips models with fewer than 6 rounds', () => {
      const manager = new ModelStateManager(['model-a']);

      // Add only 5 rounds
      for (let i = 1; i <= 5; i++) {
        manager.addRoundScore('model-a', {
          roundNumber: i,
          logLoss: 0.9,
          logLossByHorizon: { '15m': 0.9, '1h': 0.9, '24h': 0.9, '7d': 0.9 },
          predictions: { '15m': 0.95, '1h': 0.95, '24h': 0.95, '7d': 0.95 },
          labels: { '15m': false, '1h': false, '24h': false, '7d': false },
        });
      }

      runPhase0(manager);

      // Should not be eliminated due to insufficient rounds
      expect(manager.isEliminated('model-a')).toBe(false);
    });
  });

  describe('runPhase1', () => {
    it('eliminates models in bottom quartile on 2+ horizons', () => {
      const manager = new ModelStateManager([
        'good-model',
        'bad-model',
        'avg-model-1',
        'avg-model-2',
      ]);

      // Good model - low log loss
      for (let i = 1; i <= 6; i++) {
        manager.addRoundScore('good-model', {
          roundNumber: i,
          logLoss: 0.2,
          logLossByHorizon: { '15m': 0.2, '1h': 0.2, '24h': 0.2, '7d': 0.2 },
        });
      }

      // Bad model - high log loss on all horizons
      for (let i = 1; i <= 6; i++) {
        manager.addRoundScore('bad-model', {
          roundNumber: i,
          logLoss: 0.9,
          logLossByHorizon: { '15m': 0.9, '1h': 0.9, '24h': 0.9, '7d': 0.9 },
        });
      }

      // Average models
      for (let i = 1; i <= 6; i++) {
        manager.addRoundScore('avg-model-1', {
          roundNumber: i,
          logLoss: 0.5,
          logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        });
        manager.addRoundScore('avg-model-2', {
          roundNumber: i,
          logLoss: 0.6,
          logLossByHorizon: { '15m': 0.6, '1h': 0.6, '24h': 0.6, '7d': 0.6 },
        });
      }

      runPhase1(manager);

      expect(manager.isEliminated('good-model')).toBe(false);
      expect(manager.isEliminated('bad-model')).toBe(true);
    });
  });

  describe('runPhase2', () => {
    it('eliminates models with high regret on 2+ horizons', () => {
      const manager = new ModelStateManager(['stable-model', 'unstable-model']);

      // Stable model - consistent performance
      for (let i = 1; i <= 12; i++) {
        manager.addRoundScore('stable-model', {
          roundNumber: i,
          logLoss: 0.4,
          logLossByHorizon: { '15m': 0.4, '1h': 0.4, '24h': 0.4, '7d': 0.4 },
        });
      }

      // Unstable model - very high worst window performance
      for (let i = 1; i <= 6; i++) {
        manager.addRoundScore('unstable-model', {
          roundNumber: i,
          logLoss: 0.3,
          logLossByHorizon: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        });
      }
      // Then crashes badly
      for (let i = 7; i <= 12; i++) {
        manager.addRoundScore('unstable-model', {
          roundNumber: i,
          logLoss: 1.5,
          logLossByHorizon: { '15m': 1.5, '1h': 1.5, '24h': 1.5, '7d': 1.5 },
        });
      }

      runPhase2(manager);

      expect(manager.isEliminated('stable-model')).toBe(false);
      expect(manager.isEliminated('unstable-model')).toBe(true);
    });
  });

  describe('runPhase3', () => {
    it('ranks models by composite score', () => {
      const manager = new ModelStateManager(['model-a', 'model-b', 'model-c']);

      // Best model
      for (let i = 1; i <= 12; i++) {
        manager.addRoundScore('model-a', {
          roundNumber: i,
          logLoss: 0.2,
          logLossByHorizon: { '15m': 0.2, '1h': 0.2, '24h': 0.2, '7d': 0.2 },
        });
      }

      // Medium model
      for (let i = 1; i <= 12; i++) {
        manager.addRoundScore('model-b', {
          roundNumber: i,
          logLoss: 0.5,
          logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        });
      }

      // Worst model
      for (let i = 1; i <= 12; i++) {
        manager.addRoundScore('model-c', {
          roundNumber: i,
          logLoss: 0.8,
          logLossByHorizon: { '15m': 0.8, '1h': 0.8, '24h': 0.8, '7d': 0.8 },
        });
      }

      const rankings = runPhase3(manager);

      expect(rankings).toHaveLength(3);
      expect(rankings[0]?.modelId).toBe('model-a');
      expect(rankings[2]?.modelId).toBe('model-c');
    });

    it('returns top 8 models maximum', () => {
      const modelIds = Array.from({ length: 10 }, (_, i) => `model-${i}`);
      const manager = new ModelStateManager(modelIds);

      for (const modelId of modelIds) {
        for (let i = 1; i <= 12; i++) {
          manager.addRoundScore(modelId, {
            roundNumber: i,
            logLoss: 0.5,
            logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
          });
        }
      }

      const rankings = runPhase3(manager);

      expect(rankings).toHaveLength(8);
    });
  });
});
