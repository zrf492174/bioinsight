"""CobraMod Curation API Router — async task-based."""
import os
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.responses import Response
from typing import Optional, List
import threading

from backend.services.cobramod_curation import (
    parse_sbml_model,
    store_model_bytes,
    get_model_bytes,
    submit_curation_task,
    run_curation_background,
    get_curation_task,
    list_curation_tasks,
)

router = APIRouter(prefix="/api/curation", tags=["CobraMod Curation"])


@router.post("/upload")
async def curation_upload(
    file: UploadFile = File(..., description="SBML 模型文件 (.xml)"),
):
    """
    Upload an SBML model file.
    Returns model summary and a model_token for subsequent curation tasks.
    """
    try:
        file_bytes = await file.read()
        if not file_bytes:
            return {"status": "error", "message": "上传文件为空"}

        # Parse model synchronously (fast)
        summary = parse_sbml_model(file_bytes, file.filename)

        # Store bytes for later curation
        model_token = store_model_bytes(file_bytes)
        summary["model_token"] = model_token

        return {"status": "success", "data": summary}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/submit")
async def curation_submit(
    background_tasks: BackgroundTasks,
    model_token: str = Form(..., description="从 /upload 返回的 model_token"),
    filename: str = Form("model.xml", description="模型文件名"),
    mode: str = Form("manual", description="'auto' 或 'manual'"),
    operation: str = Form("add_pathway", description="add_metabolites | add_reactions | add_pathway | add_crossreferences"),
    database: str = Form("KEGG", description="数据库: META, KEGG, BIGG, pmn:CORN 等"),
    items: str = Form("", description="换行分隔的 ID 列表 (e.g. 'GLYCOLYSIS\\nPWY-5690')"),
):
    """Submit a CobraMod curation task."""
    try:
        items_list = [x.strip() for x in items.strip().splitlines() if x.strip()]

        if not model_token:
            return {"status": "error", "message": "请先上传模型文件"}
        if not items_list and operation != "add_crossreferences":
            return {"status": "error", "message": "请提供至少一个标识符"}

        job_id = submit_curation_task(
            mode=mode,
            filename=filename,
            database=database,
            items=items_list,
            operation=operation,
        )

        def launch_bg():
            run_curation_background(
                job_id=job_id,
                model_token=model_token,
                filename=filename,
                mode=mode,
                operation=operation,
                database=database,
                items=items_list,
            )

        t = threading.Thread(target=launch_bg, daemon=True)
        background_tasks.add_task(t.start)

        return {
            "status": "success",
            "data": {"task_id": job_id, "status": "pending"},
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/task/{task_id}")
async def curation_task_status(task_id: str):
    """Poll status / result of a curation task."""
    task_info = get_curation_task(task_id)
    if not task_info:
        raise HTTPException(status_code=404, detail="任务未找到")
    return {"status": "success", "data": task_info}


@router.get("/tasks")
async def curation_task_list():
    """List all curation tasks (newest first)."""
    try:
        tasks = list_curation_tasks()
        return {"status": "success", "data": tasks}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/download/{model_token}")
async def curation_download(model_token: str, filename: str = "curated_model.xml"):
    """Download a curated model by its token."""
    data = get_model_bytes(model_token)
    if not data:
        raise HTTPException(status_code=404, detail="文件未找到 (token 可能已过期)")
    return Response(
        content=data,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
