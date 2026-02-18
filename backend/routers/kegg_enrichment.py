"""KEGG Pathway Enrichment Analysis API Router."""
from fastapi import APIRouter, Form
from backend.services.kegg import run_kegg_enrichment

router = APIRouter(prefix="/api/kegg-enrichment", tags=["KEGG Enrichment"])


@router.post("/run")
async def run_kegg(
    gene_list: str = Form(..., description="Comma or newline separated gene list"),
    pvalue_cutoff: float = Form(0.05),
):
    """Run KEGG pathway enrichment analysis."""
    genes = [g.strip() for g in gene_list.replace('\n', ',').split(',') if g.strip()]

    if not genes:
        return {"status": "error", "message": "No genes provided"}

    try:
        result = run_kegg_enrichment(genes, pvalue_cutoff=pvalue_cutoff)
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}
