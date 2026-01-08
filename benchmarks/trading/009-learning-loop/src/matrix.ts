/**
 * Model matrix loader for 007-chart-reader benchmark.
 */
import modelsData from './models.json' with { type: 'json' };

export interface ModelConfig {
  id: string;
  provider: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  tier: 'budget' | 'mid' | 'frontier';
  vision: boolean;
  notes: string;
}

interface ModelsJson {
  models: ModelConfig[];
  tiers: Record<string, unknown>;
  providers: string[];
}

/**
 * 3 CHEAP models - fast and budget-friendly
 * Best value for quick iterations
 */
const CHEAP_MODELS = [
  'google/gemini-2.5-flash-lite',     // $0.075/M input - CHEAPEST
  'google/gemini-2.0-flash',          // $0.10/M input
  'openai/gpt-4o-mini',               // $0.15/M input
];

/**
 * 3 EXPENSIVE models - frontier tier
 * Highest capability, slower and costlier
 */
const EXPENSIVE_MODELS = [
  'anthropic/claude-opus-4-5',        // $25/M output - Most capable
  'openai/gpt-5',                     // $15/M output - GPT-5 flagship
  'google/gemini-3-pro-preview',      // $8/M output - Gemini 3 Preview
];

/**
 * Load cheap models (budget-friendly)
 */
export function loadCheapModels(): ModelConfig[] {
  const data = modelsData as ModelsJson;
  return data.models.filter((m) => CHEAP_MODELS.includes(m.id));
}

/**
 * Load expensive models (frontier tier)
 */
export function loadExpensiveModels(): ModelConfig[] {
  const data = modelsData as ModelsJson;
  return data.models.filter((m) => EXPENSIVE_MODELS.includes(m.id));
}

/**
 * Load models based on --cheap or --expensive flag
 * Default to cheap models if no flag specified
 */
export function loadModelMatrix(): ModelConfig[] {
  const args = process.argv.slice(2);
  
  const useExpensive = args.includes('--expensive');
  
  if (useExpensive) {
    return loadExpensiveModels();
  }
  return loadCheapModels();
}

/**
 * Load ALL vision models (for full benchmark runs)
 */
export function loadFullModelMatrix(): ModelConfig[] {
  const data = modelsData as ModelsJson;
  return data.models.filter((m) => m.vision);
}

/**
 * Get a specific model by ID
 */
export function getModel(modelId: string): ModelConfig | undefined {
  const models = loadModelMatrix();
  return models.find((m) => m.id === modelId);
}

/**
 * Get models by tier
 */
export function getModelsByTier(tier: 'budget' | 'mid' | 'frontier'): ModelConfig[] {
  const models = loadModelMatrix();
  return models.filter((m) => m.tier === tier);
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: string): ModelConfig[] {
  const models = loadModelMatrix();
  return models.filter((m) => m.provider === provider);
}
