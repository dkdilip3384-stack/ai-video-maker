from __future__ import annotations

import asyncio
import os
import time
import uuid
from typing import Any, Dict, Literal, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="AI Video Maker GPU Worker", version="0.1.0")

WORKER_API_KEY = os.getenv("WORKER_API_KEY")
COMFYUI_URL = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
PUBLIC_OUTPUT_BASE_URL = os.getenv("PUBLIC_OUTPUT_BASE_URL", "").rstrip("/")

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


async def submit_to_comfyui(job_id: str, payload: GenerateRequest, scene: SceneSpec) -> None:
    job = JOBS[job_id]
    job.status = "processing"
    job.progress = 5
    job.updatedAt = time.time()

    width, height = dimensions(payload.project.format)
    prompt = f"{scene.visualPrompt}. Camera: {scene.camera}. Real continuous motion, no slideshow."

    # This is a provider-neutral payload. The next integration step maps it to the
    # exact Wan/ComfyUI workflow JSON exported from the chosen GPU installation.
    request_body = {
        "client_id": job_id,
        "prompt": {
            "_meta": {
                "scene_id": scene.id,
                "positive_prompt": prompt,
                "duration_seconds": scene.durationSeconds,
                "width": width,
                "height": height,
                "reference_assets": scene.referenceAssetUrls,
            }
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{COMFYUI_URL}/prompt", json=request_body)
            if response.status_code >= 400:
                raise RuntimeError(
                    f"ComfyUI returned {response.status_code}: {response.text[:300]}"
                )
            data = response.json()

        job.metadata["comfyPromptId"] = data.get("prompt_id")
        job.progress = 15
        job.updatedAt = time.time()

        # Until the concrete Wan workflow/output watcher is wired, keep the job
        # explicit instead of pretending an MP4 was generated.
        job.status = "failed"
        job.error = (
            "ComfyUI accepted the request, but a concrete Wan workflow JSON and output watcher "
            "must be configured before MP4 generation can complete."
        )
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
        "provider": "comfyui-wan",
        "comfyuiUrl": COMFYUI_URL,
        "comfyuiReachable": comfy_reachable,
        "detail": detail,
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
    asyncio.create_task(submit_to_comfyui(job_id, payload, scene))
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
