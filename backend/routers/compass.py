"""Compass Metabolic Modeling API Router — async task-based."""
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from typing import Optional
from backend.services.compass import (
    submit_compass_task,
    run_compass_background,
    get_compass_task,
    list_compass_tasks,
)

router = APIRouter(prefix="/api/compass", tags=["Compass"])


@router.post("/submit")
async def compass_submit(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Gene expression matrix (.tsv / .mtx)"),
    species: str = Form("homo_sapiens"),
    model: str = Form("RECON2_mat"),
    num_processes: int = Form(1),
    num_threads: int = Form(1),
    microcluster_size: Optional[int] = Form(None),
    lambda_val: float = Form(0),
    calc_metabolites: bool = Form(False),
    test_mode: bool = Form(False),
):
    """Submit a Compass analysis task.  Returns a task_id for polling."""
    try:
        content = await file.read()

        job_id = submit_compass_task(
            file_bytes=content,
            filename=file.filename,
            species=species,
            model=model,
            num_processes=num_processes,
            num_threads=num_threads,
            microcluster_size=microcluster_size,
            lambda_val=lambda_val,
            calc_metabolites=calc_metabolites,
            test_mode=test_mode,
        )

        # Schedule the heavy work in the background
        background_tasks.add_task(
            run_compass_background,
            job_id=job_id,
            file_bytes=content,
            filename=file.filename,
            species=species,
            model=model,
            num_processes=num_processes,
            num_threads=num_threads,
            microcluster_size=microcluster_size,
            lambda_val=lambda_val,
            calc_metabolites=calc_metabolites,
            test_mode=test_mode,
        )

        return {
            "status": "success",
            "data": {"task_id": job_id, "status": "pending"},
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/task/{task_id}")
async def compass_task_status(task_id: str):
    """Poll the status / result of a Compass task."""
    task_info = get_compass_task(task_id)
    if not task_info:
        raise HTTPException(status_code=404, detail="任务未找到")
    return {"status": "success", "data": task_info}


@router.get("/tasks")
async def compass_task_list():
    """List all Compass tasks (newest first)."""
    try:
        tasks = list_compass_tasks()
        return {"status": "success", "data": tasks}
    except Exception as e:
        return {"status": "error", "message": str(e)}
