export const MODEL_MATRIX = [
  'xai/grok-4-fast-reasoning',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5-nano',
] as const;

export type ModelId = (typeof MODEL_MATRIX)[number];

export const BENCHMARK_ROUNDS = 3;
