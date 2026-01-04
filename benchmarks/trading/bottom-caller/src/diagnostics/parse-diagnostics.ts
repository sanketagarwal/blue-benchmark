/**
 * Parse and validation diagnostics for model outputs.
 *
 * CRITICAL RULE: If parsing fails for an example, do NOT fabricate a default prediction.
 * Mark the example as failed for that model and exclude it from scoring.
 */

import type { TimeframeId } from '../timeframe-config.js';

/**
 * Parse result for a single model response
 */
export interface ParseResult {
  /** Whether the raw output was successfully parsed as JSON */
  parseSuccess: boolean;
  /** Whether the parsed JSON passed schema validation */
  schemaValid: boolean;
  /** Which horizons are missing from the output (if any) */
  missingHorizons: TimeframeId[];
  /** Error message if parsing or validation failed */
  errorMessage?: string;
}

/**
 * Aggregate parse diagnostics for a model across all rounds
 */
export interface ModelParseDiagnostics {
  modelId: string;
  /** Number of successful parses */
  parseSuccessCount: number;
  /** Number of parse failures */
  parseFailCount: number;
  /** Number of schema validation failures */
  schemaFailCount: number;
  /** Total missing horizons across all rounds */
  missingHorizonCount: number;
  /** Per-horizon missing counts */
  missingByHorizon: Record<TimeframeId, number>;
  /** Breakdown by failure type */
  failuresByType?: {
    transport: number;
    timeout: number;
    parse: number;
    schema: number;
    other: number;
  };
}

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

/**
 * Create an empty parse diagnostics record
 * @param modelId - The model identifier
 * @returns A new ModelParseDiagnostics with zeroed counts
 */
export function createEmptyParseDiagnostics(
  modelId: string
): ModelParseDiagnostics {
  return {
    modelId,
    parseSuccessCount: 0,
    parseFailCount: 0,
    schemaFailCount: 0,
    missingHorizonCount: 0,
    missingByHorizon: { '15m': 0, '1h': 0, '4h': 0, '24h': 0 },
  };
}

/**
 * Record a parse result into the diagnostics
 * @param diagnostics - The diagnostics object to update
 * @param result - The parse result to record
 */
export function recordParseResult(
  diagnostics: ModelParseDiagnostics,
  result: ParseResult
): void {
  if (!result.parseSuccess) {
    diagnostics.parseFailCount++;
    return;
  }

  if (!result.schemaValid) {
    diagnostics.schemaFailCount++;
    return;
  }

  diagnostics.parseSuccessCount++;

  for (const horizon of result.missingHorizons) {
    diagnostics.missingHorizonCount++;
    // eslint-disable-next-line security/detect-object-injection -- horizon is typed TimeframeId
    diagnostics.missingByHorizon[horizon]++;
  }
}

/**
 * Check if a parse was fully successful (parsed, validated, all horizons present)
 * @param result - The parse result to check
 * @returns True if the parse was fully successful
 */
export function isFullySuccessful(result: ParseResult): boolean {
  return (
    result.parseSuccess && result.schemaValid && result.missingHorizons.length === 0
  );
}

/**
 * Try to extract JSON from a markdown code block
 * @param rawOutput - The raw string to search
 * @returns The parsed JSON or undefined if extraction failed
 */
function tryExtractFromCodeBlock(rawOutput: string): unknown {
  const codeBlockRegex = /```(?:json)?\s*([\S\s]*?)```/;
  const match = codeBlockRegex.exec(rawOutput);
  if (match?.[1] === undefined || match[1] === '') {
    return undefined;
  }
  try {
    return JSON.parse(match[1].trim()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Try to extract JSON object from surrounding text
 * @param rawOutput - The raw string to search
 * @returns The parsed JSON or undefined if extraction failed
 */
function tryExtractFromText(rawOutput: string): unknown {
  const objectRegex = /{[\S\s]*}/;
  const match = objectRegex.exec(rawOutput);
  if (match?.[0] === undefined || match[0] === '') {
    return undefined;
  }
  try {
    return JSON.parse(match[0]) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Check which horizons are missing from predictions
 * @param predictions - The predictions object to check
 * @returns Array of missing horizon IDs
 */
function findMissingHorizons(predictions: Record<string, unknown>): TimeframeId[] {
  const missing: TimeframeId[] = [];
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon is typed TimeframeId
    if (predictions[horizon] === undefined) {
      missing.push(horizon);
    }
  }
  return missing;
}

/**
 * Attempt to parse and validate a model response.
 * Returns a ParseResult with details about what succeeded/failed.
 *
 * @param rawOutput - Raw string output from the model
 * @param validateFunction - Schema validation function
 * @returns Parse result with success/failure details
 */
export function parseModelOutput(
  rawOutput: string,
  validateFunction: (parsed: unknown) => { success: boolean; data?: unknown; error?: string }
): ParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    const fromCodeBlock = tryExtractFromCodeBlock(rawOutput);
    const fromText = tryExtractFromText(rawOutput);
    const extracted = fromCodeBlock ?? fromText;

    if (extracted === undefined) {
      return {
        parseSuccess: false,
        schemaValid: false,
        missingHorizons: HORIZONS,
        errorMessage: 'No JSON found in response',
      };
    }
    parsed = extracted;
  }

  const validation = validateFunction(parsed);
  if (!validation.success) {
    return {
      parseSuccess: true,
      schemaValid: false,
      missingHorizons: HORIZONS,
      errorMessage: validation.error ?? 'Schema validation failed',
    };
  }

  const data = validation.data as Record<string, unknown>;
  const predictions = (data['predictions'] ?? data) as Record<string, unknown>;
  const missingHorizons = findMissingHorizons(predictions);

  if (missingHorizons.length > 0) {
    return {
      parseSuccess: true,
      schemaValid: true,
      missingHorizons,
      errorMessage: `Missing horizons: ${missingHorizons.join(', ')}`,
    };
  }

  return {
    parseSuccess: true,
    schemaValid: true,
    missingHorizons,
  };
}

/**
 * Format parse diagnostics as a human-readable string
 * @param diagnostics - The diagnostics to format
 * @returns Formatted string representation
 */
export function formatParseDiagnostics(
  diagnostics: ModelParseDiagnostics
): string {
  const total =
    diagnostics.parseSuccessCount +
    diagnostics.parseFailCount +
    diagnostics.schemaFailCount;
  const lines: string[] = [];

  lines.push(`Model: ${diagnostics.modelId}`);
  lines.push(`  Parse success: ${String(diagnostics.parseSuccessCount)}/${String(total)}`);
  lines.push(`  Parse fail: ${String(diagnostics.parseFailCount)}`);
  lines.push(`  Schema fail: ${String(diagnostics.schemaFailCount)}`);

  if (diagnostics.missingHorizonCount > 0) {
    lines.push(`  Missing horizons: ${String(diagnostics.missingHorizonCount)} total`);
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon is typed TimeframeId
      const count = diagnostics.missingByHorizon[horizon];
      if (count > 0) {
        lines.push(`    ${horizon}: ${String(count)}`);
      }
    }
  }

  return lines.join('\n');
}
