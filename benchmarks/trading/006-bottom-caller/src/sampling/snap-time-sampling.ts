/**
 * SnapTime sampling strategies for benchmark.
 *
 * S1 - Proximity Sampling: Filter candidates close to reference low
 * S2 - Event-Balanced Sampling: Sample to achieve balanced label distribution
 */

import type { TimeframeId } from '../timeframe-config.js';

export interface SnapTimeCandidate {
  snapTime: number;
  closeAtSnap: number;
  refLow: number;
  distanceToRefLow: number;
  labelByHorizon?: Record<TimeframeId, boolean>;
}

export interface SamplingConfig {
  strategy: 'proximity' | 'balanced' | 'both';
  proximityThresholds: Record<TimeframeId, number>;
  balancedTargets: { minPositive: number; maxPositive: number; minMinority: number };
  minSeparationMinutes: Record<TimeframeId, number>;
}

export interface SamplingResult {
  selectedSnapTimes: number[];
  candidatePool: SnapTimeCandidate[];
  strategyUsed: 'proximity' | 'balanced';
  labelDistribution?: Record<TimeframeId, { trueCount: number; falseCount: number }>;
}

export const DEFAULT_PROXIMITY_THRESHOLDS: Record<TimeframeId, number> = {
  '15m': 0.004,
  '1h': 0.008,
  '4h': 0.015,
  '24h': 0.03,
};

export const DEFAULT_MIN_SEPARATION_MINUTES: Record<TimeframeId, number> = {
  '15m': 30,
  '1h': 120,
  '4h': 360,
  '24h': 1440,
};

/**
 * Create default sampling configuration.
 * @returns Default sampling config with standard thresholds
 */
export function createDefaultSamplingConfig(): SamplingConfig {
  return {
    strategy: 'both',
    proximityThresholds: { ...DEFAULT_PROXIMITY_THRESHOLDS },
    balancedTargets: { minPositive: 10, maxPositive: 14, minMinority: 8 },
    minSeparationMinutes: { ...DEFAULT_MIN_SEPARATION_MINUTES },
  };
}

/**
 * Get threshold value for a specific horizon.
 * @param thresholds - Record of thresholds by timeframe
 * @param horizon - Timeframe ID
 * @returns Threshold value
 */
function getThresholdForHorizon(
  thresholds: Record<TimeframeId, number>,
  horizon: TimeframeId
): number {
  switch (horizon) {
    case '15m':
      return thresholds['15m'];
    case '1h':
      return thresholds['1h'];
    case '4h':
      return thresholds['4h'];
    case '24h':
      return thresholds['24h'];
  }
}

/**
 * Get separation minutes for a specific horizon.
 * @param separations - Record of separations by timeframe
 * @param horizon - Timeframe ID
 * @returns Separation in minutes
 */
function getSeparationForHorizon(
  separations: Record<TimeframeId, number>,
  horizon: TimeframeId
): number {
  switch (horizon) {
    case '15m':
      return separations['15m'];
    case '1h':
      return separations['1h'];
    case '4h':
      return separations['4h'];
    case '24h':
      return separations['24h'];
  }
}

/**
 * Filter candidates by proximity threshold.
 * Only includes candidates where (closeAtSnap - refLow) / refLow <= threshold.
 * @param candidates - Array of snap time candidates
 * @param horizon - Timeframe ID for threshold lookup
 * @param config - Sampling configuration
 * @returns Filtered candidates within proximity threshold
 */
export function filterByProximity(
  candidates: SnapTimeCandidate[],
  horizon: TimeframeId,
  config: SamplingConfig
): SnapTimeCandidate[] {
  const threshold = getThresholdForHorizon(config.proximityThresholds, horizon);
  return candidates.filter((candidate) => candidate.distanceToRefLow <= threshold);
}

/**
 * Enforce minimum time separation between selected candidates.
 * Greedy approach: iterate chronologically, keep candidate if far enough from last kept.
 * @param candidates - Array of snap time candidates
 * @param horizon - Timeframe ID for separation lookup
 * @param config - Sampling configuration
 * @returns Candidates with minimum separation enforced
 */
export function enforceMinSeparation(
  candidates: SnapTimeCandidate[],
  horizon: TimeframeId,
  config: SamplingConfig
): SnapTimeCandidate[] {
  if (candidates.length === 0) {
    return [];
  }

  const minSeparationMs = getSeparationForHorizon(config.minSeparationMinutes, horizon) * 60_000;
  const sorted = [...candidates].sort((a, b) => a.snapTime - b.snapTime);

  const result: SnapTimeCandidate[] = [];
  let lastKeptTime = -Infinity;

  for (const candidate of sorted) {
    if (candidate.snapTime - lastKeptTime >= minSeparationMs) {
      result.push(candidate);
      lastKeptTime = candidate.snapTime;
    }
  }

  return result;
}

