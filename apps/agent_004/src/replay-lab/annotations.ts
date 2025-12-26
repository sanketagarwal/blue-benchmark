import { replayLabFetch } from './client';

export const CONTRACT_IDS = [
  'dump-simple-15m-1pct',
  'dump-simple-15m-3pct',
  'dump-simple-15m-5pct',
  'dump-simple-1h-0.5pct',
  'dump-simple-1h-1pct',
  'dump-vol-adjusted-15m-z2',
  'dump-vol-adjusted-1h-z2',
  'dump-drawdown-1pct',
  'dump-drawdown-3pct',
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
