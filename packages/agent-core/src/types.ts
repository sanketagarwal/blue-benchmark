import type { ZodType } from 'zod';

/** Text content part */
export interface TextPart {
  type: 'text';
  text: string;
}

/** Image content part (URL, base64, or binary data) */
export interface ImagePart {
  type: 'image';
  image: string | Uint8Array; // URL, base64 data, or binary data
}

/** Content can be text-only string or multimodal parts */
export type MessageContent = string | (TextPart | ImagePart)[];

/** Multimodal prompt result from buildRoundPrompt */
export interface MultimodalPrompt {
  content: MessageContent;
}

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
  buildRoundPrompt: (context: RoundContext<TOutput>) => string | MultimodalPrompt;
  buildCompactionPrompt: (history: RoundHistory<TOutput>[]) => string;
  compactionTrigger?: CompactionTrigger;
  systemPrompt?: string;
  onRoundComplete?: (result: RoundResult<TOutput>) => Promise<void>;
  /** If true, don't load previous messages - each round is independent */
  stateless?: boolean;
}

/**
 * Agent instance with readonly definition
 */
export interface Agent<TOutput> {
  readonly definition: AgentDefinition<TOutput>;
}
