from __future__ import annotations

import asyncio
import os
import random
import time
import uuid
from typing import Any, Dict, Literal, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from assembly import render_manifest
from comfy_adapter import check_history, load_workflow, queue_workflow

app = FastAPI(title="AI Video Maker GPU Worker", version="0.5.0")

WORKER_API_KEY = os.getenv("WORKER_API_KEY")
COMFYUI_URL = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
POLL_SECONDS = max(1.0, float(os.getenv("COMFYUI_POLL_SECONDS", "3")))
JOB_TIMEOUT_SECONDS = max(60, int(os.getenv("JOB_TIMEOUT_SECONDS", "1800")))

JobStatus = Literal["queued", "processing", "completed", "failed"]


class SceneSpec(BaseModel):
    id: str
    title: str
    durationSeconds: int = Field(default=5, ge=1, le=30)
    visualPrompt: str
    camera: str = ""
    voiceText: Optional[str] = None
    voiceUrl: Optional[str] = None
    transition: Optional[str] = None
    referenceAssetUrls: list[str] = []


class VideoProject(BaseModel):
    id: str
    mode: Literal["promo", "film"]
    format: Literal["9:16", "16:9", "1:1"]
    language: Literal["ta", "en", "mix"]
    title: str
    scenes: list[SceneSpec]
    musicUrl: Optional[str] = None


class GenerateRequest(BaseModel):
    project: VideoProject
    sceneId: Optional[str] = None


class RenderScene(BaseModel):
    id: str
    order: int
    durationSeconds: int
    videoUrl: Optional[str] = None
    voiceUrl: Optional[str] = None
    subtitle: str = ""
    transition: str = "cut"


class RenderManifest(BaseModel):
    projectId: str
    title: str
    format: Literal["9:16", "16:9", "1:1"]
    totalDurationSeconds: int
    scenes: list[RenderScene]
    musicUrl: Optional[str] = None
    outputFileName: str


class Job(BaseModel):
    id: str
    provider: str = "comfyui-wan"
    status: JobStatus
    progress: int = 0
    outputUrl: Optional[str] = None
    error: Optional[str] = None
    createdAt: float = Field(default_factory=time.time)
    updatedAt: float = Field(default_factory=time.time)
    metadata: Dict[str, Any] = {}


JOBS: Dict[str, Job] = {}
RENDER_JOBS: Dict[str, Job] = {}


def authorize(authorization: Optional[str]) -> None:
    if not WORKER_API_KEY:
        return
    expected = f"Bearer {WORKER_API_KEY}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def selected_scenes(payload: GenerateRequest) -> list[SceneSpec]:
    if payload.sceneId:
        for scene in payload.project.scenes:
            if scene.id == payload.sceneId:
                return [scene]
        raise HTTPException(status_code=404, detail="Scene not found")
    if not payload.project.scenes:
        raise HTTPException(status_code=400, detail="Project has no scenes")
    return payload.project.scenes


def dimensions(fmt: str) -> tuple[int, int]:
    if fmt == "16:9":
        return 1280, 720
    if fmt == "1:1":
        return 768, 768
    return 720, 1280


async def generate_scene_clip(
    client: httpx.AsyncClient,
    *,
    job: Job,
    project: VideoProject,
    scene: SceneSpec,
    scene_index: int,
    scene_count: int,
) -> str:
    width, height = dimensions(project.format)
    prompt = (
        f"{scene.visualPrompt}. Camera: {scene.camera}. "
        "Real continuous motion, natural movement, consistent subjects, no slideshow."
    )
    seed = random.randint(1, 2_147_483_647)
    workflow = load_workflow(
        prompt=prompt,
        width=width,
        height=height,
        duration_seconds=scene.durationSeconds,
        seed=seed,
    )

    prompt_id = await queue_workflow(client, workflow, f"{job.id}-{scene.id}")
    generated = job.metadata.setdefault("generatedScenes", [])
    generated.append(
        {
            "sceneId": scene.id,
            "promptId": prompt_id,
            "seed": seed,
            "width": width,
            "height": height,
            "referenceAssetUrls": scene.referenceAssetUrls,
        }
    )
    job.updatedAt = time.time()

    started = time.time()
    while time.time() - started < JOB_TIMEOUT_SECONDS:
        status, output_url, error = await check_history(client, prompt_id)
        if status == "completed" and output_url:
            generated[-1]["outputUrl"] = output_url
            return output_url
        if status == "failed":
            raise RuntimeError(error or f"ComfyUI failed on scene {scene.id}")

        elapsed = time.time() - started
        local_ratio = min(0.95, elapsed / max(120.0, scene.durationSeconds * 40.0))
        completed_share = scene_index / max(1, scene_count)
        current_share = local_ratio / max(1, scene_count)
        job.progress = min(88, 5 + int((completed_share + current_share) * 80))
        job.updatedAt = time.time()
        await asyncio.sleep(POLL_SECONDS)

    raise RuntimeError(f"Scene {scene.id} timed out after {JOB_TIMEOUT_SECONDS} seconds")


