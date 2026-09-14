'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import BrowserVideoExporter from '../components/BrowserVideoExporter';
import PromoPreview from '../components/PromoPreview';
import SystemReadiness from '../components/SystemReadiness';
import { buildStoryboard, StoryboardProject } from '../lib/storyboard';

type UploadedAsset = {
  name: string;
  type: string;
  size: number;
  url: string;
  path: string;
};

export default function HomePage() {
  const [prompt, setPrompt] = useState('');
  const [language, setLanguage] = useState('ta');
  const [format, setFormat] = useState('9:16');
  const [duration, setDuration] = useState(30);
  const [assets, setAssets] = useState<File[]>([]);
  const [uploadedAssets, setUploadedAssets] = useState<UploadedAsset[]>([]);
  const [project, setProject] = useState<StoryboardProject | null>(null);

  const assetSummary = useMemo(() => {
    if (!assets.length) return 'No assets added yet';
    if (uploadedAssets.length === assets.length) return `${assets.length} file${assets.length > 1 ? 's' : ''} uploaded`;
    return `${assets.length} file${assets.length > 1 ? 's' : ''} selected`;
  }, [assets, uploadedAssets]);

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setAssets(Array.from(event.target.files || []));
    setUploadedAssets([]);
  }

  function generateProject() {
    const result = buildStoryboard({ prompt, mode: 'promo', language, format, duration });
    setProject(result);
    setTimeout(() => document.getElementById('storyboard')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  function downloadProject() {
    if (!project) return;
    const payload = {
      ...project,
      assets: assets.map((file) => {
        const uploaded = uploadedAssets.find((item) => item.name === file.name && item.size === file.size);
        return { name: file.name, type: file.type, size: file.size, url: uploaded?.url };
      }),
      createdAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ai-video-project.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="badge">AI VIDEO MAKER • FREE MODE</div>
        <h1>Story to moving promo video</h1>
        <p>Create animated promo videos from your story, logo, screenshots and screen recordings. Preview the motion in the browser and export a video without a paid GPU service.</p>
      </section>

      <SystemReadiness />

      <section className="modeGrid">
        <button className="mode active" type="button">
          <span className="modeTitle">Promo Mode • Free</span>
          <span>Logo + screens + features → animated commercial</span>
        </button>
        <button className="mode" type="button" disabled title="Optional future feature">
          <span className="modeTitle">AI Film Mode • Later</span>
          <span>Full AI-generated people and cinematic scenes need external GPU compute, so this stays optional.</span>
        </button>
      </section>

      <section className="panel">
        <label>Story / Prompt
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: Create a 30-second Tamil promo for Z-KANAKKU. Start with roommates confused about expenses, reveal the app, show adding an expense, balances and settlement, then end with the logo." />
        </label>
        <div className="threeCol">
          <label>Language<select value={language} onChange={(e) => setLanguage(e.target.value)}><option value="ta">Tamil</option><option value="en">English</option><option value="mix">Tamil + English</option></select></label>
          <label>Format<select value={format} onChange={(e) => setFormat(e.target.value)}><option>9:16</option><option>16:9</option><option>1:1</option></select></label>
          <label>Duration<select value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={15}>15 sec</option><option value={30}>30 sec</option><option value={45}>45 sec</option><option value={60}>60 sec</option></select></label>
        </div>
        <label>Assets
          <input type="file" multiple accept="image/*,video/*" onChange={handleFiles} />
          <small>{assetSummary}. Add logo, app screenshots or screen recordings. These are used directly in the free motion preview/export.</small>
        </label>
        {assets.length > 0 && <div className="assetList">{assets.map((file) => <div className="assetChip" key={`${file.name}-${file.size}`}><span>{file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE'}</span>{file.name}</div>)}</div>}
        <button className="primary" type="button" onClick={generateProject}>Build Free Promo</button>
      </section>

      <section className="flow">
        <h2>Free automatic pipeline</h2>
        <div className="steps">{['Understand story', 'Build scenes', 'Animate assets', 'Add motion text', 'Export video'].map((item, i) => <div className="step done" key={item}><span>{i + 1}</span><p>{item}</p></div>)}</div>
      </section>

      {project && <section className="storyboard" id="storyboard">
        <div className="storyHeader">
          <div><div className="badge">FREE PROMO READY</div><h2>{project.title}</h2><p>{project.scenes.length} scenes • {project.totalDuration}s • {project.format}</p></div>
          <button className="secondary" onClick={downloadProject}>Download Project JSON</button>
        </div>
        <PromoPreview project={project} assets={assets} />
        <BrowserVideoExporter project={project} assets={assets} />
        <div className="timeline">{project.scenes.map((scene) => <article className="sceneCard" key={scene.id}><div className="sceneTop"><div className="sceneNumber">{scene.order}</div><div><h3>{scene.title}</h3><span>{scene.duration}s</span></div></div><div className="sceneGrid"><div><b>Visual</b><p>{scene.visualPrompt}</p></div><div><b>Camera</b><p>{scene.camera}</p></div><div><b>Voice script</b><p>{scene.narration}</p></div><div><b>Transition</b><p>{scene.transition}</p></div>{scene.onScreenText && <div className="wide"><b>On-screen text</b><p>{scene.onScreenText}</p></div>}</div></article>)}</div>
        <div className="generationBox"><div><strong>No paid GPU required</strong><p>Use the motion preview above, then tap Export Motion Preview to create the browser-rendered video. Full generative AI Film mode is intentionally left optional.</p></div></div>
      </section>}
    </main>
  );
}
