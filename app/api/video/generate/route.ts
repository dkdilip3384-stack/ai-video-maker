import { NextResponse } from 'next/server';
import { startVideoGeneration } from '@/lib/video/provider';
import type { GenerateVideoRequest } from '@/lib/video/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateVideoRequest;

    if (!body?.project?.id || !Array.isArray(body.project.scenes) || body.project.scenes.length === 0) {
      return NextResponse.json({ error: 'A valid project with at least one scene is required.' }, { status: 400 });
    }

    const job = await startVideoGeneration(body);
    return NextResponse.json(job, { status: job.status === 'not_configured' ? 503 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to start video generation.' },
      { status: 500 },
    );
  }
}
