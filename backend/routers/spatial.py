"""Spatial analysis API router."""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import shutil
import os
import uuid
from ..services.spatial import process_spatial

router = APIRouter(prefix="/api/spatial", tags=["Spatial Transcriptomics Analysis"])

@router.post("/process")
async def run_spatial(
    adata_file: UploadFile = File(..., description="AnnData file (.h5ad)"),
    target_gene: str = Form(None, description="Gene to map expression for")
):
    """Process spatial data to get coordinates and expression values."""
    if not adata_file.filename.endswith('.h5ad'):
        raise HTTPException(status_code=400, detail="Only .h5ad files are supported.")
        
    temp_dir = "/tmp/bioinsight"
    os.makedirs(temp_dir, exist_ok=True)
    
    unique_id = str(uuid.uuid4())
    temp_path = os.path.join(temp_dir, f"{unique_id}_{adata_file.filename}")
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(adata_file.file, buffer)
            
        # Optional: Empty string conversion to None if FormData sends empty string
        gene = target_gene if target_gene and target_gene.strip() != "" else None
        
        result = process_spatial(temp_path, target_gene=gene)
        
        return {"status": "success", "data": result}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"空间转录组分析出错: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
