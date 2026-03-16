"""
Compass Metabolic Modeling Service.

Runs the Compass algorithm (YosefLab) as a background CLI task.
Supports async task submission with status polling.

NOTE: Compass requires IBM CPLEX optimizer.  If CPLEX is not installed,
tasks will fail gracefully with a descriptive error message.
"""
import os
import sys
import uuid
import shutil
import tempfile
import subprocess
import logging
import pandas as pd
from typing import Dict, Optional

from backend.utils.task_manager import TaskManager

logger = logging.getLogger("compass_service")

# Path to local Compass clone
COMPASS_HOME = os.environ.get(
    "COMPASS_HOME",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Compass"))
)


def _find_compass_executable() -> list:
    """Determine how to invoke compass.

    Priority:
    1. If `compass` is on PATH (pip-installed), use it directly.
    2. Fall back to running the local clone via `python -m compass.main`.
    """
    # Check if compass CLI is available globally
    if shutil.which("compass"):
        return ["compass"]

    # Fall back to local clone
    compass_main = os.path.join(COMPASS_HOME, "compass", "main.py")
    if os.path.isfile(compass_main):
        return [sys.executable, compass_main]

    raise FileNotFoundError(
        "Compass 未安装且未在 /root/test/Compass 找到本地源码。"
        "请先安装 Compass: pip install git+https://github.com/yoseflab/Compass.git"
    )


def submit_compass_task(
    file_bytes: bytes,
    filename: str,
    species: str = "homo_sapiens",
    model: str = "RECON2_mat",
    num_processes: int = 1,
    num_threads: int = 1,
    microcluster_size: Optional[int] = None,
    lambda_val: float = 0,
    calc_metabolites: bool = False,
    test_mode: bool = False,
) -> str:
    """Create a task entry and return job_id.  The actual work is run
    via ``run_compass_background`` in a BackgroundTasks executor."""
    job_id = str(uuid.uuid4())
    TaskManager.create_task(job_id, meta={
        "filename": filename,
        "species": species,
        "model": model,
        "num_processes": num_processes,
        "microcluster_size": microcluster_size,
    })
    return job_id


