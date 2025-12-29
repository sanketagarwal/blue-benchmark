import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BenchmarkLogger, createBenchmarkLogger } from '../src/index.js';

describe('BenchmarkLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('verbose mode suppression', () => {
    it('suppresses log() when verbose=false', () => {
      const logger = new BenchmarkLogger({ verbose: false });
      logger.log('test message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('suppresses logPredictions() when verbose=false', () => {
      const logger = new BenchmarkLogger({ verbose: false });
      logger.logPredictions({ key1: 0.5, key2: 0.8 });
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('suppresses logGroundTruth() when verbose=false', () => {
      const logger = new BenchmarkLogger({ verbose: false });
      logger.logGroundTruth({ key1: true, key2: false });
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('suppresses logScores() when verbose=false', () => {
      const logger = new BenchmarkLogger({ verbose: false });
      logger.logScores({ brier: 0.1, logLoss: 0.5, accuracy: 0.9 });
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('suppresses logMove() when verbose=false', () => {
      const logger = new BenchmarkLogger({ verbose: false });
      logger.logMove('e4', 'Pawn to e4');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('suppresses logGameState() when verbose=false', () => {
      const logger = new BenchmarkLogger({ verbose: false });
      logger.logGameState('Current board state');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('verbose mode output', () => {
    it('outputs log() when verbose=true', () => {
      const logger = new BenchmarkLogger({ verbose: true });
      logger.log('test message');
      expect(consoleSpy).toHaveBeenCalledWith('test message');
    });

    it('outputs logPredictions() when verbose=true', () => {
      const logger = new BenchmarkLogger({ verbose: true });
      logger.logPredictions({ key1: 0.5 });
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('Predictions');
      expect(calls).toContain('key1');
      expect(calls).toContain('0.500');
    });

    it('outputs logGroundTruth() when verbose=true', () => {
      const logger = new BenchmarkLogger({ verbose: true });
      logger.logGroundTruth({ key1: true, key2: false });
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('Ground Truth');
      expect(calls).toContain('key1');
      expect(calls).toContain('key2');
    });

    it('outputs logGroundTruth() with predictions when provided', () => {
      const logger = new BenchmarkLogger({ verbose: true });
      logger.logGroundTruth({ key1: true }, { key1: 0.75 });
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('predicted');
      expect(calls).toContain('0.75');
    });

    it('outputs logScores() when verbose=true', () => {
      const logger = new BenchmarkLogger({ verbose: true });
      logger.logScores({ brier: 0.123, logLoss: 0.456, accuracy: 0.789 });
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('Scores');
      expect(calls).toContain('Brier=0.123');
      expect(calls).toContain('LogLoss=0.456');
      expect(calls).toContain('Accuracy=78.9%');
    });

    it('outputs logMove() when verbose=true', () => {
      const logger = new BenchmarkLogger({ verbose: true });
      logger.logMove('e4', 'Pawn moved');
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('e4');
      expect(calls).toContain('Pawn moved');
    });

    it('outputs logGameState() when verbose=true', () => {
      const logger = new BenchmarkLogger({ verbose: true });
      logger.logGameState('Board state here');
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('Board state here');
    });
  });

  describe('always-output methods', () => {
    it('outputs header() regardless of verbose setting', () => {
      const logger = new BenchmarkLogger({ verbose: false });
      logger.header('Test Header');
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('Test Header');
    });

    it('outputs header() with underline', () => {
      const logger = new BenchmarkLogger({ verbose: false });
      logger.header('Test');
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      const secondCall = consoleSpy.mock.calls[1]?.[0] as string;
      expect(secondCall).toBe('====');
    });

    it('outputs summary() regardless of verbose setting', () => {
      const logger = new BenchmarkLogger({ verbose: false });
      logger.summary({ key1: 'value1', key2: 0.123 });
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('Results');
      expect(calls).toContain('key1');
      expect(calls).toContain('value1');
      expect(calls).toContain('key2');
      expect(calls).toContain('0.123');
    });
  });

  describe('spinner lifecycle', () => {
    it('starts spinner with text', () => {
      const logger = new BenchmarkLogger();
      // Spinner is created but we can't easily test ora directly
      // We verify it doesn't throw and can be updated
      expect(() => logger.startSpinner('Loading...')).not.toThrow();
    });

    it('updates spinner text', () => {
      const logger = new BenchmarkLogger();
      logger.startSpinner('Initial');
      expect(() => logger.updateSpinner('Updated')).not.toThrow();
    });

    it('succeeds spinner with optional text', () => {
      const logger = new BenchmarkLogger();
      logger.startSpinner('Loading...');
      expect(() => logger.succeedSpinner('Done!')).not.toThrow();
    });

    it('succeeds spinner without text', () => {
      const logger = new BenchmarkLogger();
      logger.startSpinner('Loading...');
      expect(() => logger.succeedSpinner()).not.toThrow();
    });

    it('fails spinner with optional text', () => {
      const logger = new BenchmarkLogger();
      logger.startSpinner('Loading...');
      expect(() => logger.failSpinner('Error!')).not.toThrow();
    });

    it('fails spinner without text', () => {
      const logger = new BenchmarkLogger();
      logger.startSpinner('Loading...');
      expect(() => logger.failSpinner()).not.toThrow();
    });

    it('handles updateSpinner when no spinner active', () => {
      const logger = new BenchmarkLogger();
      expect(() => logger.updateSpinner('text')).not.toThrow();
    });

    it('handles succeedSpinner when no spinner active', () => {
      const logger = new BenchmarkLogger();
      expect(() => logger.succeedSpinner('text')).not.toThrow();
    });

    it('handles failSpinner when no spinner active', () => {
      const logger = new BenchmarkLogger();
      expect(() => logger.failSpinner('text')).not.toThrow();
    });

    it('clears spinner reference after succeed', () => {
      const logger = new BenchmarkLogger();
      logger.startSpinner('Loading...');
      logger.succeedSpinner();
      // Second succeed should be a no-op (no active spinner)
      expect(() => logger.succeedSpinner()).not.toThrow();
    });

    it('clears spinner reference after fail', () => {
      const logger = new BenchmarkLogger();
      logger.startSpinner('Loading...');
      logger.failSpinner();
      // Second fail should be a no-op (no active spinner)
      expect(() => logger.failSpinner()).not.toThrow();
    });
  });

  describe('createBenchmarkLogger factory', () => {
    it('creates logger with default options', () => {
      const logger = createBenchmarkLogger();
      expect(logger).toBeInstanceOf(BenchmarkLogger);
      logger.log('test');
      // Default is verbose=false, so no output
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('creates verbose logger when true passed', () => {
      const logger = createBenchmarkLogger(true);
      expect(logger).toBeInstanceOf(BenchmarkLogger);
      logger.log('test');
      expect(consoleSpy).toHaveBeenCalledWith('test');
    });

    it('creates non-verbose logger when false passed', () => {
      const logger = createBenchmarkLogger(false);
      expect(logger).toBeInstanceOf(BenchmarkLogger);
      logger.log('test');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('default options', () => {
    it('defaults to verbose=false when no options provided', () => {
      const logger = new BenchmarkLogger();
      logger.log('test');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('defaults to verbose=false when empty options provided', () => {
      const logger = new BenchmarkLogger({});
      logger.log('test');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});
