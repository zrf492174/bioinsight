"""GO Enrichment Analysis API Router."""
from fastapi import APIRouter, Form
from typing import Optional
from backend.services.enrichment import run_enrichment

router = APIRouter(prefix="/api/go-enrichment", tags=["GO Enrichment"])


@router.post("/run")
async def run_go_enrichment(
    gene_list: str = Form(..., description="Comma or newline separated gene list"),
    pvalue_cutoff: float = Form(0.05),
):
    """Run GO enrichment analysis on a gene list."""
    genes = [g.strip() for g in gene_list.replace('\n', ',').split(',') if g.strip()]

    if not genes:
        return {"status": "error", "message": "No genes provided"}

    try:
        result = run_enrichment(genes, pvalue_cutoff=pvalue_cutoff)
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}
