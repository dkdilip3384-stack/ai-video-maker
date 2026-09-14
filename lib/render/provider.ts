import type { RenderManifest } from './manifest';

export type RenderJob = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'not_configured';
  progress: number;
  outputUrl?: string;
  error?: string;
};

const endpoint = process.env.RENDER_API_URL?.replace(/\/$/, '');
const apiKey = process.env.RENDER_API_KEY;

function headers() {
  return {
    'content-type': 'application/json',
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };
}

export function isRenderProviderConfigured() {
  return Boolean(endpoint);
}

export async function startRender(manifest: RenderManifest): Promise<RenderJob> {
  if (!endpoint) {
    return {
      id: `render-local-${Date.now()}`,
      status: 'not_configured',
      progress: 0,
      error: 'RENDER_API_URL is not configured yet.',
    };
  }

  const response = await fetch(`${endpoint}/render`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(manifest),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Render provider error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<RenderJob>;
}

export async function getRenderStatus(jobId: string): Promise<RenderJob> {
  if (!endpoint) {
    return {
      id: jobId,
      status: 'not_configured',
      progress: 0,
      error: 'RENDER_API_URL is not configured yet.',
    };
  }

  const response = await fetch(`${endpoint}/renders/${encodeURIComponent(jobId)}`, {
    headers: headers(),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Render status error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<RenderJob>;
}
