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

// Try to fetch from database - averages across ALL runs
async function fetchFromDatabase(): Promise<{
  models: ModelResult[];
  lastUpdated: string;
  runId: string;
  totalRuns: number;
} | null> {
  // Only try database if POSTGRES_URL is configured
  if (!process.env.POSTGRES_URL) {
    return null;
  }

  try {
    const { sql } = await import('@vercel/postgres');
    
    // Get average accuracy across ALL runs for each model
    const avgResults = await sql`
      SELECT 
        model_id,
        AVG(accuracy) as avg_accuracy,
        AVG(exact_matches) as avg_exact_matches,
        AVG(latency_ms) as avg_latency,
        COUNT(DISTINCT run_id) as run_count,
        MAX(created_at) as last_run
      FROM benchmark_results 
      GROUP BY model_id
      ORDER BY model_id
    `;

    if (avgResults.rows.length === 0) {
      return null;
    }

    // Get per-frame averages for each model (across all runs)
    const frameAvgResults = await sql`
      SELECT 
        model_id,
        frame_id,
        AVG(accuracy) as avg_accuracy,
        AVG(exact_matches) as avg_exact_matches,
        AVG(latency_ms) as avg_latency,
        COUNT(*) as sample_count
      FROM benchmark_results 
      GROUP BY model_id, frame_id
      ORDER BY model_id, frame_id
    `;

    // Group frame results by model
    const framesByModel: Record<string, typeof frameAvgResults.rows> = {};
    for (const row of frameAvgResults.rows) {
      const modelId = row.model_id as string;
      if (!framesByModel[modelId]) {
        framesByModel[modelId] = [];
      }
      framesByModel[modelId].push(row);
    }

    // Get total unique runs
    const runCountResult = await sql`
      SELECT COUNT(DISTINCT run_id) as total_runs FROM benchmark_results
    `;
    const totalRuns = Number(runCountResult.rows[0]?.total_runs || 0);

    // Build response
    const modelResults: ModelResult[] = [];
    let lastUpdated = new Date(0);

    for (const model of DASHBOARD_MODELS) {
      const avgRow = avgResults.rows.find((r) => r.model_id === model.id);
      const modelFrames = framesByModel[model.id] || [];
      
      const frames: FrameResult[] = FRAMES.map((frame) => {
        const frameRow = modelFrames.find((r) => r.frame_id === frame.id);
        if (frameRow) {
          return {
            frameId: frame.id,
            accuracy: Number(frameRow.avg_accuracy) * 100,
            exactMatches: Number(frameRow.avg_exact_matches),
            predictions: {},
            groundTruth: {},
            duration: Number(frameRow.avg_latency),
          };
        }
        return {
          frameId: frame.id,
          accuracy: 0,
          exactMatches: 0,
          predictions: {},
          groundTruth: {},
          duration: 0,
        };
      });

      if (avgRow) {
        const rowLastRun = new Date(avgRow.last_run as string);
        if (rowLastRun > lastUpdated) {
          lastUpdated = rowLastRun;
        }
        
        modelResults.push({
          modelId: model.id,
          shortName: model.shortName,
          provider: model.provider,
          cost: model.cost,
          avgAccuracy: Number(avgRow.avg_accuracy) * 100,
          avgExactMatches: Number(avgRow.avg_exact_matches),
          avgLatency: Number(avgRow.avg_latency),
          frames,
        });
      } else {
        // Model not in database yet
        modelResults.push({
          modelId: model.id,
          shortName: model.shortName,
          provider: model.provider,
          cost: model.cost,
          avgAccuracy: 0,
          avgExactMatches: 0,
          avgLatency: 0,
          frames,
        });
      }
    }

    return { 
      models: modelResults, 
      lastUpdated: lastUpdated.toISOString(), 
      runId: `avg-${totalRuns}-runs`,
      totalRuns,
    };
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
    totalRuns: 1,
  });
}
