import { createOpenAI } from '@ai-sdk/openai';

/**
 * LLM client configuration for AI Gateway
 */
export interface LLMClientConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * Create an LLM client with explicit configuration (for AI Gateway)
 * @param config - Base URL and API key for AI Gateway
 */
export function createLLMClient(config: LLMClientConfig) {
  if (!config.baseUrl) {throw new Error('AI Gateway base URL is required');}
  if (!config.apiKey) {throw new Error('AI Gateway API key is required');}

  return createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

/**
 * Get LLM client from environment variables
 */
export function getLLMClient() {
  const baseUrl = process.env['AI_GATEWAY_BASE_URL'];
  const apiKey = process.env['AI_GATEWAY_API_KEY'];

  if (!baseUrl) {throw new Error('AI_GATEWAY_BASE_URL environment variable is required');}
  if (!apiKey) {throw new Error('AI_GATEWAY_API_KEY environment variable is required');}

  return createLLMClient({ baseUrl, apiKey });
}

/**
 * Get model ID from environment variable
 */
export function getModelId(): string {
  const modelId = process.env['MODEL_ID'];
  if (!modelId) {throw new Error('MODEL_ID environment variable is required');}
  return modelId;
}

/**
 * Default context window size for unknown models
 */
export const DEFAULT_CONTEXT_WINDOW = 100_000;

/**
 * Known model context window sizes
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'openai/gpt-4o': 128_000,
  'openai/gpt-4o-mini': 128_000,
  'openai/gpt-5-nano': 128_000,
  'deepseek/deepseek-v3.2': 128_000,
  'anthropic/claude-sonnet-4': 200_000,
  'anthropic/claude-haiku-4.5': 200_000,
  'xai/grok-4.1-fast-reasoning': 2_000_000,
  'xai/grok-4-fast-reasoning': 2_000_000,
};

/**
 * Get context window size for a model, with fallback to default
 * @param modelId - The model identifier (e.g., 'openai/gpt-4o')
 * @returns The context window size in tokens
 */
export function getContextWindow(modelId: string): number {
  const contextWindow = MODEL_CONTEXT_WINDOWS[modelId];
  if (contextWindow === undefined) {
    // eslint-disable-next-line no-console -- Intentional warning for unknown models to help developers add them to the list
    console.warn(
      `⚠️  WARNING: Unknown model "${modelId}" - using default context window of ${String(DEFAULT_CONTEXT_WINDOW)} tokens. ` +
      `Add this model to MODEL_CONTEXT_WINDOWS in packages/agent-core/src/llm.ts for accurate compaction.`
    );
    return DEFAULT_CONTEXT_WINDOW;
  }
  return contextWindow;
}
