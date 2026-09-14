import { NextResponse } from 'next/server';
import { isVideoProviderConfigured } from '@/lib/video/provider';

export async function GET() {
  return NextResponse.json({
    ok: true,
    videoProviderConfigured: isVideoProviderConfigured(),
    voiceProviderConfigured: Boolean(process.env.AI_VOICE_API_URL),
    timestamp: new Date().toISOString(),
  });
}