async def run_generation(job_id: str, payload: GenerateRequest, scenes: list[SceneSpec]) -> None:
    job = JOBS[job_id]
    job.status = "processing"
    job.progress = 5
    job.updatedAt = time.time()

    try:
        clip_urls: list[str] = []
        async with httpx.AsyncClient(timeout=30) as client:
            for index, scene in enumerate(scenes):
                job.metadata["currentSceneId"] = scene.id
                job.metadata["currentSceneNumber"] = index + 1
                job.metadata["sceneCount"] = len(scenes)
                job.updatedAt = time.time()
                clip_url = await generate_scene_clip(
                    client,
                    job=job,
                    project=payload.project,
                    scene=scene,
                    scene_index=index,
                    scene_count=len(scenes),
                )
                clip_urls.append(clip_url)
                job.progress = min(88, 5 + int(((index + 1) / len(scenes)) * 80))
                job.updatedAt = time.time()

        if len(scenes) == 1 and payload.sceneId:
            job.outputUrl = clip_urls[0]
            job.status = "completed"
            job.progress = 100
            job.updatedAt = time.time()
            return

        job.metadata["stage"] = "assembling"
        job.progress = 90
        job.updatedAt = time.time()
        manifest = {
            "projectId": payload.project.id,
            "title": payload.project.title,
            "format": payload.project.format,
            "totalDurationSeconds": sum(scene.durationSeconds for scene in scenes),
            "scenes": [
                {
                    "id": scene.id,
                    "order": index + 1,
                    "durationSeconds": scene.durationSeconds,
                    "videoUrl": clip_urls[index],
                    "voiceUrl": scene.voiceUrl,
                    "subtitle": scene.voiceText or "",
                    "transition": scene.transition or "cut",
                }
                for index, scene in enumerate(scenes)
            ],
            "musicUrl": payload.project.musicUrl,
            "outputFileName": f"{payload.project.id}.mp4",
        }
        output_url = await render_manifest(manifest, job_id)
        job.outputUrl = output_url
        job.status = "completed"
        job.progress = 100
        job.metadata["stage"] = "completed"
        job.updatedAt = time.time()
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)
        job.updatedAt = time.time()


async def run_render(job_id: str, manifest: RenderManifest) -> None:
    job = RENDER_JOBS[job_id]
    job.status = "processing"
    job.progress = 10
    job.updatedAt = time.time()

    try:
        output_url = await render_manifest(manifest.model_dump(), job_id)
        job.outputUrl = output_url
        job.status = "completed"
        job.progress = 100
        job.updatedAt = time.time()
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)
        job.updatedAt = time.time()


@app.get("/health")
async def health() -> dict[str, Any]:
    comfy_reachable = False
    detail = None
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            response = await client.get(f"{COMFYUI_URL}/system_stats")
            comfy_reachable = response.status_code < 500
    except Exception as exc:
        detail = str(exc)

    return {
        "ok": True,
        "worker": "gpu-video-worker",
        "version": "0.5.0",
        "provider": "comfyui-wan",
        "comfyuiUrl": COMFYUI_URL,
        "comfyuiReachable": comfy_reachable,
        "detail": detail,
        "activeGenerationJobs": sum(1 for job in JOBS.values() if job.status in ("queued", "processing")),
        "activeRenderJobs": sum(1 for job in RENDER_JOBS.values() if job.status in ("queued", "processing")),
    }


@app.post("/generate", response_model=Job)
async def generate(
    payload: GenerateRequest,
    authorization: Optional[str] = Header(default=None),
) -> Job:
    authorize(authorization)
    scenes = selected_scenes(payload)
    job_id = f"vid_{uuid.uuid4().hex[:16]}"
    job = Job(
        id=job_id,
        status="queued",
        metadata={"sceneCount": len(scenes), "projectId": payload.project.id},
    )
    JOBS[job_id] = job
    asyncio.create_task(run_generation(job_id, payload, scenes))
    return job


@app.get("/jobs/{job_id}", response_model=Job)
async def get_job(
    job_id: str,
    authorization: Optional[str] = Header(default=None),
) -> Job:
    authorize(authorization)
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/render", response_model=Job)
async def render(
    manifest: RenderManifest,
    authorization: Optional[str] = Header(default=None),
) -> Job:
    authorize(authorization)
    if not manifest.scenes:
        raise HTTPException(status_code=400, detail="Render manifest has no scenes")
    job_id = f"render_{uuid.uuid4().hex[:16]}"
    job = Job(id=job_id, provider="ffmpeg", status="queued", metadata={"projectId": manifest.projectId})
    RENDER_JOBS[job_id] = job
    asyncio.create_task(run_render(job_id, manifest))
    return job


@app.get("/render-jobs/{job_id}", response_model=Job)
async def get_render_job(
    job_id: str,
    authorization: Optional[str] = Header(default=None),
) -> Job:
    authorize(authorization)
    job = RENDER_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    return job
