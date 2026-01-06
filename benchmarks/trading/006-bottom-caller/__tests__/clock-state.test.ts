/* eslint-disable sonarjs/no-duplicate-string -- Test assertions require duplicate date strings for verification */
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  advanceClock,
  getChartWindow,
  getClockState,
  getPredictionWindow,
  initializeClock,
  resetClockState,
} from '../src/clock-state';

const CLOCK_NOT_INITIALIZED_ERROR = 'Clock not initialized';
const SIMULATION_START_TIME_ENV_VAR = 'SIMULATION_START_TIME';
const QUICK_SIMULATION_START_TIME_ENV_VAR = 'QUICK_SIMULATION_START_TIME';
const SIMULATION_START_TIME = '2024-01-01T00:00:00.000Z';
const QUICK_START_TIME = '2024-01-01T02:00:00.000Z';
// 15-minute intervals for bottom prediction benchmark
const SIMULATION_START_TIME_PLUS_15M = '2024-01-01T00:15:00.000Z';
const SIMULATION_START_TIME_PLUS_30M = '2024-01-01T00:30:00.000Z';
const SIMULATION_START_TIME_PLUS_45M = '2024-01-01T00:45:00.000Z';
const SIMULATION_START_TIME_PLUS_1_HOUR = '2024-01-01T01:00:00.000Z';
const SIMULATION_START_TIME_4_HOURS = '2024-01-01T04:00:00.000Z';
const SIMULATION_START_TIME_4H_30M = '2024-01-01T04:30:00.000Z';

