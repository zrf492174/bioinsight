"""
Gene Name Conversion Service.

Provides mapping between different gene identifier formats:
- Gene Symbol ↔ Entrez ID
- Gene Symbol ↔ Ensembl ID
- Case normalization

Includes a built-in demo mapping table and optional MyGene.info API support.
"""
from typing import List, Dict, Optional

try:
    import mygene
    HAS_MYGENE = True
except ImportError:
    HAS_MYGENE = False


# Built-in demo mapping table
DEMO_MAPPING = {
    "TP53": {"entrez": "7157", "ensembl": "ENSG00000141510", "symbol": "TP53", "name": "tumor protein p53"},
    "BRCA1": {"entrez": "672", "ensembl": "ENSG00000012048", "symbol": "BRCA1", "name": "BRCA1 DNA repair associated"},
    "EGFR": {"entrez": "1956", "ensembl": "ENSG00000146648", "symbol": "EGFR", "name": "epidermal growth factor receptor"},
    "VEGFA": {"entrez": "7422", "ensembl": "ENSG00000112715", "symbol": "VEGFA", "name": "vascular endothelial growth factor A"},
    "MYC": {"entrez": "4609", "ensembl": "ENSG00000136997", "symbol": "MYC", "name": "MYC proto-oncogene"},
    "KRAS": {"entrez": "3845", "ensembl": "ENSG00000133703", "symbol": "KRAS", "name": "KRAS proto-oncogene, GTPase"},
    "AKT1": {"entrez": "207", "ensembl": "ENSG00000142208", "symbol": "AKT1", "name": "AKT serine/threonine kinase 1"},
    "PTEN": {"entrez": "5728", "ensembl": "ENSG00000171862", "symbol": "PTEN", "name": "phosphatase and tensin homolog"},
    "RB1": {"entrez": "5925", "ensembl": "ENSG00000139687", "symbol": "RB1", "name": "RB transcriptional corepressor 1"},
    "CDK2": {"entrez": "1017", "ensembl": "ENSG00000123374", "symbol": "CDK2", "name": "cyclin dependent kinase 2"},
    "BCL2": {"entrez": "596", "ensembl": "ENSG00000171791", "symbol": "BCL2", "name": "BCL2 apoptosis regulator"},
    "CASP3": {"entrez": "836", "ensembl": "ENSG00000164305", "symbol": "CASP3", "name": "caspase 3"},
    "TNF": {"entrez": "7124", "ensembl": "ENSG00000232810", "symbol": "TNF", "name": "tumor necrosis factor"},
    "IL6": {"entrez": "3569", "ensembl": "ENSG00000136244", "symbol": "IL6", "name": "interleukin 6"},
    "GAPDH": {"entrez": "2597", "ensembl": "ENSG00000111640", "symbol": "GAPDH", "name": "glyceraldehyde-3-phosphate dehydrogenase"},
    "ACTB": {"entrez": "60", "ensembl": "ENSG00000075624", "symbol": "ACTB", "name": "actin beta"},
    "MAPK1": {"entrez": "5594", "ensembl": "ENSG00000100030", "symbol": "MAPK1", "name": "mitogen-activated protein kinase 1"},
    "STAT3": {"entrez": "6774", "ensembl": "ENSG00000168610", "symbol": "STAT3", "name": "signal transducer and activator of transcription 3"},
    "NFKB1": {"entrez": "4790", "ensembl": "ENSG00000109320", "symbol": "NFKB1", "name": "nuclear factor kappa B subunit 1"},
    "PIK3CA": {"entrez": "5290", "ensembl": "ENSG00000121879", "symbol": "PIK3CA", "name": "PI3K catalytic subunit alpha"},
}

# Reverse lookups
_ENTREZ_TO_SYMBOL = {v["entrez"]: k for k, v in DEMO_MAPPING.items()}
_ENSEMBL_TO_SYMBOL = {v["ensembl"]: k for k, v in DEMO_MAPPING.items()}


