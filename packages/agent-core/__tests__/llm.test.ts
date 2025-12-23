import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLLMClient, getLLMClient, getModelId, MODEL_CONTEXT_WINDOWS } from '../src/llm.js';

describe('llm', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createLLMClient', () => {
    it('throws error when baseUrl is empty', () => {
      expect(() =>
        createLLMClient({ baseUrl: '', apiKey: 'test-key' })
      ).toThrow('AI Gateway base URL is required');
    });

    it('throws error when apiKey is empty', () => {
      expect(() =>
        createLLMClient({ baseUrl: 'https://api.example.com', apiKey: '' })
      ).toThrow('AI Gateway API key is required');
    });

    it('returns client when both baseUrl and apiKey provided', () => {
      const client = createLLMClient({
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
      });
      expect(client).toBeDefined();
      expect(typeof client).toBe('function');
    });
  });

  describe('getLLMClient', () => {
    it('throws error when AI_GATEWAY_BASE_URL not set', () => {
      delete process.env['AI_GATEWAY_BASE_URL'];
      process.env['AI_GATEWAY_API_KEY'] = 'test-key';

      expect(() => getLLMClient()).toThrow('AI_GATEWAY_BASE_URL environment variable is required');
    });

    it('throws error when AI_GATEWAY_API_KEY not set', () => {
      process.env['AI_GATEWAY_BASE_URL'] = 'https://api.example.com';
      delete process.env['AI_GATEWAY_API_KEY'];

      expect(() => getLLMClient()).toThrow('AI_GATEWAY_API_KEY environment variable is required');
    });

    it('returns client when both environment variables set', () => {
      process.env['AI_GATEWAY_BASE_URL'] = 'https://api.example.com';
      process.env['AI_GATEWAY_API_KEY'] = 'test-key';

      const client = getLLMClient();
      expect(client).toBeDefined();
    });
  });

  describe('getModelId', () => {
    it('throws error when MODEL_ID not set', () => {
      delete process.env['MODEL_ID'];

      expect(() => getModelId()).toThrow('MODEL_ID environment variable is required');
    });

    it('returns model ID when environment variable set', () => {
      process.env['MODEL_ID'] = 'openai/gpt-4o';

      const modelId = getModelId();
      expect(modelId).toBe('openai/gpt-4o');
    });
  });

  describe('MODEL_CONTEXT_WINDOWS', () => {
    it('has correct context windows for known models', () => {
      expect(MODEL_CONTEXT_WINDOWS['openai/gpt-4o']).toBe(128_000);
      expect(MODEL_CONTEXT_WINDOWS['openai/gpt-4o-mini']).toBe(128_000);
      expect(MODEL_CONTEXT_WINDOWS['deepseek/deepseek-v3.2']).toBe(128_000);
      expect(MODEL_CONTEXT_WINDOWS['anthropic/claude-sonnet-4']).toBe(200_000);
    });
  });
});
