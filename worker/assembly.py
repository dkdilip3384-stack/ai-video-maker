from __future__ import annotations

import asyncio
import os
import shlex
import tempfile
from pathlib import Path
from typing import Any

import httpx

PUBLIC_OUTPUT_BASE_URL = os.getenv("PUBLIC_OUTPUT_BASE_URL", "").rstrip("/")
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/tmp/ai-video-maker-output"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


async def _download(client: httpx.AsyncClient, url: str, path: Path) -> None:
    async with client.stream("GET", url) as response:
        response.raise_for_status()
        with path.open("wb") as handle:
            async for chunk in response.aiter_bytes():
                handle.write(chunk)


async def render_manifest(manifest: dict[str, Any], job_id: str) -> str:
    scenes = manifest.get("scenes") or []
    if not scenes:
        raise RuntimeError("Render manifest has no scenes")

    with tempfile.TemporaryDirectory(prefix="ai-video-render-") as tmp:
        tmp_path = Path(tmp)
        concat_file = tmp_path / "concat.txt"
        clip_paths: list[Path] = []

        async with httpx.AsyncClient(timeout=120) as client:
            for index, scene in enumerate(scenes, start=1):
                video_url = scene.get("videoUrl")
                if not video_url:
                    raise RuntimeError(f"Scene {scene.get('id', index)} is missing videoUrl")
                clip_path = tmp_path / f"scene-{index:03d}.mp4"
                await _download(client, video_url, clip_path)
                clip_paths.append(clip_path)

        concat_file.write_text(
            "\n".join(f"file {shlex.quote(str(path))}" for path in clip_paths),
            encoding="utf-8",
        )

        output_name = manifest.get("outputFileName") or f"{job_id}.mp4"
        output_path = OUTPUT_DIR / output_name

        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_file),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()
        if process.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {stderr.decode(errors='ignore')[-1200:]}")

    if PUBLIC_OUTPUT_BASE_URL:
        return f"{PUBLIC_OUTPUT_BASE_URL}/{output_name}"
    return f"file://{output_path}"
