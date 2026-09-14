'use client';

import { useState } from 'react';
import type { StoryboardProject } from '../lib/storyboard';

type Props = {
  project: StoryboardProject;
  assets: File[];
};

function dimensions(format: string) {
  if (format === '16:9') return { width: 960, height: 540 };
  if (format === '1:1') return { width: 720, height: 720 };
  return { width: 540, height: 960 };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

async function loadImages(files: File[]) {
  const imageFiles = files.filter((file) => file.type.startsWith('image/')).slice(0, 8);
  const loaded: HTMLImageElement[] = [];
  for (const file of imageFiles) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
    if (img.naturalWidth > 0) loaded.push(img);
  }
  return loaded;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number, progress: number) {
  const baseScale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const zoom = 1.02 + progress * 0.12;
  const scale = baseScale * zoom;
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const panX = (progress - 0.5) * width * 0.06;
  const panY = (0.5 - progress) * height * 0.04;
  ctx.drawImage(img, (width - drawW) / 2 + panX, (height - drawH) / 2 + panY, drawW, drawH);
}

export default function BrowserVideoExporter({ project, assets }: Props) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');

  async function exportVideo() {
    if (exporting) return;
    if (typeof MediaRecorder === 'undefined') {
      setStatus('This browser does not support video recording.');
      return;
    }

    setExporting(true);
    setStatus('Preparing browser render…');

    try {
      const { width, height } = dimensions(project.format);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable.');

      const images = await loadImages(assets);
      const fps = 30;
      const stream = canvas.captureStream(fps);
      const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };

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
          const gradient = ctx.createLinearGradient(0, 0, width, height);
          gradient.addColorStop(0, `hsl(${228 + overall * 20} 55% 16%)`);
          gradient.addColorStop(1, `hsl(${190 + overall * 35} 58% 10%)`);
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);

          const image = images.length ? images[(scene.order - 1) % images.length] : null;
          if (image) {
            ctx.save();
            ctx.globalAlpha = 0.96;
            drawCover(ctx, image, width, height, sceneProgress);
            ctx.restore();
          } else {
            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.rotate((sceneProgress - 0.5) * 0.05);
            ctx.fillStyle = 'rgba(124,140,255,.18)';
            ctx.fillRect(-width * 0.32, -height * 0.28, width * 0.64, height * 0.56);
            ctx.restore();
          }

          const shade = ctx.createLinearGradient(0, height * 0.35, 0, height);
          shade.addColorStop(0, 'rgba(5,8,18,0.04)');
          shade.addColorStop(1, 'rgba(5,8,18,0.94)');
          ctx.fillStyle = shade;
          ctx.fillRect(0, 0, width, height);

          const margin = width * 0.07;
          const textY = height * 0.70;
          ctx.fillStyle = 'rgba(220,226,247,.78)';
          ctx.font = `${Math.round(width * 0.028)}px Arial`;
          ctx.fillText(`SCENE ${scene.order} / ${project.scenes.length}`, margin, textY);

          ctx.fillStyle = '#ffffff';
          ctx.font = `700 ${Math.round(width * 0.07)}px Arial`;
          const titleLines = wrapText(ctx, scene.onScreenText || scene.title, width - margin * 2);
          titleLines.forEach((line, index) => ctx.fillText(line, margin, textY + width * 0.085 * (index + 1)));

          ctx.fillStyle = 'rgba(232,235,247,.88)';
          ctx.font = `${Math.round(width * 0.032)}px Arial`;
          const narration = wrapText(ctx, scene.narration, width - margin * 2);
          const narrationY = Math.min(height - height * 0.08, textY + width * 0.085 * (titleLines.length + 1.5));
          narration.forEach((line, index) => ctx.fillText(line, margin, narrationY + width * 0.044 * index));

          ctx.fillStyle = 'rgba(255,255,255,.18)';
          ctx.fillRect(margin, height - height * 0.035, width - margin * 2, Math.max(4, height * 0.005));
          ctx.fillStyle = '#d9deff';
          ctx.fillRect(margin, height - height * 0.035, (width - margin * 2) * overall, Math.max(4, height * 0.005));

          setStatus(`Rendering motion preview… ${Math.round(overall * 100)}%`);
          if (elapsed >= totalMs) {
            resolve();
            return;
          }
          requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
      });

      recorder.stop();
      await done;
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ai-video-maker-${project.mode}-${Date.now()}.webm`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatus('Motion preview exported successfully.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Browser video export failed.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="browserExportBox">
      <div>
        <strong>Browser motion export</strong>
        <p>GPU இல்லாமலும் animated promo preview-ஐ WebM video file-ஆ export பண்ணலாம்.</p>
      </div>
      <button className="secondary" type="button" disabled={exporting} onClick={exportVideo}>
        {exporting ? 'Rendering…' : 'Export Motion Preview'}
      </button>
      {status && <div className="generationStatus">{status}</div>}
    </div>
  );
}
