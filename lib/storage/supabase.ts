const defaultSupabaseUrl = 'https://guvubjvmxazvnwoyappv.supabase.co';
const supabaseUrl = (process.env.SUPABASE_URL || defaultSupabaseUrl).replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_ASSET_BUCKET || 'ai-video-assets';
const uploadSignerUrl = `${supabaseUrl}/functions/v1/sign-ai-video-upload`;

function cleanName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'asset';
}

export function isAssetStorageConfigured() {
  return Boolean(supabaseUrl);
}

async function createWithServiceRole(fileName: string, projectId?: string) {
  if (!serviceRoleKey) return null;

  const folder = cleanName(projectId || 'draft');
  const objectPath = `${folder}/${Date.now()}-${crypto.randomUUID()}-${cleanName(fileName)}`;
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ upsert: false }),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to create signed upload URL: ${response.status} ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) throw new Error('Supabase did not return an upload token.');

  return {
    bucket,
    path: objectPath,
    uploadUrl: `${supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}?token=${encodeURIComponent(data.token)}`,
    publicUrl: `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`,
  };
}

export async function createSignedAssetUpload({
  fileName,
  projectId,
  contentType,
  size,
}: {
  fileName: string;
  projectId?: string;
  contentType?: string;
  size?: number;
}) {
  const direct = await createWithServiceRole(fileName, projectId);
  if (direct) return direct;

  const response = await fetch(uploadSignerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName, projectId, contentType, size }),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Unable to prepare asset upload (${response.status}).`);
  }
  return data as { bucket: string; path: string; uploadUrl: string; publicUrl: string };
}
