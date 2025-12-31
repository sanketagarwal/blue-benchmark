import type { TimeframeId } from '../timeframe-config.js';

export type Phase = 0 | 1 | 2 | 3;

export interface RoundScore {
  roundNumber: number;
  logLoss: number;
  logLossByHorizon?: Record<TimeframeId, number>;
  predictions?: Record<TimeframeId, number>;
  labels?: Record<TimeframeId, boolean>;
  timeToPivotRatio?: Record<TimeframeId, number | undefined>;
}

export interface ModelState {
  modelId: string;
  isActive: boolean;
  eliminatedInPhase?: Phase;
  eliminationReason?: string;
  roundScores: RoundScore[];
  // NEW: per-horizon qualification
  qualifiedHorizons: Set<TimeframeId>;
  disqualifiedHorizons: Map<TimeframeId, { phase: Phase; reason: string }>;
}

/**
 * In-memory state manager for tracking model status across phases
 */
export class ModelStateManager {
  private readonly models: Map<string, ModelState>;
  private currentPhase: Phase;

  constructor(modelIds: string[]) {
    this.models = new Map();
    this.currentPhase = 0;

    for (const modelId of modelIds) {
      this.models.set(modelId, {
        modelId,
        isActive: true,
        roundScores: [],
        qualifiedHorizons: new Set(['15m', '1h', '24h', '7d'] as TimeframeId[]),
        disqualifiedHorizons: new Map(),
      });
    }
  }

  /**
   * Get current phase
   * @returns The current phase number (0-3)
   */
  getCurrentPhase(): Phase {
    return this.currentPhase;
  }

  /**
   * Advance to next phase
   */
  advancePhase(): void {
    if (this.currentPhase < 3) {
      this.currentPhase = (this.currentPhase + 1) as Phase;
    }
  }

  /**
   * Get list of active (non-eliminated) model IDs
   * @returns Array of model IDs that are still active
   */
  getActiveModels(): string[] {
    return [...this.models.values()]
      .filter(m => m.isActive)
      .map(m => m.modelId);
  }

  /**
   * Get list of eliminated model states
   * @returns Array of ModelState objects for eliminated models
   */
  getEliminatedModels(): ModelState[] {
    return [...this.models.values()].filter(m => !m.isActive);
  }

  /**
   * Check if model has been eliminated
   * @param modelId - The ID of the model to check
   * @returns True if the model has been eliminated, false otherwise
   */
  isEliminated(modelId: string): boolean {
    const state = this.models.get(modelId);
    if (state === undefined) {
      return false;
    }
    // Model is eliminated if explicitly inactive OR has no qualified horizons left
    return !state.isActive || state.qualifiedHorizons.size === 0;
  }

  /**
   * Get state for a specific model
   * @param modelId - The ID of the model to retrieve
   * @returns The model state, or undefined if not found
   */
  getModelState(modelId: string): ModelState | undefined {
    return this.models.get(modelId);
  }

  /**
   * Eliminate a model with reason
   * @param modelId - The ID of the model to eliminate
   * @param phase - The phase in which the model was eliminated
   * @param reason - The reason for elimination
   */
  eliminateModel(modelId: string, phase: Phase, reason: string): void {
    const state = this.models.get(modelId);
    if (state !== undefined) {
      state.isActive = false;
      state.eliminatedInPhase = phase;
      state.eliminationReason = reason;
    }
  }

  /**
   * Add a round score for a model
   * @param modelId - The ID of the model to add the score for
   * @param score - The round score to add
   */
  addRoundScore(modelId: string, score: RoundScore): void {
    const state = this.models.get(modelId);
    if (state !== undefined) {
      state.roundScores.push(score);
    }
  }

  /**
   * Get all model states
   * @returns Array of all ModelState objects
   */
  getAllModelStates(): ModelState[] {
    return [...this.models.values()];
  }

  /**
   * Get models that are qualified for a specific horizon
   * @param horizon - The horizon to check qualification for
   * @returns Array of model IDs qualified for the horizon
   */
  getModelsForHorizon(horizon: TimeframeId): string[] {
    return [...this.models.values()]
      .filter(m => m.qualifiedHorizons.has(horizon))
      .map(m => m.modelId);
  }

  /**
   * Check if a model is qualified for a specific horizon
   * @param modelId - The ID of the model to check
   * @param horizon - The horizon to check qualification for
   * @returns True if the model is qualified for the horizon
   */
  isQualifiedForHorizon(modelId: string, horizon: TimeframeId): boolean {
    const state = this.models.get(modelId);
    if (state === undefined) {
      return false;
    }
    return state.qualifiedHorizons.has(horizon);
  }

  /**
   * Disqualify a model from a specific horizon
   * @param modelId - The ID of the model to disqualify
   * @param horizon - The horizon to disqualify from
   * @param phase - The phase in which disqualification occurred
   * @param reason - The reason for disqualification
   */
  disqualifyFromHorizon(
    modelId: string,
    horizon: TimeframeId,
    phase: Phase,
    reason: string,
  ): void {
    const state = this.models.get(modelId);
    if (state !== undefined) {
      state.qualifiedHorizons.delete(horizon);
      state.disqualifiedHorizons.set(horizon, { phase, reason });
    }
  }

  /**
   * Qualify a model for a specific horizon (re-qualification)
   * @param modelId - The ID of the model to qualify
   * @param horizon - The horizon to qualify for
   */
  qualifyForHorizon(modelId: string, horizon: TimeframeId): void {
    const state = this.models.get(modelId);
    if (state !== undefined) {
      state.qualifiedHorizons.add(horizon);
      state.disqualifiedHorizons.delete(horizon);
    }
  }

  /**
   * Get the set of horizons a model is qualified for
   * @param modelId - The ID of the model to check
   * @returns Set of qualified horizons, or undefined if model not found
   */
  getQualifiedHorizonsForModel(modelId: string): Set<TimeframeId> | undefined {
    return this.models.get(modelId)?.qualifiedHorizons;
  }
}
