# Deployment

## Web app (Vercel)

Import this GitHub repository into Vercel and use the repository root as the project root. Next.js is detected automatically.

Configure these environment variables in Vercel:

- `AI_VIDEO_API_URL` — public HTTPS URL of the GPU worker
- `AI_VIDEO_API_KEY` — same bearer key configured on the worker
- `AI_VOICE_API_URL` — optional Tamil/English TTS endpoint
- `AI_VOICE_API_KEY` — optional TTS bearer key
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only; never expose to the browser
- `SUPABASE_ASSET_BUCKET` — defaults to `ai-video-assets`
- `AI_VIDEO_MUSIC_URL` — optional default background music URL

After deployment, open `/api/health`. It reports whether video, voice and asset storage are configured.

## GPU worker

The worker lives in `worker/` and is built as a Docker container. It expects a reachable ComfyUI/Wan installation and a Wan workflow exported in ComfyUI API format.

Required worker settings:

- `WORKER_API_KEY`
- `COMFYUI_URL`
- `COMFYUI_WORKFLOW_PATH=/app/workflow_api.json`
- the node IDs for prompt, width, height, frame count, seed and output
- `PUBLIC_OUTPUT_BASE_URL` if generated media is served from a public object store or HTTP server

Use `worker/docker-compose.example.yml` as a starting point.

## Supabase storage

Create a storage bucket named `ai-video-assets` (or set `SUPABASE_ASSET_BUCKET` to another bucket). The web app requests signed upload tokens on the server and uploads files directly from the browser to Supabase Storage.

## Smoke test

After the web app is live:

```bash
APP_URL=https://your-app.example.com node scripts/smoke.mjs
```

A passing smoke test confirms that the app is reachable and that the health contract is intact. Provider readiness is shown in the returned JSON.

## End-to-end flow

1. User enters story/prompt and selects assets.
2. Assets upload directly to Supabase Storage.
3. Storyboard creates scenes.
4. Optional TTS creates per-scene narration URLs.
5. Web app submits the whole project to the GPU worker.
6. Worker generates every scene with Wan/ComfyUI.
7. Worker assembles scene clips, narration, Tamil/English subtitles and optional music with FFmpeg.
8. Final MP4 URL is returned to the web app.

The remaining deployment-specific requirement is a real GPU host running ComfyUI/Wan plus an exported workflow JSON matching the configured node IDs.
