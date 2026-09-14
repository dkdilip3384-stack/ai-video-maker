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

app = FastAPI(title="AI Video Maker GPU Worker", version="0.3.0")

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
    transition: Optional[str] = None
    referenceAssetUrls: list[str] = []


class VideoProject(BaseModel):
    id: str
    mode: Literal["promo", "film"]
    format: Literal["9:16", "16:9", "1:1"]
    language: Literal["ta", "en", "mix"]
    title: str
    scenes: list[SceneSpec]


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


def pick_scene(payload: GenerateRequest) -> SceneSpec:
    if payload.sceneId:
        for scene in payload.project.scenes:
            if scene.id == payload.sceneId:
                return scene
        raise HTTPException(status_code=404, detail="Scene not found")
    if not payload.project.scenes:
        raise HTTPException(status_code=400, detail="Project has no scenes")
    return payload.project.scenes[0]


def dimensions(fmt: str) -> tuple[int, int]:
    if fmt == "16:9":
        return 1280, 720
    if fmt == "1:1":
        return 768, 768
    return 720, 1280


async def run_generation(job_id: str, payload: GenerateRequest, scene: SceneSpec) -> None:
    job = JOBS[job_id]
    job.status = "processing"
    job.progress = 5
    job.updatedAt = time.time()

    width, height = dimensions(payload.project.format)
    prompt = f"{scene.visualPrompt}. Camera: {scene.camera}. Real continuous motion, natural movement, no slideshow."
    seed = random.randint(1, 2_147_483_647)

    try:
        workflow = load_workflow(
            prompt=prompt,
            width=width,
            height=height,
            duration_seconds=scene.durationSeconds,
            seed=seed,
        )

        async with httpx.AsyncClient(timeout=30) as client:
            prompt_id = await queue_workflow(client, workflow, job_id)
            job.metadata.update(
                {
                    "sceneId": scene.id,
                    "comfyPromptId": prompt_id,
                    "seed": seed,
                    "width": width,
                    "height": height,
                }
            )
            job.progress = 12
            job.updatedAt = time.time()

            started = time.time()
            while time.time() - started < JOB_TIMEOUT_SECONDS:
                status, output_url, error = await check_history(client, prompt_id)

                if status == "completed" and output_url:
                    job.status = "completed"
                    job.progress = 100
                    job.outputUrl = output_url
                    job.error = None
                    job.updatedAt = time.time()
                    return

                if status == "failed":
                    job.status = "failed"
                    job.error = error or "ComfyUI generation failed"
                    job.updatedAt = time.time()
                    return

                elapsed = time.time() - started
                ratio = min(0.88, elapsed / max(120.0, scene.durationSeconds * 40.0))
                job.progress = max(job.progress, 12 + int(ratio * 82))
                job.updatedAt = time.time()
                await asyncio.sleep(POLL_SECONDS)

        job.status = "failed"
        job.error = f"Generation timed out after {JOB_TIMEOUT_SECONDS} seconds"
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
        job.progress = 30
        job.updatedAt = time.time()
        output_url = await render_manifest(manifest.model_dump(), job_id)
        job.progress = 95
        job.updatedAt = time.time()
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
        "version": "0.3.0",
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
    scene = pick_scene(payload)
    job_id = f"vid_{uuid.uuid4().hex[:16]}"
    job = Job(id=job_id, status="queued", metadata={"sceneId": scene.id})
    JOBS[job_id] = job
    asyncio.create_task(run_generation(job_id, payload, scene))
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
    if any(not scene.videoUrl for scene in manifest.scenes):
        raise HTTPException(status_code=400, detail="Every scene must contain videoUrl before final render")

    job_id = f"render_{uuid.uuid4().hex[:16]}"
    job = Job(id=job_id, provider="ffmpeg", status="queued", metadata={"projectId": manifest.projectId})
    RENDER_JOBS[job_id] = job
    asyncio.create_task(run_render(job_id, manifest))
    return job


@app.get("/renders/{job_id}", response_model=Job)
async def get_render(
    job_id: str,
    authorization: Optional[str] = Header(default=None),
) -> Job:
    authorize(authorization)
    job = RENDER_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    return job
