"""
GO Enrichment Analysis Service.

Uses Fisher's exact test with a built-in GO annotation database
for demonstration. Supports custom gene sets via GMT file upload.
"""
import numpy as np
from scipy import stats
from typing import List, Dict, Optional
import json


# Built-in demo GO annotations (small subset for demonstration)
DEMO_GO_DB = {
    "GO:0006915": {
        "name": "apoptotic process",
        "genes": ["Gene_001", "Gene_005", "Gene_010", "Gene_015", "Gene_020",
                  "Gene_025", "Gene_030", "Gene_035", "Gene_040", "Gene_045"]
    },
    "GO:0006954": {
        "name": "inflammatory response",
        "genes": ["Gene_002", "Gene_006", "Gene_011", "Gene_016", "Gene_021",
                  "Gene_026", "Gene_031", "Gene_036", "Gene_041", "Gene_046"]
    },
    "GO:0008283": {
        "name": "cell proliferation",
        "genes": ["Gene_003", "Gene_007", "Gene_012", "Gene_017", "Gene_022",
                  "Gene_027", "Gene_032", "Gene_037", "Gene_042", "Gene_047"]
    },
    "GO:0007049": {
        "name": "cell cycle",
        "genes": ["Gene_004", "Gene_008", "Gene_013", "Gene_018", "Gene_023",
                  "Gene_028", "Gene_033", "Gene_038", "Gene_043", "Gene_048"]
    },
    "GO:0006281": {
        "name": "DNA repair",
        "genes": ["Gene_001", "Gene_009", "Gene_014", "Gene_019", "Gene_024",
                  "Gene_029", "Gene_034", "Gene_039", "Gene_044", "Gene_049"]
    },
    "GO:0006355": {
        "name": "regulation of transcription",
        "genes": ["Gene_001", "Gene_002", "Gene_003", "Gene_004", "Gene_005",
                  "Gene_050", "Gene_051", "Gene_052", "Gene_053", "Gene_054",
                  "Gene_055", "Gene_056", "Gene_057", "Gene_058", "Gene_059"]
    },
    "GO:0007165": {
        "name": "signal transduction",
        "genes": ["Gene_006", "Gene_007", "Gene_008", "Gene_009", "Gene_010",
                  "Gene_060", "Gene_061", "Gene_062", "Gene_063", "Gene_064",
                  "Gene_065", "Gene_066", "Gene_067", "Gene_068", "Gene_069"]
    },
    "GO:0006468": {
        "name": "protein phosphorylation",
        "genes": ["Gene_011", "Gene_012", "Gene_013", "Gene_014", "Gene_015",
                  "Gene_070", "Gene_071", "Gene_072", "Gene_073", "Gene_074"]
    },
    "GO:0006412": {
        "name": "translation",
        "genes": ["Gene_016", "Gene_017", "Gene_018", "Gene_019", "Gene_020",
                  "Gene_075", "Gene_076", "Gene_077", "Gene_078", "Gene_079"]
    },
    "GO:0055114": {
        "name": "oxidation-reduction process",
        "genes": ["Gene_021", "Gene_022", "Gene_023", "Gene_024", "Gene_025",
                  "Gene_080", "Gene_081", "Gene_082", "Gene_083", "Gene_084"]
    },
    "GO:0016310": {
        "name": "phosphorylation",
        "genes": ["Gene_001", "Gene_011", "Gene_013", "Gene_015", "Gene_023",
                  "Gene_085", "Gene_086", "Gene_087", "Gene_088", "Gene_089"]
    },
    "GO:0006974": {
        "name": "cellular response to DNA damage",
        "genes": ["Gene_001", "Gene_005", "Gene_009", "Gene_014", "Gene_019",
                  "Gene_090", "Gene_091", "Gene_092", "Gene_093", "Gene_094"]
    },
}


def parse_gmt(content: str) -> Dict[str, Dict]:
    """Parse GMT format gene set file."""
    db = {}
    for line in content.strip().split('\n'):
        parts = line.strip().split('\t')
        if len(parts) >= 3:
            term_id = parts[0]
            description = parts[1]
            genes = [g.strip() for g in parts[2:] if g.strip()]
            db[term_id] = {"name": description, "genes": genes}
    return db


def bh_correction(pvalues: List[float]) -> List[float]:
    """Benjamini-Hochberg FDR correction."""
    n = len(pvalues)
    if n == 0:
        return []
    indexed = sorted(enumerate(pvalues), key=lambda x: x[1])
    fdr = [0.0] * n
    min_so_far = 1.0
    for rank_idx in range(n - 1, -1, -1):
        orig_idx, pval = indexed[rank_idx]
        rank = rank_idx + 1
        adjusted = pval * n / rank
        min_so_far = min(min_so_far, adjusted)
        fdr[orig_idx] = min(min_so_far, 1.0)
    return fdr


def run_enrichment(
    gene_list: List[str],
    background_genes: Optional[List[str]] = None,
    go_db: Optional[Dict] = None,
    pvalue_cutoff: float = 0.05,
) -> Dict:
    """
    Run GO enrichment analysis using Fisher's exact test.

    Args:
        gene_list: List of query genes (e.g. DEGs).
        background_genes: Background gene universe. If None, uses all genes in the DB.
        go_db: GO annotation database. If None, uses built-in demo DB.
        pvalue_cutoff: FDR threshold for significance.
    """
    if go_db is None:
        go_db = DEMO_GO_DB

    # Determine background
    if background_genes is None:
        all_genes = set()
        for data in go_db.values():
            all_genes.update(data["genes"])
        background_genes = list(all_genes)

    bg_set = set(background_genes)
    query_set = set(gene_list) & bg_set
    N = len(bg_set)  # total background
    n = len(query_set)  # query genes in background

    results = []
    for term_id, data in go_db.items():
        term_genes = set(data["genes"]) & bg_set
        K = len(term_genes)  # genes in this term
        k = len(query_set & term_genes)  # overlap

        if k == 0 or K == 0:
            continue

        # Fisher's exact test (2x2 contingency table)
        table = [
            [k, n - k],
            [K - k, N - K - n + k]
        ]
        # Use hypergeometric test for one-sided (over-representation)
        pvalue = stats.hypergeom.sf(k - 1, N, K, n)

        gene_ratio = f"{k}/{n}"
        bg_ratio = f"{K}/{N}"
        overlap_genes = sorted(query_set & term_genes)

        results.append({
            "term_id": term_id,
            "term_name": data["name"],
            "gene_ratio": gene_ratio,
            "bg_ratio": bg_ratio,
            "pvalue": float(pvalue),
            "count": k,
            "genes": overlap_genes,
        })

    if not results:
        return {"terms": [], "summary": {"total_terms": 0, "significant": 0}}

    # Sort by p-value
    results.sort(key=lambda x: x["pvalue"])

    # BH correction
    pvals = [r["pvalue"] for r in results]
    fdrs = bh_correction(pvals)
    for r, fdr in zip(results, fdrs):
        r["fdr"] = fdr

    significant = sum(1 for r in results if r["fdr"] < pvalue_cutoff)

    return {
        "terms": results,
        "summary": {
            "total_terms": len(results),
            "significant": significant,
            "query_genes": len(query_set),
            "background_size": N,
        }
    }
