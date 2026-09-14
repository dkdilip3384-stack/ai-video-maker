# AI Video GPU Worker

The web app is intentionally separated from the heavy GPU renderer. This folder defines the worker contract used by `AI_VIDEO_API_URL`.

## Required HTTP API

### `POST /generate`

Receives:

```json
{
  "project": {
    "id": "project-123",
    "mode": "film",
    "format": "9:16",
    "language": "ta",
    "title": "AI Short Film Project",
    "scenes": [
      {
        "id": "scene-1",
        "title": "Opening",
        "durationSeconds": 5,
        "visualPrompt": "cinematic live-action...",
        "camera": "slow push-in",
        "voiceText": "...",
        "transition": "match cut"
      }
    ]
  }
}
```

Returns a job object:

```json
{
  "id": "job-123",
  "provider": "wan-comfyui",
  "status": "queued",
  "progress": 0
}
```

### `GET /jobs/:id`

Returns the same job shape. When finished:

```json
{
  "id": "job-123",
  "provider": "wan-comfyui",
  "status": "completed",
  "progress": 100,
  "outputUrl": "https://.../final.mp4"
}
```

## Intended free/self-hosted stack

- ComfyUI as the workflow engine
- Wan-family image-to-video / text-to-video workflow
- FFmpeg to concatenate scenes, mix audio and burn subtitles
- Local disk or S3-compatible storage for generated MP4 files

The frontend does not need to change when the worker implementation changes; only `AI_VIDEO_API_URL` changes.
