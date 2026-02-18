"""Gene Name Conversion API Router."""
from fastapi import APIRouter, Form
from backend.services.gene_convert import convert_genes_demo, convert_genes_mygene

router = APIRouter(prefix="/api/gene-convert", tags=["Gene Conversion"])


@router.post("/run")
async def convert_genes(
    gene_list: str = Form(..., description="Comma or newline separated gene list"),
    from_type: str = Form("auto", description="Input ID type: auto, symbol, entrez, ensembl"),
    use_api: bool = Form(False, description="Use MyGene.info API instead of built-in mapping"),
):
    """Convert gene identifiers between formats."""
    genes = [g.strip() for g in gene_list.replace('\n', ',').split(',') if g.strip()]

    if not genes:
        return {"status": "error", "message": "No genes provided"}

    try:
        if use_api:
            result = convert_genes_mygene(genes, from_type=from_type)
        else:
            result = convert_genes_demo(genes, from_type=from_type)
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}
