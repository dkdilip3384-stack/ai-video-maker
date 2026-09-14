export type VideoMode = 'promo' | 'film';
export type VideoFormat = '9:16' | '16:9' | '1:1';
export type VideoLanguage = 'ta' | 'en' | 'mix';

export type SceneSpec = {
  id: string;
  title: string;
  durationSeconds: number;
  visualPrompt: string;
  camera: string;
  voiceText?: string;
  transition?: string;
  referenceAssetUrls?: string[];
};

export type VideoProject = {
  id: string;
  mode: VideoMode;
  format: VideoFormat;
  language: VideoLanguage;
  title: string;
  scenes: SceneSpec[];
};

export type GenerateVideoRequest = {
  project: VideoProject;
  sceneId?: string;
};

export type GenerationJob = {
  id: string;
  provider: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'not_configured';
  progress: number;
  outputUrl?: string;
  error?: string;
};