def run_compass_background(
    job_id: str,
    file_bytes: bytes,
    filename: str,
    species: str = "homo_sapiens",
    model: str = "RECON2_mat",
    num_processes: int = 1,
    num_threads: int = 1,
    microcluster_size: Optional[int] = None,
    lambda_val: float = 0,
    calc_metabolites: bool = False,
    test_mode: bool = False,
):
    """Background task: run compass CLI and update task status."""
    TaskManager.update_task_status(job_id, "running")
    temp_dir = tempfile.mkdtemp(prefix=f"compass_{job_id}_")

    try:
        input_dir = os.path.join(temp_dir, "input")
        output_dir = os.path.join(temp_dir, "output")
        os.makedirs(input_dir)
        os.makedirs(output_dir)

        # Write uploaded data
        input_file_path = os.path.join(input_dir, filename)
        with open(input_file_path, "wb") as f:
            f.write(file_bytes)

        # Build compass command
        try:
            cmd_base = _find_compass_executable()
        except FileNotFoundError as e:
            TaskManager.update_task_status(job_id, "failed", error=str(e))
            return

        cmd = cmd_base + [
            "--data", input_file_path,
            "--species", species,
            "--model", model,
            "--num-processes", str(num_processes),
            "--num-threads", str(num_threads),
            "--output-dir", output_dir,
            "--lambda", str(lambda_val),
        ]

        if microcluster_size and microcluster_size > 0:
            cmd += ["--microcluster-size", str(microcluster_size)]

        if calc_metabolites:
            cmd.append("--calc-metabolites")

        if test_mode:
            cmd.append("--test-mode")

        logger.info("Running Compass: %s", " ".join(cmd))

        # Run the process (can take minutes to hours)
        process = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=output_dir,
            timeout=86400,  # 24h maximum
        )

        if process.returncode != 0:
            error_msg = (process.stderr or "") + "\n" + (process.stdout or "")
            # Truncate long errors
            if len(error_msg) > 2000:
                error_msg = error_msg[:2000] + "\n... (truncated)"
            TaskManager.update_task_status(
                job_id, "failed",
                error=f"Compass 进程退出码 {process.returncode}:\n{error_msg}"
            )
            return

        # Parse outputs
        result_data = _parse_compass_outputs(output_dir, species, model)
        TaskManager.update_task_status(job_id, "completed", result=result_data)

    except subprocess.TimeoutExpired:
        TaskManager.update_task_status(
            job_id, "failed", error="Compass 任务超时 (超过24小时)"
        )
    except Exception as e:
        TaskManager.update_task_status(job_id, "failed", error=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def _parse_compass_outputs(output_dir: str, species: str, model: str) -> Dict:
    """Parse Compass output files (reactions.tsv, uptake.tsv, secretions.tsv)."""
    result = {
        "species": species,
        "model": model,
    }

    # reactions.tsv  (rows=reactions, columns=samples)
    reactions_file = os.path.join(output_dir, "reactions.tsv")
    if os.path.isfile(reactions_file):
        df = pd.read_csv(reactions_file, sep="\t", index_col=0)
        df = df.round(4)
        result["reactions"] = df.index.astype(str).tolist()
        result["samples"] = df.columns.astype(str).tolist()
        result["scores"] = df.values.tolist()
        result["num_reactions"] = len(result["reactions"])
        result["num_samples"] = len(result["samples"])
    else:
        # Try .h5ad output
        h5ad_file = os.path.join(output_dir, "reactions.h5ad")
        if os.path.isfile(h5ad_file):
            import anndata
            adata = anndata.read_h5ad(h5ad_file)
            X = adata.X.toarray() if hasattr(adata.X, "toarray") else adata.X
            df = pd.DataFrame(X, index=adata.obs_names, columns=adata.var_names).round(4)
            result["reactions"] = df.columns.astype(str).tolist()
            result["samples"] = df.index.astype(str).tolist()
            result["scores"] = df.values.tolist()
            result["num_reactions"] = len(result["reactions"])
            result["num_samples"] = len(result["samples"])
        else:
            # List what's actually in the output dir for debugging
            available = os.listdir(output_dir)
            raise FileNotFoundError(
                f"Compass 输出中未找到 reactions.tsv 或 reactions.h5ad。"
                f"输出目录内容: {available}"
            )

    # uptake.tsv (optional)
    uptake_file = os.path.join(output_dir, "uptake.tsv")
    if os.path.isfile(uptake_file):
        df_up = pd.read_csv(uptake_file, sep="\t", index_col=0).round(4)
        result["uptake"] = {
            "metabolites": df_up.index.astype(str).tolist(),
            "samples": df_up.columns.astype(str).tolist(),
            "scores": df_up.values.tolist(),
        }

    # secretions.tsv (optional)
    secretions_file = os.path.join(output_dir, "secretions.tsv")
    if os.path.isfile(secretions_file):
        df_sec = pd.read_csv(secretions_file, sep="\t", index_col=0).round(4)
        result["secretions"] = {
            "metabolites": df_sec.index.astype(str).tolist(),
            "samples": df_sec.columns.astype(str).tolist(),
            "scores": df_sec.values.tolist(),
        }

    return result


def get_compass_task(task_id: str) -> Optional[Dict]:
    """Retrieve a task's info by ID."""
    return TaskManager.get_task(task_id)


def list_compass_tasks() -> list:
    """Return all compass tasks (ordered by creation time, newest first)."""
    from backend.utils.task_manager import _TASKS
    tasks = []
    for tid, info in _TASKS.items():
        # Only include tasks that have compass-related meta
        tasks.append({
            "id": info["id"],
            "status": info["status"],
            "created_at": info["created_at"],
            "updated_at": info["updated_at"],
            "meta": info.get("meta", {}),
            "error": info.get("error"),
        })
    # Sort newest first
    tasks.sort(key=lambda t: t["created_at"], reverse=True)
    return tasks
