# AI Video Maker

A mobile-first AI video creation project for generating real motion promo videos and cinematic short-film scenes from a story, logo, app screens, images and voice.

## Product goal

This is **not** a photo slideshow maker. The target output is real motion: scene-by-scene generated video, camera movement, consistent visual direction, voice, subtitles, music and final MP4 assembly.

## Modes

- **Promo Mode** — logo + app screenshots/screen recordings + features → professional animated commercial
- **AI Film Mode** — story → cinematic scene plan → AI-generated moving clips → voice/subtitles/music → final MP4
- Output formats: 9:16, 16:9 and 1:1
- Tamil / English / mixed language
- Mobile-first UI

## Current implementation

- Story/prompt input and automatic scene planner
- Promo and Film modes
- Per-scene duration, visual prompt, camera direction, narration and transition
- Direct signed asset upload flow for logos, screenshots, videos and reference media
- Supabase Storage adapter for browser-to-storage uploads
- `Generate Moving Video` action with queued/processing/progress/completed status polling
- Wan/ComfyUI workflow adapter with node mapping and output polling
- Multi-scene generation instead of first-scene-only generation
- Optional Tamil/English TTS before the GPU job starts
- FFmpeg final renderer
- Per-scene narration mixing
- Burned-in subtitles, including Tamil font support in the worker image
- Optional background music mixing
- Final MP4 assembly
- Dockerized GPU/render worker
- GitHub Actions verification for Next.js, Python worker code and the worker Docker image

## Architecture

### Web app

Next.js + React handles the mobile UI, storyboard, asset upload and orchestration.

### Asset storage

Selected logo/screens/source clips are uploaded directly from the browser to a dedicated public Supabase Storage bucket using short-lived signed upload URLs. The service-role key stays server-side.

### GPU video worker

Heavy video generation is separate from Vercel. The app connects through `AI_VIDEO_API_URL`. The worker queues an exported Wan/ComfyUI API workflow for every scene and polls ComfyUI until each clip is ready.

### Voice worker

Tamil/English TTS connects through `AI_VOICE_API_URL`. If voice is unavailable, the project can still render with subtitles.

### Final renderer

The GPU worker uses FFmpeg to concatenate generated scenes, add narration at the correct scene timing, burn subtitles, mix optional background music and produce the final MP4.

## Environment

Copy `.env.example` and configure the web app provider/storage values. The GPU worker also needs its ComfyUI workflow/node mapping and a public output URL.

## Still required for a real end-to-end generation

The application code path is ready, but a real GPU runtime is still required. To produce actual AI moving clips, deploy the `worker/` service alongside ComfyUI/Wan, export the chosen Wan workflow in API format, map its prompt/dimension/frame/seed/output node IDs, and set the web app `AI_VIDEO_API_URL` to that worker. A voice provider and Supabase bucket are optional integrations that unlock narration and reference uploads.
