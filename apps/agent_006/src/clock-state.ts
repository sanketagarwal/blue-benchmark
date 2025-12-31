export interface ClockState {
  currentTime: Date;
  roundNumber: number;
  startTime: Date;
}

export interface TimeWindow {
  from: Date;
  to: Date;
}

const CLOCK_NOT_INITIALIZED_ERROR = 'Clock not initialized';

let clockState: ClockState | undefined;

export function initializeClock(): ClockState {
  if (clockState !== undefined) {
    return clockState;
  }

  const startTimeString = process.env['SIMULATION_START_TIME'];
  if (startTimeString === undefined || startTimeString === '') {
    throw new Error('SIMULATION_START_TIME environment variable is required');
  }

  const startTime = new Date(startTimeString);
  if (Number.isNaN(startTime.getTime())) {
    throw new TypeError('SIMULATION_START_TIME must be a valid ISO 8601 date string');
  }

  clockState = {
    currentTime: startTime,
    roundNumber: 0,
    startTime,
  };

  return clockState;
}

export function getClockState(): ClockState {
  if (clockState === undefined) {
    throw new Error(CLOCK_NOT_INITIALIZED_ERROR);
  }
  return clockState;
}

// Advance by 15 minutes per round for bottom prediction
const ROUND_INTERVAL_MS = 15 * 60 * 1000;

export function advanceClock(): ClockState {
  if (clockState === undefined) {
    throw new Error(CLOCK_NOT_INITIALIZED_ERROR);
  }

  const newTime = new Date(clockState.currentTime.getTime() + ROUND_INTERVAL_MS);

  clockState = {
    ...clockState,
    currentTime: newTime,
    roundNumber: clockState.roundNumber + 1,
  };

  return clockState;
}

export function getPredictionWindow(): TimeWindow {
  if (clockState === undefined) {
    throw new Error(CLOCK_NOT_INITIALIZED_ERROR);
  }

  const from = clockState.currentTime;
  const to = new Date(from);
  to.setHours(to.getHours() + 1);

  return { from, to };
}

export function getChartWindow(): TimeWindow {
  if (clockState === undefined) {
    throw new Error(CLOCK_NOT_INITIALIZED_ERROR);
  }

  const to = clockState.currentTime;
  const from = new Date(to);
  from.setHours(from.getHours() - 4);

  return { from, to };
}

export function resetClockState(): void {
  clockState = undefined;
}
