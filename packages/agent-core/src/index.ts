/**
 * NullAgent Core Framework
 *
 * Provides durable agent orchestration with message history, compaction, and structured output.
 */

// Core agent functions
export { defineAgent, runRound } from './run-round.js';

// Types
export type {
  Agent,
  AgentDefinition,
  CompactionTrigger,
  CompactionContext,
  RoundContext,
  RoundHistory,
  RoundResult,
  TextPart,
  ImagePart,
  MessageContent,
  MultimodalPrompt,
} from './types.js';

// History functions (useful for custom implementations)
export type { Message } from './history.js';
export {
  loadMessageHistory,
  saveRoundPrompt,
  saveRoundOutput,
  getCurrentRoundNumber,
  loadRecentRounds,
} from './history.js';

// Compaction functions (useful for custom triggers)
export { estimateTokenCount, shouldCompact, runCompaction } from './compaction.js';

// LLM utilities
export type { LLMClientConfig } from './llm.js';
export { createLLMClient, getLLMClient, getModelId, MODEL_CONTEXT_WINDOWS } from './llm.js';