def detect_id_type(gene_ids: List[str]) -> str:
    """Auto-detect gene ID type."""
    sample = gene_ids[:10]
    ensembl_count = sum(1 for g in sample if g.startswith("ENSG") or g.startswith("ENSM"))
    numeric_count = sum(1 for g in sample if g.isdigit())

    if ensembl_count > len(sample) * 0.5:
        return "ensembl"
    elif numeric_count > len(sample) * 0.5:
        return "entrez"
    else:
        return "symbol"


def convert_genes_demo(
    gene_ids: List[str],
    from_type: str = "auto",
    to_type: str = "symbol",
) -> Dict:
    """Convert gene IDs using built-in mapping table."""
    if from_type == "auto":
        from_type = detect_id_type(gene_ids)

    results = []
    found = 0
    not_found = 0

    for gid in gene_ids:
        query = gid.strip()
        if not query:
            continue

        mapped = None

        if from_type == "symbol":
            key = query.upper()
            if key in DEMO_MAPPING:
                mapped = DEMO_MAPPING[key]
        elif from_type == "entrez":
            if query in _ENTREZ_TO_SYMBOL:
                symbol = _ENTREZ_TO_SYMBOL[query]
                mapped = DEMO_MAPPING[symbol]
        elif from_type == "ensembl":
            if query in _ENSEMBL_TO_SYMBOL:
                symbol = _ENSEMBL_TO_SYMBOL[query]
                mapped = DEMO_MAPPING[symbol]

        if mapped:
            found += 1
            results.append({
                "input": query,
                "symbol": mapped["symbol"],
                "entrez": mapped["entrez"],
                "ensembl": mapped["ensembl"],
                "name": mapped["name"],
                "status": "found",
            })
        else:
            not_found += 1
            results.append({
                "input": query,
                "symbol": query if from_type == "symbol" else "",
                "entrez": query if from_type == "entrez" else "",
                "ensembl": query if from_type == "ensembl" else "",
                "name": "",
                "status": "not_found",
            })

    return {
        "results": results,
        "summary": {
            "total": len(results),
            "found": found,
            "not_found": not_found,
            "from_type": from_type,
            "to_type": to_type,
            "source": "demo",
        }
    }


def convert_genes_mygene(
    gene_ids: List[str],
    from_type: str = "symbol",
    to_type: str = "entrezgene,ensembl.gene,symbol,name",
    species: str = "human",
) -> Dict:
    """Convert gene IDs using MyGene.info API."""
    if not HAS_MYGENE:
        return convert_genes_demo(gene_ids, from_type, to_type)

    try:
        mg = mygene.MyGeneInfo()

        scopes_map = {
            "symbol": "symbol",
            "entrez": "entrezgene",
            "ensembl": "ensembl.gene",
        }
        scopes = scopes_map.get(from_type, "symbol,entrezgene,ensembl.gene")

        results_raw = mg.querymany(
            gene_ids,
            scopes=scopes,
            fields="symbol,entrezgene,ensembl.gene,name",
            species=species,
            returnall=True,
        )

        results = []
        found = 0
        not_found = 0

        hits_map = {}
        for hit in results_raw.get("out", []):
            query = hit.get("query", "")
            if hit.get("notfound"):
                not_found += 1
                results.append({
                    "input": query,
                    "symbol": "",
                    "entrez": "",
                    "ensembl": "",
                    "name": "",
                    "status": "not_found",
                })
            else:
                found += 1
                ensembl = hit.get("ensembl", {})
                if isinstance(ensembl, list):
                    ensembl = ensembl[0] if ensembl else {}
                results.append({
                    "input": query,
                    "symbol": hit.get("symbol", ""),
                    "entrez": str(hit.get("entrezgene", "")),
                    "ensembl": ensembl.get("gene", "") if isinstance(ensembl, dict) else "",
                    "name": hit.get("name", ""),
                    "status": "found",
                })

        return {
            "results": results,
            "summary": {
                "total": len(results),
                "found": found,
                "not_found": not_found,
                "from_type": from_type,
                "to_type": to_type,
                "source": "mygene",
            }
        }
    except Exception as e:
        result = convert_genes_demo(gene_ids, from_type)
        result["summary"]["source"] = f"demo (mygene error: {str(e)})"
        return result
