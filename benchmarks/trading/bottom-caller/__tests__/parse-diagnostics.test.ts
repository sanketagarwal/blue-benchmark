import { describe, it, expect } from 'vitest';
import {
  createEmptyParseDiagnostics,
  formatParseDiagnostics,
  isFullySuccessful,
  parseModelOutput,
  recordParseResult,
  type ModelParseDiagnostics,
  type ParseResult,
} from '../src/diagnostics/parse-diagnostics.js';

describe('parseModelOutput', () => {
  const validValidator = (parsed: unknown) => {
    const obj = parsed as Record<string, unknown>;
    if (obj['15m'] && obj['1h'] && obj['4h'] && obj['24h']) {
      return { success: true, data: parsed };
    }
    return { success: true, data: { predictions: parsed } };
  };

  const invalidValidator = () => ({ success: false, error: 'Invalid schema' });

  it('parses valid JSON directly', () => {
    const rawOutput = JSON.stringify({
      '15m': { noNewLow: true, confidence: 0.8 },
      '1h': { noNewLow: false, confidence: 0.6 },
      '4h': { noNewLow: true, confidence: 0.9 },
      '24h': { noNewLow: false, confidence: 0.7 },
    });

    const result = parseModelOutput(rawOutput, validValidator);

    expect(result.parseSuccess).toBe(true);
    expect(result.schemaValid).toBe(true);
    expect(result.missingHorizons).toEqual([]);
    expect(result.errorMessage).toBeUndefined();
  });

  it('parses JSON from markdown code block', () => {
    const rawOutput = `Here's my analysis:

\`\`\`json
{
  "15m": { "noNewLow": true, "confidence": 0.8 },
  "1h": { "noNewLow": false, "confidence": 0.6 },
  "4h": { "noNewLow": true, "confidence": 0.9 },
  "24h": { "noNewLow": false, "confidence": 0.7 }
}
\`\`\`

Based on the chart patterns...`;

    const result = parseModelOutput(rawOutput, validValidator);

    expect(result.parseSuccess).toBe(true);
    expect(result.schemaValid).toBe(true);
    expect(result.missingHorizons).toEqual([]);
  });

  it('parses embedded JSON object from text', () => {
    const rawOutput = `After analyzing the chart, I predict: {"15m": {"noNewLow": true, "confidence": 0.8}, "1h": {"noNewLow": false, "confidence": 0.6}, "4h": {"noNewLow": true, "confidence": 0.9}, "24h": {"noNewLow": false, "confidence": 0.7}} - this is based on support levels.`;

    const result = parseModelOutput(rawOutput, validValidator);

    expect(result.parseSuccess).toBe(true);
    expect(result.schemaValid).toBe(true);
    expect(result.missingHorizons).toEqual([]);
  });

  it('returns parseSuccess=false for invalid JSON', () => {
    const rawOutput = 'This is just plain text with no JSON at all.';

    const result = parseModelOutput(rawOutput, validValidator);

    expect(result.parseSuccess).toBe(false);
    expect(result.schemaValid).toBe(false);
    expect(result.missingHorizons).toEqual(['15m', '1h', '4h', '24h']);
    expect(result.errorMessage).toBe('No JSON found in response');
  });

  it('returns parseSuccess=false for malformed JSON in code block', () => {
    const rawOutput = `\`\`\`json
{ invalid json here
\`\`\``;

    const result = parseModelOutput(rawOutput, validValidator);

    expect(result.parseSuccess).toBe(false);
    expect(result.errorMessage).toBe('No JSON found in response');
  });

  it('returns parseSuccess=false for malformed embedded JSON', () => {
    const rawOutput = 'Here is my answer: { broken: json, }';

    const result = parseModelOutput(rawOutput, validValidator);

    expect(result.parseSuccess).toBe(false);
    expect(result.errorMessage).toBe('No JSON found in response');
  });

  it('detects missing horizons', () => {
    const rawOutput = JSON.stringify({
      '15m': { noNewLow: true, confidence: 0.8 },
      '4h': { noNewLow: true, confidence: 0.9 },
    });

    const result = parseModelOutput(rawOutput, validValidator);

    expect(result.parseSuccess).toBe(true);
    expect(result.schemaValid).toBe(true);
    expect(result.missingHorizons).toEqual(['1h', '24h']);
    expect(result.errorMessage).toBe('Missing horizons: 1h, 24h');
  });

  it('returns schemaValid=false when validation fails', () => {
    const rawOutput = JSON.stringify({
      '15m': { noNewLow: true, confidence: 0.8 },
      '1h': { noNewLow: false, confidence: 0.6 },
      '4h': { noNewLow: true, confidence: 0.9 },
      '24h': { noNewLow: false, confidence: 0.7 },
    });

    const result = parseModelOutput(rawOutput, invalidValidator);

    expect(result.parseSuccess).toBe(true);
    expect(result.schemaValid).toBe(false);
    expect(result.errorMessage).toBe('Invalid schema');
  });
});

