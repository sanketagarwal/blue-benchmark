import { createBenchmarkLogger } from '@nullagent/cli-utils';

import { getForecastingCharts } from './replay-lab/charts.js';

const ROUND_INTERVAL_MS = 15 * 60 * 1000;

interface PrefetchResult {
  roundTimestamps: Date[];
  totalDataPoints: number;
  elapsedMs: number;
}

/**
 * Prefetch all Replay Lab data needed for benchmark run
 * Fails fast if any API call fails, before spending money on AI
 * @param symbolId - Trading symbol
 * @param startTime - First round timestamp
 * @param totalRounds - Total number of rounds to prefetch
 * @param verbose - Whether to log progress
 * @returns Prefetch result with timing info
 */
export async function prefetchAllRoundData(
  symbolId: string,
  startTime: Date,
  totalRounds: number,
  verbose = false
): Promise<PrefetchResult> {
  const logger = createBenchmarkLogger(verbose);
  const start = Date.now();

  const roundTimestamps: Date[] = [];
  for (let index = 0; index < totalRounds; index++) {
    roundTimestamps.push(new Date(startTime.getTime() + index * ROUND_INTERVAL_MS));
  }

  logger.log(`Prefetching data for ${String(totalRounds)} rounds...`);
  logger.startSpinner(`Warming up Replay Lab cache...`);

  let totalDataPoints = 0;

  const prefetchPromises = roundTimestamps.map(async (timestamp, index) => {
    await getForecastingCharts(symbolId, timestamp);
    totalDataPoints++;

    if (verbose) {
      logger.log(`  Round ${String(index + 1)}/${String(totalRounds)} data cached`);
    }
  });

  await Promise.all(prefetchPromises);

  const elapsedMs = Date.now() - start;
  logger.succeedSpinner(`Prefetch complete: ${String(totalDataPoints)} data points in ${String(Math.round(elapsedMs / 1000))}s`);

  return {
    roundTimestamps,
    totalDataPoints,
    elapsedMs,
  };
}
