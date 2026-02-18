"""Clustering analysis API router."""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from ..utils.data_parser import parse_expression_matrix
from ..services.clustering import run_clustering_analysis

router = APIRouter(prefix="/api/clustering", tags=["Clustering Analysis"])


@router.post("/run")
async def run_clustering(
    expression_file: UploadFile = File(..., description="Expression matrix CSV/TSV"),
    k: int = Form(3, description="Number of clusters"),
    do_pca: bool = Form(True, description="Whether to run PCA"),
    n_pca_components: int = Form(2, description="Number of PCA components"),
    max_iter: int = Form(300, description="Max K-Means iterations"),
):
    """Run clustering analysis on expression data."""
    try:
        content = await expression_file.read()
        expr_df = parse_expression_matrix(content, expression_file.filename)

        if expr_df.shape[1] < 3:
            raise ValueError("聚类分析至少需要 3 个样本")

        result = run_clustering_analysis(
            expr_df,
            k=k,
            do_pca=do_pca,
            n_pca_components=n_pca_components,
            max_iter=max_iter,
        )

        return {"status": "success", "data": result}

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"聚类分析出错: {str(e)}")
