import type { GenerateVideoRequest, GenerationJob } from './types';

const endpoint = process.env.AI_VIDEO_API_URL?.replace(/\/$/, '');
const apiKey = process.env.AI_VIDEO_API_KEY;

function headers() {
  return {
    'content-type': 'application/json',
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };
}

export function isVideoProviderConfigured() {
  return Boolean(endpoint);
}

export async function startVideoGeneration(input: GenerateVideoRequest): Promise<GenerationJob> {
  if (!endpoint) {
    return {
      id: `local-${Date.now()}`,
      provider: 'unconfigured',
      status: 'not_configured',
      progress: 0,
      error: 'AI_VIDEO_API_URL is not configured yet.',
    };
  }

  const response = await fetch(`${endpoint}/generate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(input),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Video provider error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<GenerationJob>;
}

export async function getVideoGenerationStatus(jobId: string): Promise<GenerationJob> {
  if (!endpoint) {
    return {
      id: jobId,
      provider: 'unconfigured',
      status: 'not_configured',
      progress: 0,
      error: 'AI_VIDEO_API_URL is not configured yet.',
    };
  }

  const response = await fetch(`${endpoint}/jobs/${encodeURIComponent(jobId)}`, {
    headers: headers(),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Video provider status error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<GenerationJob>;
}
