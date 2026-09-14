'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { buildStoryboard, StoryboardProject, VideoMode } from '../lib/storyboard';

type GenerationState = {
  loading: boolean;
  message: string;
  jobId?: string;
  outputUrl?: string;
  progress?: number;
};

type ProviderJob = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'not_configured';
  progress?: number;
  outputUrl?: string;
  error?: string;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function HomePage() {
  const [mode, setMode] = useState<VideoMode>('promo');
  const [prompt, setPrompt] = useState('');
  const [language, setLanguage] = useState('ta');
  const [format, setFormat] = useState('9:16');
  const [duration, setDuration] = useState(30);
  const [assets, setAssets] = useState<File[]>([]);
  const [project, setProject] = useState<StoryboardProject | null>(null);
  const [generation, setGeneration] = useState<GenerationState>({ loading: false, message: '' });

  const assetSummary = useMemo(() => {
    if (!assets.length) return 'No assets added yet';
    return `${assets.length} file${assets.length > 1 ? 's' : ''} ready`;
  }, [assets]);

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setAssets(Array.from(event.target.files || []));
  }

  function generateProject() {
    const result = buildStoryboard({ prompt, mode, language, format, duration });
    setProject(result);
    setGeneration({ loading: false, message: '' });
    setTimeout(() => document.getElementById('storyboard')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  function downloadProject() {
    if (!project) return;
    const payload = {
      ...project,
      assets: assets.map((file) => ({ name: file.name, type: file.type, size: file.size })),
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

  async function pollJob(jobId: string) {
    for (let attempt = 0; attempt < 360; attempt += 1) {
      await wait(5000);
      const response = await fetch(`/api/video/status?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      const job = (await response.json()) as ProviderJob;

      if (!response.ok && job.status !== 'not_configured') {
        throw new Error(job.error || 'Unable to read generation status.');
      }

      const progress = Math.max(0, Math.min(100, job.progress || 0));
      if (job.status === 'completed') {
        setGeneration({
          loading: false,
          message: 'Moving video generated successfully.',
          jobId,
          progress: 100,
          outputUrl: job.outputUrl,
        });
        return;
      }

      if (job.status === 'failed' || job.status === 'not_configured') {
        setGeneration({
          loading: false,
          message: job.error || (job.status === 'not_configured' ? 'GPU video provider is not connected yet.' : 'Generation failed.'),
          jobId,
          progress,
        });
        return;
      }

      setGeneration({
        loading: true,
        message: job.status === 'queued' ? 'Waiting for GPU…' : `Generating moving video… ${progress}%`,
        jobId,
        progress,
      });
    }

    setGeneration({ loading: false, message: 'Generation is still running. Try checking the job again later.', jobId });
  }

  async function generateMovingVideo() {
    if (!project) return;
    setGeneration({ loading: true, message: 'Starting moving-video generation…', progress: 0 });

    const providerProject = {
      id: `project-${Date.now()}`,
      mode: project.mode,
      format: project.format,
      language: project.language,
      title: project.title,
      scenes: project.scenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        durationSeconds: scene.duration,
        visualPrompt: scene.visualPrompt,
        camera: scene.camera,
        voiceText: scene.narration,
        transition: scene.transition,
      })),
    };

    try {
      const response = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: providerProject }),
      });
      const data = (await response.json()) as ProviderJob;

      if (!response.ok) {
        const providerMissing = data?.status === 'not_configured' || response.status === 503;
        setGeneration({
          loading: false,
          message: providerMissing
            ? 'Video engine connection is ready in the app, but the GPU video provider is not connected yet.'
            : data?.error || 'Video generation could not start.',
          jobId: data?.id,
          progress: data?.progress || 0,
        });
        return;
      }

      setGeneration({ loading: true, message: 'GPU job queued…', jobId: data.id, progress: data.progress || 0 });
      await pollJob(data.id);
    } catch (error) {
      setGeneration({
        loading: false,
        message: error instanceof Error ? error.message : 'Video generation could not start.',
      });
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="badge">AI VIDEO MAKER • BUILD 03</div>
        <h1>Story to real moving video</h1>
        <p>
          Build a proper motion-video project from your story, logo, app screens and references.
          The goal is cinematic motion and professional promo editing — not a photo slideshow.
        </p>
      </section>

      <section className="modeGrid">
        <button className={mode === 'promo' ? 'mode active' : 'mode'} onClick={() => setMode('promo')}>
          <span className="modeTitle">Promo Mode</span>
          <span>Logo + screens + features → animated commercial</span>
        </button>
        <button className={mode === 'film' ? 'mode active' : 'mode'} onClick={() => setMode('film')}>
          <span className="modeTitle">AI Film Mode</span>
          <span>Story → cinematic scenes + voice + subtitles + music</span>
        </button>
      </section>

      <section className="panel">
        <label>
          Story / Prompt
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === 'promo'
                ? 'Example: Create a 30-second Tamil promo for Z-KANAKKU. Start with roommates confused about expenses, reveal the app, show adding an expense, balances and settlement, then end with the logo.'
                : 'Example: A delivery rider finishes a long rainy day. He reaches home tired, sees his mother waiting, and gives her the medicine he bought on the way.'
            }
          />
        </label>

        <div className="threeCol">
          <label>
            Language
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="ta">Tamil</option>
              <option value="en">English</option>
              <option value="mix">Tamil + English</option>
            </select>
          </label>
          <label>
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option>9:16</option>
              <option>16:9</option>
              <option>1:1</option>
            </select>
          </label>
          <label>
            Duration
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={15}>15 sec</option>
              <option value={30}>30 sec</option>
              <option value={45}>45 sec</option>
              <option value={60}>60 sec</option>
            </select>
          </label>
        </div>

        <label>
          Assets
          <input type="file" multiple accept="image/*,video/*" onChange={handleFiles} />
          <small>{assetSummary}. Add logo, screenshots, screen recordings, character references or source clips.</small>
        </label>

        {assets.length > 0 && (
          <div className="assetList">
            {assets.map((file) => (
              <div className="assetChip" key={`${file.name}-${file.size}`}>
                <span>{file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE'}</span>
                {file.name}
              </div>
            ))}
          </div>
        )}

        <button className="primary" type="button" onClick={generateProject}>
          Build Scene Plan
        </button>
      </section>

      <section className="flow">
        <h2>Automatic pipeline</h2>
        <div className="steps">
          {['Understand story', 'Build scenes', 'Generate motion clips', 'Add voice & subtitles', 'Render final MP4'].map((item, i) => (
            <div className={`step ${i < 2 ? 'done' : ''}`} key={item}>
              <span>{i + 1}</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      {project && (
        <section className="storyboard" id="storyboard">
          <div className="storyHeader">
            <div>
              <div className="badge">SCENE ENGINE READY</div>
              <h2>{project.title}</h2>
              <p>{project.scenes.length} scenes • {project.totalDuration}s • {project.format}</p>
            </div>
            <button className="secondary" onClick={downloadProject}>Download Project JSON</button>
          </div>

          <div className="timeline">
            {project.scenes.map((scene) => (
              <article className="sceneCard" key={scene.id}>
                <div className="sceneTop">
                  <div className="sceneNumber">{scene.order}</div>
                  <div>
                    <h3>{scene.title}</h3>
                    <span>{scene.duration}s</span>
                  </div>
                </div>
                <div className="sceneGrid">
                  <div><b>Visual</b><p>{scene.visualPrompt}</p></div>
                  <div><b>Camera</b><p>{scene.camera}</p></div>
                  <div><b>Voice</b><p>{scene.narration}</p></div>
                  <div><b>Transition</b><p>{scene.transition}</p></div>
                  {scene.onScreenText && <div className="wide"><b>On-screen text</b><p>{scene.onScreenText}</p></div>}
                </div>
              </article>
            ))}
          </div>

          <div className="generationBox">
            <div>
              <strong>Moving-video engine</strong>
              <p>Send the scene to the connected GPU video provider and follow generation progress automatically.</p>
            </div>
            <button className="primary" type="button" disabled={generation.loading} onClick={generateMovingVideo}>
              {generation.loading ? 'Generating…' : 'Generate Moving Video'}
            </button>
            {generation.message && <div className="generationStatus">{generation.message}</div>}
            {typeof generation.progress === 'number' && generation.loading && (
              <div className="progressTrack"><div className="progressFill" style={{ width: `${generation.progress}%` }} /></div>
            )}
            {generation.outputUrl && <a className="secondaryLink" href={generation.outputUrl} target="_blank" rel="noreferrer">Open generated video</a>}
          </div>
        </section>
      )}
    </main>
  );
}
