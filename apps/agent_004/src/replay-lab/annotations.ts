import { replayLabFetch } from './client';

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

interface AnnotationsResponse {
  symbol_id: string;
  annotations: Annotation[];
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
