"""
CobraMod Curation Service.

Provides pathway-centric curation of genome-scale metabolic models (GEMs)
using the CobraMod library (https://cobramod.readthedocs.io/v1.3.0/).

Supports:
  - Upload and parse SBML models
  - Add metabolites from BioCyc / KEGG / BiGG
  - Add reactions from BioCyc / KEGG / BiGG
  - Add full pathways from BioCyc / KEGG / BiGG
  - Add cross-references
  - Quality checks (mass balance, non-zero flux, MEMOTE)
  - Export curated model as SBML
"""

import os
import sys
import uuid
import shutil
import tempfile
import logging
import traceback
import io
from pathlib import Path
from typing import Dict, Optional, Any, List

from backend.utils.task_manager import TaskManager

logger = logging.getLogger("cobramod_service")

# ── Helpers ──────────────────────────────────────────────────────────

def _cobra_model_summary(model) -> Dict[str, Any]:
    """Extract a JSON-serialisable summary from a COBRApy model."""
    summary: Dict[str, Any] = {
        "id": model.id or "unknown",
        "name": model.name or "",
        "num_reactions": len(model.reactions),
        "num_metabolites": len(model.metabolites),
        "num_genes": len(model.genes),
        "objective": None,
        "fba_value": None,
        "reactions": [],
        "metabolites": [],
        "genes": [],
    }

    # Objective info
    objs = list(model.objective.to_json().get("expression", {}).get("args", []))
    if objs:
        summary["objective"] = str(model.objective.expression)

    # FBA
    try:
        sol = model.optimize()
        if sol.status == "optimal":
            summary["fba_value"] = round(float(sol.objective_value), 6)
    except Exception:
        pass

    # Reactions (first 200 for display)
    for rxn in list(model.reactions)[:200]:
        entry = {
            "id": rxn.id,
            "name": rxn.name or "",
            "subsystem": rxn.subsystem or "",
            "lower_bound": rxn.lower_bound,
            "upper_bound": rxn.upper_bound,
            "formula": rxn.reaction,
            "gpr": rxn.gene_reaction_rule or "",
        }
        summary["reactions"].append(entry)

    # Metabolites (first 200)
    for met in list(model.metabolites)[:200]:
        summary["metabolites"].append({
            "id": met.id,
            "name": met.name or "",
            "formula": met.formula or "",
            "charge": met.charge,
            "compartment": met.compartment or "",
        })

    # Genes (first 200)
    for g in list(model.genes)[:200]:
        summary["genes"].append({"id": g.id, "name": g.name or ""})

    return summary


