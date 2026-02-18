"""
PPI (Protein-Protein Interaction) Analysis Service.

Uses the STRING database REST API to fetch interaction data.
Also provides a built-in demo mode for offline use.
"""
import json
from typing import List, Dict, Optional

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


# Demo PPI data for offline use
DEMO_PPI = {
    "nodes": [
        {"id": "Gene_001", "name": "Gene_001", "description": "Apoptosis regulator"},
        {"id": "Gene_002", "name": "Gene_002", "description": "Inflammatory mediator"},
        {"id": "Gene_003", "name": "Gene_003", "description": "Cell proliferation factor"},
        {"id": "Gene_004", "name": "Gene_004", "description": "Cell cycle kinase"},
        {"id": "Gene_005", "name": "Gene_005", "description": "Tumor suppressor"},
        {"id": "Gene_006", "name": "Gene_006", "description": "Signaling receptor"},
        {"id": "Gene_007", "name": "Gene_007", "description": "Growth factor"},
        {"id": "Gene_008", "name": "Gene_008", "description": "Transcription factor"},
        {"id": "Gene_009", "name": "Gene_009", "description": "DNA repair enzyme"},
        {"id": "Gene_010", "name": "Gene_010", "description": "Kinase regulator"},
    ],
    "edges": [
        {"source": "Gene_001", "target": "Gene_005", "score": 0.95, "type": "physical"},
        {"source": "Gene_001", "target": "Gene_009", "score": 0.87, "type": "functional"},
        {"source": "Gene_002", "target": "Gene_006", "score": 0.92, "type": "physical"},
        {"source": "Gene_002", "target": "Gene_003", "score": 0.78, "type": "functional"},
        {"source": "Gene_003", "target": "Gene_004", "score": 0.91, "type": "physical"},
        {"source": "Gene_003", "target": "Gene_007", "score": 0.85, "type": "functional"},
        {"source": "Gene_004", "target": "Gene_008", "score": 0.88, "type": "physical"},
        {"source": "Gene_005", "target": "Gene_009", "score": 0.94, "type": "physical"},
        {"source": "Gene_005", "target": "Gene_010", "score": 0.79, "type": "functional"},
        {"source": "Gene_006", "target": "Gene_007", "score": 0.83, "type": "physical"},
        {"source": "Gene_006", "target": "Gene_010", "score": 0.76, "type": "functional"},
        {"source": "Gene_007", "target": "Gene_008", "score": 0.81, "type": "functional"},
        {"source": "Gene_008", "target": "Gene_009", "score": 0.72, "type": "functional"},
    ],
}


def query_string_api(
    gene_list: List[str],
    species: int = 9606,
    score_threshold: float = 400,
) -> Dict:
    """
    Query STRING database for PPI data.

    Args:
        gene_list: List of gene/protein names.
        species: NCBI taxonomy ID (9606 = human).
        score_threshold: Minimum combined score (0-1000).
    """
    if not HAS_REQUESTS:
        return get_demo_ppi(gene_list)

    string_url = "https://string-db.org/api"

    try:
        # Get interaction network
        params = {
            "identifiers": "\r".join(gene_list[:50]),  # max 50
            "species": species,
            "required_score": int(score_threshold),
            "caller_identity": "bioinsight_app",
        }

        resp = requests.get(
            f"{string_url}/json/network",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        interactions = resp.json()

        # Build nodes and edges
        node_ids = set()
        edges = []
        for inter in interactions:
            src = inter.get("preferredName_A", inter.get("stringId_A", ""))
            tgt = inter.get("preferredName_B", inter.get("stringId_B", ""))
            score = inter.get("score", 0)
            node_ids.add(src)
            node_ids.add(tgt)
            edges.append({
                "source": src,
                "target": tgt,
                "score": round(score, 3),
                "type": "string",
            })

        nodes = [{"id": nid, "name": nid, "description": ""} for nid in node_ids]

        return {
            "nodes": nodes,
            "edges": edges,
            "source": "STRING",
            "summary": {
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "species": species,
                "score_threshold": score_threshold,
            }
        }
    except Exception as e:
        # Fall back to demo data with a note
        result = get_demo_ppi(gene_list)
        result["source"] = "demo (STRING API unreachable)"
        result["error"] = str(e)
        return result


def get_demo_ppi(gene_list: List[str]) -> Dict:
    """Get demo PPI data for given genes."""
    gene_set = set(gene_list)
    nodes = [n for n in DEMO_PPI["nodes"] if n["id"] in gene_set]
    node_ids = {n["id"] for n in nodes}
    edges = [e for e in DEMO_PPI["edges"]
             if e["source"] in node_ids and e["target"] in node_ids]

    # Add any requested genes not in demo data
    for g in gene_list:
        if g not in node_ids:
            nodes.append({"id": g, "name": g, "description": ""})

    return {
        "nodes": nodes,
        "edges": edges,
        "source": "demo",
        "summary": {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "species": 9606,
            "score_threshold": 0,
        }
    }
