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

// Base API sources (API only accepts these, not full contract IDs)
const BASE_SOURCE_DUMP_SIMPLE = 'dump-simple';
const BASE_SOURCE_DUMP_VOL_ADJUSTED = 'dump-vol-adjusted';
const BASE_SOURCE_DUMP_DRAWDOWN = 'dump-drawdown';

// Map contract IDs to their base API source
const CONTRACT_TO_BASE_SOURCE: Record<ContractId, string> = {
  'dump-simple-15m-1pct': BASE_SOURCE_DUMP_SIMPLE,
  'dump-simple-15m-3pct': BASE_SOURCE_DUMP_SIMPLE,
  'dump-simple-15m-5pct': BASE_SOURCE_DUMP_SIMPLE,
  'dump-simple-1h-0.5pct': BASE_SOURCE_DUMP_SIMPLE,
  'dump-simple-1h-1pct': BASE_SOURCE_DUMP_SIMPLE,
  'dump-vol-adjusted-15m-z2': BASE_SOURCE_DUMP_VOL_ADJUSTED,
  'dump-vol-adjusted-1h-z2': BASE_SOURCE_DUMP_VOL_ADJUSTED,
  'dump-drawdown-1pct': BASE_SOURCE_DUMP_DRAWDOWN,
  'dump-drawdown-3pct': BASE_SOURCE_DUMP_DRAWDOWN,
};

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

// Check if annotation matches the specific contract ID
// The API returns annotations for the base source, we filter by the full annotator name
function annotationMatchesContract(annotation: Annotation, contractId: ContractId): boolean {
  return annotation.source === contractId;
}

async function getAnnotationsForContract(
  symbolId: string,
  contractId: ContractId,
  from: string,
  to: string
): Promise<boolean> {
  // eslint-disable-next-line security/detect-object-injection -- contractId is from CONTRACT_IDS constant
  const baseSource = CONTRACT_TO_BASE_SOURCE[contractId];
  const response = await replayLabFetch<AnnotationsResponse>(
    `/api/annotations/${symbolId}?source=${baseSource}&from=${from}&to=${to}`
  );
  // Filter annotations to find one matching the specific contract
  return response.annotations.some((annotation) => annotationMatchesContract(annotation, contractId));
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
      const hasAnnotation = await getAnnotationsForContract(
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
