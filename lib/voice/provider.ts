export type VoiceRequest = {
  text: string;
  language: 'ta' | 'en' | 'mix';
  voice?: string;
};

export type VoiceResult = {
  provider: string;
  status: 'completed' | 'not_configured';
  audioUrl?: string;
  error?: string;
};

const endpoint = process.env.AI_VOICE_API_URL?.replace(/\/$/, '');
const apiKey = process.env.AI_VOICE_API_KEY;

export async function synthesizeVoice(input: VoiceRequest): Promise<VoiceResult> {
  if (!endpoint) {
    return {
      provider: 'unconfigured',
      status: 'not_configured',
      error: 'AI_VOICE_API_URL is not configured yet.',
    };
  }

  const response = await fetch(`${endpoint}/synthesize`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Voice provider error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<VoiceResult>;
}
