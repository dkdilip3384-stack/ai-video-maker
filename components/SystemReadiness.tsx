'use client';

import { useEffect, useState } from 'react';

type Health = {
  ok?: boolean;
  assetStorageConfigured?: boolean;
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
    ['Web app', true, 'Ready'],
    ['Motion preview', true, 'Ready'],
    ['Browser video export', true, 'Free'],
    ['Asset storage', Boolean(health?.assetStorageConfigured), health?.assetStorageConfigured ? 'Ready' : 'Browser-only'],
    ['AI Film', false, 'Future optional'],
  ] as const;

  return (
    <section className="readiness">
      <div>
        <div className="badge">FREE WORKFLOW</div>
        <h2>Ready without paid GPU</h2>
        <p>Promo creation, moving preview and browser video export work without a paid AI video service.</p>
      </div>
      <div className="readinessGrid">
        {items.map(([label, ready, detail]) => (
          <div className={`readyItem ${ready ? 'ready' : 'optional'}`} key={label}>
            <span>{ready ? '✓' : '·'}</span>
            <div><strong>{label}</strong><small>{detail}</small></div>
          </div>
        ))}
      </div>
      {error && <small className="healthError">Status check unavailable. Free browser tools still work.</small>}
    </section>
  );
}
