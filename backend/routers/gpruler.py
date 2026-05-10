"""GPRuler GPR Rule Reconstruction API Router — async task-based."""
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from typing import Optional
from backend.services.gpruler import (
    submit_gpruler_task,
    run_gpruler_background,
    get_gpruler_task,
    list_gpruler_tasks,
)
import threading

router = APIRouter(prefix="/api/gpruler", tags=["GPRuler"])


@router.post("/submit")
async def gpruler_submit(
    background_tasks: BackgroundTasks,
    mode: str = Form(..., description="执行模式: 'sbml' 或 'organism'"),
    model_name: str = Form("MyModel", description="模型/输出文件名前缀"),
    organism_name: str = Form("", description="生物体名称 (organism 模式)"),
    kegg_code: str = Form("", description="KEGG 生物体代码, 如 hsa (organism 模式)"),
    file: Optional[UploadFile] = File(None, description="SBML 模型文件 (.xml) — sbml 模式必须"),
):
    """Submit a GPRuler GPR rule reconstruction task."""
    try:
        file_bytes = b""
        filename = ""

        if mode == "sbml":
            if not file:
                return {"status": "error", "message": "SBML 模式需要上传 .xml 模型文件"}
            file_bytes = await file.read()
            filename = file.filename
        elif mode == "organism":
            if not kegg_code:
                return {"status": "error", "message": "Organism 模式需要提供 KEGG 生物体代码"}
        else:
            return {"status": "error", "message": f"未知模式: {mode}，请选择 'sbml' 或 'organism'"}

        job_id = submit_gpruler_task(
            mode=mode,
            model_name=model_name,
            organism_name=organism_name,
            kegg_code=kegg_code,
            filename=filename,
        )

        # We use threading.Thread directly so we don't block FastAPI's worker threadpool
        # which is needed for parsing new incoming multipart/form-data requests
        def launch_bg():
            run_gpruler_background(
                job_id=job_id,
                mode=mode,
                model_name=model_name,
                organism_name=organism_name,
                kegg_code=kegg_code,
                file_bytes=file_bytes,
                filename=filename,
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
async def gpruler_task_status(task_id: str):
    """Poll the status / result of a GPRuler task."""
    task_info = get_gpruler_task(task_id)
    if not task_info:
        raise HTTPException(status_code=404, detail="任务未找到")
    return {"status": "success", "data": task_info}


@router.get("/tasks")
async def gpruler_task_list():
    """List all GPRuler tasks (newest first)."""
    try:
        tasks = list_gpruler_tasks()
        return {"status": "success", "data": tasks}
    except Exception as e:
        return {"status": "error", "message": str(e)}
