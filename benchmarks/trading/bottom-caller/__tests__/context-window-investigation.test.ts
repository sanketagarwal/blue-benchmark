import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createBottomCaller,
  setBottomCallerContext,
  clearBottomCallerContext,
  type BottomCallerContext,
} from '../src/bottom-caller.js';

describe('context-window-investigation', () => {
  const mockContext: BottomCallerContext = {
    chartByHorizon: {
      '15m': 'https://example.com/chart-15m.png',
      '1h': 'https://example.com/chart-1h.png',
      '4h': 'https://example.com/chart-4h.png',
      '24h': 'https://example.com/chart-24h.png',
    },
    currentTime: '2025-01-01T00:00:00Z',
    symbolId: 'COINBASE_SPOT_BTC_USD',
  };

  beforeEach(() => {
    setBottomCallerContext(mockContext);
  });

  afterEach(() => {
    clearBottomCallerContext();
  });

  it('measures prompt size for Gemini 3 Pro Preview on round 1', () => {
    const modelId = 'google/gemini-3-pro-preview';
    const agent = createBottomCaller(modelId);

    // Round 1 with no previous output or compaction
    const prompt = agent.definition.buildRoundPrompt({ roundNumber: 1 });

    // Measure character count
    const charCount = prompt.length;

    // Rough token estimate: ~4 chars per token (conservative for English text)
    // URLs might be different, but let's see
    const estimatedTokens = Math.ceil(charCount / 4);

    // Log the measurements
    console.log('\n=== Prompt Size Analysis ===');
    console.log(`Model: ${modelId}`);
    console.log(`Character count: ${charCount.toLocaleString()}`);
    console.log(`Estimated tokens (chars/4): ${estimatedTokens.toLocaleString()}`);
    console.log(`\nFirst 500 chars:\n${prompt.slice(0, 500)}`);
    console.log(`\n... (${charCount - 1000} chars omitted) ...\n`);
    console.log(`Last 500 chars:\n${prompt.slice(-500)}`);
    console.log('\n=== URL Analysis ===');
    console.log(`Chart URLs present: ${Object.values(mockContext.chartByHorizon).length}`);
    console.log('URLs:');
    for (const [horizon, url] of Object.entries(mockContext.chartByHorizon)) {
      console.log(`  ${horizon}: ${url}`);
    }
    console.log('\nNote: These are mock URLs. Real URLs from charts.ts may be longer.');
    console.log('If AI SDK converts URLs to embedded images, token count would be MUCH higher.');
    console.log('4 images at 1200x800 could be 10K+ tokens EACH.');

    // Basic assertions
    expect(charCount).toBeGreaterThan(0);
    expect(charCount).toBeLessThan(10000); // Sanity check - text should be < 10KB
    expect(prompt).toContain('COINBASE_SPOT_BTC_USD');
    expect(prompt).toContain('chart-15m.png');
    expect(prompt).toContain('chart-1h.png');
    expect(prompt).toContain('chart-4h.png');
    expect(prompt).toContain('chart-24h.png');
  });

  it('checks if prompt is just text or could contain image parts', () => {
    const modelId = 'google/gemini-3-pro-preview';
    const agent = createBottomCaller(modelId);
    const prompt = agent.definition.buildRoundPrompt({ roundNumber: 1 });

    // Check what type the prompt is
    console.log('\n=== Prompt Type Analysis ===');
    console.log(`Type: ${typeof prompt}`);
    console.log(`Is string: ${typeof prompt === 'string'}`);
    console.log(`Is array: ${Array.isArray(prompt)}`);
    console.log(`Is object: ${typeof prompt === 'object' && !Array.isArray(prompt)}`);

    // The prompt should be a plain string based on the code
    expect(typeof prompt).toBe('string');

    // If it's a string with URLs, then the AI SDK would need to:
    // Option A: Send URLs as-is (low token count)
    // Option B: Fetch and embed images (high token count)
    console.log('\nConclusion: buildRoundPrompt returns a string with URLs embedded.');
    console.log('The question is: does AI SDK / the model provider fetch these URLs?');
  });

  it('examines what gets sent to generateObject', () => {
    // Looking at run-round.ts line 88:
    // messages: [...messages, { role: 'user', content: prompt }]
    //
    // Where prompt is the string from buildRoundPrompt
    // So the content is a STRING with URLs in it

    console.log('\n=== What Gets Sent to AI SDK ===');
    console.log('From run-round.ts line 88:');
    console.log('  messages: [...messages, { role: \'user\', content: prompt }]');
    console.log('\nWhere prompt is a string containing text + URLs');
    console.log('\nQuestion: Does the AI SDK or model provider fetch those URLs?');
    console.log('\nPossibility 1: URLs sent as text → low token count');
    console.log('Possibility 2: Provider fetches and embeds images → HUGE token count');
    console.log('\nGemini models DO support vision/images, so option 2 is possible.');
    console.log('We need to check actual usage.promptTokens from successful models.');

    expect(true).toBe(true); // Placeholder
  });
});
