# GPU Video Worker

This folder is the GPU-side service for AI Video Maker.

It exposes:

- `GET /health`
- `POST /generate`
- `GET /jobs/{job_id}`

The web app calls this worker through `AI_VIDEO_API_URL` and optional `AI_VIDEO_API_KEY`.

## Run directly

```bash
cd worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Run with Docker

```bash
docker build -t ai-video-worker .
docker run --rm -p 8000:8000 \
  -e COMFYUI_URL=http://host.docker.internal:8188 \
  -e WORKER_API_KEY=change-me \
  ai-video-worker
```

## Environment

- `WORKER_API_KEY` optional bearer token expected from the web app
- `COMFYUI_URL` defaults to `http://127.0.0.1:8188`
- `PUBLIC_OUTPUT_BASE_URL` reserved for generated MP4 URLs

## Web app connection

Set these on the deployed Next.js app:

```text
AI_VIDEO_API_URL=https://your-gpu-worker.example.com
AI_VIDEO_API_KEY=the-same-worker-api-key
```

## Current integration state

The worker validates projects, accepts generation jobs, checks ComfyUI connectivity, and forwards scene data toward ComfyUI. It deliberately does not fake a completed MP4.

The remaining GPU-specific step is to export a working Wan video workflow from the actual ComfyUI installation, map its node IDs/inputs into `submit_to_comfyui()`, watch ComfyUI history until the clip finishes, then expose the produced MP4 URL.

Once that workflow is connected, the existing web app `Generate Moving Video` flow can start real jobs without redesigning the frontend.
