"""Heatmap Data API Router."""
from fastapi import APIRouter, UploadFile, File, Form
from backend.utils.data_parser import parse_expression_matrix
from backend.services.heatmap import prepare_heatmap_data
from typing import Optional

router = APIRouter(prefix="/api/heatmap", tags=["Heatmap"])


@router.post("/run")
async def generate_heatmap(
    expression_file: UploadFile = File(...),
    gene_list: Optional[str] = Form(None, description="Comma-separated gene list (optional)"),
    top_n: int = Form(50),
    normalize: str = Form("zscore_row"),
    cluster_rows: bool = Form(True),
    cluster_cols: bool = Form(True),
):
    """Generate heatmap data from expression matrix."""
    try:
        content = await expression_file.read()
        df = parse_expression_matrix(content, expression_file.filename)

        genes = None
        if gene_list:
            genes = [g.strip() for g in gene_list.split(',') if g.strip()]

        result = prepare_heatmap_data(
            df,
            gene_list=genes,
            top_n=top_n,
            normalize=normalize,
            cluster_rows=cluster_rows,
            cluster_cols=cluster_cols,
        )
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}
