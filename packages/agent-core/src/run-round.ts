import { generateObject } from 'ai';

import { shouldCompact, runCompaction } from './compaction.js';
import {
  loadMessageHistory,
  saveRoundPrompt,
  saveRoundOutput,
  getCurrentRoundNumber,
} from './history.js';
import { getLLMClient, getModelId } from './llm.js';

import type { AgentDefinition, Agent, RoundResult, RoundContext } from './types.js';

/**
 * Define an agent from its definition
 * @param definition
 */
export function defineAgent<TOutput>(definition: AgentDefinition<TOutput>): Agent<TOutput> {
  return Object.freeze({
    definition,
  });
}

/**
 * Execute a single round for an agent
 * @param agent - The agent to execute
 * @param options - Optional configuration
 * @param options.traceId - Optional trace ID for correlation (auto-generated if not provided)
 */
export async function runRound<TOutput>(
  agent: Agent<TOutput>,
  options?: { traceId?: string }
): Promise<RoundResult<TOutput>> {
  const { definition } = agent;
  const traceId = options?.traceId ?? crypto.randomUUID();

  const messages = await loadMessageHistory(definition.id);
  const roundNumber = await getCurrentRoundNumber(definition.id);

  let wasCompacted = false;
  let compactionSummary: string | undefined;

  if (definition.compactionTrigger) {
    const shouldTriggerCompaction = await shouldCompact(
      definition.compactionTrigger,
      definition.id,
      messages
    );

    if (shouldTriggerCompaction) {
      compactionSummary = await runCompaction(definition);
      wasCompacted = true;
    }
  }

  let previousOutput: TOutput | undefined;
  if (messages.length >= 2) {
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant');

    if (lastAssistantMessage) {
      try {
        previousOutput = JSON.parse(lastAssistantMessage.content) as TOutput;
      } catch {
        // If parsing fails, leave previousOutput undefined
      }
    }
  }

  const context: RoundContext<TOutput> = {
    roundNumber,
    ...(previousOutput !== undefined && { previousOutput }),
    ...(compactionSummary !== undefined && { compactionSummary }),
  };

  const prompt = definition.buildRoundPrompt(context);
  await saveRoundPrompt(definition.id, prompt, roundNumber, traceId);

  const client = getLLMClient();
  const modelId = getModelId();

  // Use .chat() explicitly to force chat completions API (not responses API)
  // This is required for AI Gateway compatibility
  const generateConfig: Parameters<typeof generateObject>[0] = {
    model: client.chat(modelId) as unknown as Parameters<typeof generateObject>[0]['model'],
    schema: definition.outputSchema,
    messages: [...messages, { role: 'user', content: prompt }],
  };

  if (definition.systemPrompt) {
    generateConfig.system = definition.systemPrompt;
  }

  const result = await generateObject(generateConfig);

  const outputText = JSON.stringify(result.object);
  await saveRoundOutput(definition.id, outputText, result.object as TOutput, roundNumber, traceId);

  const usage = result.usage as unknown as {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  const roundResult: RoundResult<TOutput> = {
    output: result.object as TOutput,
    roundNumber,
    usage: {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    },
    wasCompacted,
    traceId,
  };

  if (definition.onRoundComplete) {
    await definition.onRoundComplete(roundResult);
  }

  return roundResult;
}
