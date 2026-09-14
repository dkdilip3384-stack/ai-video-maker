import type { VideoProject } from '../video/types';

export type RenderScene = {
  id: string;
  order: number;
  durationSeconds: number;
  videoUrl?: string;
  voiceUrl?: string;
  subtitle: string;
  transition: string;
};

export type RenderManifest = {
  projectId: string;
  title: string;
  format: VideoProject['format'];
  totalDurationSeconds: number;
  scenes: RenderScene[];
  musicUrl?: string;
  outputFileName: string;
};

export function buildRenderManifest(project: VideoProject): RenderManifest {
  const scenes = project.scenes.map((scene, index) => ({
    id: scene.id,
    order: index + 1,
    durationSeconds: scene.durationSeconds,
    subtitle: scene.voiceText || '',
    transition: scene.transition || 'cut',
  }));

  return {
    projectId: project.id,
    title: project.title,
    format: project.format,
    totalDurationSeconds: scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    scenes,
    outputFileName: `${project.id || 'ai-video'}.mp4`,
  };
}
