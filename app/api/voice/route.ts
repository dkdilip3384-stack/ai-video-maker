import { NextResponse } from 'next/server';
import { synthesizeVoice, type VoiceRequest } from '@/lib/voice/provider';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VoiceRequest;

    if (!body?.text?.trim()) {
      return NextResponse.json({ error: 'Voice text is required.' }, { status: 400 });
    }

    const result = await synthesizeVoice(body);
    return NextResponse.json(result, { status: result.status === 'not_configured' ? 503 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to synthesize voice.' },
      { status: 500 },
    );
  }
}
