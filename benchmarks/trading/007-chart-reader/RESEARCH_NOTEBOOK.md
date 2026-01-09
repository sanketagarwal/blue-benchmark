# Agent 007: Chart Reader - Visual Understanding Benchmark

**Research Question:** Can vision-enabled LLMs accurately extract structured information from candlestick charts, including OHLCV data, pattern recognition, and multi-step market analysis?

**Status:** active

## Overview

The 007 Chart Reader benchmark tests vision LLMs ability to extract structured information from candlestick charts. This is a foundational capability test that evaluates whether models can accurately "read" financial charts before more complex analysis tasks.

## 3-Level Visual Understanding Framework

### Level 1: Literal Reading (Meta/Active Readout)
- Base/quote pair identification
- Exchange/venue recognition
- Timeframe detection
- OHLCV value extraction

### Level 2: Pattern Synthesis (Multi-Step Reasoning)
- Trend + indicator confluence detection
- Support/resistance + price action analysis
- Volume-confirmed breakout identification
- Reversal pattern recognition

### Level 3: Market Interpretation (Overall Bias)
- Synthesize observations into actionable bias
- Range: strongly bearish → strongly bullish

## Methodology
- 6 test frames across 3 timeframes (15m, 1h, 4h)
- Ground truth computed from Replay Labs API annotations + local indicators
- Scoring: exact match for booleans, enum matching with partial credit
- Per-field accuracy averaged across all frames

## Executive Summary

# Executive Summary

## Research Question and Significance

This study investigated whether vision-enabled large language models (LLMs) can accurately extract structured information from financial candlestick charts—a foundational capability for automated market analysis. The research addresses a critical question for financial technology: before AI systems can provide sophisticated trading insights, they must first demonstrate the ability to reliably "read" visual chart data, including price values, patterns, and technical indicators.

## Key Findings

The study's primary hypothesis—that vision LLMs can achieve greater than 70% accuracy on multi-step chart pattern reasoning tasks—was **supported**. Testing across 9 vision-enabled models revealed that 3 models successfully exceeded this threshold:

- **Google Gemini 2.5 Flash**: 75.0% accuracy (highest performer)
- **Google Gemini 2.5 Flash Lite**: 70.8% accuracy
- **OpenAI GPT-4o**: 70.8% accuracy

These results demonstrate that current state-of-the-art vision models can effectively synthesize multiple chart indicators to assess patterns, though performance varies significantly across model providers.

## Patterns and Observations

A notable pattern emerges from the results: Google's Gemini family dominated the top positions, suggesting their vision architecture may be particularly well-suited for structured data extraction from financial visualizations. The clustering of three models at or just above the 70% threshold indicates this benchmark represents a meaningful difficulty level that differentiates model capabilities.

The fact that only one-third of tested models met the accuracy threshold highlights that multi-step chart reasoning remains challenging for many vision LLMs. This capability—which requires models to detect trend and indicator confluence, identify support/resistance levels, recognize volume-confirmed breakouts, and synthesize these into market bias assessments—demands more than simple visual recognition.

## Areas for Further Investigation

With the study still active, several questions merit continued exploration: How do models perform across the three-level framework (literal reading vs. pattern synthesis vs. market interpretation)? Do accuracy rates vary by timeframe (15m, 1h, 4h)? What specific pattern types prove most challenging? Understanding where models fail could guide both model improvement and appropriate use-case boundaries.

## Conclusion

This benchmark establishes that leading vision LLMs possess foundational chart-reading capabilities sufficient for multi-step pattern reasoning, though the technology has not yet reached uniform reliability across providers. For practitioners, this suggests selective model choice is critical when deploying AI for financial chart analysis.

## Hypotheses

**Supported:** 1 | **Not Supported:** 0 | **Inconclusive:** 0 | **Pending:** 0

| Hypothesis | Type | Status | Verdict |
|------------|------|--------|---------|
| Vision LLMs can achieve >70% accuracy on multi-ste... | confirmatory | supported | supported |

### Vision LLMs can achieve >70% accuracy on multi-step chart pattern reasoning tasks

- **Type:** confirmatory
- **Relationship:** primary
- **Status:** supported
- **Verdict:** supported
- **Rationale:** 3 out of 9 tested vision LLMs exceeded the 70% accuracy threshold on multi-step chart pattern reasoning tasks. Google Gemini 2.5 Flash achieved the highest accuracy at 75.0%, followed by Gemini 2.5 Flash Lite and OpenAI GPT-4o both at 70.8%. This demonstrates that state-of-the-art vision models can effectively synthesize multiple chart indicators for pattern assessment.

---
*Generated on 2026-01-09T17:13:24.820Z with AI summary from claude-opus-4-5-20251101*
