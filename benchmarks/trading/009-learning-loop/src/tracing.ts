/**
 * Langfuse Integration for LLM Observability
 * 
 * Provides tracing for all LLM calls in the ICL benchmark.
 */

import { Langfuse } from 'langfuse';

let langfuseInstance: Langfuse | undefined;

export interface TraceMetadata {
  sessionId: string;
  modelId: string;
  roundNumber: number;
  roundType: 'baseline' | 'same_chart' | 'similar_chart' | 'transfer';
  chartUrl?: string;
  timeframe?: string;
}

/**
 * Initialize Langfuse client
 */
export function initLangfuse(): Langfuse {
  if (langfuseInstance) return langfuseInstance;
  
  const secretKey = process.env['LANGFUSE_SECRET_KEY'];
  const publicKey = process.env['LANGFUSE_PUBLIC_KEY'];
  const baseUrl = process.env['LANGFUSE_BASE_URL'] ?? 'https://cloud.langfuse.com';
  
  if (!secretKey || !publicKey) {
    console.warn('⚠️  Langfuse keys not configured - tracing disabled');
    // Return a mock langfuse that does nothing
    return {
      trace: () => ({
        generation: () => ({ end: () => {} }),
        span: () => ({ end: () => {} }),
        update: () => {},
        id: 'mock',
      }),
      flush: async () => {},
      shutdownAsync: async () => {},
    } as unknown as Langfuse;
  }
  
  langfuseInstance = new Langfuse({
    secretKey,
    publicKey,
    baseUrl,
  });
  
  console.log('✅ Langfuse initialized');
  return langfuseInstance;
}

/**
 * Create a trace for an ICL session
 */
export function createSessionTrace(metadata: TraceMetadata) {
  const langfuse = initLangfuse();
  
  const trace = langfuse.trace({
    id: `${metadata.sessionId}_round${metadata.roundNumber}`,
    name: `icl_${metadata.roundType}`,
    sessionId: metadata.sessionId,
    metadata: {
      modelId: metadata.modelId,
      roundNumber: metadata.roundNumber,
      roundType: metadata.roundType,
      chartUrl: metadata.chartUrl,
      timeframe: metadata.timeframe,
    },
    tags: ['icl-benchmark', metadata.roundType, metadata.modelId.split('/')[0] ?? 'unknown'],
  });
  
  return trace;
}

/**
 * Track an LLM generation within a trace
 */
export function trackGeneration(
  trace: ReturnType<typeof createSessionTrace>,
  input: {
    prompt: string;
    imageCount: number;
    feedbackIncluded: boolean;
  },
  output: {
    response: unknown;
    accuracy: number;
    exactMatches: number;
    latencyMs: number;
    tokensUsed?: {
      prompt: number;
      completion: number;
      total: number;
    };
  },
  modelId: string
) {
  const generation = trace.generation({
    name: 'chart_analysis',
    model: modelId,
    input: {
      promptLength: input.prompt.length,
      imageCount: input.imageCount,
      feedbackIncluded: input.feedbackIncluded,
    },
    output: output.response,
    usage: output.tokensUsed ? {
      promptTokens: output.tokensUsed.prompt,
      completionTokens: output.tokensUsed.completion,
      totalTokens: output.tokensUsed.total,
    } : undefined,
    metadata: {
      accuracy: output.accuracy,
      exactMatches: output.exactMatches,
      latencyMs: output.latencyMs,
    },
  });
  
  generation.end();
  return generation;
}

/**
 * Track accuracy metrics as a span
 */
export function trackAccuracy(
  trace: ReturnType<typeof createSessionTrace>,
  metrics: {
    accuracy: number;
    exactMatches: number;
    totalFields: number;
    fieldResults: Record<string, number>;
    deltaFromBaseline?: number;
  }
) {
  const span = trace.span({
    name: 'accuracy_scoring',
    input: { totalFields: metrics.totalFields },
    output: {
      accuracy: metrics.accuracy,
      exactMatches: metrics.exactMatches,
      deltaFromBaseline: metrics.deltaFromBaseline,
      fieldResults: metrics.fieldResults,
    },
    metadata: {
      accuracyPct: `${(metrics.accuracy * 100).toFixed(1)}%`,
      exactMatchRatio: `${metrics.exactMatches}/${metrics.totalFields}`,
    },
  });
  
  span.end();
  return span;
}

/**
 * Flush all pending events to Langfuse
 */
export async function flushLangfuse() {
  if (langfuseInstance) {
    await langfuseInstance.flush();
  }
}

/**
 * Shutdown Langfuse client
 */
export async function shutdownLangfuse() {
  if (langfuseInstance) {
    await langfuseInstance.shutdownAsync();
  }
}
