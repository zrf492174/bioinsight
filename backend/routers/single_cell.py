"""Single-cell analysis API router."""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import shutil
import os
import uuid
from ..services.single_cell import process_single_cell

router = APIRouter(prefix="/api/single-cell", tags=["Single Cell Analysis"])

@router.post("/process")
async def run_single_cell(
    adata_file: UploadFile = File(..., description="AnnData file (.h5ad)"),
    n_top_genes: int = Form(500, description="Number of highly variable genes"),
    n_pcs: int = Form(10, description="Number of principal components"),
    resolution: float = Form(0.5, description="Resolution for Leiden clustering")
):
    """Process single-cell data (QC, PCA, UMAP, Clustering)."""
    if not adata_file.filename.endswith('.h5ad'):
        raise HTTPException(status_code=400, detail="Only .h5ad files are supported.")
        
    temp_dir = "/tmp/bioinsight"
    os.makedirs(temp_dir, exist_ok=True)
    
    unique_id = str(uuid.uuid4())
    temp_path = os.path.join(temp_dir, f"{unique_id}_{adata_file.filename}")
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(adata_file.file, buffer)
            
        result = process_single_cell(
            temp_path, 
            n_top_genes=n_top_genes, 
            n_pcs=n_pcs, 
            resolution=resolution
        )
        
        return {"status": "success", "data": result}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"单细胞分析出错: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
