import { replayLabFetch } from './client.js';

/** Fractal pivot detection parameters */
export interface FractalParams {
  L: number;
  candleTimeframe: string;
}

/** Zigzag pivot detection parameters */
export interface ZigzagParams {
  deviationPct: number;
  candleTimeframe: string;
}

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
  method: 'fractal' | 'zigzag';
  schema_version: string;
  payload: {
    direction: 'low' | 'high';
    price?: number;
    candleTimeframe?: string;
    params?: {
      L?: number;
      deviationPct?: number;
    };
  };
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

/** Response type from compute endpoint - uses camelCase and nested structure */
interface ComputeAnnotationPayload {
  kind: 'bottom' | 'top';
  method: 'fractal' | 'zigzag';
  price?: number;
  candleTimeframe?: string;
  params?: {
    L?: number;
    deviationPct?: number;
  };
  availability?: {
    availableAt: string;
    futureBarsUsed: number;
    mode: string;
  };
}

/** Raw annotation from compute endpoint - uses camelCase */
interface ComputeAnnotation {
  timeStart: string;
  timeEnd?: string | null;
  payload: ComputeAnnotationPayload;
}

interface ComputeAnnotationsResponse {
  symbol_id: string;
  annotations: ComputeAnnotation[];
}

/** Stored annotation format - uses snake_case and top-level method */
interface StoredAnnotation {
  id: string;
  time_start: string;
  time_end: string | null;
  type: string;
  method: 'fractal' | 'zigzag';
  schema_version: string;
  payload: {
    kind: 'bottom' | 'top';
    price?: number;
    candleTimeframe?: string;
    params?: {
      L?: number;
      deviationPct?: number;
    };
  };
  source: string;
}

/** Response type from stored annotations API - uses snake_case */
interface StoredAnnotationsResponse {
  symbol_id: string;
  annotations: StoredAnnotation[];
}

/**
 * Transform a compute endpoint annotation (camelCase) to LocalExtremaAnnotation
 * @param a - Raw annotation from the compute endpoint
 * @returns Transformed annotation with 'direction' field in payload
 */
function transformComputeAnnotation(a: ComputeAnnotation): LocalExtremaAnnotation {
  const payload: LocalExtremaAnnotation['payload'] = {
    direction: a.payload.kind === 'bottom' ? 'low' : 'high',
  };

  // Only add optional fields if they are defined (exactOptionalPropertyTypes)
  if (a.payload.price !== undefined) {
    payload.price = a.payload.price;
  }
  if (a.payload.candleTimeframe !== undefined) {
    payload.candleTimeframe = a.payload.candleTimeframe;
  }
  if (a.payload.params !== undefined) {
    payload.params = a.payload.params;
  }

  return {
    id: crypto.randomUUID(), // Generate ID for compute results
    time_start: a.timeStart,
    // eslint-disable-next-line unicorn/no-null -- LocalExtremaAnnotation interface requires null for time_end
    time_end: a.timeEnd ?? null,
    type: 'local_extrema',
    method: a.payload.method,
    schema_version: '1.0',
    payload,
    source: 'compute',
  };
}

/**
 * Transform a stored annotation (snake_case) to LocalExtremaAnnotation
 * @param a - Raw annotation from the stored annotations API
 * @returns Transformed annotation with 'direction' field in payload
 */
function transformStoredAnnotation(a: StoredAnnotation): LocalExtremaAnnotation {
  const payload: LocalExtremaAnnotation['payload'] = {
    direction: a.payload.kind === 'bottom' ? 'low' : 'high',
  };

  // Only add optional fields if they are defined (exactOptionalPropertyTypes)
  if (a.payload.price !== undefined) {
    payload.price = a.payload.price;
  }
  if (a.payload.candleTimeframe !== undefined) {
    payload.candleTimeframe = a.payload.candleTimeframe;
  }
  if (a.payload.params !== undefined) {
    payload.params = a.payload.params;
  }

  return {
    id: a.id,
    time_start: a.time_start,
    time_end: a.time_end,
    type: 'local_extrema',
    method: a.method,
    schema_version: a.schema_version,
    payload,
    source: a.source,
  };
}

