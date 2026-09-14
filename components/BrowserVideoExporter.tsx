'use client';

import { useState } from 'react';
import type { StoryboardProject } from '../lib/storyboard';

type Props = { project: StoryboardProject; assets: File[] };
type LoadedMedia =
  | { kind: 'image'; element: HTMLImageElement; url: string }
  | { kind: 'video'; element: HTMLVideoElement; url: string };

function dimensions(format: string) {
  if (format === '16:9') return { width: 960, height: 540 };
  if (format === '1:1') return { width: 720, height: 720 };
  return { width: 540, height: 960 };
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

function easeInOut(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else line = test;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

async function loadMedia(files: File[]) {
  const selected = files.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/')).slice(0, 10);
  const media: LoadedMedia[] = [];

  for (const file of selected) {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        video.onloadeddata = done;
        video.onerror = done;
        setTimeout(done, 3500);
      });
      if (video.videoWidth > 0) media.push({ kind: 'video', element: video, url });
      else URL.revokeObjectURL(url);
    } else {
      const image = new Image();
      image.decoding = 'async';
      await new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = url;
      });
      if (image.naturalWidth > 0) media.push({ kind: 'image', element: image, url });
      else URL.revokeObjectURL(url);
    }
  }
  return media;
}

function mediaSize(media: LoadedMedia) {
  return media.kind === 'video'
    ? { width: media.element.videoWidth, height: media.element.videoHeight }
    : { width: media.element.naturalWidth, height: media.element.naturalHeight };
}

function drawMediaCover(
  ctx: CanvasRenderingContext2D,
  media: LoadedMedia,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  zoomStrength = 0.08,
) {
  const source = media.element;
  const size = mediaSize(media);
  if (!size.width || !size.height) return;
  const scale = Math.max(width / size.width, height / size.height) * (1.02 + easeInOut(progress) * zoomStrength);
  const drawW = size.width * scale;
  const drawH = size.height * scale;
  const panX = (progress - 0.5) * width * 0.09;
  const panY = (0.5 - progress) * height * 0.05;
  ctx.drawImage(source, x + (width - drawW) / 2 + panX, y + (height - drawH) / 2 + panY, drawW, drawH);
}

