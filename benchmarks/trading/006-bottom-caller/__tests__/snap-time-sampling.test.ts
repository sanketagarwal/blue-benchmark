import { describe, expect, it } from 'vitest';

import type { SamplingConfig, SnapTimeCandidate } from '../src/sampling/snap-time-sampling.js';
import {
  computeDistanceToRefLow,
  createSnapTimeCandidate,
  enforceMinSeparation,
  filterByProximity,
  sampleBalanced,
  selectSnapTimes,
} from '../src/sampling/snap-time-sampling.js';

function createTestConfig(overrides: Partial<SamplingConfig> = {}): SamplingConfig {
  return {
    strategy: 'both',
    proximityThresholds: { '15m': 0.004, '1h': 0.008, '4h': 0.015, '24h': 0.03 },
    balancedTargets: { minPositive: 10, maxPositive: 14, minMinority: 8 },
    minSeparationMinutes: { '15m': 30, '1h': 120, '4h': 360, '24h': 1440 },
    ...overrides,
  };
}

function createTestCandidate(
  snapTime: number,
  distanceToRefLow: number,
  label?: boolean
): SnapTimeCandidate {
  return {
    snapTime,
    closeAtSnap: 100,
    refLow: 100,
    distanceToRefLow,
    labelByHorizon: label !== undefined ? { '15m': label, '1h': label, '4h': label, '24h': label } : undefined,
  };
}

describe('computeDistanceToRefLow', () => {
  it('computes correct distance for price above refLow', () => {
    expect(computeDistanceToRefLow(102, 100)).toBeCloseTo(0.02, 6);
  });

  it('returns zero when closeAtSnap equals refLow', () => {
    expect(computeDistanceToRefLow(100, 100)).toBe(0);
  });

  it('returns negative for price below refLow', () => {
    expect(computeDistanceToRefLow(98, 100)).toBeCloseTo(-0.02, 6);
  });

  it('returns Infinity for zero refLow', () => {
    expect(computeDistanceToRefLow(100, 0)).toBe(Infinity);
  });

  it('returns Infinity for negative refLow', () => {
    expect(computeDistanceToRefLow(100, -10)).toBe(Infinity);
  });
});

describe('createSnapTimeCandidate', () => {
  it('creates candidate with computed distance', () => {
    const candidate = createSnapTimeCandidate(1000, 102, 100);
    expect(candidate.snapTime).toBe(1000);
    expect(candidate.closeAtSnap).toBe(102);
    expect(candidate.refLow).toBe(100);
    expect(candidate.distanceToRefLow).toBeCloseTo(0.02, 6);
    expect(candidate.labelByHorizon).toBeUndefined();
  });

  it('includes labelByHorizon when provided', () => {
    const labels = { '15m': true, '1h': false, '4h': true, '24h': false } as const;
    const candidate = createSnapTimeCandidate(1000, 102, 100, labels);
    expect(candidate.labelByHorizon).toEqual(labels);
  });
});

describe('filterByProximity', () => {
  const config = createTestConfig();

  it('keeps candidates within threshold', () => {
    const candidates = [
      createTestCandidate(1000, 0.002),
      createTestCandidate(2000, 0.003),
    ];
    const result = filterByProximity(candidates, '15m', config);
    expect(result).toHaveLength(2);
  });

  it('removes candidates outside threshold', () => {
    const candidates = [
      createTestCandidate(1000, 0.002),
      createTestCandidate(2000, 0.010),
    ];
    const result = filterByProximity(candidates, '15m', config);
    expect(result).toHaveLength(1);
    expect(result[0]?.snapTime).toBe(1000);
  });

  it('includes candidates exactly at threshold', () => {
    const candidates = [createTestCandidate(1000, 0.004)];
    const result = filterByProximity(candidates, '15m', config);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no candidates within threshold', () => {
    const candidates = [
      createTestCandidate(1000, 0.05),
      createTestCandidate(2000, 0.06),
    ];
    const result = filterByProximity(candidates, '15m', config);
    expect(result).toHaveLength(0);
  });

  it('uses correct threshold for different horizons', () => {
    const candidates = [createTestCandidate(1000, 0.010)];
    expect(filterByProximity(candidates, '15m', config)).toHaveLength(0);
    expect(filterByProximity(candidates, '1h', config)).toHaveLength(0);
    expect(filterByProximity(candidates, '4h', config)).toHaveLength(1);
  });
});

