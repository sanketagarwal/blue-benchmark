import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createBottomCaller,
  setBottomCallerContext,
  clearBottomCallerContext,
  BOTTOM_CONTRACT_IDS,
  type BottomCallerContext,
} from '../src/bottom-caller.js';

import type { MultimodalPrompt, TextPart, ImagePart } from '@nullagent/agent-core';

function getTextContent(prompt: string | MultimodalPrompt): string {
  if (typeof prompt === 'string') {
    return prompt;
  }
  if (typeof prompt.content === 'string') {
    return prompt.content;
  }
  return prompt.content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function getImageParts(prompt: string | MultimodalPrompt): ImagePart[] {
  if (typeof prompt === 'string' || typeof prompt.content === 'string') {
    return [];
  }
  return prompt.content.filter((part): part is ImagePart => part.type === 'image');
}

describe('bottom-caller', () => {
  describe('BOTTOM_CONTRACT_IDS', () => {
    it('has 4 timeframe contracts', () => {
      expect(BOTTOM_CONTRACT_IDS).toEqual([
        'bottom-15m',
        'bottom-1h',
        'bottom-4h',
        'bottom-24h',
      ]);
    });
  });

  describe('createBottomCaller', () => {
    const mockContext: BottomCallerContext = {
      chartByHorizon: {
        '15m': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        '1h': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        '4h': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        '24h': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
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

    it('creates agent with model-specific ID', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      expect(agent.definition.id).toBe('bottom_caller_anthropic_claude-haiku-4.5');
    });

    it('includes output schema with bottom predictions', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      expect(agent.definition.outputSchema).toBeDefined();
    });

    it('throws if context not set', () => {
      clearBottomCallerContext();
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      expect(() => agent.definition.buildRoundPrompt({ roundNumber: 0 })).toThrow(
        'Bottom caller context not set'
      );
    });

    it('builds multimodal prompt with image parts and horizon descriptions', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      const prompt = agent.definition.buildRoundPrompt({ roundNumber: 0 });
      const textContent = getTextContent(prompt);
      const imageParts = getImageParts(prompt);
      expect(imageParts).toHaveLength(4);
      expect(textContent).toContain('15m horizon chart');
      expect(textContent).toContain('1h horizon chart');
      expect(textContent).toContain('4h horizon chart');
      expect(textContent).toContain('24h horizon chart');
    });

    it('builds compaction prompt with round count', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      const mockHistory = [{ role: 'user', content: 'test' }, { role: 'assistant', content: 'response' }];
      const prompt = agent.definition.buildCompactionPrompt(mockHistory);
      expect(prompt).toContain('2 rounds');
      expect(prompt).toContain('learnings');
    });

    it('includes compaction summary in prompt when provided', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      const prompt = agent.definition.buildRoundPrompt({
        roundNumber: 10,
        compactionSummary: 'Previous learnings: momentum divergence works well',
      });
      const textContent = getTextContent(prompt);
      expect(textContent).toContain('Your past learnings:');
      expect(textContent).toContain('momentum divergence works well');
    });
  });
});
