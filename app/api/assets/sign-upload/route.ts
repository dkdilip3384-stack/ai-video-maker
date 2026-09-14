import { NextResponse } from 'next/server';
import { createSignedAssetUpload, isAssetStorageConfigured } from '@/lib/storage/supabase';

export async function POST(request: Request) {
  try {
    if (!isAssetStorageConfigured()) {
      return NextResponse.json(
        { error: 'Asset storage is not configured.', status: 'not_configured' },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      fileName?: string;
      projectId?: string;
      contentType?: string;
      size?: number;
    };
    if (!body.fileName) {
      return NextResponse.json({ error: 'fileName is required.' }, { status: 400 });
    }

    const signed = await createSignedAssetUpload({
      fileName: body.fileName,
      projectId: body.projectId,
      contentType: body.contentType,
      size: body.size,
    });

    return NextResponse.json(signed);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to sign asset upload.' },
      { status: 500 },
    );
  }
}