describe('enforceMinSeparation', () => {
  const config = createTestConfig();
  const msPerMinute = 60_000;

  it('returns empty array for empty input', () => {
    const result = enforceMinSeparation([], '15m', config);
    expect(result).toHaveLength(0);
  });

  it('keeps single candidate', () => {
    const candidates = [createTestCandidate(1000, 0.001)];
    const result = enforceMinSeparation(candidates, '15m', config);
    expect(result).toHaveLength(1);
  });

  it('removes candidates within separation threshold', () => {
    const candidates = [
      createTestCandidate(0, 0.001),
      createTestCandidate(15 * msPerMinute, 0.001),
    ];
    const result = enforceMinSeparation(candidates, '15m', config);
    expect(result).toHaveLength(1);
    expect(result[0]?.snapTime).toBe(0);
  });

  it('keeps candidates outside separation threshold', () => {
    const candidates = [
      createTestCandidate(0, 0.001),
      createTestCandidate(35 * msPerMinute, 0.001),
    ];
    const result = enforceMinSeparation(candidates, '15m', config);
    expect(result).toHaveLength(2);
  });

  it('keeps candidates exactly at separation threshold', () => {
    const candidates = [
      createTestCandidate(0, 0.001),
      createTestCandidate(30 * msPerMinute, 0.001),
    ];
    const result = enforceMinSeparation(candidates, '15m', config);
    expect(result).toHaveLength(2);
  });

  it('sorts candidates chronologically before filtering', () => {
    const candidates = [
      createTestCandidate(60 * msPerMinute, 0.001),
      createTestCandidate(0, 0.001),
      createTestCandidate(35 * msPerMinute, 0.001),
    ];
    const result = enforceMinSeparation(candidates, '15m', config);
    expect(result).toHaveLength(2);
    expect(result[0]?.snapTime).toBe(0);
    expect(result[1]?.snapTime).toBe(35 * msPerMinute);
  });

  it('uses correct separation for different horizons', () => {
    const candidates = [
      createTestCandidate(0, 0.001),
      createTestCandidate(60 * msPerMinute, 0.001),
    ];
    expect(enforceMinSeparation(candidates, '15m', config)).toHaveLength(2);
    expect(enforceMinSeparation(candidates, '1h', config)).toHaveLength(1);
  });
});

describe('sampleBalanced', () => {
  const config = createTestConfig();
  const seededRandom = (): number => 0.5;

  it('returns empty array for empty input', () => {
    const result = sampleBalanced([], '15m', 20, config, seededRandom);
    expect(result).toHaveLength(0);
  });

  it('achieves target minority count when possible', () => {
    const candidates: SnapTimeCandidate[] = [];
    for (let i = 0; i < 15; i++) {
      candidates.push(createTestCandidate(i * 1000, 0.001, true));
    }
    for (let i = 0; i < 15; i++) {
      candidates.push(createTestCandidate((i + 20) * 1000, 0.001, false));
    }

    const result = sampleBalanced(candidates, '15m', 20, config, seededRandom);
    const positives = result.filter((c) => c.labelByHorizon?.['15m'] === true);
    const negatives = result.filter((c) => c.labelByHorizon?.['15m'] === false);

    expect(positives.length).toBeGreaterThanOrEqual(8);
    expect(negatives.length).toBeGreaterThanOrEqual(8);
  });

  it('respects available candidates when insufficient', () => {
    const candidates = [
      createTestCandidate(1000, 0.001, true),
      createTestCandidate(2000, 0.001, false),
    ];

    const result = sampleBalanced(candidates, '15m', 20, config, seededRandom);
    expect(result).toHaveLength(2);
  });

  it('sorts results by snapTime', () => {
    const candidates: SnapTimeCandidate[] = [];
    for (let i = 0; i < 10; i++) {
      candidates.push(createTestCandidate((10 - i) * 1000, 0.001, i % 2 === 0));
    }

    const result = sampleBalanced(candidates, '15m', 6, config, seededRandom);
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      if (prev !== undefined && curr !== undefined) {
        expect(curr.snapTime).toBeGreaterThan(prev.snapTime);
      }
    }
  });

  it('ignores candidates without labels', () => {
    const candidates = [
      createTestCandidate(1000, 0.001, true),
      { snapTime: 2000, closeAtSnap: 100, refLow: 100, distanceToRefLow: 0.001 },
      createTestCandidate(3000, 0.001, false),
    ];

    const result = sampleBalanced(candidates, '15m', 3, config, seededRandom);
    expect(result.some((c) => c.snapTime === 2000)).toBe(false);
    expect(result).toHaveLength(2);
  });
});

