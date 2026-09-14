export type VideoMode = 'promo' | 'film';

export type Scene = {
  id: string;
  order: number;
  title: string;
  duration: number;
  narration: string;
  visualPrompt: string;
  camera: string;
  onScreenText: string;
  transition: string;
};

export type StoryboardProject = {
  title: string;
  mode: VideoMode;
  language: string;
  format: string;
  totalDuration: number;
  scenes: Scene[];
};

const cameras = [
  'Slow push-in with gentle parallax',
  'Smooth left-to-right tracking shot',
  'Medium close-up with subtle handheld realism',
  'Wide establishing shot, then slow dolly forward',
  'Over-the-shoulder shot with rack focus',
  'Top-down detail shot with controlled zoom',
];

const transitions = ['Soft whip pan', 'Match cut', 'Motion blur cut', 'Clean zoom transition', 'Light sweep', 'Hard cinematic cut'];

function sentenceChunks(text: string) {
  return text
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function compact(text: string, max = 72) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}

export function buildStoryboard({
  prompt,
  mode,
  language,
  format,
  duration = 30,
}: {
  prompt: string;
  mode: VideoMode;
  language: string;
  format: string;
  duration?: number;
}): StoryboardProject {
  const fallback =
    mode === 'promo'
      ? 'Introduce the product, show the main problem, demonstrate the key features, show the result, and end with a strong call to action.'
      : 'Introduce the character and place, create a small conflict, build emotion through action, resolve the moment, and end on a memorable final shot.';

  const source = prompt.trim() || fallback;
  const chunks = sentenceChunks(source);
  const sceneCount = Math.min(8, Math.max(5, chunks.length || 5));
  const secondsPerScene = Math.max(3, Math.round(duration / sceneCount));

  const promoBeats = [
    'Hook',
    'Problem',
    'Product reveal',
    'Feature in action',
    'Benefit',
    'Social / trust moment',
    'Result',
    'Call to action',
  ];
  const filmBeats = ['Opening', 'Character', 'Setup', 'Conflict', 'Action', 'Emotion', 'Resolution', 'Final shot'];
  const beats = mode === 'promo' ? promoBeats : filmBeats;

  const scenes: Scene[] = Array.from({ length: sceneCount }, (_, index) => {
    const sourceLine = chunks[index % Math.max(chunks.length, 1)] || source;
    const beat = beats[index] || `Scene ${index + 1}`;
    const isLast = index === sceneCount - 1;

    const narration = isLast && mode === 'promo'
      ? `${compact(sourceLine, 95)}. End with a clear, confident call to action.`
      : compact(sourceLine, 120);

    const visualPrompt = mode === 'promo'
      ? `${beat}: professional modern commercial shot. Show real motion, polished lighting, believable depth, app/product interaction where relevant, no slideshow feel. ${compact(sourceLine, 150)}`
      : `${beat}: cinematic live-action style scene with natural body motion, consistent character appearance, realistic environment, expressive lighting and depth. ${compact(sourceLine, 150)}`;

    return {
      id: `scene-${index + 1}`,
      order: index + 1,
      title: beat,
      duration: secondsPerScene,
      narration,
      visualPrompt,
      camera: cameras[index % cameras.length],
      onScreenText: mode === 'promo' ? compact(sourceLine, 42) : '',
      transition: transitions[index % transitions.length],
    };
  });

  return {
    title: mode === 'promo' ? 'AI Promo Project' : 'AI Short Film Project',
    mode,
    language,
    format,
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    scenes,
  };
}
