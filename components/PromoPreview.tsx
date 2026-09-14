'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StoryboardProject } from '../lib/storyboard';

type PromoPreviewProps = {
  project: StoryboardProject;
  assets: File[];
};

export default function PromoPreview({ project, assets }: PromoPreviewProps) {
  const [activeScene, setActiveScene] = useState(0);
  const [playing, setPlaying] = useState(true);

  const imageUrls = useMemo(
    () => assets.filter((file) => file.type.startsWith('image/')).map((file) => URL.createObjectURL(file)),
    [assets],
  );

  useEffect(() => () => imageUrls.forEach((url) => URL.revokeObjectURL(url)), [imageUrls]);

  useEffect(() => {
    if (!playing || project.scenes.length === 0) return;
    const scene = project.scenes[activeScene] || project.scenes[0];
    const timer = window.setTimeout(
      () => setActiveScene((current) => (current + 1) % project.scenes.length),
      Math.max(1800, scene.duration * 1000),
    );
    return () => window.clearTimeout(timer);
  }, [activeScene, playing, project.scenes]);

  const scene = project.scenes[activeScene] || project.scenes[0];
  const image = imageUrls.length ? imageUrls[activeScene % imageUrls.length] : undefined;

  if (!scene) return null;

  return (
    <section className="previewPanel">
      <div className="previewHeader">
        <div>
          <div className="badge">LIVE MOTION PREVIEW</div>
          <h2>Promo preview</h2>
          <p>GPU இல்லாமலும் browser-ல motion timing, text, camera-feel preview பார்க்கலாம்.</p>
        </div>
        <button className="secondary" type="button" onClick={() => setPlaying((value) => !value)}>
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      <div className={`promoStage ${project.format === '16:9' ? 'landscape' : project.format === '1:1' ? 'square' : 'portrait'}`}>
        <div className="promoGlow" />
        {image ? (
          <img key={`${activeScene}-${image}`} className="promoAsset" src={image} alt="Selected promo asset" />
        ) : (
          <div className="promoPlaceholder">AI VIDEO MAKER</div>
        )}
        <div className="promoShade" />
        <div key={activeScene} className="promoCopy">
          <span>SCENE {scene.order}</span>
          <h3>{scene.title}</h3>
          <p>{scene.onScreenText || scene.narration}</p>
          <small>{scene.camera}</small>
        </div>
        <div className="promoProgress">
          {project.scenes.map((item, index) => (
            <button
              type="button"
              aria-label={`Open scene ${item.order}`}
              className={index === activeScene ? 'active' : ''}
              key={item.id}
              onClick={() => setActiveScene(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
