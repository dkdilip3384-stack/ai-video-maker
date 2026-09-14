import { NextResponse } from 'next/server';
import { getVideoGenerationStatus } from '@/lib/video/provider';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required.' }, { status: 400 });
    }

    const job = await getVideoGenerationStatus(jobId);
    return NextResponse.json(job, { status: job.status === 'not_configured' ? 503 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to fetch video status.' },
      { status: 500 },
    );
  }
}
