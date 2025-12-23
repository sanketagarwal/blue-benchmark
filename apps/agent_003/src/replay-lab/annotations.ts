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

type BatchAnnotationResponse = Record<string, { timestamp: string }[]>;

export async function getGroundTruthBatch(
  symbolId: string,
  predictionTime: Date,
  predictionEndTime: Date
): Promise<GroundTruth> {
  const fromTime = predictionTime.toISOString();
  const toTime = predictionEndTime.toISOString();
  const sources = CONTRACT_IDS.join(',');

  const response = await replayLabFetch<BatchAnnotationResponse>(
    `/api/annotations/${symbolId}?sources=${sources}&from=${fromTime}&to=${toTime}`
  );

  const groundTruth: Record<string, boolean> = {};
  for (const contractId of CONTRACT_IDS) {
    // eslint-disable-next-line security/detect-object-injection -- contractId is from CONTRACT_IDS constant
    const annotations = response[contractId] ?? [];
    // eslint-disable-next-line security/detect-object-injection -- contractId is from CONTRACT_IDS constant
    groundTruth[contractId] = annotations.length > 0;
  }

  return groundTruth as GroundTruth;
}