function drawPhone(
  ctx: CanvasRenderingContext2D,
  media: LoadedMedia,
  cx: number,
  cy: number,
  phoneW: number,
  phoneH: number,
  progress: number,
  variant: number,
) {
  const enter = easeOut(Math.min(1, progress * 4));
  const exit = easeInOut(Math.max(0, (progress - 0.84) / 0.16));
  const scale = (0.76 + enter * 0.24) * (1 - exit * 0.08);
  const direction = variant % 2 === 0 ? 1 : -1;
  const xOffset = direction * (1 - enter) * phoneW * 0.75 + direction * exit * phoneW * 0.18;
  const rotation = direction * ((1 - enter) * 0.12 - progress * 0.025);

  ctx.save();
  ctx.translate(cx + xOffset, cy);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);

  ctx.shadowColor = 'rgba(0,0,0,.48)';
  ctx.shadowBlur = phoneW * 0.12;
  ctx.shadowOffsetY = phoneW * 0.055;
  ctx.fillStyle = '#05070c';
  roundRect(ctx, -phoneW / 2, -phoneH / 2, phoneW, phoneH, phoneW * 0.11);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  const bezel = phoneW * 0.035;
  const screenX = -phoneW / 2 + bezel;
  const screenY = -phoneH / 2 + bezel;
  const screenW = phoneW - bezel * 2;
  const screenH = phoneH - bezel * 2;
  ctx.save();
  roundRect(ctx, screenX, screenY, screenW, screenH, phoneW * 0.085);
  ctx.clip();
  ctx.fillStyle = '#101522';
  ctx.fillRect(screenX, screenY, screenW, screenH);
  drawMediaCover(ctx, media, screenX, screenY, screenW, screenH, progress, 0.12);
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,.9)';
  roundRect(ctx, -phoneW * 0.13, -phoneH / 2 + phoneW * 0.05, phoneW * 0.26, phoneW * 0.035, phoneW * 0.02);
  ctx.fill();

  const tapPhase = (progress * 3.2) % 1;
  if (progress > 0.2 && progress < 0.86) {
    const pulse = 1 - tapPhase;
    const px = phoneW * (variant % 2 ? -0.12 : 0.14);
    const py = phoneH * (variant % 3 === 0 ? 0.1 : -0.06);
    ctx.strokeStyle = `rgba(125,145,255,${0.75 * pulse})`;
    ctx.lineWidth = Math.max(2, phoneW * 0.012);
    ctx.beginPath();
    ctx.arc(px, py, phoneW * (0.035 + tapPhase * 0.12), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.arc(px, py, phoneW * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFloatingCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, progress: number, label: string) {
  const enter = easeOut(Math.min(1, Math.max(0, progress - 0.12) * 4));
  ctx.save();
  ctx.globalAlpha = enter;
  ctx.translate(x, y + (1 - enter) * 34);
  ctx.shadowColor = 'rgba(0,0,0,.3)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = 'rgba(20,26,44,.88)';
  roundRect(ctx, 0, 0, w, w * 0.28, w * 0.06);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.max(14, Math.round(w * 0.07))}px Arial`;
  ctx.fillText(label.slice(0, 24), w * 0.08, w * 0.17);
  ctx.restore();
}

export default function BrowserVideoExporter({ project, assets }: Props) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');

  async function exportVideo() {
    if (exporting) return;
    if (typeof MediaRecorder === 'undefined') {
      setStatus('இந்த browser video export support பண்ணவில்லை. Chrome-ல் try பண்ணுங்க.');
      return;
    }
    if (!assets.length) {
      setStatus('Logo / app screenshots / screen recording add பண்ணி export செய்யுங்கள்.');
      return;
    }

    setExporting(true);
    setStatus('Preparing professional promo render…');
    let media: LoadedMedia[] = [];

    try {
      const { width, height } = dimensions(project.format);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable.');

      media = await loadMedia(assets);
      if (!media.length) throw new Error('Selected assets could not be loaded.');
      await Promise.all(media.filter((item) => item.kind === 'video').map(async (item) => {
        try { await item.element.play(); } catch { /* browser may still allow frame drawing */ }
      }));

      const fps = 30;
      const stream = canvas.captureStream(fps);
      const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 7_000_000 } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const done = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error('Browser video export failed.'));
      });

      recorder.start(500);
      const totalMs = Math.max(1000, project.totalDuration * 1000);
      const startedAt = performance.now();

      await new Promise<void>((resolve) => {
        const render = () => {
          const elapsed = Math.min(totalMs, performance.now() - startedAt);
          const timeSec = elapsed / 1000;
          let cursor = 0;
          let scene = project.scenes[project.scenes.length - 1];
          let sceneProgress = 1;
          for (const candidate of project.scenes) {
            if (timeSec < cursor + candidate.duration) {
              scene = candidate;
              sceneProgress = Math.max(0, Math.min(1, (timeSec - cursor) / Math.max(0.1, candidate.duration)));
              break;
            }
            cursor += candidate.duration;
          }

          const overall = elapsed / totalMs;
          const current = media[(scene.order - 1) % media.length];
          const next = media[scene.order % media.length];
          const transition = easeInOut(Math.max(0, (sceneProgress - 0.86) / 0.14));

          ctx.fillStyle = '#070b17';
          ctx.fillRect(0, 0, width, height);

          // Moving, blurred media backdrop creates depth instead of a flat slideshow.
          ctx.save();
          ctx.globalAlpha = 0.36 * (1 - transition);
          ctx.filter = `blur(${Math.max(12, width * 0.03)}px) saturate(1.25)`;
          drawMediaCover(ctx, current, -width * 0.08, -height * 0.08, width * 1.16, height * 1.16, sceneProgress, 0.16);
          ctx.restore();
          if (transition > 0 && next) {
            ctx.save();
            ctx.globalAlpha = 0.32 * transition;
            ctx.filter = `blur(${Math.max(12, width * 0.03)}px) saturate(1.2)`;
            drawMediaCover(ctx, next, -width * 0.08, -height * 0.08, width * 1.16, height * 1.16, transition, 0.1);
            ctx.restore();
          }

          const vignette = ctx.createLinearGradient(0, 0, 0, height);
          vignette.addColorStop(0, 'rgba(4,7,17,.18)');
          vignette.addColorStop(0.58, 'rgba(4,7,17,.06)');
          vignette.addColorStop(1, 'rgba(4,7,17,.84)');
          ctx.fillStyle = vignette;
          ctx.fillRect(0, 0, width, height);

          const isPortrait = height >= width;
          const phoneW = isPortrait ? width * 0.55 : height * 0.34;
          const phoneH = phoneW * 2.02;
          const phoneCx = isPortrait ? width * 0.56 : width * 0.66;
          const phoneCy = isPortrait ? height * 0.45 : height * 0.52;
          drawPhone(ctx, current, phoneCx, phoneCy, phoneW, phoneH, sceneProgress, scene.order);

          if (isPortrait) {
            drawFloatingCard(ctx, width * 0.055, height * 0.19, width * 0.42, sceneProgress, scene.title);
          } else {
            drawFloatingCard(ctx, width * 0.07, height * 0.27, width * 0.31, sceneProgress, scene.title);
          }

          // Kinetic text enters independently from the phone.
          const textEnter = easeOut(Math.min(1, sceneProgress * 5));
          const textExit = easeInOut(Math.max(0, (sceneProgress - 0.82) / 0.18));
          const textAlpha = textEnter * (1 - textExit);
          const margin = width * 0.065;
          const titleY = isPortrait ? height * 0.76 : height * 0.42;
          ctx.save();
          ctx.globalAlpha = textAlpha;
          ctx.translate((1 - textEnter) * -width * 0.08, 0);
          ctx.fillStyle = 'rgba(174,185,255,.92)';
          ctx.font = `700 ${Math.max(13, Math.round(width * 0.027))}px Arial`;
          ctx.fillText(`0${scene.order}  •  ${scene.transition || 'MOTION'}`.toUpperCase(), margin, titleY - width * 0.055);
          ctx.fillStyle = '#fff';
          ctx.font = `800 ${Math.max(26, Math.round(width * (isPortrait ? 0.072 : 0.052)))}px Arial`;
          const title = scene.onScreenText || scene.title;
          const lines = wrapText(ctx, title, isPortrait ? width * 0.86 : width * 0.42, 2);
          lines.forEach((line, index) => ctx.fillText(line, margin, titleY + index * width * (isPortrait ? 0.085 : 0.062)));
          ctx.restore();

          // Animated accent line / progress.
          ctx.fillStyle = 'rgba(255,255,255,.16)';
          ctx.fillRect(margin, height - height * 0.035, width - margin * 2, Math.max(4, height * 0.005));
          ctx.fillStyle = '#9da9ff';
          ctx.fillRect(margin, height - height * 0.035, (width - margin * 2) * overall, Math.max(4, height * 0.005));

          // Short white flash between scenes for a real edit feel.
          if (transition > 0.72) {
            ctx.fillStyle = `rgba(255,255,255,${Math.sin((transition - 0.72) / 0.28 * Math.PI) * 0.16})`;
            ctx.fillRect(0, 0, width, height);
          }

          setStatus(`Rendering professional promo… ${Math.round(overall * 100)}%`);
          if (elapsed >= totalMs) { resolve(); return; }
          requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
      });

      recorder.stop();
      await done;
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      if (!blob.size) throw new Error('Rendered video is empty.');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ai-video-maker-promo-${Date.now()}.webm`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatus('Professional motion promo exported successfully.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Browser video export failed.');
    } finally {
      media.forEach((item) => {
        if (item.kind === 'video') item.element.pause();
        URL.revokeObjectURL(item.url);
      });
      setExporting(false);
    }
  }

  return (
    <div className="browserExportBox">
      <div>
        <strong>Professional app promo export</strong>
        <p>Photo slideshow இல்ல. App screens phone frame-க்குள் move/zoom, tap pulse, kinetic text, depth background, transitions உடன் render ஆகும். Screen recording add பண்ணினா அதையும் motion source-ஆ பயன்படுத்தும்.</p>
      </div>
      <button className="secondary" type="button" disabled={exporting} onClick={exportVideo}>
        {exporting ? 'Rendering promo…' : 'Export Professional Promo'}
      </button>
      {status && <div className="generationStatus">{status}</div>}
    </div>
  );
}
