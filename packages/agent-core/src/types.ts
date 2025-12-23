import type { ZodType } from 'zod';

/**
 * Compaction trigger strategies
 */
export type CompactionTrigger =
  | { type: 'message-count'; count: number }
  | { type: 'context-window'; modelId: string; threshold: number }
  | { type: 'custom'; shouldCompact: (context: CompactionContext) => boolean | Promise<boolean> };

/**
 * Context provided to compaction decision logic
 */
export interface CompactionContext {
  roundNumber: number;
  messageCount: number;
  estimatedTokens: number;
  contextWindowSize: number;
  lastCompactionRound?: number;
  previousOutput?: unknown;
}

/**
 * Context provided to buildRoundPrompt
 */
export interface RoundContext<TOutput> {
  roundNumber: number;
  previousOutput?: TOutput;
  compactionSummary?: string;
}

/**
 * Historical round data for compaction
 */
export interface RoundHistory<TOutput> {
  roundNumber: number;
  prompt: string;
  output: TOutput;
  timestamp: string;
}

/**
 * Result of executing a round
 */
export interface RoundResult<TOutput> {
  output: TOutput;
  roundNumber: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  wasCompacted: boolean;
  traceId: string;
}

/**
 * Complete agent definition
 */
export interface AgentDefinition<TOutput> {
  id: string;
  outputSchema: ZodType<TOutput>;
  buildRoundPrompt: (context: RoundContext<TOutput>) => string;
  buildCompactionPrompt: (history: RoundHistory<TOutput>[]) => string;
  compactionTrigger?: CompactionTrigger;
  systemPrompt?: string;
  onRoundComplete?: (result: RoundResult<TOutput>) => Promise<void>;
}

/**
 * Agent instance with readonly definition
 */
export interface Agent<TOutput> {
  readonly definition: AgentDefinition<TOutput>;
}