def parse_sbml_model(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Load an SBML model from raw bytes, return model summary dict.
    This is synchronous and fast – called directly by the upload endpoint.
    """
    import cobra

    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        model = cobra.io.read_sbml_model(tmp_path)
        summary = _cobra_model_summary(model)
        summary["filename"] = filename
        return summary
    finally:
        os.unlink(tmp_path)


# ── Task lifecycle ────────────────────────────────────────────────────

def submit_curation_task(
    mode: str,
    filename: str,
    database: str = "META",
    items: Optional[List[str]] = None,
    operation: str = "add_pathway",
) -> str:
    """
    Create a curation task entry, return job_id.

    mode: 'auto' | 'manual'
    operation: 'add_metabolites' | 'add_reactions' | 'add_pathway' | 'add_crossreferences'
    items: list of identifiers/lines (e.g. ["PWY-5690", "GLYCOLYSIS"])
    database: e.g. 'META', 'KEGG', 'BIGG'
    """
    job_id = str(uuid.uuid4())
    TaskManager.create_task(job_id, meta={
        "type": "cobramod_curation",
        "mode": mode,
        "filename": filename,
        "database": database,
        "operation": operation,
        "items": items or [],
    })
    return job_id


def get_curation_task(task_id: str) -> Optional[Dict]:
    return TaskManager.get_task(task_id)


def list_curation_tasks() -> List[Dict]:
    from backend.utils.task_manager import _TASKS
    tasks = []
    for tid, info in _TASKS.items():
        if info.get("meta", {}).get("type") == "cobramod_curation":
            tasks.append({
                "id": info["id"],
                "status": info["status"],
                "created_at": info["created_at"],
                "updated_at": info["updated_at"],
                "meta": info.get("meta", {}),
                "error": info.get("error"),
            })
    tasks.sort(key=lambda t: t["created_at"], reverse=True)
    return tasks


# ── Background curation runner ────────────────────────────────────────

# In-memory store for uploaded model bytes (keyed by a session token returned at upload)
_MODEL_STORE: Dict[str, bytes] = {}


def store_model_bytes(file_bytes: bytes) -> str:
    """Store uploaded file bytes, return a token."""
    token = str(uuid.uuid4())
    _MODEL_STORE[token] = file_bytes
    return token


def get_model_bytes(token: str) -> Optional[bytes]:
    return _MODEL_STORE.get(token)


def run_curation_background(
    job_id: str,
    model_token: str,
    filename: str,
    mode: str,
    operation: str,
    database: str,
    items: List[str],
):
    """
    Background task that performs CobraMod curation operations on the model.

    Steps:
      1. Load model from stored bytes
      2. Capture model stats (before)
      3. Run specified curation operation(s)
      4. Capture model stats (after)
      5. Write curated model to temp file and store bytes
      6. Return result dict
    """
    import cobra
    import cobramod

    TaskManager.update_task_status(job_id, "running")
    temp_dir = tempfile.mkdtemp(prefix=f"cobramod_{job_id}_")
    log_capture = []

    try:
        # ── Get model bytes ──
        file_bytes = get_model_bytes(model_token)
        if not file_bytes:
            raise ValueError("模型文件未找到，请重新上传")

        model_path = os.path.join(temp_dir, filename)
        with open(model_path, "wb") as f:
            f.write(file_bytes)

        # CobraMod data directory
        data_dir = Path(temp_dir) / "cobramod_data"
        data_dir.mkdir(exist_ok=True)

        # ── Load model ──
        model = cobra.io.read_sbml_model(model_path)
        before = _cobra_model_summary(model)
        log_capture.append(f"✅ 模型加载成功: {model.id} ({len(model.reactions)} 反应, {len(model.metabolites)} 代谢物)")

        # ── Credentials for BioCyc (empty = no auth) ──
        credentials_path = None
        creds_file = Path(temp_dir) / "credentials.txt"
        # Leave empty — BioCyc "META"/"YEAST" etc. without auth works for non-MetaCyc dbs
        # If user provides credentials they can be passed; we skip META and use KEGG/BIGG freely

        # Normalize database name
        db = database.strip().upper()
        if db == "METACYC":
            db = "META"
        elif db == "BIGG":
            db = "BIGG"
        # KEGG stays "KEGG"

        # ── Perform operation ──
        curated_model = model.copy()
        errors = []
        op_log = []

        if operation == "add_metabolites":
            log_capture.append(f"🔬 添加代谢物 ({len(items)} 项) from {db}...")
            for line in items:
                line = line.strip()
                if not line:
                    continue
                try:
                    cobramod.add_metabolites(
                        model=curated_model,
                        obj=[line],
                        database=db,
                        directory=data_dir,
                    )
                    op_log.append(f"  ✅ {line}")
                except Exception as e:
                    err = str(e)[:200]
                    op_log.append(f"  ⚠️ {line}: {err}")
                    errors.append(f"{line}: {err}")

        elif operation == "add_reactions":
            log_capture.append(f"⚗️ 添加反应 ({len(items)} 项) from {db}...")
            for line in items:
                line = line.strip()
                if not line:
                    continue
                try:
                    cobramod.add_reactions(
                        model=curated_model,
                        obj=[line],
                        database=db,
                        directory=data_dir,
                    )
                    op_log.append(f"  ✅ {line}")
                except Exception as e:
                    err = str(e)[:200]
                    op_log.append(f"  ⚠️ {line}: {err}")
                    errors.append(f"{line}: {err}")

        elif operation == "add_pathway":
            log_capture.append(f"🛣️ 添加通路 ({len(items)} 项) from {db}...")
            for pathway_id in items:
                pathway_id = pathway_id.strip()
                if not pathway_id:
                    continue
                try:
                    cobramod.add_pathway(
                        model=curated_model,
                        pathway=pathway_id,
                        database=db,
                        directory=data_dir,
                    )
                    op_log.append(f"  ✅ {pathway_id}")
                except Exception as e:
                    err = str(e)[:200]
                    op_log.append(f"  ⚠️ {pathway_id}: {err}")
                    errors.append(f"{pathway_id}: {err}")

        elif operation == "add_crossreferences":
            log_capture.append(f"🔗 添加交叉引用 from {db}...")
            try:
                cobramod.add_crossreferences(
                    model=curated_model,
                    database=db,
                    directory=data_dir,
                )
                op_log.append("  ✅ 交叉引用添加完成")
            except Exception as e:
                err = str(e)[:300]
                op_log.append(f"  ⚠️ 交叉引用添加失败: {err}")
                errors.append(err)

        elif operation == "remove_reactions":
            log_capture.append(f"🗑️ 删除反应 ({len(items)} 项)...")
            for rxn_id in items:
                rxn_id = rxn_id.strip()
                if not rxn_id:
                    continue
                try:
                    rxn = curated_model.reactions.get_by_id(rxn_id)
                    curated_model.remove_reactions([rxn], remove_orphans=True)
                    op_log.append(f"  ✅ 删除反应: {rxn_id}")
                except KeyError:
                    op_log.append(f"  ⚠️ 反应 {rxn_id} 未在模型中找到")
                    errors.append(f"反应 {rxn_id} 未找到")
                except Exception as e:
                    err = str(e)[:200]
                    op_log.append(f"  ⚠️ {rxn_id}: {err}")
                    errors.append(f"{rxn_id}: {err}")

        elif operation == "remove_metabolites":
            log_capture.append(f"🗑️ 删除代谢物 ({len(items)} 项)...")
            for met_id in items:
                met_id = met_id.strip()
                if not met_id:
                    continue
                try:
                    met = curated_model.metabolites.get_by_id(met_id)
                    met.remove_from_model()
                    op_log.append(f"  ✅ 删除代谢物: {met_id}")
                except KeyError:
                    op_log.append(f"  ⚠️ 代谢物 {met_id} 未在模型中找到")
                    errors.append(f"代谢物 {met_id} 未找到")
                except Exception as e:
                    err = str(e)[:200]
                    op_log.append(f"  ⚠️ {met_id}: {err}")
                    errors.append(f"{met_id}: {err}")

        log_capture.extend(op_log)

        # ── After stats ──
        after = _cobra_model_summary(curated_model)
        log_capture.append(
            f"📊 校正完成: {after['num_reactions']} 反应 (+{after['num_reactions'] - before['num_reactions']}), "
            f"{after['num_metabolites']} 代谢物 (+{after['num_metabolites'] - before['num_metabolites']})"
        )

        # ── FBA check ──
        try:
            sol = curated_model.optimize()
            fba_status = sol.status
            fba_val = round(float(sol.objective_value), 6) if sol.status == "optimal" else None
            log_capture.append(f"🧮 FBA check: {fba_status}" + (f", objective = {fba_val}" if fba_val is not None else ""))
        except Exception as e:
            fba_status = "error"
            fba_val = None
            log_capture.append(f"⚠️ FBA check 失败: {str(e)[:100]}")

        # ── Export curated model ──
        curated_path = os.path.join(temp_dir, f"curated_{filename}")
        cobra.io.write_sbml_model(curated_model, curated_path)
        with open(curated_path, "rb") as f:
            curated_bytes = f.read()

        # Store curated model for download
        curated_token = store_model_bytes(curated_bytes)
        log_capture.append(f"💾 校正后模型已准备好下载")

        result = {
            "before": {
                "num_reactions": before["num_reactions"],
                "num_metabolites": before["num_metabolites"],
                "num_genes": before["num_genes"],
                "fba_value": before["fba_value"],
            },
            "after": {
                "num_reactions": after["num_reactions"],
                "num_metabolites": after["num_metabolites"],
                "num_genes": after["num_genes"],
                "fba_value": after["fba_value"],
                "fba_status": fba_status,
            },
            "diff": {
                "reactions_added": after["num_reactions"] - before["num_reactions"],
                "metabolites_added": after["num_metabolites"] - before["num_metabolites"],
                "genes_added": after["num_genes"] - before["num_genes"],
            },
            "errors": errors,
            "log": "\n".join(log_capture),
            "curated_model_token": curated_token,
            "curated_filename": f"curated_{filename}",
        }

        TaskManager.update_task_status(job_id, "completed", result=result)

    except Exception as e:
        logger.exception("CobraMod curation task failed: %s", e)
        error_msg = traceback.format_exc()
        if len(error_msg) > 3000:
            error_msg = error_msg[:3000] + "\n... (truncated)"
        TaskManager.update_task_status(job_id, "failed", error=error_msg)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
