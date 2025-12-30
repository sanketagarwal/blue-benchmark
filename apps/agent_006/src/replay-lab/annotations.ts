import { replayLabFetch } from './client.js';

import type { FractalParams, ZigzagParams } from '../horizon-config.js';

/**
 * Fill probability contract IDs for market-making predictions.
 * Note: Ground truth for these contracts is typically computed via fill-checker.ts
 * rather than fetched from annotations API.
 */
export const CONTRACT_IDS = [
  'bid-fill-1m',
  'bid-fill-5m',
  'bid-fill-15m',
  'ask-fill-1m',
  'ask-fill-5m',
  'ask-fill-15m',
] as const;

export type ContractId = (typeof CONTRACT_IDS)[number];

export type GroundTruth = Record<ContractId, boolean>;

interface Annotation {
  id: string;
  time_start: string;
  time_end: string | null;
  type: string;
  schema_version: string;
  payload: Record<string, unknown>;
  source: string;
}

export interface LocalExtremaAnnotation {
  id: string;
  time_start: string;
  time_end: string | null;
  type: 'local_extrema';
  schema_version: string;
  payload: {
    direction: 'low' | 'high';
    price?: number;
  };
  source: string;
}

interface AnnotationsResponse {
  symbol_id: string;
  annotations: Annotation[];
}

interface LocalExtremaAnnotationsResponse {
  symbol_id: string;
  annotations: LocalExtremaAnnotation[];
}

async function getAnnotationsForSource(
  symbolId: string,
  source: string,
  from: string,
  to: string
): Promise<boolean> {
  const response = await replayLabFetch<AnnotationsResponse>(
    `/api/annotations/${symbolId}?source=${source}&from=${from}&to=${to}&limit=1`
  );
  return response.annotations.length > 0;
}

/**
 * Fetches ground truth from annotations API.
 * Note: For fill probability contracts, prefer using computeFillGroundTruth()
 * from fill-checker.ts with actual trade data.
 * @param symbolId - The trading symbol identifier
 * @param predictionTime - Start of the prediction window
 * @param predictionEndTime - End of the prediction window
 * @returns Ground truth for all fill contracts
 */
export async function getGroundTruthBatch(
  symbolId: string,
  predictionTime: Date,
  predictionEndTime: Date
): Promise<GroundTruth> {
  const fromTime = predictionTime.toISOString();
  const toTime = predictionEndTime.toISOString();

  // Fetch all contract annotations in parallel
  const results = await Promise.all(
    CONTRACT_IDS.map(async (contractId) => {
      const hasAnnotation = await getAnnotationsForSource(
        symbolId,
        contractId,
        fromTime,
        toTime
      );
      return [contractId, hasAnnotation] as const;
    })
  );

  const groundTruth: Record<string, boolean> = {};
  for (const [contractId, hasAnnotation] of results) {
    // eslint-disable-next-line security/detect-object-injection -- contractId is from CONTRACT_IDS constant
    groundTruth[contractId] = hasAnnotation;
  }

  return groundTruth as GroundTruth;
}

/**
 * Fetch local_extrema annotations within a time window.
 * Uses availableAt filter to prevent lookahead bias.
 *
 * @param symbolId - Trading symbol
 * @param method - Detection method ('fractal' or 'zigzag')
 * @param params - Method parameters
 * @param from - Start of prediction window
 * @param to - End of prediction window (closesAt)
 * @param availableAt - Only return annotations confirmed by this time
 * @returns Array of local extrema annotations
 */
export async function getLocalExtremaAnnotations(
  symbolId: string,
  method: 'fractal' | 'zigzag',
  params: FractalParams | ZigzagParams,
  from: Date,
  to: Date,
  availableAt: Date
): Promise<LocalExtremaAnnotation[]> {
  const queryParams = new URLSearchParams({
    type: 'local_extrema',
    method,
    from: from.toISOString(),
    to: to.toISOString(),
    availableAt: availableAt.toISOString(),
  });

  // Add method-specific params
  if ('L' in params) {
    queryParams.set('L', String(params.L));
    queryParams.set('candleTimeframe', params.candleTimeframe);
  } else {
    queryParams.set('deviationPct', String(params.deviationPct));
    queryParams.set('candleTimeframe', params.candleTimeframe);
  }

  const path = `/api/annotations/${symbolId}?${queryParams.toString()}`;
  const response = await replayLabFetch<LocalExtremaAnnotationsResponse>(path);

  return response.annotations;
}

/**
 * Filter annotations to only pivot LOWs
 * @param annotations - Array of local extrema annotations
 * @returns Filtered array containing only LOW direction annotations
 */
export function filterPivotLows(annotations: LocalExtremaAnnotation[]): LocalExtremaAnnotation[] {
  return annotations.filter(a => a.payload.direction === 'low');
}
