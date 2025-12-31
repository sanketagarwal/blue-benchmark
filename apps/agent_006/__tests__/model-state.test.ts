import { beforeEach, describe, expect, it } from 'vitest';

import {
  ModelStateManager,
  type ModelState,
  type Phase,
} from '../src/state/model-state.js';

describe('model-state', () => {
  let manager: ModelStateManager;

  beforeEach(() => {
    manager = new ModelStateManager(['model-a', 'model-b', 'model-c']);
  });

  describe('initialization', () => {
    it('starts all models as active in phase 0', () => {
      expect(manager.getActiveModels()).toHaveLength(3);
      expect(manager.getCurrentPhase()).toBe(0);
    });
  });

  describe('eliminateModel', () => {
    it('removes model from active set', () => {
      manager.eliminateModel('model-a', 0, 'Failed sanity check');

      expect(manager.getActiveModels()).toHaveLength(2);
      expect(manager.isEliminated('model-a')).toBe(true);
    });

    it('records elimination reason', () => {
      manager.eliminateModel('model-b', 1, 'No strength');

      const state = manager.getModelState('model-b');
      expect(state?.eliminatedInPhase).toBe(1);
      expect(state?.eliminationReason).toBe('No strength');
    });
  });

  describe('addRoundScore', () => {
    it('accumulates round scores for model', () => {
      manager.addRoundScore('model-a', { roundNumber: 1, logLoss: 0.5 });
      manager.addRoundScore('model-a', { roundNumber: 2, logLoss: 0.4 });

      const state = manager.getModelState('model-a');
      expect(state?.roundScores).toHaveLength(2);
    });
  });

  describe('advancePhase', () => {
    it('increments current phase', () => {
      manager.advancePhase();
      expect(manager.getCurrentPhase()).toBe(1);

      manager.advancePhase();
      expect(manager.getCurrentPhase()).toBe(2);
    });
  });

  describe('getEliminatedModels', () => {
    it('returns all eliminated models', () => {
      manager.eliminateModel('model-a', 0, 'Reason A');
      manager.eliminateModel('model-b', 1, 'Reason B');

      const eliminated = manager.getEliminatedModels();
      expect(eliminated).toHaveLength(2);
    });
  });
});

// Type assertions to ensure exports are correctly typed
const _typeCheckPhase: Phase = 0;
const _typeCheckModelState: ModelState = {
  modelId: 'test',
  isActive: true,
  roundScores: [],
};
void _typeCheckPhase;
void _typeCheckModelState;
