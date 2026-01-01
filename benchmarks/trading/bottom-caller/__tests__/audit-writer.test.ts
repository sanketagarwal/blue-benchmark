import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  initAuditFile,
  writeAuditRecord,
  getAuditFilePath,
  buildAuditRecord,
} from '../src/diagnostics/audit-writer.js';

import type { AuditRecord, BuildAuditRecordParams } from '../src/diagnostics/audit-writer.js';

function createTestRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    timestamp: '2024-01-15T10:00:00.000Z',
    roundNumber: 1,
    modelId: 'gpt-4-turbo',
    horizon: '15m',
    prediction: 0.75,
    hasBottomed: true,
    confidence: 0.75,
    candlesBack: 2,
    label: true,
    firstPivotAt: '2024-01-15T10:05:00.000Z',
    timeToPivotRatio: 0.33,
    logLoss: 0.287,
    brier: 0.0625,
    baselineRandom: 0.693,
    baselineTrivial: 0.693,
    deltaVsRandom: -0.406,
    deltaVsTrivial: -0.406,
    ...overrides,
  };
}

describe('audit-writer', () => {
  const testDir = tmpdir();
  let testFilePath: string;

  beforeEach(() => {
    testFilePath = join(testDir, `audit-test-${Date.now()}.jsonl`);
  });

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  describe('initAuditFile', () => {
    it('should create file if it does not exist', () => {
      expect(existsSync(testFilePath)).toBe(false);

      initAuditFile(testFilePath);

      expect(existsSync(testFilePath)).toBe(true);
      expect(readFileSync(testFilePath, 'utf8')).toBe('');
    });

    it('should not truncate existing file', () => {
      // Write some content first
      writeAuditRecord(createTestRecord(), testFilePath);
      const beforeContent = readFileSync(testFilePath, 'utf8');

      // Init should not truncate
      initAuditFile(testFilePath);

      const afterContent = readFileSync(testFilePath, 'utf8');
      expect(afterContent).toBe(beforeContent);
    });
  });

  describe('writeAuditRecord', () => {
    it('should write valid JSON line', () => {
      const record = createTestRecord();

      writeAuditRecord(record, testFilePath);

      const content = readFileSync(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0] as string);
      expect(parsed.timestamp).toBe('2024-01-15T10:00:00.000Z');
      expect(parsed.roundNumber).toBe(1);
      expect(parsed.modelId).toBe('gpt-4-turbo');
      expect(parsed.horizon).toBe('15m');
      expect(parsed.prediction).toBe(0.75);
    });

    it('should append multiple records', () => {
      writeAuditRecord(createTestRecord({ roundNumber: 1 }), testFilePath);
      writeAuditRecord(createTestRecord({ roundNumber: 2 }), testFilePath);
      writeAuditRecord(createTestRecord({ roundNumber: 3 }), testFilePath);

      const content = readFileSync(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      expect(JSON.parse(lines[0] as string).roundNumber).toBe(1);
      expect(JSON.parse(lines[1] as string).roundNumber).toBe(2);
      expect(JSON.parse(lines[2] as string).roundNumber).toBe(3);
    });

    it('should handle optional fields correctly', () => {
      const record = createTestRecord({
        candlesBack: undefined,
        firstPivotAt: undefined,
        timeToPivotRatio: undefined,
      });

      writeAuditRecord(record, testFilePath);

      const content = readFileSync(testFilePath, 'utf8');
      const parsed = JSON.parse(content.trim());

      expect(parsed.candlesBack).toBeUndefined();
      expect(parsed.firstPivotAt).toBeUndefined();
      expect(parsed.timeToPivotRatio).toBeUndefined();
    });

    it('should write all four horizons for a round', () => {
      const horizons = ['15m', '1h', '4h', '24h'] as const;

      for (const horizon of horizons) {
        writeAuditRecord(
          createTestRecord({ roundNumber: 1, horizon }),
          testFilePath
        );
      }

      const content = readFileSync(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(4);

      const parsedHorizons = lines.map(
        (line) => JSON.parse(line).horizon as string
      );
      expect(parsedHorizons).toEqual(['15m', '1h', '4h', '24h']);
    });

    it('should include baseline deltas', () => {
      const record = createTestRecord({
        logLoss: 0.5,
        baselineRandom: 0.693,
        baselineTrivial: 0.6,
        deltaVsRandom: -0.193,
        deltaVsTrivial: -0.1,
      });

      writeAuditRecord(record, testFilePath);

      const content = readFileSync(testFilePath, 'utf8');
      const parsed = JSON.parse(content.trim());

      expect(parsed.baselineRandom).toBe(0.693);
      expect(parsed.baselineTrivial).toBe(0.6);
      expect(parsed.deltaVsRandom).toBe(-0.193);
      expect(parsed.deltaVsTrivial).toBe(-0.1);
    });
  });

  describe('getAuditFilePath', () => {
    it('should return path in current working directory', () => {
      const path = getAuditFilePath();

      expect(path).toContain('benchmark-audit.jsonl');
      expect(path.startsWith('/')).toBe(true);
    });
  });
});

describe('buildAuditRecord', () => {
  const baseParams: BuildAuditRecordParams = {
    timestamp: new Date('2024-01-15T10:00:00Z'),
    roundNumber: 5,
    modelId: 'claude-3-opus',
    horizon: '1h',
    prediction: {
      hasBottomed: true,
      confidence: 0.8,
      candlesBack: 2,
    },
    groundTruth: {
      label: true,
      firstPivotAt: new Date('2024-01-15T10:30:00Z'),
      timeToPivotRatio: 0.5,
    },
    labelBaseRate: 0.4,
  };

  it('should build record with correct metadata', () => {
    const record = buildAuditRecord(baseParams);

    expect(record.timestamp).toBe('2024-01-15T10:00:00.000Z');
    expect(record.roundNumber).toBe(5);
    expect(record.modelId).toBe('claude-3-opus');
    expect(record.horizon).toBe('1h');
  });

  it('should convert prediction to probability correctly when hasBottomed is true', () => {
    const record = buildAuditRecord(baseParams);

    // hasBottomed=true, confidence=0.8 => probability = 0.8
    expect(record.prediction).toBe(0.8);
    expect(record.hasBottomed).toBe(true);
    expect(record.confidence).toBe(0.8);
  });

  it('should convert prediction to probability correctly when hasBottomed is false', () => {
    const params: BuildAuditRecordParams = {
      ...baseParams,
      prediction: {
        hasBottomed: false,
        confidence: 0.7,
        candlesBack: undefined,
      },
    };

    const record = buildAuditRecord(params);

    // hasBottomed=false, confidence=0.7 => probability = 1 - 0.7 = 0.3
    expect(record.prediction).toBeCloseTo(0.3, 5);
    expect(record.hasBottomed).toBe(false);
    expect(record.confidence).toBe(0.7);
  });

  it('should include ground truth fields', () => {
    const record = buildAuditRecord(baseParams);

    expect(record.label).toBe(true);
    expect(record.firstPivotAt).toBe('2024-01-15T10:30:00.000Z');
    expect(record.timeToPivotRatio).toBe(0.5);
  });

  it('should handle undefined ground truth fields', () => {
    const params: BuildAuditRecordParams = {
      ...baseParams,
      groundTruth: {
        label: false,
        firstPivotAt: undefined,
        timeToPivotRatio: undefined,
      },
    };

    const record = buildAuditRecord(params);

    expect(record.label).toBe(false);
    expect(record.firstPivotAt).toBeUndefined();
    expect(record.timeToPivotRatio).toBeUndefined();
  });

  it('should compute log loss correctly', () => {
    // p=0.8, label=true => LL = -log(0.8) = 0.223
    const record = buildAuditRecord(baseParams);

    expect(record.logLoss).toBeCloseTo(0.223, 2);
  });

  it('should compute brier score correctly', () => {
    // p=0.8, label=true => Brier = (0.8 - 1)^2 = 0.04
    const record = buildAuditRecord(baseParams);

    expect(record.brier).toBeCloseTo(0.04, 3);
  });

  it('should compute baseline comparisons', () => {
    const record = buildAuditRecord(baseParams);

    // Random baseline is log(2) = 0.693
    expect(record.baselineRandom).toBeCloseTo(0.693, 3);

    // Trivial baseline: logLoss(0.4, true) = -log(0.4) = 0.916
    expect(record.baselineTrivial).toBeCloseTo(0.916, 2);

    // Delta vs random: 0.223 - 0.693 = -0.470 (better than random)
    expect(record.deltaVsRandom).toBeCloseTo(-0.470, 2);

    // Delta vs trivial: 0.223 - 0.916 = -0.693 (better than trivial)
    expect(record.deltaVsTrivial).toBeCloseTo(-0.693, 2);
  });

  it('should handle high confidence wrong prediction', () => {
    const params: BuildAuditRecordParams = {
      ...baseParams,
      prediction: {
        hasBottomed: true,
        confidence: 0.95,
        candlesBack: 1,
      },
      groundTruth: {
        label: false,
        firstPivotAt: undefined,
        timeToPivotRatio: undefined,
      },
    };

    const record = buildAuditRecord(params);

    // p=0.95, label=false => LL = -log(1-0.95) = -log(0.05) = 2.996
    expect(record.logLoss).toBeCloseTo(2.996, 2);

    // Brier = (0.95 - 0)^2 = 0.9025
    expect(record.brier).toBeCloseTo(0.9025, 3);

    // Should be worse than random
    expect(record.deltaVsRandom).toBeGreaterThan(0);
  });
});
