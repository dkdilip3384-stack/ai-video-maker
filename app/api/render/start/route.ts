import { NextResponse } from 'next/server';
import { startRender } from '@/lib/render/provider';
import type { RenderManifest } from '@/lib/render/manifest';

export async function POST(request: Request) {
  try {
    const manifest = (await request.json()) as RenderManifest;
    if (!manifest?.projectId || !Array.isArray(manifest.scenes)) {
      return NextResponse.json({ error: 'Valid render manifest is required.' }, { status: 400 });
    }

    const job = await startRender(manifest);
    return NextResponse.json(job, { status: job.status === 'not_configured' ? 503 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to start render.' },
      { status: 500 },
    );
  }
}
