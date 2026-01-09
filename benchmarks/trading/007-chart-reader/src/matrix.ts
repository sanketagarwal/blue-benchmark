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
 * 6 DASHBOARD models - for the website, ordered by cost
 * Range from cheapest to most expensive
 */
const DASHBOARD_MODELS = [
  'google/gemini-2.5-flash-lite',     // $0.375/M total - CHEAPEST
  'google/gemini-2.0-flash',          // $0.50/M total
  'openai/gpt-4o-mini',               // $0.75/M total
  'google/gemini-2.5-flash',          // $0.75/M total
  'openai/gpt-4o',                    // $12.50/M total
  'anthropic/claude-opus-4-5',        // $30.00/M total - MOST EXPENSIVE
];

/**
 * Load models based on --cheap, --expensive, or --dashboard flag
 * Default to cheap models if no flag specified
 */
export function loadModelMatrix(): ModelConfig[] {
  const data = modelsData as ModelsJson;
  const args = process.argv.slice(2);
  
  const useExpensive = args.includes('--expensive');
  const useDashboard = args.includes('--dashboard');
  
  // Select models based on flag (--cheap or no flag defaults to CHEAP_MODELS)
  const selectedModels = useDashboard ? DASHBOARD_MODELS
                       : useExpensive ? EXPENSIVE_MODELS 
                       : CHEAP_MODELS;
  
  return data.models.filter((m) => selectedModels.includes(m.id));
}

/**
 * Load the 6 dashboard models (for website cron job)
 */
export function loadDashboardModels(): ModelConfig[] {
  const data = modelsData as ModelsJson;
  return data.models
    .filter((m) => DASHBOARD_MODELS.includes(m.id))
    .sort((a, b) => {
      // Sort by total cost (input + output)
      const aCost = a.inputCostPerMillion + a.outputCostPerMillion;
      const bCost = b.inputCostPerMillion + b.outputCostPerMillion;
      return aCost - bCost;
    });
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
