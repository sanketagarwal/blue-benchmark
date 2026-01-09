import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

interface BenchmarkResult {
  runId: string;
  modelId: string;
  frameId: string;
  timeframe: string;
  accuracy: number;
  exactMatches: number;
  latencyMs: number;
  prediction?: Record<string, unknown>;
  groundTruth?: Record<string, unknown>;
  error?: string;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedKey = process.env.BENCHMARK_API_KEY;
    
    if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: BenchmarkResult[] = await request.json();

    for (const result of results) {
      await sql`
        INSERT INTO benchmark_results (
          run_id, model_id, frame_id, timeframe, 
          accuracy, exact_matches, latency_ms,
          prediction, ground_truth, error
        ) VALUES (
          ${result.runId},
          ${result.modelId},
          ${result.frameId},
          ${result.timeframe},
          ${result.accuracy},
          ${result.exactMatches},
          ${result.latencyMs},
          ${JSON.stringify(result.prediction ?? {})},
          ${JSON.stringify(result.groundTruth ?? {})},
          ${result.error ?? null}
        )
        ON CONFLICT (run_id, model_id, frame_id) 
        DO UPDATE SET
          accuracy = EXCLUDED.accuracy,
          exact_matches = EXCLUDED.exact_matches,
          latency_ms = EXCLUDED.latency_ms,
          prediction = EXCLUDED.prediction,
          ground_truth = EXCLUDED.ground_truth,
          error = EXCLUDED.error,
          created_at = NOW()
      `;
    }

    return NextResponse.json({ 
      success: true, 
      count: results.length 
    });
  } catch (error) {
    console.error('Write error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

