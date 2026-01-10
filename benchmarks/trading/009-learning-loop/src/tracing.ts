/**
 * Langfuse Integration for LLM Observability
 * 
 * Provides tracing for all LLM calls in the ICL benchmark.
 * Also manages prompt versioning for tracking prompt experiments.
 */

import { Langfuse } from 'langfuse';

let langfuseInstance: Langfuse | undefined;

// Current prompt version - increment when prompts change
const PROMPT_VERSION = 'v4-reset-high-baseline';

export interface TraceMetadata {
  sessionId: string;
  modelId: string;
  roundNumber: number;
  roundType: 'baseline' | 'same_chart' | 'similar_chart' | 'transfer';
  chartUrl?: string;
  timeframe?: string;
}

export interface PromptConfig {
  name: string;
  prompt: string;
  labels?: string[];
  config?: Record<string, unknown>;
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
 * Create or update a prompt in Langfuse
 */
export async function createOrUpdatePrompt(config: PromptConfig): Promise<void> {
  const langfuse = initLangfuse();
  
  try {
    await langfuse.createPrompt({
      name: config.name,
      prompt: config.prompt,
      labels: config.labels ?? [PROMPT_VERSION],
      config: config.config,
    });
    console.log(`📝 Prompt "${config.name}" created/updated with version ${PROMPT_VERSION}`);
  } catch (error) {
    // Prompt might already exist, which is fine
    console.log(`📝 Prompt "${config.name}" already exists or error: ${error}`);
  }
}

/**
 * Get a prompt from Langfuse
 */
export async function getPrompt(name: string, label?: string) {
  const langfuse = initLangfuse();
  
  try {
    return await langfuse.getPrompt(name, undefined, { label: label ?? PROMPT_VERSION });
  } catch {
    return null;
  }
}

/**
 * Register all ICL benchmark prompts
 */
export async function registerPrompts(): Promise<void> {
  const prompts: PromptConfig[] = [
    {
      name: 'icl-baseline',
      prompt: `Analyze this candlestick chart and identify patterns.
You will receive a chart image with OHLCV data.
Evaluate each field based on what you SEE in this specific chart.`,
      config: { type: 'baseline', version: PROMPT_VERSION },
    },
    {
      name: 'icl-same-chart-feedback',
      prompt: `Review your previous analysis with the feedback provided.
Now re-analyze the SAME chart with the corrections in mind.
Focus on the fields you got wrong and apply the feedback.`,
      config: { type: 'same_chart', version: PROMPT_VERSION },
    },
    {
      name: 'icl-similar-chart-low-baseline',
      prompt: `📋 FIELD-SPECIFIC FOCUS MODE

This is a NEW, DIFFERENT chart. Analyze it FRESH.

🎯 FOCUS AREAS (fields you got wrong before):
{{wrongFields}}

✅ KEEP DOING (fields you got right):
{{correctFields}}

⚠️ CRITICAL REMINDERS:
- This chart has DIFFERENT data than before
- The correct answers may be DIFFERENT
- Analyze what you SEE, don't copy previous answers
- Each field must be evaluated based on THIS chart`,
      config: { 
        type: 'similar_chart', 
        mode: 'low_baseline',
        version: PROMPT_VERSION,
        threshold: 0.7,
      },
    },
    {
      name: 'icl-similar-chart-high-baseline',
      prompt: `🎯 FRESH ANALYSIS MODE (High Confidence)

You have strong chart analysis skills. Your methodology is sound.

📌 ANALYZE THIS CHART INDEPENDENTLY:
- Look at THIS specific chart image
- Evaluate each field based on what you SEE
- Do NOT assume any answers - analyze fresh

{{tipForWrongFields}}

This is a standalone analysis. Trust your methodology.`,
      config: { 
        type: 'similar_chart', 
        mode: 'high_baseline_reset',
        version: PROMPT_VERSION,
        threshold: 0.7,
        resetConversation: true,
      },
    },
  ];

  for (const prompt of prompts) {
    await createOrUpdatePrompt(prompt);
  }
  
  console.log(`\n📋 Registered ${prompts.length} prompts with version: ${PROMPT_VERSION}`);
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
    promptName?: string;  // Langfuse prompt name for linking
    imageCount: number;
    feedbackIncluded: boolean;
    resetConversation?: boolean;
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
      promptName: input.promptName,
      promptVersion: PROMPT_VERSION,
      imageCount: input.imageCount,
      feedbackIncluded: input.feedbackIncluded,
      resetConversation: input.resetConversation,
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
      promptVersion: PROMPT_VERSION,
    },
  });
  
  generation.end();
  return generation;
}

/**
 * Get current prompt version
 */
export function getPromptVersion(): string {
  return PROMPT_VERSION;
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
 * Create or get a dataset for ICL experiments
 */
export async function createICLDataset(sessionId: string): Promise<string> {
  const langfuse = initLangfuse();
  const datasetName = `icl-benchmark/${sessionId}`;
  
  try {
    await langfuse.createDataset({
      name: datasetName,
      description: `ICL benchmark charts for session ${sessionId}`,
      metadata: {
        promptVersion: PROMPT_VERSION,
        createdAt: new Date().toISOString(),
      },
    });
    console.log(`📊 Created dataset: ${datasetName}`);
  } catch {
    // Dataset might already exist
    console.log(`📊 Using existing dataset: ${datasetName}`);
  }
  
  return datasetName;
}

/**
 * Add a chart to the ICL dataset
 */
export async function addChartToDataset(
  datasetName: string,
  chartData: {
    chartUrl: string;
    timeframe: string;
    symbolId: string;
    candleCount: number;
    groundTruth: unknown;
    chartType: 'baseline' | 'similar';
    fingerprint?: unknown;
    similarityScore?: number;
  }
): Promise<void> {
  const langfuse = initLangfuse();
  
  try {
    await langfuse.createDatasetItem({
      datasetName,
      input: {
        chartUrl: chartData.chartUrl,
        timeframe: chartData.timeframe,
        symbolId: chartData.symbolId,
        candleCount: chartData.candleCount,
      },
      expectedOutput: chartData.groundTruth,
      metadata: {
        chartType: chartData.chartType,
        fingerprint: chartData.fingerprint,
        similarityScore: chartData.similarityScore,
        promptVersion: PROMPT_VERSION,
      },
    });
    console.log(`   📝 Added ${chartData.chartType} chart to dataset`);
  } catch (error) {
    console.warn(`   ⚠️ Failed to add chart to dataset: ${error}`);
  }
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
