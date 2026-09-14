'use client';

import { useEffect, useState } from 'react';

type Health = {
  ok?: boolean;
  videoProviderConfigured?: boolean;
  voiceProviderConfigured?: boolean;
  assetStorageConfigured?: boolean;
  musicConfigured?: boolean;
};

export default function SystemReadiness() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/health', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
        return response.json() as Promise<Health>;
      })
      .then((data) => { if (active) setHealth(data); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Health check failed'); });
    return () => { active = false; };
  }, []);

  const items = [
    ['Web app', true],
    ['Video GPU', Boolean(health?.videoProviderConfigured)],
    ['Tamil / English voice', Boolean(health?.voiceProviderConfigured)],
    ['Asset storage', Boolean(health?.assetStorageConfigured)],
    ['Background music', Boolean(health?.musicConfigured)],
  ] as const;

  return (
    <section className="readiness">
      <div>
        <div className="badge">SYSTEM READINESS</div>
        <h2>Connection status</h2>
        <p>Green items are ready. Missing external services stay visible here instead of failing silently.</p>
      </div>
      <div className="readinessGrid">
        {items.map(([label, ready]) => (
          <div className={`readyItem ${ready ? 'ready' : 'missing'}`} key={label}>
            <span>{ready ? '✓' : '!'}</span>
            <div><strong>{label}</strong><small>{ready ? 'Ready' : 'Needs connection'}</small></div>
          </div>
        ))}
      </div>
      {error && <small className="healthError">{error}</small>}
    </section>
  );
}
