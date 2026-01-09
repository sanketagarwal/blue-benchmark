import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Create benchmark_results table
    await sql`
      CREATE TABLE IF NOT EXISTS benchmark_results (
        id SERIAL PRIMARY KEY,
        run_id VARCHAR(50) NOT NULL,
        model_id VARCHAR(100) NOT NULL,
        frame_id VARCHAR(20) NOT NULL,
        timeframe VARCHAR(10) NOT NULL,
        accuracy DECIMAL(5,4) NOT NULL,
        exact_matches INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        prediction JSONB,
        ground_truth JSONB,
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(run_id, model_id, frame_id)
      )
    `;

    // Create index for faster queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_benchmark_results_model_frame 
      ON benchmark_results(model_id, frame_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_benchmark_results_created 
      ON benchmark_results(created_at DESC)
    `;

    return NextResponse.json({ 
      success: true, 
      message: 'Database initialized successfully' 
    });
  } catch (error) {
    console.error('Database init error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

