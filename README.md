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

- Story/prompt input
- Promo and Film modes
- Automatic storyboard / scene planner
- Per-scene duration, visual prompt, camera direction, narration and transition
- Asset selection UI for logo, screenshots, videos and character references
- Downloadable project JSON
- `Generate Moving Video` UI action
- Pluggable `/api/video/generate` and `/api/video/status` backend
- Pluggable Tamil/English voice endpoint
- Health/provider status API
- GitHub Actions build verification
- Self-hosted GPU worker contract in `worker/README.md`

## Architecture

### Web app

Next.js + React handles the mobile UI, storyboard and orchestration.

### GPU video worker

Heavy video generation is intentionally separate from Vercel. The app connects through `AI_VIDEO_API_URL`. This allows a Wan/ComfyUI GPU machine, a future free GPU environment, or a paid provider to be swapped without changing the frontend.

### Voice worker

Tamil/English TTS connects through `AI_VOICE_API_URL`.

### Final renderer

Planned final stage uses FFmpeg / a rendering worker to concatenate generated scenes, mix narration/music and produce the final MP4.

## Environment

Copy `.env.example` and configure the provider URLs when a GPU/voice worker is available.

## Remaining milestones

1. Connect a real Wan/ComfyUI GPU worker.
2. Upload/reference assets so generated characters/products stay consistent.
3. Generate scene clips and poll job progress.
4. Generate Tamil/English voice tracks.
5. Assemble clips + voice + subtitles + music into final MP4.
6. Deploy web UI and run end-to-end tests.