describe('clock-state', () => {
  beforeEach(() => {
    resetClockState();
    vi.unstubAllEnvs();
  });

  describe('initializeClock', () => {
    test('initializes clock from SIMULATION_START_TIME env var', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);

      const state = initializeClock();

      expect(state.currentTime).toEqual(new Date(SIMULATION_START_TIME));
      expect(state.startTime).toEqual(new Date(SIMULATION_START_TIME));
      expect(state.roundNumber).toBe(0);
    });

    test('throws error when SIMULATION_START_TIME is missing', () => {
      expect(() => initializeClock()).toThrow(
        'SIMULATION_START_TIME environment variable is required'
      );
    });

    test('throws error when SIMULATION_START_TIME is invalid', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, 'invalid-date');

      expect(() => initializeClock()).toThrow(
        'SIMULATION_START_TIME must be a valid ISO 8601 date string'
      );
    });

    test('returns existing clock state if already initialized', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);

      const state1 = initializeClock();
      const state2 = initializeClock();

      expect(state1).toBe(state2);
    });

    test('uses QUICK_SIMULATION_START_TIME when isQuickMode is true', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);
      vi.stubEnv(QUICK_SIMULATION_START_TIME_ENV_VAR, QUICK_START_TIME);

      const state = initializeClock({ isQuickMode: true });

      expect(state.currentTime).toEqual(new Date(QUICK_START_TIME));
      expect(state.startTime).toEqual(new Date(QUICK_START_TIME));
    });

    test('falls back to SIMULATION_START_TIME in quick mode when QUICK_SIMULATION_START_TIME is not set', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);

      const state = initializeClock({ isQuickMode: true });

      expect(state.currentTime).toEqual(new Date(SIMULATION_START_TIME));
      expect(state.startTime).toEqual(new Date(SIMULATION_START_TIME));
    });

    test('ignores QUICK_SIMULATION_START_TIME when isQuickMode is false', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);
      vi.stubEnv(QUICK_SIMULATION_START_TIME_ENV_VAR, QUICK_START_TIME);

      const state = initializeClock({ isQuickMode: false });

      expect(state.currentTime).toEqual(new Date(SIMULATION_START_TIME));
      expect(state.startTime).toEqual(new Date(SIMULATION_START_TIME));
    });

    test('throws error with correct env var name when QUICK_SIMULATION_START_TIME is invalid', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);
      vi.stubEnv(QUICK_SIMULATION_START_TIME_ENV_VAR, 'invalid-date');

      expect(() => initializeClock({ isQuickMode: true })).toThrow(
        'QUICK_SIMULATION_START_TIME must be a valid ISO 8601 date string'
      );
    });
  });

  describe('getClockState', () => {
    test('returns current clock state when initialized', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);
      initializeClock();

      const state = getClockState();

      expect(state.currentTime).toEqual(new Date(SIMULATION_START_TIME));
      expect(state.startTime).toEqual(new Date(SIMULATION_START_TIME));
      expect(state.roundNumber).toBe(0);
    });

    test('throws error when clock is not initialized', () => {
      expect(() => getClockState()).toThrow(CLOCK_NOT_INITIALIZED_ERROR);
    });
  });

  describe('advanceClock', () => {
    test('advances clock by 15 minutes and increments round number', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);
      initializeClock();

      const state = advanceClock();

      expect(state.currentTime).toEqual(new Date(SIMULATION_START_TIME_PLUS_15M));
      expect(state.roundNumber).toBe(1);
      expect(state.startTime).toEqual(new Date(SIMULATION_START_TIME));
    });

    test('accumulates multiple advances correctly', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);
      initializeClock();

      advanceClock();
      advanceClock();
      const state = advanceClock();

      expect(state.currentTime).toEqual(new Date(SIMULATION_START_TIME_PLUS_45M));
      expect(state.roundNumber).toBe(3);
      expect(state.startTime).toEqual(new Date(SIMULATION_START_TIME));
    });

    test('throws error when clock is not initialized', () => {
      expect(() => advanceClock()).toThrow(CLOCK_NOT_INITIALIZED_ERROR);
    });
  });

  describe('getPredictionWindow', () => {
    test('returns 1-hour window from current time', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);
      initializeClock();

      const window = getPredictionWindow();

      expect(window.from).toEqual(new Date(SIMULATION_START_TIME));
      expect(window.to).toEqual(new Date(SIMULATION_START_TIME_PLUS_1_HOUR));
    });

    test('returns correct window after clock advancement', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);
      initializeClock();
      advanceClock(); // +15m
      advanceClock(); // +30m

      const window = getPredictionWindow();

      // After 2 advances: from=00:30, to=01:30
      expect(window.from).toEqual(new Date(SIMULATION_START_TIME_PLUS_30M));
      expect(window.to).toEqual(new Date('2024-01-01T01:30:00.000Z'));
    });

    test('throws error when clock is not initialized', () => {
      expect(() => getPredictionWindow()).toThrow(CLOCK_NOT_INITIALIZED_ERROR);
    });
  });

  describe('getChartWindow', () => {
    test('returns 4-hour lookback window from current time', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME_4_HOURS);
      initializeClock();

      const window = getChartWindow();

      expect(window.from).toEqual(new Date(SIMULATION_START_TIME));
      expect(window.to).toEqual(new Date(SIMULATION_START_TIME_4_HOURS));
    });

    test('returns correct window after clock advancement', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME_4_HOURS);
      initializeClock();
      advanceClock(); // +15m
      advanceClock(); // +30m

      const window = getChartWindow();

      // After 2 advances (30m): from=00:30, to=04:30
      expect(window.from).toEqual(new Date(SIMULATION_START_TIME_PLUS_30M));
      expect(window.to).toEqual(new Date(SIMULATION_START_TIME_4H_30M));
    });

    test('throws error when clock is not initialized', () => {
      expect(() => getChartWindow()).toThrow(CLOCK_NOT_INITIALIZED_ERROR);
    });
  });

  describe('resetClockState', () => {
    test('resets clock state for testing', () => {
      vi.stubEnv(SIMULATION_START_TIME_ENV_VAR, SIMULATION_START_TIME);
      initializeClock();
      advanceClock();

      resetClockState();

      expect(() => getClockState()).toThrow(CLOCK_NOT_INITIALIZED_ERROR);
    });
  });
});
/* eslint-enable sonarjs/no-duplicate-string -- Re-enable rule after test file */
