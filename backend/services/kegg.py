"""
KEGG Pathway Enrichment Analysis Service.

Uses Fisher's exact test with a built-in KEGG pathway annotation database.
"""
from typing import List, Dict, Optional
from backend.services.enrichment import bh_correction
from scipy import stats

# Built-in demo KEGG annotations
DEMO_KEGG_DB = {
    "hsa04110": {
        "name": "Cell cycle",
        "genes": ["Gene_001", "Gene_004", "Gene_008", "Gene_013", "Gene_018",
                  "Gene_023", "Gene_028", "Gene_033", "Gene_038", "Gene_043"]
    },
    "hsa04210": {
        "name": "Apoptosis",
        "genes": ["Gene_001", "Gene_005", "Gene_010", "Gene_015", "Gene_020",
                  "Gene_025", "Gene_030", "Gene_035", "Gene_040", "Gene_045"]
    },
    "hsa04151": {
        "name": "PI3K-Akt signaling pathway",
        "genes": ["Gene_002", "Gene_006", "Gene_011", "Gene_016", "Gene_021",
                  "Gene_026", "Gene_031", "Gene_036", "Gene_060", "Gene_061",
                  "Gene_062", "Gene_063", "Gene_064", "Gene_065"]
    },
    "hsa04010": {
        "name": "MAPK signaling pathway",
        "genes": ["Gene_003", "Gene_007", "Gene_012", "Gene_017", "Gene_022",
                  "Gene_027", "Gene_032", "Gene_037", "Gene_066", "Gene_067",
                  "Gene_068", "Gene_069", "Gene_070"]
    },
    "hsa03030": {
        "name": "DNA replication",
        "genes": ["Gene_009", "Gene_014", "Gene_019", "Gene_024", "Gene_029",
                  "Gene_034", "Gene_039", "Gene_044", "Gene_049", "Gene_090"]
    },
    "hsa04668": {
        "name": "TNF signaling pathway",
        "genes": ["Gene_002", "Gene_006", "Gene_016", "Gene_026", "Gene_036",
                  "Gene_046", "Gene_071", "Gene_072", "Gene_073"]
    },
    "hsa04115": {
        "name": "p53 signaling pathway",
        "genes": ["Gene_001", "Gene_005", "Gene_010", "Gene_014", "Gene_019",
                  "Gene_074", "Gene_075", "Gene_076"]
    },
    "hsa00190": {
        "name": "Oxidative phosphorylation",
        "genes": ["Gene_021", "Gene_022", "Gene_023", "Gene_024", "Gene_025",
                  "Gene_080", "Gene_081", "Gene_082", "Gene_083", "Gene_084"]
    },
    "hsa04620": {
        "name": "Toll-like receptor signaling",
        "genes": ["Gene_002", "Gene_011", "Gene_016", "Gene_021", "Gene_026",
                  "Gene_085", "Gene_086", "Gene_087", "Gene_088"]
    },
    "hsa04064": {
        "name": "NF-kappa B signaling pathway",
        "genes": ["Gene_002", "Gene_006", "Gene_011", "Gene_016", "Gene_036",
                  "Gene_046", "Gene_089", "Gene_091", "Gene_092"]
    },
}


def run_kegg_enrichment(
    gene_list: List[str],
    background_genes: Optional[List[str]] = None,
    kegg_db: Optional[Dict] = None,
    pvalue_cutoff: float = 0.05,
) -> Dict:
    """Run KEGG pathway enrichment analysis."""
    if kegg_db is None:
        kegg_db = DEMO_KEGG_DB

    if background_genes is None:
        all_genes = set()
        for data in kegg_db.values():
            all_genes.update(data["genes"])
        background_genes = list(all_genes)

    bg_set = set(background_genes)
    query_set = set(gene_list) & bg_set
    N = len(bg_set)
    n = len(query_set)

    results = []
    for pathway_id, data in kegg_db.items():
        pathway_genes = set(data["genes"]) & bg_set
        K = len(pathway_genes)
        k = len(query_set & pathway_genes)

        if k == 0 or K == 0:
            continue

        pvalue = stats.hypergeom.sf(k - 1, N, K, n)

        results.append({
            "pathway_id": pathway_id,
            "pathway_name": data["name"],
            "gene_ratio": f"{k}/{n}",
            "bg_ratio": f"{K}/{N}",
            "pvalue": float(pvalue),
            "count": k,
            "genes": sorted(query_set & pathway_genes),
        })

    if not results:
        return {"pathways": [], "summary": {"total_pathways": 0, "significant": 0}}

    results.sort(key=lambda x: x["pvalue"])

    pvals = [r["pvalue"] for r in results]
    fdrs = bh_correction(pvals)
    for r, fdr in zip(results, fdrs):
        r["fdr"] = fdr

    significant = sum(1 for r in results if r["fdr"] < pvalue_cutoff)

    return {
        "pathways": results,
        "summary": {
            "total_pathways": len(results),
            "significant": significant,
            "query_genes": len(query_set),
            "background_size": N,
        }
    }