/** Request body for the compute endpoint */
interface ComputeRequestBody {
  type: 'local_extrema';
  method: 'fractal' | 'zigzag';
  params: {
    L?: number;
    deviationPct?: number;
    candleTimeframe: string;
  };
  from: string;
  to: string;
  cachePolicy?: 'none' | 'ephemeral' | 'persist';
}

/**
 * Compute local_extrema annotations on-demand via the /compute endpoint.
 * This generates fresh annotations for time ranges where stored annotations don't exist.
 *
 * @param symbolId - Trading symbol
 * @param method - Detection method ('fractal' or 'zigzag')
 * @param params - Method parameters
 * @param from - Start of prediction window
 * @param to - End of prediction window
 * @returns Array of local extrema annotations
 */
export async function computeLocalExtremaAnnotations(
  symbolId: string,
  method: 'fractal' | 'zigzag',
  params: FractalParams | ZigzagParams,
  from: Date,
  to: Date
): Promise<LocalExtremaAnnotation[]> {
  // Build the request body for POST
  const requestBody: ComputeRequestBody = {
    type: 'local_extrema',
    method,
    params: {
      candleTimeframe: params.candleTimeframe,
    },
    from: from.toISOString(),
    to: to.toISOString(),
    cachePolicy: 'none',
  };

  // Add method-specific params
  if ('L' in params) {
    requestBody.params.L = params.L;
  } else {
    requestBody.params.deviationPct = params.deviationPct;
  }

  const path = `/api/annotations/${symbolId}/compute`;

  const response = await replayLabFetch<ComputeAnnotationsResponse>(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  // Transform compute endpoint response to match LocalExtremaAnnotation type
  // Compute endpoint returns camelCase with method in payload
  return response.annotations.map(transformComputeAnnotation);
}

/**
 * Fetch stored local_extrema annotations within a time window.
 * This is an internal function that only queries stored annotations.
 *
 * @param symbolId - Trading symbol
 * @param method - Detection method ('fractal' or 'zigzag')
 * @param params - Method parameters
 * @param from - Start of prediction window
 * @param to - End of prediction window (closesAt)
 * @param availableAt - Only return annotations confirmed by this time
 * @returns Array of local extrema annotations
 */
async function getStoredLocalExtremaAnnotations(
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

  const path = `/api/annotations/${symbolId}?${queryParams.toString()}`;
  const response = await replayLabFetch<StoredAnnotationsResponse>(path);

  // Transform and filter client-side (API doesn't support method/params query params)
  return response.annotations
    .filter((a) => {
      // Must match method (top-level field)
      if (a.method !== method) {
        return false;
      }

      // Must match candleTimeframe (in payload)
      if (a.payload.candleTimeframe !== params.candleTimeframe) {
        return false;
      }

      // Must match method-specific params
      if ('L' in params) {
        return a.payload.params?.L === params.L;
      }

      return a.payload.params?.deviationPct === params.deviationPct;
    })
    .map(transformStoredAnnotation);
}

/**
 * Fetch local_extrema annotations within a time window.
 * First tries stored annotations, then falls back to compute endpoint if none found.
 * Uses availableAt filter to prevent lookahead bias when fetching stored annotations.
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
  // First try stored annotations
  const storedAnnotations = await getStoredLocalExtremaAnnotations(
    symbolId,
    method,
    params,
    from,
    to,
    availableAt
  );

  if (storedAnnotations.length > 0) {
    return storedAnnotations;
  }

  // Fallback to compute endpoint when no stored annotations exist
  // eslint-disable-next-line no-console, no-restricted-syntax -- Debug log for compute endpoint fallback visibility
  console.log(
    `[annotations] No stored annotations found for ${symbolId} ${method}, using compute endpoint`
  );

  return await computeLocalExtremaAnnotations(symbolId, method, params, from, to);
}

/**
 * Filter annotations to only pivot LOWs
 * @param annotations - Array of local extrema annotations
 * @returns Filtered array containing only LOW direction annotations
 */
export function filterPivotLows(annotations: LocalExtremaAnnotation[]): LocalExtremaAnnotation[] {
  return annotations.filter(a => a.payload.direction === 'low');
}
