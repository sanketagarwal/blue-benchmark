import { getDatabase, agentMessages } from '@nullagent/database';
import { generateText } from 'ai';

import { getCurrentRoundNumber, loadRecentRounds } from './history.js';
import { getLLMClient, getModelId, getContextWindow } from './llm.js';

import type { CompactionTrigger, AgentDefinition } from './types.js';



/**
 * Estimate token count from messages (rough: ~4 chars per token)
 * @param messages
 */
export function estimateTokenCount(messages: { content: string }[]): number {
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Evaluate if compaction should be triggered
 * @param trigger
 * @param agentId
 * @param messages
 * @param modelId - Optional model ID override for parallel execution
 */
export async function shouldCompact(
  trigger: CompactionTrigger,
  agentId: string,
  messages: { content: string }[],
  modelId?: string
): Promise<boolean> {
  if (trigger.type === 'message-count') {
    return messages.length >= trigger.count;
  }

  if (trigger.type === 'context-window') {
    const contextWindow = getContextWindow(trigger.modelId);
    const estimatedTokens = estimateTokenCount(messages);
    return estimatedTokens / contextWindow >= trigger.threshold;
  }

  if (trigger.type === 'custom') {
    const roundNumber = await getCurrentRoundNumber(agentId);
    const estimatedTokens = estimateTokenCount(messages);
    const resolvedModelId = modelId ?? getModelId();
    const contextWindowSize = getContextWindow(resolvedModelId);

    const context = {
      roundNumber,
      messageCount: messages.length,
      estimatedTokens,
      contextWindowSize,
    };

    return await trigger.shouldCompact(context);
  }

  throw new Error(`Unknown compaction trigger type: ${JSON.stringify(trigger)}`);
}

/**
 * Execute compaction and save the summary
 * @param agent
 * @param modelId - Optional model ID override for parallel execution
 */
export async function runCompaction<TOutput>(agent: AgentDefinition<TOutput>, modelId?: string): Promise<string> {
  const recentRounds = await loadRecentRounds<TOutput>(agent.id, 100);
  const compactionPrompt = agent.buildCompactionPrompt(recentRounds);

  const client = getLLMClient();
  const resolvedModelId = modelId ?? getModelId();

  // Use .chat() explicitly to force chat completions API (not responses API)
  // This is required for AI Gateway compatibility
  const generateConfig: Parameters<typeof generateText>[0] = {
    model: client.chat(resolvedModelId) as unknown as Parameters<typeof generateText>[0]['model'],
    prompt: compactionPrompt,
  };

  if (agent.systemPrompt) {
    generateConfig.system = agent.systemPrompt;
  }

  const result = await generateText(generateConfig);

  const summary = result.text;

  const database = getDatabase();
  await database.insert(agentMessages).values({
    agentId: agent.id,
    role: 'assistant',
    kind: 'compaction',
    content: summary,
  });

  return summary;
}
