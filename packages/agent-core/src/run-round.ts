import { generateObject } from 'ai';

import { shouldCompact, runCompaction } from './compaction.js';
import {
  loadMessageHistory,
  saveRoundPrompt,
  saveRoundOutput,
  getCurrentRoundNumber,
} from './history.js';
import { getLLMClient, getModelId } from './llm.js';

import type { AgentDefinition, Agent, RoundResult, RoundContext, MultimodalPrompt, MessageContent, TextPart } from './types.js';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function extractPreviousOutput<TOutput>(messages: Message[]): TOutput | undefined {
  if (messages.length < 2) {
    return undefined;
  }
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');

  if (!lastAssistantMessage) {
    return undefined;
  }
  try {
    return JSON.parse(lastAssistantMessage.content) as TOutput;
  } catch {
    return undefined;
  }
}

async function loadMessages(
  agentId: string,
  stateless: boolean | undefined,
  since?: Date
): Promise<Message[]> {
  if (stateless) {
    return [];
  }
  return await loadMessageHistory(agentId, since ? { since } : undefined);
}

function normalizePromptResult(promptResult: string | MultimodalPrompt): {
  content: MessageContent;
  text: string;
} {
  if (typeof promptResult === 'string') {
    return { content: promptResult, text: promptResult };
  }
  
  const content = promptResult.content;
  if (typeof content === 'string') {
    return { content, text: content };
  }
  
  const textParts = content.filter(
    (part): part is TextPart => part.type === 'text'
  );
  const textOnly = textParts.map((part) => part.text).join('\n');
  
  const imageCount = content.filter((part) => part.type === 'image').length;
  
  const historyText = imageCount > 0 
    ? `${textOnly}\n\n[${String(imageCount)} image(s) attached - not stored in history]`
    : textOnly;
  
  return { content, text: historyText };
}

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
 * @param options.modelId - Optional model ID override for parallel execution (avoids env race condition)
 * @param options.since - Only load messages created at or after this date (for session isolation)
 */
export async function runRound<TOutput>(
  agent: Agent<TOutput>,
  options?: { traceId?: string; modelId?: string; since?: Date }
): Promise<RoundResult<TOutput>> {
  const { definition } = agent;
  const traceId = options?.traceId ?? crypto.randomUUID();

  let messages = await loadMessages(definition.id, definition.stateless, options?.since);
  const roundNumber = await getCurrentRoundNumber(definition.id);

  let wasCompacted = false;
  let compactionSummary: string | undefined;

  if (definition.compactionTrigger) {
    const shouldTriggerCompaction = await shouldCompact(
      definition.compactionTrigger,
      definition.id,
      messages,
      options?.modelId
    );

    if (shouldTriggerCompaction) {
      compactionSummary = await runCompaction(definition, options?.modelId);
      wasCompacted = true;
      messages = await loadMessages(definition.id, definition.stateless, options?.since);
    }
  }

  const previousOutput = extractPreviousOutput<TOutput>(messages);

  const context: RoundContext<TOutput> = {
    roundNumber,
    ...(previousOutput !== undefined && { previousOutput }),
    ...(compactionSummary !== undefined && { compactionSummary }),
  };

  const promptResult = definition.buildRoundPrompt(context);
  const { content: promptContent, text: promptText } = normalizePromptResult(promptResult);

  await saveRoundPrompt(definition.id, promptText, roundNumber, traceId);

  const userMessage = { role: 'user' as const, content: promptContent };

  const client = getLLMClient();
  const modelId = options?.modelId ?? getModelId();

  const generateConfig: Parameters<typeof generateObject>[0] = {
    model: client.chat(modelId) as unknown as Parameters<typeof generateObject>[0]['model'],
    schema: definition.outputSchema,
    messages: [...messages, userMessage],
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
