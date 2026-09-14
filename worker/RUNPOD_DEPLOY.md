# RunPod deployment for AI Video Maker

Use this deployment path when you want the full AI Film / GPU pipeline.

## Published worker image

```text
ghcr.io/dkdilip3384-stack/ai-video-maker-worker:latest
```

This image contains the AI Video Maker FastAPI adapter and FFmpeg assembly layer. It expects a reachable ComfyUI/Wan runtime; it does **not** bundle the Wan model itself.

## Recommended RunPod setup

1. Create a RunPod Serverless GPU endpoint.
2. Import the image above from GHCR.
3. Choose a GPU with enough VRAM for the Wan workflow you plan to use.
4. Make ComfyUI available to the worker and set the environment variables below.
5. Export a tested ComfyUI API workflow JSON and mount/copy it at the configured path.
6. Test `/health` before connecting the web app.

## Required worker environment

```text
WORKER_API_KEY=<long-random-secret>
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_WORKFLOW_PATH=/app/workflow_api.json
COMFYUI_PROMPT_NODE_ID=<node-id>
COMFYUI_WIDTH_NODE_ID=<node-id>
COMFYUI_HEIGHT_NODE_ID=<node-id>
COMFYUI_FRAMES_NODE_ID=<node-id>
COMFYUI_SEED_NODE_ID=<node-id>
COMFYUI_OUTPUT_NODE_ID=<node-id>
PUBLIC_OUTPUT_BASE_URL=<public-output-base-url>
OUTPUT_DIR=/tmp/ai-video-maker-output
VIDEO_FPS=16
```

## Web app connection

When the RunPod endpoint is working, configure the deployed Next.js app with:

```text
AI_VIDEO_API_URL=https://<your-worker-endpoint>
AI_VIDEO_API_KEY=<same-WORKER_API_KEY>
```

The app already has provider health checks, job submission, polling, voice hooks, asset references, and final-output UI.

## Validation checklist

- `GET /health` returns healthy worker + ComfyUI connectivity.
- A single scene can be submitted and a Wan clip is produced.
- The generated clip has a publicly reachable URL.
- Multi-scene job generates all clips.
- FFmpeg assembly produces the final MP4.
- The final MP4 URL is reachable from the browser.

## Important

The current GHCR image is the adapter/assembly worker only. A RunPod deployment still needs an actual Wan/ComfyUI model runtime and a tested workflow JSON. Do not treat a successful container start as proof that AI video inference is ready.
