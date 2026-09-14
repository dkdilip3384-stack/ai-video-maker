import { NextResponse } from 'next/server';
import { startVideoGeneration } from '@/lib/video/provider';
import type { GenerateVideoRequest } from '@/lib/video/types';
import { synthesizeVoice } from '@/lib/voice/provider';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateVideoRequest;

    if (!body?.project?.id || !Array.isArray(body.project.scenes) || body.project.scenes.length === 0) {
      return NextResponse.json({ error: 'A valid project with at least one scene is required.' }, { status: 400 });
    }

    const scenes = await Promise.all(
      body.project.scenes.map(async (scene) => {
        if (!scene.voiceText?.trim()) return scene;
        try {
          const voice = await synthesizeVoice({
            text: scene.voiceText,
            language: body.project.language,
          });
          return voice.status === 'completed' && voice.audioUrl
            ? { ...scene, voiceUrl: voice.audioUrl }
            : scene;
        } catch {
          // Voice is optional. Video generation can continue with subtitles only.
          return scene;
        }
      }),
    );

    const enriched: GenerateVideoRequest = {
      ...body,
      project: {
        ...body.project,
        scenes,
        musicUrl: body.project.musicUrl || process.env.DEFAULT_BACKGROUND_MUSIC_URL || undefined,
      },
    };

    const job = await startVideoGeneration(enriched);
    return NextResponse.json(job, { status: job.status === 'not_configured' ? 503 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to start video generation.' },
      { status: 500 },
    );
  }
}
