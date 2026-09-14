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


def _srt_time(seconds: float) -> str:
    millis = int(round(seconds * 1000))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _write_subtitles(scenes: list[dict[str, Any]], path: Path) -> bool:
    blocks: list[str] = []
    cursor = 0.0
    number = 1
    for scene in scenes:
        duration = max(0.1, float(scene.get("durationSeconds") or 0))
        text = str(scene.get("subtitle") or "").strip()
        if text:
            blocks.append(
                f"{number}\n{_srt_time(cursor)} --> {_srt_time(cursor + duration)}\n{text}\n"
            )
            number += 1
        cursor += duration
    if not blocks:
        return False
    path.write_text("\n".join(blocks), encoding="utf-8")
    return True


def _subtitle_filter(path: Path) -> str:
    escaped = str(path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    return (
        f"subtitles='{escaped}':"
        "force_style='FontName=Noto Sans Tamil,FontSize=26,PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=54,Alignment=2'"
    )


async def _run_ffmpeg(args: list[str]) -> None:
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-y",
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    if process.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {stderr.decode(errors='ignore')[-1800:]}")


async def render_manifest(manifest: dict[str, Any], job_id: str) -> str:
    scenes = manifest.get("scenes") or []
    if not scenes:
        raise RuntimeError("Render manifest has no scenes")

    with tempfile.TemporaryDirectory(prefix="ai-video-render-") as tmp:
        tmp_path = Path(tmp)
        concat_file = tmp_path / "concat.txt"
        subtitle_file = tmp_path / "subtitles.srt"
        base_video = tmp_path / "base.mp4"
        clip_paths: list[Path] = []
        voice_inputs: list[tuple[Path, int, int]] = []
        music_path: Path | None = None

        async with httpx.AsyncClient(timeout=180, follow_redirects=True) as client:
            cursor_ms = 0
            for index, scene in enumerate(scenes, start=1):
                video_url = scene.get("videoUrl")
                if not video_url:
                    raise RuntimeError(f"Scene {scene.get('id', index)} is missing videoUrl")
                clip_path = tmp_path / f"scene-{index:03d}.mp4"
                await _download(client, str(video_url), clip_path)
                clip_paths.append(clip_path)

                voice_url = scene.get("voiceUrl")
                duration_ms = int(max(0.1, float(scene.get("durationSeconds") or 0)) * 1000)
                if voice_url:
                    voice_path = tmp_path / f"voice-{index:03d}.audio"
                    await _download(client, str(voice_url), voice_path)
                    voice_inputs.append((voice_path, cursor_ms, duration_ms))
                cursor_ms += duration_ms

            music_url = manifest.get("musicUrl")
            if music_url:
                music_path = tmp_path / "music.audio"
                await _download(client, str(music_url), music_path)

        concat_file.write_text(
            "\n".join(f"file {shlex.quote(str(path))}" for path in clip_paths),
            encoding="utf-8",
        )

        await _run_ffmpeg(
            [
                "-f", "concat", "-safe", "0", "-i", str(concat_file),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", str(base_video),
            ]
        )

        output_name = manifest.get("outputFileName") or f"{job_id}.mp4"
        output_path = OUTPUT_DIR / output_name
        has_subtitles = _write_subtitles(scenes, subtitle_file)

        args: list[str] = ["-i", str(base_video)]
        for voice_path, _, _ in voice_inputs:
            args += ["-i", str(voice_path)]
        music_input_index: int | None = None
        if music_path:
            music_input_index = 1 + len(voice_inputs)
            args += ["-stream_loop", "-1", "-i", str(music_path)]

        filters: list[str] = []
        video_label = "0:v"
        if has_subtitles:
            filters.append(f"[0:v]{_subtitle_filter(subtitle_file)}[vout]")
            video_label = "vout"

        audio_labels: list[str] = []
        for index, (_, start_ms, duration_ms) in enumerate(voice_inputs, start=1):
            label = f"voice{index}"
            duration_seconds = duration_ms / 1000.0
            filters.append(
                f"[{index}:a]atrim=0:{duration_seconds:.3f},asetpts=PTS-STARTPTS,"
                f"adelay={start_ms}:all=1,volume=1.0[{label}]"
            )
            audio_labels.append(f"[{label}]")

        if music_input_index is not None:
            total_duration = max(0.1, float(manifest.get("totalDurationSeconds") or 0))
            filters.append(
                f"[{music_input_index}:a]atrim=0:{total_duration:.3f},asetpts=PTS-STARTPTS,"
                "volume=0.16[music]"
            )
            audio_labels.append("[music]")

        audio_output = None
        if audio_labels:
            if len(audio_labels) == 1:
                filters.append(f"{audio_labels[0]}anull[aout]")
            else:
                filters.append(
                    f"{''.join(audio_labels)}amix=inputs={len(audio_labels)}:duration=longest:dropout_transition=2[aout]"
                )
            audio_output = "aout"

        if filters:
            args += ["-filter_complex", ";".join(filters)]

        args += ["-map", f"[{video_label}]" if video_label == "vout" else "0:v"]
        if audio_output:
            args += ["-map", f"[{audio_output}]", "-c:a", "aac", "-b:a", "192k"]
        else:
            args += ["-an"]

        args += [
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-shortest", str(output_path),
        ]
        await _run_ffmpeg(args)

    if PUBLIC_OUTPUT_BASE_URL:
        return f"{PUBLIC_OUTPUT_BASE_URL}/{output_name}"
    return f"file://{output_path}"
