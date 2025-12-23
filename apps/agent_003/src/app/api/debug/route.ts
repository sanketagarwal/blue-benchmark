import { loadMessageHistory } from '@nullagent/agent-core';
import { NextResponse } from 'next/server';

import { getClockState, resetClockState } from '../../../clock-state';
import { forecaster } from '../../../forecaster';

export async function GET(): Promise<NextResponse> {
  try {
    const clockState = getClockState();
    const messageHistory = await loadMessageHistory(forecaster.definition.id);

    return NextResponse.json({
      clock: {
        currentTime: clockState.currentTime.toISOString(),
        roundNumber: clockState.roundNumber,
        startTime: clockState.startTime.toISOString(),
      },
      forecaster: {
        id: forecaster.definition.id,
        messageCount: messageHistory.length,
        recentMessages: messageHistory.slice(-5), // Last 5 messages
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: message,
        note: 'Clock may not be initialized. Call POST /api/play first.',
      },
      { status: 500 }
    );
  }
}

export function DELETE(): NextResponse {
  resetClockState();
  return NextResponse.json({ success: true, message: 'Clock state reset' });
}
