/**
 * Tests for the chart reading output schema.
 */
import { describe, expect, it } from 'vitest';

import {
  ChartReadingOutputSchema,
  MetaSchema,
  ActiveReadoutSchema,
  IndicatorReadoutSchema,
  DerivedFromActiveSchema,
  LastNVisualSchema,
  AnnotationsSchema,
} from '../src/output-schema.js';

describe('MetaSchema', () => {
  it('should accept valid meta', () => {
    const result = MetaSchema.safeParse({
      base_quote: 'Bitcoin / U.S. Dollar',
      venue: 'Coinbase',
      timeframe: '4h',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing fields', () => {
    const result = MetaSchema.safeParse({ base_quote: 'BTC/USD' });
    expect(result.success).toBe(false);
  });
});

describe('ActiveReadoutSchema', () => {
  it('should accept valid OHLC', () => {
    const result = ActiveReadoutSchema.safeParse({
      open: 87000,
      high: 87500,
      low: 86500,
      close: 87200,
    });
    expect(result.success).toBe(true);
  });
});

describe('IndicatorReadoutSchema', () => {
  it('should accept numeric values', () => {
    const result = IndicatorReadoutSchema.safeParse({
      vwap: 87211,
      bb_upper: 88000,
      bb_lower: 86000,
      bb_mid: 87000,
      sma20: 87100,
      ema20: 87150,
    });
    expect(result.success).toBe(true);
  });

  it('should accept NaN string', () => {
    const result = IndicatorReadoutSchema.safeParse({
      vwap: 'NaN',
      bb_upper: null,
      bb_lower: null,
      bb_mid: null,
      sma20: null,
      ema20: null,
    });
    expect(result.success).toBe(true);
  });

  it('should accept null for missing indicators', () => {
    const result = IndicatorReadoutSchema.safeParse({
      vwap: null,
      bb_upper: null,
      bb_lower: null,
      bb_mid: null,
      sma20: null,
      ema20: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('DerivedFromActiveSchema', () => {
  it('should accept valid derived fields', () => {
    const result = DerivedFromActiveSchema.safeParse({
      candle_direction: 'bull',
      range: 1000,
      body: 200,
      upper_wick: 300,
      lower_wick: 500,
      close_vs_vwap: 'above',
      close_within_bb: true,
    });
    expect(result.success).toBe(true);
  });

  it('should accept doji candle', () => {
    const result = DerivedFromActiveSchema.safeParse({
      candle_direction: 'doji',
      range: 100,
      body: 0,
      upper_wick: 50,
      lower_wick: 50,
      close_vs_vwap: 'equal',
      close_within_bb: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('LastNVisualSchema', () => {
  it('should accept valid visual data', () => {
    const result = LastNVisualSchema.safeParse({
      n: 10,
      bull_bear_sequence: 'GGRRGGRRGG',
      idx_max_high: 3,
      idx_min_low: 7,
      idx_max_volume: 2,
      idx_max_range: 5,
    });
    expect(result.success).toBe(true);
  });

  it('should reject wrong sequence length', () => {
    const result = LastNVisualSchema.safeParse({
      n: 10,
      bull_bear_sequence: 'GGRR', // too short
      idx_max_high: 0,
      idx_min_low: 0,
      idx_max_volume: 0,
      idx_max_range: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid sequence characters', () => {
    const result = LastNVisualSchema.safeParse({
      n: 10,
      bull_bear_sequence: 'GGRRGGRRGA', // A is invalid
      idx_max_high: 0,
      idx_min_low: 0,
      idx_max_volume: 0,
      idx_max_range: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject out of range indices', () => {
    const result = LastNVisualSchema.safeParse({
      n: 10,
      bull_bear_sequence: 'GGRRGGRRGG',
      idx_max_high: 10, // should be 0-9
      idx_min_low: 0,
      idx_max_volume: 0,
      idx_max_range: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('AnnotationsSchema', () => {
  it('should accept valid annotations', () => {
    const result = AnnotationsSchema.safeParse({
      local_extrema_text_count: 5,
      marker_count_total: 8,
      marker_count_highs: 4,
      marker_count_lows: 4,
    });
    expect(result.success).toBe(true);
  });

  it('should accept null for text count', () => {
    const result = AnnotationsSchema.safeParse({
      local_extrema_text_count: null,
      marker_count_total: 0,
      marker_count_highs: 0,
      marker_count_lows: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe('ChartReadingOutputSchema', () => {
  it('should accept complete valid output', () => {
    const result = ChartReadingOutputSchema.safeParse({
      meta: {
        base_quote: 'Bitcoin / U.S. Dollar',
        venue: 'Coinbase',
        timeframe: '4h',
      },
      active_readout: {
        open: 87000,
        high: 87500,
        low: 86500,
        close: 87200,
      },
      indicator_readout: {
        vwap: 87211,
        bb_upper: 88000,
        bb_lower: 86000,
        bb_mid: 87000,
        sma20: 87100,
        ema20: 87150,
      },
      derived_from_active: {
        candle_direction: 'bull',
        range: 1000,
        body: 200,
        upper_wick: 300,
        lower_wick: 500,
        close_vs_vwap: 'above',
        close_within_bb: true,
      },
      last_n_visual: {
        n: 10,
        bull_bear_sequence: 'GGRRGGRRGG',
        idx_max_high: 3,
        idx_min_low: 7,
        idx_max_volume: 2,
        idx_max_range: 5,
      },
      annotations: {
        local_extrema_text_count: 5,
        marker_count_total: 8,
        marker_count_highs: 4,
        marker_count_lows: 4,
      },
    });
    expect(result.success).toBe(true);
  });
});

