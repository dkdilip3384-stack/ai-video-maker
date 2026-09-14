import { NextResponse } from 'next/server';
import { isVideoProviderConfigured } from '@/lib/video/provider';
import { isAssetStorageConfigured } from '@/lib/storage/supabase';

export async function GET() {
  return NextResponse.json({
    ok: true,
    videoProviderConfigured: isVideoProviderConfigured(),
    voiceProviderConfigured: Boolean(process.env.AI_VOICE_API_URL),
    assetStorageConfigured: isAssetStorageConfigured(),
    backgroundMusicConfigured: Boolean(process.env.DEFAULT_BACKGROUND_MUSIC_URL),
    timestamp: new Date().toISOString(),
  });
}
