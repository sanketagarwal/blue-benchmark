import modelsJson from './models.json' with { type: 'json' };

export interface ModelConfig {
  id: string;
  provider: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  tier: 'budget' | 'mid' | 'frontier';
  vision: boolean;
  notes: string;
}

interface ModelsFile {
  models: ModelConfig[];
  tiers: Record<string, unknown>;
  providers: string[];
}

/**
 * Load all vision models from models.json
 *
 * @returns Array of ModelConfig objects for all vision-capable models
 */
export function loadModelMatrix(): ModelConfig[] {
  const data = modelsJson as ModelsFile;
  return data.models.filter(m => m.vision);
}

/**
 * Get just the model IDs for iteration
 *
 * @returns Array of model ID strings in provider/model format
 */
export function getModelIds(): string[] {
  return loadModelMatrix().map(m => m.id);
}

/**
 * Model matrix as an array - for backward compatibility with existing code
 */
export const MODEL_MATRIX = getModelIds();

export type ModelId = string;

export const BENCHMARK_ROUNDS = 4; // Phase 0: 4 rounds for sanity filter