describe('recordParseResult', () => {
  it('increments parseFailCount on parse failure', () => {
    const diagnostics = createEmptyParseDiagnostics('test-model');
    const result: ParseResult = {
      parseSuccess: false,
      schemaValid: false,
      missingHorizons: ['15m', '1h', '4h', '24h'],
    };

    recordParseResult(diagnostics, result);

    expect(diagnostics.parseFailCount).toBe(1);
    expect(diagnostics.parseSuccessCount).toBe(0);
    expect(diagnostics.schemaFailCount).toBe(0);
  });

  it('increments schemaFailCount on schema failure', () => {
    const diagnostics = createEmptyParseDiagnostics('test-model');
    const result: ParseResult = {
      parseSuccess: true,
      schemaValid: false,
      missingHorizons: ['15m', '1h', '4h', '24h'],
    };

    recordParseResult(diagnostics, result);

    expect(diagnostics.parseFailCount).toBe(0);
    expect(diagnostics.schemaFailCount).toBe(1);
    expect(diagnostics.parseSuccessCount).toBe(0);
  });

  it('increments parseSuccessCount and missing horizon counts on success', () => {
    const diagnostics = createEmptyParseDiagnostics('test-model');
    const result: ParseResult = {
      parseSuccess: true,
      schemaValid: true,
      missingHorizons: ['1h', '24h'],
    };

    recordParseResult(diagnostics, result);

    expect(diagnostics.parseSuccessCount).toBe(1);
    expect(diagnostics.missingHorizonCount).toBe(2);
    expect(diagnostics.missingByHorizon['1h']).toBe(1);
    expect(diagnostics.missingByHorizon['24h']).toBe(1);
    expect(diagnostics.missingByHorizon['15m']).toBe(0);
    expect(diagnostics.missingByHorizon['4h']).toBe(0);
  });

  it('accumulates counts across multiple results', () => {
    const diagnostics = createEmptyParseDiagnostics('test-model');

    recordParseResult(diagnostics, {
      parseSuccess: true,
      schemaValid: true,
      missingHorizons: [],
    });
    recordParseResult(diagnostics, {
      parseSuccess: true,
      schemaValid: true,
      missingHorizons: ['15m'],
    });
    recordParseResult(diagnostics, {
      parseSuccess: false,
      schemaValid: false,
      missingHorizons: ['15m', '1h', '4h', '24h'],
    });

    expect(diagnostics.parseSuccessCount).toBe(2);
    expect(diagnostics.parseFailCount).toBe(1);
    expect(diagnostics.missingHorizonCount).toBe(1);
    expect(diagnostics.missingByHorizon['15m']).toBe(1);
  });
});

describe('isFullySuccessful', () => {
  it('returns true when all conditions met', () => {
    const result: ParseResult = {
      parseSuccess: true,
      schemaValid: true,
      missingHorizons: [],
    };

    expect(isFullySuccessful(result)).toBe(true);
  });

  it('returns false when parseSuccess is false', () => {
    const result: ParseResult = {
      parseSuccess: false,
      schemaValid: true,
      missingHorizons: [],
    };

    expect(isFullySuccessful(result)).toBe(false);
  });

  it('returns false when schemaValid is false', () => {
    const result: ParseResult = {
      parseSuccess: true,
      schemaValid: false,
      missingHorizons: [],
    };

    expect(isFullySuccessful(result)).toBe(false);
  });

  it('returns false when horizons are missing', () => {
    const result: ParseResult = {
      parseSuccess: true,
      schemaValid: true,
      missingHorizons: ['15m'],
    };

    expect(isFullySuccessful(result)).toBe(false);
  });
});

describe('createEmptyParseDiagnostics', () => {
  it('creates diagnostics with zeroed counts', () => {
    const diagnostics = createEmptyParseDiagnostics('my-model');

    expect(diagnostics.modelId).toBe('my-model');
    expect(diagnostics.parseSuccessCount).toBe(0);
    expect(diagnostics.parseFailCount).toBe(0);
    expect(diagnostics.schemaFailCount).toBe(0);
    expect(diagnostics.missingHorizonCount).toBe(0);
    expect(diagnostics.missingByHorizon).toEqual({
      '15m': 0,
      '1h': 0,
      '4h': 0,
      '24h': 0,
    });
  });
});

describe('formatParseDiagnostics', () => {
  it('formats diagnostics with no missing horizons', () => {
    const diagnostics: ModelParseDiagnostics = {
      modelId: 'gpt-4o',
      parseSuccessCount: 10,
      parseFailCount: 2,
      schemaFailCount: 1,
      missingHorizonCount: 0,
      missingByHorizon: { '15m': 0, '1h': 0, '4h': 0, '24h': 0 },
    };

    const output = formatParseDiagnostics(diagnostics);

    expect(output).toContain('Model: gpt-4o');
    expect(output).toContain('Parse success: 10/13');
    expect(output).toContain('Parse fail: 2');
    expect(output).toContain('Schema fail: 1');
    expect(output).not.toContain('Missing horizons');
  });

  it('formats diagnostics with missing horizons', () => {
    const diagnostics: ModelParseDiagnostics = {
      modelId: 'claude-3',
      parseSuccessCount: 8,
      parseFailCount: 0,
      schemaFailCount: 0,
      missingHorizonCount: 5,
      missingByHorizon: { '15m': 2, '1h': 0, '4h': 3, '24h': 0 },
    };

    const output = formatParseDiagnostics(diagnostics);

    expect(output).toContain('Model: claude-3');
    expect(output).toContain('Missing horizons: 5 total');
    expect(output).toContain('15m: 2');
    expect(output).toContain('4h: 3');
    expect(output).not.toContain('1h:');
    expect(output).not.toContain('24h:');
  });
});
