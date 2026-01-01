import { describe, it, expect } from 'vitest';
import { parseModelArgument } from '../src/cli-arguments.js';

describe('parseModelArgument', () => {
  it('should parse single --model flag with single value', () => {
    const result = parseModelArgument(['--model', 'mistral/ministral-3b-latest']);
    expect(result).toEqual(['mistral/ministral-3b-latest']);
  });

  it('should parse --model flag with comma-separated values', () => {
    const result = parseModelArgument(['--model', 'a,b,c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should parse multiple --model flags', () => {
    const result = parseModelArgument(['--model', 'a', '--model', 'b']);
    expect(result).toEqual(['a', 'b']);
  });

  it('should return undefined when no --model flag provided', () => {
    const result = parseModelArgument([]);
    expect(result).toBeUndefined();
  });

  it('should return undefined when only other flags are provided', () => {
    const result = parseModelArgument(['--quick', '--verbose']);
    expect(result).toBeUndefined();
  });

  it('should trim whitespace from model names', () => {
    const result = parseModelArgument(['--model', ' a , b , c ']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should handle mixed --model and other flags', () => {
    const result = parseModelArgument(['--quick', '--model', 'model-a', '--verbose', '--model', 'model-b']);
    expect(result).toEqual(['model-a', 'model-b']);
  });
});