describe('selectSnapTimes', () => {
  const msPerMinute = 60_000;

  it('uses proximity strategy when configured', () => {
    const config = createTestConfig({ strategy: 'proximity' });
    const candidates = [
      createTestCandidate(0, 0.001, true),
      createTestCandidate(60 * msPerMinute, 0.002, false),
      createTestCandidate(120 * msPerMinute, 0.010, true),
    ];

    const result = selectSnapTimes(candidates, '15m', 10, config, 12345);
    expect(result.strategyUsed).toBe('proximity');
    expect(result.selectedSnapTimes).not.toContain(120 * msPerMinute);
  });

  it('uses balanced strategy when configured', () => {
    const config = createTestConfig({ strategy: 'balanced' });
    const candidates: SnapTimeCandidate[] = [];
    for (let i = 0; i < 30; i++) {
      candidates.push(createTestCandidate(i * 60 * msPerMinute, 0.001, i < 15));
    }

    const result = selectSnapTimes(candidates, '15m', 10, config, 12345);
    expect(result.strategyUsed).toBe('balanced');
  });

  it('falls back to balanced in both strategy when proximity insufficient', () => {
    const config = createTestConfig({ strategy: 'both' });
    const candidates = [
      createTestCandidate(0, 0.001, true),
      createTestCandidate(60 * msPerMinute, 0.010, false),
    ];

    const result = selectSnapTimes(candidates, '15m', 10, config, 12345);
    expect(result.strategyUsed).toBe('balanced');
  });

  it('uses proximity in both strategy when sufficient candidates', () => {
    const config = createTestConfig({ strategy: 'both' });
    const candidates: SnapTimeCandidate[] = [];
    for (let i = 0; i < 30; i++) {
      candidates.push(createTestCandidate(i * 60 * msPerMinute, 0.002, i < 15));
    }

    const result = selectSnapTimes(candidates, '15m', 5, config, 12345);
    expect(result.strategyUsed).toBe('proximity');
  });

  it('returns selectedSnapTimes sorted chronologically', () => {
    const config = createTestConfig({ strategy: 'proximity' });
    const candidates = [
      createTestCandidate(200 * msPerMinute, 0.001),
      createTestCandidate(0, 0.001),
      createTestCandidate(100 * msPerMinute, 0.001),
    ];

    const result = selectSnapTimes(candidates, '15m', 10, config, 12345);
    for (let i = 1; i < result.selectedSnapTimes.length; i++) {
      const prev = result.selectedSnapTimes[i - 1];
      const curr = result.selectedSnapTimes[i];
      if (prev !== undefined && curr !== undefined) {
        expect(curr).toBeGreaterThan(prev);
      }
    }
  });

  it('includes label distribution in result', () => {
    const config = createTestConfig({ strategy: 'proximity' });
    const candidates = [
      createTestCandidate(0, 0.001, true),
      createTestCandidate(60 * msPerMinute, 0.001, false),
    ];

    const result = selectSnapTimes(candidates, '15m', 10, config, 12345);
    expect(result.labelDistribution).toBeDefined();
    expect(result.labelDistribution?.['15m']).toEqual({ trueCount: 1, falseCount: 1 });
  });

  it('returns original candidatePool', () => {
    const config = createTestConfig({ strategy: 'proximity' });
    const candidates = [createTestCandidate(0, 0.001)];

    const result = selectSnapTimes(candidates, '15m', 10, config, 12345);
    expect(result.candidatePool).toBe(candidates);
  });

  it('produces deterministic results with seed', () => {
    const config = createTestConfig({ strategy: 'proximity' });
    const candidates: SnapTimeCandidate[] = [];
    for (let i = 0; i < 20; i++) {
      candidates.push(createTestCandidate(i * 60 * msPerMinute, 0.001));
    }

    const result1 = selectSnapTimes(candidates, '15m', 5, config, 42);
    const result2 = selectSnapTimes(candidates, '15m', 5, config, 42);

    expect(result1.selectedSnapTimes).toEqual(result2.selectedSnapTimes);
  });
});
