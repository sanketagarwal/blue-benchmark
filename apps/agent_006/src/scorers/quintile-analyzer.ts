/**
 * Quintile Analyzer for EV Calibration
 *
 * Buckets EV-PnL samples into quintiles by predicted EV to analyze
 * calibration across the prediction distribution. Well-calibrated
 * predictions should show similar mean EV and mean PnL per quintile.
 */
// eslint-disable-next-line eslint-comments/disable-enable-pair -- File-wide disable for domain term
/* eslint-disable unicorn/prevent-abbreviations -- EV is a standard financial term */

export interface EVPnLSample {
  predictedEV: number;
  realizedPnL: number;
}

export interface QuintileBucket {
  label: string;
  meanPredictedEV: number;
  meanRealizedPnL: number;
  evPnLGap: number;
  sampleCount: number;
}

const QUINTILE_LABELS = ['Q1 (lowest)', 'Q2', 'Q3', 'Q4', 'Q5 (highest)'];

/**
 * Bucket EV-PnL samples into quintiles by predicted EV.
 *
 * Samples are sorted by predicted EV and divided into 5 equal-sized buckets.
 * For each bucket, we compute mean predicted EV, mean realized PnL, and the gap.
 *
 * @param samples - Array of EV-PnL pairs
 * @returns Array of 5 quintile buckets
 */
export function bucketByQuintile(samples: EVPnLSample[]): QuintileBucket[] {
  const buckets: QuintileBucket[] = QUINTILE_LABELS.map((label) => ({
    label,
    meanPredictedEV: 0,
    meanRealizedPnL: 0,
    evPnLGap: 0,
    sampleCount: 0,
  }));

  if (samples.length === 0) {
    return buckets;
  }

  const sorted = [...samples].sort((a, b) => a.predictedEV - b.predictedEV);
  const samplesPerBucket = sorted.length / 5;

  for (const [index, sample] of sorted.entries()) {
    const bucketIndex = Math.min(Math.floor(index / samplesPerBucket), 4);
    // eslint-disable-next-line security/detect-object-injection -- bucketIndex is computed from known bounds [0-4]
    const bucket = buckets[bucketIndex];

    if (bucket !== undefined) {
      bucket.meanPredictedEV += sample.predictedEV;
      bucket.meanRealizedPnL += sample.realizedPnL;
      bucket.sampleCount++;
    }
  }

  for (const bucket of buckets) {
    if (bucket.sampleCount > 0) {
      bucket.meanPredictedEV /= bucket.sampleCount;
      bucket.meanRealizedPnL /= bucket.sampleCount;
      bucket.evPnLGap = bucket.meanPredictedEV - bucket.meanRealizedPnL;
    }
  }

  return buckets;
}

/**
 * Collect EV-PnL samples from scorer results.
 * Matches EV predictions with realized PnL by contract (side + horizon).
 *
 * @param evResults - Array of EV results with side, horizon, and ev
 * @param pnlResults - Array of PnL results with side, horizon, and pnl
 * @returns Array of matched EV-PnL sample pairs
 */
export function collectEVPnLSamples(
  evResults: { side: string; horizon: string; ev: number }[],
  pnlResults: { side: string; horizon: string; pnl: number }[]
): EVPnLSample[] {
  const samples: EVPnLSample[] = [];

  for (const evResult of evResults) {
    const matchingPnl = pnlResults.find(
      (p) => p.side === evResult.side && p.horizon === evResult.horizon
    );

    if (matchingPnl !== undefined) {
      samples.push({
        predictedEV: evResult.ev,
        realizedPnL: matchingPnl.pnl,
      });
    }
  }

  return samples;
}
