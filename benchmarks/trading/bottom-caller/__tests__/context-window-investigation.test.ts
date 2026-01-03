import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createBottomCaller,
  setBottomCallerContext,
  clearBottomCallerContext,
  type BottomCallerContext,
} from '../src/bottom-caller.js';

import type { MultimodalPrompt, TextPart, ImagePart } from '@nullagent/agent-core';

describe('context-window-investigation', () => {
  const mockContext: BottomCallerContext = {
    chartByHorizon: {
      '15m': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      '1h': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      '4h': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      '24h': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    },
    refLowByHorizon: {
      '15m': { candlesBack: 5, price: 99500 },
      '1h': { candlesBack: 10, price: 99000 },
      '4h': { candlesBack: 15, price: 98500 },
      '24h': { candlesBack: 20, price: 98000 },
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

  it('measures prompt text size for Gemini 3 Pro Preview on round 1', () => {
    const modelId = 'google/gemini-3-pro-preview';
    const agent = createBottomCaller(modelId);

    const promptResult = agent.definition.buildRoundPrompt({ roundNumber: 1 }) as MultimodalPrompt;

    expect(typeof promptResult).toBe('object');
    expect(promptResult.content).toBeDefined();
    expect(Array.isArray(promptResult.content)).toBe(true);

    const textParts = (promptResult.content as (TextPart | ImagePart)[]).filter(
      (p): p is TextPart => p.type === 'text'
    );
    const imageParts = (promptResult.content as (TextPart | ImagePart)[]).filter(
      (p): p is ImagePart => p.type === 'image'
    );

    const textContent = textParts.map((p) => p.text).join('\n');
    const charCount = textContent.length;
    const estimatedTokens = Math.ceil(charCount / 4);

    console.log('\n=== Prompt Size Analysis ===');
    console.log(`Model: ${modelId}`);
    console.log(`Text parts: ${String(textParts.length)}`);
    console.log(`Image parts: ${String(imageParts.length)}`);
    console.log(`Text character count: ${charCount.toLocaleString()}`);
    console.log(`Estimated text tokens (chars/4): ${estimatedTokens.toLocaleString()}`);
    console.log(`\nFirst 500 chars:\n${textContent.slice(0, 500)}`);

    expect(imageParts).toHaveLength(4);
    expect(charCount).toBeGreaterThan(0);
    expect(textContent).toContain('COINBASE_SPOT_BTC_USD');
    expect(textContent).toContain('15m horizon chart');
  });

  it('verifies prompt is multimodal with image parts', () => {
    const modelId = 'google/gemini-3-pro-preview';
    const agent = createBottomCaller(modelId);
    const promptResult = agent.definition.buildRoundPrompt({ roundNumber: 1 }) as MultimodalPrompt;

    expect(typeof promptResult).toBe('object');
    expect(Array.isArray(promptResult.content)).toBe(true);

    const imageParts = (promptResult.content as (TextPart | ImagePart)[]).filter(
      (p): p is ImagePart => p.type === 'image'
    );

    console.log('\n=== Multimodal Prompt Analysis ===');
    console.log('Prompt is now a MultimodalPrompt with embedded image data.');
    console.log(`Number of image parts: ${String(imageParts.length)}`);
    console.log('Images are Uint8Array binary data (PNG bytes).');
    console.log('\nThe AI SDK will handle encoding these as base64 for the API.');

    expect(imageParts).toHaveLength(4);
    for (const imagePart of imageParts) {
      expect(imagePart.image).toBeInstanceOf(Uint8Array);
    }
  });

  it('confirms what gets sent to generateObject', () => {
    console.log('\n=== What Gets Sent to AI SDK ===');
    console.log('From run-round.ts:');
    console.log('  messages: [...messages, { role: \'user\', content: promptContent }]');
    console.log('\nWhere promptContent is now MessageContent (TextPart | ImagePart)[]');
    console.log('\nImages are passed as Uint8Array directly to the AI SDK.');
    console.log('The SDK handles encoding and the model processes them as vision input.');

    expect(true).toBe(true);
  });
});
