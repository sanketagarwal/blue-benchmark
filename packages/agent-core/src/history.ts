import { getDatabase, agentMessages } from '@nullagent/database';
import { eq, desc, and, ne, isNotNull, asc, gte } from 'drizzle-orm';

import type { RoundHistory } from './types.js';

/**
 *
 */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Load message history since last compaction for an agent
 * @param agentId
 */
export async function loadMessageHistory(agentId: string): Promise<Message[]> {
  const database = getDatabase();

  const messages = await database
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.agentId, agentId));

  return messages
    .filter((message) => message.kind !== 'compaction')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));
}

/**
 * Save a round prompt message
 * @param agentId
 * @param content
 * @param roundNumber
 * @param traceId
 */
export async function saveRoundPrompt(
  agentId: string,
  content: string,
  roundNumber: number,
  traceId?: string
): Promise<void> {
  const database = getDatabase();

  await database.insert(agentMessages).values({
    agentId,
    role: 'user',
    kind: 'prompt',
    content,
    roundNumber,
    // eslint-disable-next-line unicorn/no-null -- Database schema requires null for optional fields with exactOptionalPropertyTypes
    traceId: traceId ?? null,
  });
}

/**
 * Save a round output message
 * @param agentId
 * @param content
 * @param outputJson
 * @param roundNumber
 * @param traceId
 */
export async function saveRoundOutput<T>(
  agentId: string,
  content: string,
  outputJson: T,
  roundNumber: number,
  traceId?: string
): Promise<void> {
  const database = getDatabase();

  await database.insert(agentMessages).values({
    agentId,
    role: 'assistant',
    kind: 'output',
    content,
    outputJson,
    roundNumber,
    // eslint-disable-next-line unicorn/no-null -- Database schema requires null for optional fields with exactOptionalPropertyTypes
    traceId: traceId ?? null,
  });
}

/**
 * Get the current round number for an agent
 * @param agentId
 */
export async function getCurrentRoundNumber(agentId: string): Promise<number> {
  const database = getDatabase();

  const result = await database
    .select({ roundNumber: agentMessages.roundNumber })
    .from(agentMessages)
    .where(and(eq(agentMessages.agentId, agentId), isNotNull(agentMessages.roundNumber)))
    .orderBy(desc(agentMessages.roundNumber))
    .limit(1);

  if (result.length === 0) {
    return 0;
  }

  const firstResult = result[0];
  if (!firstResult || firstResult.roundNumber === null) {
    return 0;
  }

  return firstResult.roundNumber + 1;
}

/**
 * Load recent round history for compaction
 * @param agentId
 * @param limit
 */
export async function loadRecentRounds<T>(
  agentId: string,
  limit: number
): Promise<RoundHistory<T>[]> {
  const database = getDatabase();

  const messages = await database
    .select()
    .from(agentMessages)
    .where(
      and(
        eq(agentMessages.agentId, agentId),
        ne(agentMessages.kind, 'compaction'),
        isNotNull(agentMessages.roundNumber)
      )
    )
    .orderBy(desc(agentMessages.createdAt))
    .limit(limit * 2);

  const roundMap = new Map<number, { prompt?: string; output?: T; timestamp?: Date }>();

  for (const message of messages) {
    if (message.roundNumber === null) {continue;}

    const round = roundMap.get(message.roundNumber) ?? {};

    if (message.kind === 'prompt') {
      round.prompt = message.content;
      if (message.createdAt !== null) {
        round.timestamp = message.createdAt;
      }
    } else if (message.kind === 'output') {
      round.output = message.outputJson as T;
    }

    roundMap.set(message.roundNumber, round);
  }

  const rounds: RoundHistory<T>[] = [];

  for (const [roundNumber, data] of roundMap) {
    if (data.prompt && data.output && data.timestamp) {
      rounds.push({
        roundNumber,
        prompt: data.prompt,
        output: data.output,
        timestamp: data.timestamp.toISOString(),
      });
    }
  }

  return rounds.sort((a, b) => a.roundNumber - b.roundNumber);
}
