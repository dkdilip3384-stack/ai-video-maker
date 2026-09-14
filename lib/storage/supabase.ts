const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_ASSET_BUCKET || 'ai-video-assets';

function requireConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase asset storage is not configured.');
  }
  return { supabaseUrl, serviceRoleKey, bucket };
}

function cleanName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'asset';
}

export function isAssetStorageConfigured() {
  return Boolean(supabaseUrl && serviceRoleKey);
}

export async function createSignedAssetUpload({
  fileName,
  projectId,
}: {
  fileName: string;
  projectId?: string;
}) {
  const cfg = requireConfig();
  const folder = cleanName(projectId || 'draft');
  const objectPath = `${folder}/${Date.now()}-${crypto.randomUUID()}-${cleanName(fileName)}`;

  const response = await fetch(
    `${cfg.supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(cfg.bucket)}/${objectPath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
    {
      method: 'POST',
      headers: {
        apikey: cfg.serviceRoleKey,
        authorization: `Bearer ${cfg.serviceRoleKey}`,
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

  const data = (await response.json()) as { token?: string; url?: string };
  if (!data.token) throw new Error('Supabase did not return an upload token.');

  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  return {
    bucket: cfg.bucket,
    path: objectPath,
    uploadUrl: `${cfg.supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(cfg.bucket)}/${encodedPath}?token=${encodeURIComponent(data.token)}`,
    publicUrl: `${cfg.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(cfg.bucket)}/${encodedPath}`,
  };
}
