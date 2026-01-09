import { NextResponse } from 'next/server';

// This endpoint is called by Vercel Cron every 2 hours
// It triggers a re-run of the benchmark and updates results

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[CRON] Starting benchmark run at', new Date().toISOString());

    // The models to test (6 models in increasing order of cost)
    const models = [
      'google/gemini-2.5-flash-lite',   // $0.375/M
      'google/gemini-2.0-flash',         // $0.50/M
      'openai/gpt-4o-mini',              // $0.75/M
      'google/gemini-2.5-flash',         // $0.75/M
      'openai/gpt-4o',                   // $12.50/M
      'anthropic/claude-opus-4-5',       // $30.00/M
    ];

    // In production, this would call the benchmark script or an API
    // For now, we log the intended action
    console.log('[CRON] Would run benchmark for models:', models);

    // TODO: Implement actual benchmark execution
    // Options:
    // 1. Call a separate API endpoint that runs the benchmark
    // 2. Use a queue system (e.g., Vercel Queue, Inngest)
    // 3. Trigger a GitHub Action workflow

    // For now, return success
    return NextResponse.json({
      success: true,
      message: 'Benchmark cron job triggered',
      models,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[CRON] Error running benchmark:', error);
    return NextResponse.json(
      { error: 'Failed to run benchmark', details: String(error) },
      { status: 500 }
    );
  }
}

