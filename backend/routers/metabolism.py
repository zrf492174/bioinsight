"""Metabolic Modeling API Router — supports SBML upload, custom objective & medium."""
from fastapi import APIRouter, UploadFile, File, Form
from typing import Optional
from backend.services.metabolism import (
    get_builtin_model,
    load_model_from_sbml,
    get_model_info,
    get_reactions_list,
    get_exchange_reactions,
    get_genes_list,
    run_fba,
    run_fva,
    run_gene_knockout,
    find_essential_genes_list,
    get_network_data,
)

router = APIRouter(prefix="/api/metabolism", tags=["Metabolism"])


async def _resolve_model(model_file: Optional[UploadFile] = None):
    """Load model from uploaded SBML or use built-in textbook."""
    if model_file and model_file.filename:
        content = await model_file.read()
        return load_model_from_sbml(content)
    return get_builtin_model()


@router.post("/upload-model")
async def upload_model(
    model_file: UploadFile = File(..., description="SBML model file (.xml/.sbml)"),
):
    """Upload an SBML model and return its info, reactions, exchanges, and genes."""
    try:
        content = await model_file.read()
        model = load_model_from_sbml(content)
        return {
            "status": "success",
            "data": {
                "info": get_model_info(model),
                "reactions": get_reactions_list(model),
                "exchanges": get_exchange_reactions(model),
                "genes": get_genes_list(model),
            },
        }
    except Exception as e:
        return {"status": "error", "message": f"SBML 解析失败: {str(e)}"}


@router.get("/model-info")
async def model_info():
    """Get built-in model info, reactions, exchanges, and genes."""
    try:
        model = get_builtin_model()
        return {
            "status": "success",
            "data": {
                "info": get_model_info(model),
                "reactions": get_reactions_list(model),
                "exchanges": get_exchange_reactions(model),
                "genes": get_genes_list(model),
            },
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/fba")
async def fba_analysis(
    model_file: Optional[UploadFile] = File(None),
    objective_id: Optional[str] = Form(None),
    medium: Optional[str] = Form(None, description="JSON dict of exchange_id: uptake_rate"),
):
    """Run FBA with optional custom model, objective, and medium."""
    try:
        model = await _resolve_model(model_file)
        result = run_fba(model, objective_id=objective_id, medium_json=medium)
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/fva")
async def fva_analysis(
    model_file: Optional[UploadFile] = File(None),
    fraction: float = Form(0.9),
    objective_id: Optional[str] = Form(None),
    medium: Optional[str] = Form(None),
    reaction_ids: Optional[str] = Form(None),
):
    """Run FVA."""
    try:
        model = await _resolve_model(model_file)
        rxn_ids = None
        if reaction_ids:
            rxn_ids = [r.strip() for r in reaction_ids.split(',') if r.strip()]
        result = run_fva(model, fraction=fraction, objective_id=objective_id,
                         medium_json=medium, reaction_ids=rxn_ids)
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/knockout")
async def gene_knockout(
    gene_ids: str = Form(...),
    model_file: Optional[UploadFile] = File(None),
    objective_id: Optional[str] = Form(None),
    medium: Optional[str] = Form(None),
):
    """Simulate gene knockouts."""
    try:
        model = await _resolve_model(model_file)
        genes = [g.strip() for g in gene_ids.split(',') if g.strip()]
        if not genes:
            return {"status": "error", "message": "No gene IDs provided"}
        result = run_gene_knockout(genes, model, objective_id=objective_id, medium_json=medium)
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/essential-genes")
async def essential_genes(
    model_file: Optional[UploadFile] = File(None),
    objective_id: Optional[str] = Form(None),
    medium: Optional[str] = Form(None),
):
    """Find essential genes."""
    try:
        model = await _resolve_model(model_file)
        result = find_essential_genes_list(model, objective_id=objective_id, medium_json=medium)
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/network-data")
async def network_data_builtin():
    """Get network graph data for the built-in model."""
    try:
        model = get_builtin_model()
        result = get_network_data(model)
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/network-data")
async def network_data_custom(
    model_file: Optional[UploadFile] = File(None),
    objective_id: Optional[str] = Form(None),
    medium: Optional[str] = Form(None),
    run_fba_overlay: bool = Form(False),
):
    """Get network graph data with optional uploaded model and FBA flux overlay."""
    try:
        model = await _resolve_model(model_file)
        result = get_network_data(
            model,
            objective_id=objective_id,
            medium_json=medium,
            run_fba_overlay=run_fba_overlay,
        )
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}
