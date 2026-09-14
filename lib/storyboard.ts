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

function productNameFromPrompt(prompt: string) {
  const explicit = prompt.match(/(?:for|about|promo for|app called|named)\s+([A-Z0-9][A-Z0-9 _-]{2,24})/i)?.[1]?.trim();
  if (explicit) return explicit.replace(/[.,].*$/, '').trim();
  const branded = prompt.match(/\b([A-Z][A-Z0-9-]{2,20})\b/)?.[1];
  return branded || 'இந்த ஆப்';
}

function tamilSpeechProductName(productName: string) {
  const clean = productName.trim();
  if (/z[- _]?kanakku/i.test(clean) || /zkanakku/i.test(clean)) return 'ஜெட் கணக்கு';
  return clean;
}

function tamilPromoNarration(index: number, total: number, productName: string) {
  const spokenName = tamilSpeechProductName(productName);
  const lines = [
    'நண்பர்களோடு செலவு பகிர்ந்ததும், கணக்கு குழப்பமாகிப் போகுதா?',
    'யார் எவ்வளவு கொடுத்தாங்க? யாருக்கு எவ்வளவு பாக்கி? இனிமேல் நினைச்சுக்கிட்டு இருக்க வேண்டாம்.',
    `${spokenName}. பகிர்ந்த செலவுகளை சுலபமாக பதிவு பண்ணலாம். எல்லாருடைய கணக்கையும் ஒரே இடத்தில் தெளிவாக பார்க்கலாம்.`,
    'ஒரு செலவை சேர்த்த உடனே, யார் கொடுத்தது, யாருக்கு பகிரணும், எவ்வளவு பாக்கி — கணக்கு தானாக மாறும்.',
    'பேலன்ஸ், செட்டில்மெண்ட், பழைய கணக்கு — எல்லாமே தெளிவா இருக்கும். குழப்பம் குறையும். நேரமும் சேமிக்கும்.',
    'ரூம்மேட்ஸ், நண்பர்கள், குடும்பம், பயணம் — பகிர்ந்த செலவு எங்க இருக்குதோ, அங்க இந்த ஆப் உதவும்.',
    'செலவு பதிவு பண்ணுங்க. பேலன்ஸ் பாருங்க. செட்டில்மெண்ட் முடிச்சிடுங்க. அவ்வளவுதான்.',
    `${spokenName}. பகிர்ந்த செலவுக்கு சுலபமான கணக்கு. இன்றே பயன்படுத்திப் பாருங்கள்.`,
  ];
  if (total <= 5) {
    const five = [lines[0], lines[1], lines[2], lines[3], lines[7]];
    return five[Math.min(index, five.length - 1)];
  }
  return lines[Math.min(index, lines.length - 1)];
}

function englishPromoNarration(index: number, total: number, productName: string) {
  const lines = [
    'Shared expenses should be simple, not confusing.',
    'Stop guessing who paid, who owes, and what is still pending.',
    `${productName} keeps shared expenses clear in one place.`,
    'Add an expense once and balances update automatically.',
    'See balances, settlements and history without doing the math yourself.',
    'Perfect for roommates, friends, families and trips.',
    'Add. Check. Settle. Done.',
    `${productName}. A simpler way to manage shared expenses.`,
  ];
  if (total <= 5) {
    const five = [lines[0], lines[1], lines[2], lines[3], lines[7]];
    return five[Math.min(index, five.length - 1)];
  }
  return lines[Math.min(index, lines.length - 1)];
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
  const fallback = mode === 'promo'
    ? 'Introduce the product, show the main problem, demonstrate the key features, show the result, and end with a strong call to action.'
    : 'Introduce the character and place, create a small conflict, build emotion through action, resolve the moment, and end on a memorable final shot.';

  const source = prompt.trim() || fallback;
  const chunks = sentenceChunks(source);
  const sceneCount = Math.min(8, Math.max(5, chunks.length || 5));
  const secondsPerScene = Math.max(3, Math.round(duration / sceneCount));
  const productName = productNameFromPrompt(source);

  const promoBeats = ['Hook', 'Problem', 'Product reveal', 'Feature in action', 'Benefit', 'Social / trust moment', 'Result', 'Call to action'];
  const filmBeats = ['Opening', 'Character', 'Setup', 'Conflict', 'Action', 'Emotion', 'Resolution', 'Final shot'];
  const beats = mode === 'promo' ? promoBeats : filmBeats;

  const scenes: Scene[] = Array.from({ length: sceneCount }, (_, index) => {
    const sourceLine = chunks[index % Math.max(chunks.length, 1)] || source;
    const beat = beats[index] || `Scene ${index + 1}`;

    let narration = compact(sourceLine, 120);
    if (mode === 'promo' && language === 'ta') narration = tamilPromoNarration(index, sceneCount, productName);
    else if (mode === 'promo' && language === 'en') narration = englishPromoNarration(index, sceneCount, productName);
    else if (mode === 'promo' && language === 'mix') narration = index % 2 === 0
      ? tamilPromoNarration(index, sceneCount, productName)
      : englishPromoNarration(index, sceneCount, productName);

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
