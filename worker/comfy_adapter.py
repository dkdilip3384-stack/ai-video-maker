from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import httpx

COMFYUI_URL = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
WORKFLOW_PATH = os.getenv("COMFYUI_WORKFLOW_PATH", "/app/workflow_api.json")
PROMPT_NODE_ID = os.getenv("COMFYUI_PROMPT_NODE_ID", "")
WIDTH_NODE_ID = os.getenv("COMFYUI_WIDTH_NODE_ID", "")
HEIGHT_NODE_ID = os.getenv("COMFYUI_HEIGHT_NODE_ID", "")
FRAMES_NODE_ID = os.getenv("COMFYUI_FRAMES_NODE_ID", "")
SEED_NODE_ID = os.getenv("COMFYUI_SEED_NODE_ID", "")
OUTPUT_NODE_ID = os.getenv("COMFYUI_OUTPUT_NODE_ID", "")
PUBLIC_OUTPUT_BASE_URL = os.getenv("PUBLIC_OUTPUT_BASE_URL", "").rstrip("/")
FPS = max(1, int(os.getenv("VIDEO_FPS", "16")))


def _set_input(workflow: Dict[str, Any], node_id: str, key: str, value: Any) -> None:
    if not node_id:
        return
    node = workflow.get(str(node_id))
    if not isinstance(node, dict):
        raise RuntimeError(f"Configured ComfyUI node {node_id} does not exist in workflow")
    inputs = node.setdefault("inputs", {})
    inputs[key] = value


def load_workflow(*, prompt: str, width: int, height: int, duration_seconds: int, seed: int) -> Dict[str, Any]:
    path = Path(WORKFLOW_PATH)
    if not path.exists():
        raise RuntimeError(
            f"ComfyUI workflow file not found at {WORKFLOW_PATH}. Export a Wan workflow in API format and mount it there."
        )

    with path.open("r", encoding="utf-8") as handle:
        workflow = json.load(handle)

    workflow = copy.deepcopy(workflow)
    frame_count = max(FPS, duration_seconds * FPS)

    _set_input(workflow, PROMPT_NODE_ID, "text", prompt)
    _set_input(workflow, WIDTH_NODE_ID, "width", width)
    _set_input(workflow, HEIGHT_NODE_ID, "height", height)
    _set_input(workflow, FRAMES_NODE_ID, "length", frame_count)
    _set_input(workflow, SEED_NODE_ID, "seed", seed)
    return workflow


async def queue_workflow(client: httpx.AsyncClient, workflow: Dict[str, Any], client_id: str) -> str:
    response = await client.post(
        f"{COMFYUI_URL}/prompt",
        json={"prompt": workflow, "client_id": client_id},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"ComfyUI queue error {response.status_code}: {response.text[:500]}")
    data = response.json()
    prompt_id = data.get("prompt_id")
    if not prompt_id:
        raise RuntimeError("ComfyUI did not return prompt_id")
    return str(prompt_id)


def _first_media(history_item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    outputs = history_item.get("outputs", {}) or {}
    if OUTPUT_NODE_ID:
        candidates = [outputs.get(str(OUTPUT_NODE_ID), {})]
    else:
        candidates = outputs.values()

    for node_output in candidates:
        if not isinstance(node_output, dict):
            continue
        for key in ("videos", "gifs", "images"):
            media = node_output.get(key)
            if isinstance(media, list) and media:
                item = media[0]
                if isinstance(item, dict) and item.get("filename"):
                    return item
    return None


def media_url(item: Dict[str, Any]) -> str:
    filename = str(item.get("filename", ""))
    subfolder = str(item.get("subfolder", ""))
    media_type = str(item.get("type", "output"))

    if PUBLIC_OUTPUT_BASE_URL:
        base = PUBLIC_OUTPUT_BASE_URL
        relative = "/".join(part.strip("/") for part in (subfolder, filename) if part)
        return f"{base}/{relative}"

    query = urlencode({"filename": filename, "subfolder": subfolder, "type": media_type})
    return f"{COMFYUI_URL}/view?{query}"


async def check_history(client: httpx.AsyncClient, prompt_id: str) -> tuple[str, Optional[str], Optional[str]]:
    response = await client.get(f"{COMFYUI_URL}/history/{prompt_id}")
    if response.status_code >= 400:
        raise RuntimeError(f"ComfyUI history error {response.status_code}: {response.text[:300]}")

    data = response.json()
    item = data.get(prompt_id)
    if not item:
        return "processing", None, None

    status = item.get("status", {}) or {}
    if status.get("status_str") == "error":
        messages = status.get("messages") or []
        return "failed", None, str(messages[-1] if messages else "ComfyUI workflow failed")

    media = _first_media(item)
    if media:
        return "completed", media_url(media), None

    return "processing", None, None
