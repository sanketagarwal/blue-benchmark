import { getDatabase, scorerResults } from '@nullagent/database';

import type { SaveScoreParams } from './types.js';

/**
 * Save a score result to the database
 * @param params - The score parameters
 */
export async function saveScore(params: SaveScoreParams): Promise<void> {
  const database = getDatabase();
  await database.insert(scorerResults).values({
    traceId: params.traceId,
    agentId: params.agentId,
    roundNumber: params.roundNumber,
    scorerId: params.scorerId,
    score: params.result.score,
    result: params.result,
  });
}