/**
 * Simple seeded PRNG (Mulberry32).
 * @param seed - Seed value for deterministic random
 * @returns Function that returns random numbers between 0 and 1
 */
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = Math.trunc(state + 0x6D_2B_79_F5);
    let temporary = Math.imul(state ^ (state >>> 15), 1 | state);
    temporary = (temporary + Math.imul(temporary ^ (temporary >>> 7), 61 | temporary)) ^ temporary;
    return ((temporary ^ (temporary >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Fisher-Yates shuffle with seeded random.
 * @param array - Array to shuffle
 * @param random - Random function
 * @returns Shuffled copy of array
 */
function shuffleArray<T>(array: T[], random: () => number): T[] {
  const result = [...array];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    // eslint-disable-next-line security/detect-object-injection -- index from loop bounds, swapIndex from random within bounds
    const temporary = result[index];
    // eslint-disable-next-line security/detect-object-injection -- swapIndex from random within bounds
    const swapElement = result[swapIndex];
    if (temporary !== undefined && swapElement !== undefined) {
      // eslint-disable-next-line security/detect-object-injection -- index from loop bounds
      result[index] = swapElement;
      // eslint-disable-next-line security/detect-object-injection -- swapIndex from random within bounds
      result[swapIndex] = temporary;
    }
  }
  return result;
}

/**
 * Get label for a candidate at a specific horizon.
 * @param candidate - Snap time candidate
 * @param horizon - Timeframe ID
 * @returns Label value or undefined
 */
function getLabelForHorizon(
  candidate: SnapTimeCandidate,
  horizon: TimeframeId
): boolean | undefined {
  if (candidate.labelByHorizon === undefined) {
    return undefined;
  }
  switch (horizon) {
    case '15m':
      return candidate.labelByHorizon['15m'];
    case '1h':
      return candidate.labelByHorizon['1h'];
    case '4h':
      return candidate.labelByHorizon['4h'];
    case '24h':
      return candidate.labelByHorizon['24h'];
  }
}

/**
 * Sample candidates to achieve balanced label distribution.
 * Aims for target label mix with minPositive-maxPositive positives out of targetCount.
 * Enforces minMinority count if possible.
 * @param candidates - Array of snap time candidates with labels
 * @param horizon - Timeframe ID for label lookup
 * @param targetCount - Target number of samples
 * @param config - Sampling configuration
 * @param random - Optional random function for shuffling
 * @returns Balanced sample of candidates
 */
export function sampleBalanced(
  candidates: SnapTimeCandidate[],
  horizon: TimeframeId,
  targetCount: number,
  config: SamplingConfig,
  random?: () => number
): SnapTimeCandidate[] {
  const rand = random ?? Math.random;
  const { minPositive, maxPositive, minMinority } = config.balancedTargets;

  const positives: SnapTimeCandidate[] = [];
  const negatives: SnapTimeCandidate[] = [];

  for (const candidate of candidates) {
    const label = getLabelForHorizon(candidate, horizon);
    if (label === true) {
      positives.push(candidate);
    } else if (label === false) {
      negatives.push(candidate);
    }
  }

  const shuffledPositives = shuffleArray(positives, rand);
  const shuffledNegatives = shuffleArray(negatives, rand);

  const targetPositive = Math.min(
    Math.max(minPositive, Math.floor(targetCount / 2)),
    maxPositive
  );
  const targetNegative = targetCount - targetPositive;

  const effectiveMinMinority = Math.min(minMinority, Math.floor(targetCount / 3));

  let positiveCount = Math.min(targetPositive, shuffledPositives.length);
  let negativeCount = Math.min(targetNegative, shuffledNegatives.length);

  if (positiveCount < effectiveMinMinority && shuffledPositives.length >= effectiveMinMinority) {
    positiveCount = effectiveMinMinority;
    negativeCount = Math.min(targetCount - positiveCount, shuffledNegatives.length);
  }
  if (negativeCount < effectiveMinMinority && shuffledNegatives.length >= effectiveMinMinority) {
    negativeCount = effectiveMinMinority;
    positiveCount = Math.min(targetCount - negativeCount, shuffledPositives.length);
  }

  const selectedPositives = shuffledPositives.slice(0, positiveCount);
  const selectedNegatives = shuffledNegatives.slice(0, negativeCount);

  const selected = [...selectedPositives, ...selectedNegatives];

  return selected.sort((a, b) => a.snapTime - b.snapTime);
}

/**
 * Compute label distribution for a set of candidates.
 * @param candidates - Array of snap time candidates
 * @param horizon - Timeframe ID for label lookup
 * @returns Count of true and false labels
 */
function computeLabelDistribution(
  candidates: SnapTimeCandidate[],
  horizon: TimeframeId
): { trueCount: number; falseCount: number } {
  let trueCount = 0;
  let falseCount = 0;

  for (const candidate of candidates) {
    const label = getLabelForHorizon(candidate, horizon);
    if (label === true) {
      trueCount++;
    } else if (label === false) {
      falseCount++;
    }
  }

  return { trueCount, falseCount };
}

/**
 * Main sampling function that orchestrates strategies.
 * @param candidatePool - Full pool of snap time candidates
 * @param horizon - Timeframe ID for sampling
 * @param targetCount - Target number of samples to select
 * @param config - Sampling configuration
 * @param seed - Optional seed for deterministic random
 * @returns Sampling result with selected times and metadata
 */
export function selectSnapTimes(
  candidatePool: SnapTimeCandidate[],
  horizon: TimeframeId,
  targetCount: number,
  config: SamplingConfig,
  seed?: number
): SamplingResult {
  const random = seed === undefined ? Math.random : createSeededRandom(seed);

  let selected: SnapTimeCandidate[];
  let strategyUsed: 'proximity' | 'balanced';

  if (config.strategy === 'proximity') {
    const proximityFiltered = filterByProximity(candidatePool, horizon, config);
    const separated = enforceMinSeparation(proximityFiltered, horizon, config);
    selected = shuffleArray(separated, random).slice(0, targetCount);
    strategyUsed = 'proximity';
  } else if (config.strategy === 'balanced') {
    const separated = enforceMinSeparation(candidatePool, horizon, config);
    selected = sampleBalanced(separated, horizon, targetCount, config, random);
    strategyUsed = 'balanced';
  } else {
    const proximityFiltered = filterByProximity(candidatePool, horizon, config);
    const separatedProximity = enforceMinSeparation(proximityFiltered, horizon, config);

    if (separatedProximity.length >= targetCount) {
      selected = shuffleArray(separatedProximity, random).slice(0, targetCount);
      strategyUsed = 'proximity';
    } else {
      const separated = enforceMinSeparation(candidatePool, horizon, config);
      selected = sampleBalanced(separated, horizon, targetCount, config, random);
      strategyUsed = 'balanced';
    }
  }

  const selectedSnapTimes = selected
    .map((candidate) => candidate.snapTime)
    .sort((a, b) => a - b);

  const distribution: Record<TimeframeId, { trueCount: number; falseCount: number }> = {
    '15m': computeLabelDistribution(selected, '15m'),
    '1h': computeLabelDistribution(selected, '1h'),
    '4h': computeLabelDistribution(selected, '4h'),
    '24h': computeLabelDistribution(selected, '24h'),
  };

  return {
    selectedSnapTimes,
    candidatePool,
    strategyUsed,
    labelDistribution: distribution,
  };
}

/**
 * Compute distance to reference low for a candidate.
 * @param closeAtSnap - Close price at snap time
 * @param refLow - Reference low price
 * @returns Distance as a fraction (closeAtSnap - refLow) / refLow
 */
export function computeDistanceToRefLow(closeAtSnap: number, refLow: number): number {
  if (refLow <= 0) {
    return Infinity;
  }
  return (closeAtSnap - refLow) / refLow;
}

/**
 * Create a SnapTimeCandidate from raw data.
 * @param snapTime - Unix timestamp in milliseconds
 * @param closeAtSnap - Close price at snap time
 * @param refLow - Reference low price
 * @param labelByHorizon - Optional labels by horizon
 * @returns SnapTimeCandidate object
 */
export function createSnapTimeCandidate(
  snapTime: number,
  closeAtSnap: number,
  refLow: number,
  labelByHorizon?: Record<TimeframeId, boolean>
): SnapTimeCandidate {
  const candidate: SnapTimeCandidate = {
    snapTime,
    closeAtSnap,
    refLow,
    distanceToRefLow: computeDistanceToRefLow(closeAtSnap, refLow),
  };
  if (labelByHorizon !== undefined) {
    candidate.labelByHorizon = labelByHorizon;
  }
  return candidate;
}
