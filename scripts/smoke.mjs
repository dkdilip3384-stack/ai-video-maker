const base = (process.env.APP_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function getJson(path) {
  const response = await fetch(`${base}${path}`, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const health = await getJson('/api/health');
if (!health.response.ok || !health.body?.ok) {
  console.error('Health check failed', health.body);
  process.exit(1);
}

console.log('AI Video Maker health:', health.body);

const required = ['videoProviderConfigured', 'voiceProviderConfigured', 'assetStorageConfigured'];
for (const key of required) {
  if (!(key in health.body)) {
    console.error(`Missing health field: ${key}`);
    process.exit(1);
  }
}

console.log('Smoke test passed.');
