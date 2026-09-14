export type VoiceProgress = { url: string; total: number; loaded: number };

type ProgressCallback = (progress: VoiceProgress) => void;

type VoiceFiles = { onnx: string; json: string };

export const Z_VOICE_ID = 'ta_IN-rasa_male-medium';
export const Z_VOICE_LABEL = 'Z Voice • Tamil Bold Male';

const VOICE_FILES: Record<string, VoiceFiles> = {
  [Z_VOICE_ID]: {
    onnx: 'https://huggingface.co/tinisoft/piper-ta_IN-rasa_male-medium/resolve/main/ta_IN-rasa_male-medium.onnx',
    json: 'https://huggingface.co/tinisoft/piper-ta_IN-rasa_male-medium/resolve/main/ta_IN-rasa_male-medium.onnx.json',
  },
};

const ONNX_WASM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/';
const PHONEMIZER_JS = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.js';
const PHONEMIZER_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const DB_NAME = 'ai-video-maker-z-voice';
const STORE = 'models';

function filesFor(voiceId: string) {
  const files = VOICE_FILES[voiceId];
  if (!files) throw new Error(`Unknown voice: ${voiceId}`);
  return files;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbGet(key: string): Promise<ArrayBuffer | undefined> {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as ArrayBuffer | undefined);
    request.onerror = () => reject(request.error);
  }));
}

function dbPut(key: string, value: ArrayBuffer): Promise<void> {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

async function fetchArrayBuffer(url: string, onProgress?: ProgressCallback) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Voice download failed: ${response.status}`);
  const total = Number(response.headers.get('content-length') || 0);
  const reader = response.body?.getReader();
  if (!reader) return response.arrayBuffer();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.({ url, total, loaded });
  }
  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged.buffer;
}

async function getModelBytes(url: string, onProgress?: ProgressCallback) {
  try {
    const cached = await dbGet(url);
    if (cached) return cached;
  } catch {
    // IndexedDB is an optimization only; synthesis still works without cache.
  }
  const data = await fetchArrayBuffer(url, onProgress);
  try { await dbPut(url, data); } catch { /* ignore cache failures */ }
  return data;
}

let ortModule: any = null;
async function getOrt() {
  if (!ortModule) {
    ortModule = await import('onnxruntime-web');
    ortModule.env.allowLocalModels = false;
    ortModule.env.wasm.numThreads = 1;
    ortModule.env.wasm.wasmPaths = ONNX_WASM_BASE;
  }
  return ortModule;
}

type PiperFactory = (options: Record<string, unknown>) => Promise<any>;
let piperFactory: PiperFactory | null = null;

function loadPhonemizer(): Promise<PiperFactory> {
  if (piperFactory) return Promise.resolve(piperFactory);
  const browserWindow = window as unknown as { createPiperPhonemize?: PiperFactory };
  if (browserWindow.createPiperPhonemize) {
    piperFactory = browserWindow.createPiperPhonemize;
    return Promise.resolve(piperFactory);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PHONEMIZER_JS;
    script.async = true;
    script.onload = () => {
      if (!browserWindow.createPiperPhonemize) {
        reject(new Error('Z Voice phonemizer did not load.'));
        return;
      }
      piperFactory = browserWindow.createPiperPhonemize;
      resolve(piperFactory);
    };
    script.onerror = () => reject(new Error('Z Voice phonemizer download failed.'));
    document.head.appendChild(script);
  });
}

async function phonemize(text: string, espeakVoice: string): Promise<number[]> {
  const factory = await loadPhonemizer();
  return new Promise((resolve, reject) => {
    factory({
      print: (line: string) => {
        try { resolve(JSON.parse(line).phoneme_ids as number[]); }
        catch (error) { reject(error); }
      },
      printErr: (line: string) => reject(new Error(line)),
      locateFile: (file: string) => {
        if (file.endsWith('.wasm')) return `${PHONEMIZER_BASE}.wasm`;
        if (file.endsWith('.data')) return `${PHONEMIZER_BASE}.data`;
        return file;
      },
    }).then((module: any) => {
      module.callMain([
        '-l', espeakVoice,
        '--input', JSON.stringify([{ text: text.trim() }]),
        '--espeak_data', '/espeak-ng-data',
      ]);
    }).catch(reject);
  });
}

const sessions = new Map<string, { session: any; config: any }>();

async function getSession(voiceId: string, onProgress?: ProgressCallback) {
  const existing = sessions.get(voiceId);
  if (existing) return existing;
  const ort = await getOrt();
  const files = filesFor(voiceId);
  const configBytes = await getModelBytes(files.json);
  const config = JSON.parse(new TextDecoder().decode(configBytes));
  const modelBytes = await getModelBytes(files.onnx, onProgress);
  const session = await ort.InferenceSession.create(new Uint8Array(modelBytes));
  const value = { session, config };
  sessions.set(voiceId, value);
  return value;
}

function floatPcmToWav(samples: Float32Array, sampleRate: number) {
  const headerLength = 44;
  const buffer = new ArrayBuffer(headerLength + samples.length * 2);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46464952, true);
  view.setUint32(4, buffer.byteLength - 8, true);
  view.setUint32(8, 0x45564157, true);
  view.setUint32(12, 0x20746d66, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x61746164, true);
  view.setUint32(40, samples.length * 2, true);
  let offset = headerLength;
  for (const sample of samples) {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true);
    offset += 2;
  }
  return buffer;
}

export async function synthesizeZVoice(text: string, onProgress?: ProgressCallback): Promise<Blob> {
  if (!text.trim()) throw new Error('Narration text is empty.');
  const ort = await getOrt();
  const { session, config } = await getSession(Z_VOICE_ID, onProgress);
  const phonemeIds = await phonemize(text, config.espeak.voice || 'ta');
  const feeds: Record<string, any> = {
    input: new ort.Tensor('int64', BigInt64Array.from(phonemeIds, (value) => BigInt(value)), [1, phonemeIds.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(phonemeIds.length)])),
    scales: new ort.Tensor('float32', Float32Array.from([
      config.inference?.noise_scale ?? 0.667,
      0.88,
      config.inference?.noise_w ?? 0.8,
    ])),
  };
  if (Object.keys(config.speaker_id_map ?? {}).length) {
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]));
  }
  const result = await session.run(feeds);
  const pcm = result.output.data as Float32Array;
  return new Blob([floatPcmToWav(pcm, config.audio?.sample_rate || 22050)], { type: 'audio/wav' });
}
