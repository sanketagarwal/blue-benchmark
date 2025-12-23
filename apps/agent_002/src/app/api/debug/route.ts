import { loadMessageHistory } from '@nullagent/agent-core';
import { NextResponse } from 'next/server';

import { player } from '../../../player';
import { puzzleMaster } from '../../../puzzle-master';

export async function GET(): Promise<NextResponse> {
  try {
    const puzzleMasterId = puzzleMaster.definition.id;
    const playerId = player.definition.id;

    const [puzzleMasterHistory, playerHistory] = await Promise.all([
      loadMessageHistory(puzzleMasterId),
      loadMessageHistory(playerId),
    ]);

    return NextResponse.json({
      puzzleMaster: {
        id: puzzleMasterId,
        messageCount: puzzleMasterHistory.length,
        messages: puzzleMasterHistory,
      },
      player: {
        id: playerId,
        messageCount: playerHistory.length,
        messages: playerHistory,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
