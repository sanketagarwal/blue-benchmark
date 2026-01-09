import { NextResponse } from 'next/server';

// The 6 dashboard models in order of cost
const DASHBOARD_MODELS = [
  { id: 'google/gemini-2.5-flash-lite', shortName: 'Gemini 2.5 Flash Lite', provider: 'Google', cost: 0.375 },
  { id: 'google/gemini-2.0-flash', shortName: 'Gemini 2.0 Flash', provider: 'Google', cost: 0.50 },
  { id: 'openai/gpt-4o-mini', shortName: 'GPT-4o Mini', provider: 'OpenAI', cost: 0.75 },
  { id: 'google/gemini-2.5-flash', shortName: 'Gemini 2.5 Flash', provider: 'Google', cost: 0.75 },
  { id: 'openai/gpt-4o', shortName: 'GPT-4o', provider: 'OpenAI', cost: 12.50 },
  { id: 'anthropic/claude-opus-4-5', shortName: 'Claude Opus 4.5', provider: 'Anthropic', cost: 30.00 },
];

// Fallback: Latest benchmark results from 2025-12-30 run
const FALLBACK_RESULTS: Record<string, { accuracy: number; exactMatches: number; latency: number }> = {
  'google/gemini-2.5-flash-lite': { accuracy: 72.2, exactMatches: 4.0, latency: 1960 },
  'google/gemini-2.0-flash': { accuracy: 62.5, exactMatches: 3.5, latency: 2975 },
  'openai/gpt-4o-mini': { accuracy: 65.3, exactMatches: 3.7, latency: 3740 },
  'google/gemini-2.5-flash': { accuracy: 73.6, exactMatches: 4.3, latency: 21946 },
  'openai/gpt-4o': { accuracy: 69.4, exactMatches: 4.0, latency: 5816 },
  'anthropic/claude-opus-4-5': { accuracy: 70.8, exactMatches: 4.2, latency: 5483 },
};

const FRAMES = [
  { id: '15m_01', timeframe: '15m', label: '15m #1' },
  { id: '15m_02', timeframe: '15m', label: '15m #2' },
  { id: '1h_01', timeframe: '1h', label: '1h #1' },
  { id: '1h_02', timeframe: '1h', label: '1h #2' },
  { id: '4h_01', timeframe: '4h', label: '4h #1' },
  { id: '4h_02', timeframe: '4h', label: '4h #2' },
];

interface FrameResult {
  frameId: string;
  accuracy: number;
  exactMatches: number;
  predictions: Record<string, unknown>;
  groundTruth: Record<string, unknown>;
  duration: number;
}

interface ModelResult {
  modelId: string;
  shortName: string;
  provider: string;
  cost: number;
  avgAccuracy: number;
  avgExactMatches: number;
  avgLatency: number;
  frames: FrameResult[];
}

// Try to fetch from database
async function fetchFromDatabase(): Promise<{
  models: ModelResult[];
  lastUpdated: string;
  runId: string;
} | null> {
  // Only try database if POSTGRES_URL is configured
  if (!process.env.POSTGRES_URL) {
    return null;
  }

  try {
    const { sql } = await import('@vercel/postgres');
    
    // Get the latest run_id
    const latestRun = await sql`
      SELECT run_id, MAX(created_at) as latest 
      FROM benchmark_results 
      GROUP BY run_id 
      ORDER BY latest DESC 
      LIMIT 1
    `;

    if (latestRun.rows.length === 0) {
      return null;
    }

    const runId = latestRun.rows[0].run_id as string;

    // Get all results for the latest run
    const results = await sql`
      SELECT 
        model_id, frame_id, timeframe,
        accuracy, exact_matches, latency_ms,
        prediction, ground_truth, error, created_at
      FROM benchmark_results 
      WHERE run_id = ${runId}
      ORDER BY model_id, frame_id
    `;

    if (results.rows.length === 0) {
      return null;
    }

    // Group results by model
    const resultsByModel: Record<string, typeof results.rows> = {};
    for (const row of results.rows) {
      const modelId = row.model_id as string;
      if (!resultsByModel[modelId]) {
        resultsByModel[modelId] = [];
      }
      resultsByModel[modelId].push(row);
    }

    // Build response
    const modelResults: ModelResult[] = [];

    for (const model of DASHBOARD_MODELS) {
      const modelRows = resultsByModel[model.id] || [];
      const frames: FrameResult[] = [];
      let totalAccuracy = 0;
      let totalExactMatches = 0;
      let totalLatency = 0;

      for (const frame of FRAMES) {
        const row = modelRows.find((r) => r.frame_id === frame.id);
        if (row) {
          const accuracy = Number(row.accuracy) * 100;
          frames.push({
            frameId: frame.id,
            accuracy,
            exactMatches: Number(row.exact_matches),
            predictions: (row.prediction as Record<string, unknown>) || {},
            groundTruth: (row.ground_truth as Record<string, unknown>) || {},
            duration: Number(row.latency_ms),
          });
          totalAccuracy += accuracy;
          totalExactMatches += Number(row.exact_matches);
          totalLatency += Number(row.latency_ms);
        } else {
          frames.push({
            frameId: frame.id,
            accuracy: 0,
            exactMatches: 0,
            predictions: {},
            groundTruth: {},
            duration: 0,
          });
        }
      }

      const frameCount = modelRows.length || 1;
      modelResults.push({
        modelId: model.id,
        shortName: model.shortName,
        provider: model.provider,
        cost: model.cost,
        avgAccuracy: totalAccuracy / frameCount,
        avgExactMatches: totalExactMatches / frameCount,
        avgLatency: totalLatency / frameCount,
        frames,
      });
    }

    // Get last update time
    const lastUpdated = results.rows[0]?.created_at 
      ? new Date(results.rows[0].created_at as string).toISOString()
      : new Date().toISOString();

    return { models: modelResults, lastUpdated, runId };
  } catch (error) {
    console.error('Database fetch error (falling back to hardcoded):', error);
    return null;
  }
}

// Return hardcoded fallback results
function getFallbackResults(): { models: ModelResult[]; lastUpdated: string; runId: string } {
  const modelResults: ModelResult[] = DASHBOARD_MODELS.map((model) => {
    const result = FALLBACK_RESULTS[model.id] || { accuracy: 0, exactMatches: 0, latency: 0 };
    
    return {
      modelId: model.id,
      shortName: model.shortName,
      provider: model.provider,
      cost: model.cost,
      avgAccuracy: result.accuracy,
      avgExactMatches: result.exactMatches,
      avgLatency: result.latency,
      frames: FRAMES.map((f) => ({
        frameId: f.id,
        accuracy: result.accuracy,
        exactMatches: Math.round(result.exactMatches),
        predictions: {},
        groundTruth: {},
        duration: result.latency,
      })),
    };
  });

  return {
    models: modelResults,
    lastUpdated: '2025-12-30T12:00:00Z',
    runId: 'fallback-2025-12-30',
  };
}

export async function GET() {
  // Try database first
  const dbResults = await fetchFromDatabase();
  
  if (dbResults) {
    return NextResponse.json({
      ...dbResults,
      frames: FRAMES,
      hasData: true,
      source: 'database',
    });
  }

  // Fallback to hardcoded results
  const fallback = getFallbackResults();
  return NextResponse.json({
    ...fallback,
    frames: FRAMES,
    hasData: true,
    source: 'fallback',
  });
}
