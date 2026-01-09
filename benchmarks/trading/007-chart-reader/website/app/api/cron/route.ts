import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

// This endpoint is called by Vercel Cron every 2 hours
// It triggers a re-run of the benchmark and updates results

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

// The 6 dashboard models in order of cost
const DASHBOARD_MODELS = [
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.0-flash',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash',
  'openai/gpt-4o',
  'anthropic/claude-opus-4-5',
];

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log('[CRON] Starting benchmark run at', new Date().toISOString());

  try {
    // Run the benchmark with --dashboard flag
    const benchmarkDir = path.join(process.cwd(), '..');
    
    const result = await new Promise<{ success: boolean; output: string }>((resolve) => {
      const proc = spawn('pnpm', ['benchmark', '--dashboard', '--quick'], {
        cwd: benchmarkDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      
      proc.stdout?.on('data', (data) => {
        output += data.toString();
        console.log('[BENCHMARK]', data.toString());
      });
      
      proc.stderr?.on('data', (data) => {
        output += data.toString();
        console.error('[BENCHMARK ERROR]', data.toString());
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          output,
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          output: err.message,
        });
      });

      // Timeout after 4 minutes (leave 1 min buffer)
      setTimeout(() => {
        proc.kill('SIGTERM');
        resolve({
          success: false,
          output: 'Timeout after 4 minutes',
        });
      }, 240000);
    });

    const duration = Date.now() - startTime;

    if (result.success) {
      console.log('[CRON] Benchmark completed successfully in', duration, 'ms');
      return NextResponse.json({
        success: true,
        message: 'Benchmark completed successfully',
        models: DASHBOARD_MODELS,
        duration,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error('[CRON] Benchmark failed:', result.output);
      return NextResponse.json({
        success: false,
        message: 'Benchmark failed',
        error: result.output.slice(-500), // Last 500 chars of output
        duration,
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[CRON] Error running benchmark:', error);
    return NextResponse.json(
      { 
        error: 'Failed to run benchmark', 
        details: String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: Request) {
  return GET(request);
}
