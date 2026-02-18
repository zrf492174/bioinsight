"""PPI Analysis API Router."""
from fastapi import APIRouter, Form
from backend.services.ppi import query_string_api, get_demo_ppi

router = APIRouter(prefix="/api/ppi", tags=["PPI Analysis"])


@router.post("/run")
async def run_ppi_analysis(
    gene_list: str = Form(..., description="Comma or newline separated gene list"),
    species: int = Form(9606),
    score_threshold: float = Form(400),
    use_demo: bool = Form(True, description="Use demo data instead of STRING API"),
):
    """Run PPI analysis."""
    genes = [g.strip() for g in gene_list.replace('\n', ',').split(',') if g.strip()]

    if not genes:
        return {"status": "error", "message": "No genes provided"}

    try:
        if use_demo:
            result = get_demo_ppi(genes)
        else:
            result = query_string_api(genes, species=species, score_threshold=score_threshold)
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}
