import type { Horizon } from '../horizon-config.js';

export type Phase = 0 | 1 | 2 | 3;

export interface RoundScore {
  roundNumber: number;
  logLoss: number;
  logLossByHorizon?: Record<Horizon, number>;
  predictions?: Record<Horizon, number>;
  labels?: Record<Horizon, boolean>;
  timeToPivotRatio?: Record<Horizon, number | undefined>;
}

export interface ModelState {
  modelId: string;
  isActive: boolean;
  eliminatedInPhase?: Phase;
  eliminationReason?: string;
  roundScores: RoundScore[];
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
    return this.models.get(modelId)?.isActive === false;
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
}
