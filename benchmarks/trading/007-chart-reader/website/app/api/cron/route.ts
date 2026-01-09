import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The cron job logs when it runs
  // Actual benchmark runs externally and POSTs results to /api/db/write
  const timestamp = new Date().toISOString();
  
  console.log(`[CRON] Benchmark cron triggered at ${timestamp}`);
  
  return NextResponse.json({
    success: true,
    message: 'Cron job triggered',
    timestamp,
    note: 'Benchmark runs externally and posts results to /api/db/write',
  });
}
