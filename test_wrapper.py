#!/usr/bin/env python3
"""Auto-generated GPRuler organism-name pipeline wrapper."""
import sys
import os

sys.path.insert(0, "/tmp")
sys.path.insert(1, "/tmp")

import pandas as pd
import genericLib as gL

model_name = "model"
kegg_code = "eco"
organism_name = "eco"

OUTDIR = "/tmp"

print(f"GPRuler Organism Pipeline: {organism_name} ({kegg_code})")

# Step 1: Get reactions list from KEGG
print("Step 1: Retrieving metabolic reactions from KEGG...")
try:
    import genesLib as genesL
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"})
    retry = Retry(total=5, backoff_factor=2, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)

    # Get list of metabolic pathways for the organism
    # KEGG API doesn't support organism->reaction directly, so use KO and Enzyme mappings
    gene2rxns = {}
    
    # 1. Map via KO
    try:
        ko_to_rxn = {}
        resp = session.get("http://rest.kegg.jp/link/reaction/ko", timeout=120)
        if resp.status_code == 200:
            for line in resp.text.strip().split("\n"):
                if "\t" in line:
                    ko, rxn = line.strip().split("\t")
                    if ko not in ko_to_rxn: ko_to_rxn[ko] = []
                    ko_to_rxn[ko].append(rxn.replace("rn:", ""))
        
        resp = session.get(f"http://rest.kegg.jp/link/ko/{kegg_code}", timeout=120)
        if resp.status_code == 200:
            for line in resp.text.strip().split("\n"):
                if "\t" in line:
                    gene, ko = line.strip().split("\t")
                    gene = gene.replace(f"{kegg_code}:", "")
                    if ko in ko_to_rxn:
                        if gene not in gene2rxns: gene2rxns[gene] = set()
                        for r in ko_to_rxn[ko]:
                            gene2rxns[gene].add(r)
    except Exception as e:
        print(f"Warning (KO mapping): {e}")

    # 2. Map via Enzyme
    try:
        ec_to_rxn = {}
        resp = session.get("http://rest.kegg.jp/link/reaction/enzyme", timeout=120)
        if resp.status_code == 200:
            for line in resp.text.strip().split("\n"):
                if "\t" in line:
                    ec, rxn = line.strip().split("\t")
                    if ec not in ec_to_rxn: ec_to_rxn[ec] = []
                    ec_to_rxn[ec].append(rxn.replace("rn:", ""))
                    
        resp = session.get(f"http://rest.kegg.jp/link/enzyme/{kegg_code}", timeout=120)
        if resp.status_code == 200:
            for line in resp.text.strip().split("\n"):
                if "\t" in line:
                    gene, ec = line.strip().split("\t")
                    gene = gene.replace(f"eco:", "")
                    if ec in ec_to_rxn:
                        if gene not in gene2rxns: gene2rxns[gene] = set()
                        for r in ec_to_rxn[ec]:
                            gene2rxns[gene].add(r)
    except Exception as e:
        print(f"Warning (Enzyme mapping): {e}")

    if not gene2rxns:
        raise RuntimeError(f"Failed to retrieve any reactions for eco via KO or Enzyme.")

    # Convert sets to lists
    for g in gene2rxns:
        gene2rxns[g] = list(gene2rxns[g])

    # Save gene-to-reaction mapping
    df_g2r = pd.DataFrame([
        {"GeneId": g, "Rxns": str(rxns)} for g, rxns in gene2rxns.items()
    ])
    df_g2r.to_csv(os.path.join(OUTDIR, model_name + "_GeneId2Rxns.csv"), sep="\t", index=False)

    # Build reaction-to-genes mapping
    rxn2genes = {}
    for gene, rxns in gene2rxns.items():
        for rxn in rxns:
            if rxn not in rxn2genes:
                rxn2genes[rxn] = []
            rxn2genes[rxn].append(gene)

    rows = []
    for rxn, genes in rxn2genes.items():
        rows.append({"RxnId": rxn, "Genes": [genes]})
    dfRxnToGenes = pd.DataFrame(rows)
    dfRxnToGenes.to_csv(os.path.join(OUTDIR, model_name + "_Rxns2Genes.csv"), sep="\t", index=False)

    # Build gene-kegg-uniprot mapping
    gene_entries = []
    for gene in gene2rxns.keys():
        gene_entries.append({"keggId": gene, "uniprotId": gene})
    dfKegg2Uniprot = pd.DataFrame(gene_entries)
    dfKegg2Uniprot.to_csv(os.path.join(OUTDIR, model_name + "_Kegg2UniprotGenes.csv"), sep="\t", index=False)

    print(f"  Found {len(rxn2genes)} reactions, {len(gene2rxns)} genes")

except Exception as e:
    print(f"Step 1 error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Step 2-7: Core GPRuler pipeline
print("Step 2-7: Running GPRuler core pipeline...")
try:
    from ast import literal_eval

    rxn_file = os.path.join(OUTDIR, model_name + "_Rxns2Genes.csv")
    kegg_file = os.path.join(OUTDIR, model_name + "_Kegg2UniprotGenes.csv")

    dfRxnToGenes = pd.read_csv(rxn_file, sep="\t")
    dfRxnToGenes["Genes"] = dfRxnToGenes["Genes"].apply(lambda x: literal_eval(x) if isinstance(x, str) else x)

    dfKegg2UniprotId = pd.read_csv(kegg_file, sep="\t", dtype={"keggId": str})

    lOrganismGenesSet = []
    for gene in dfRxnToGenes["Genes"]:
        if isinstance(gene, list):
            for g in gene:
                if isinstance(g, list):
                    lOrganismGenesSet += g
                else:
                    lOrganismGenesSet.append(g)
    lOrganismGenesSet = gL.unique(lOrganismGenesSet)

    dfKegg2UniprotId = dfKegg2UniprotId[dfKegg2UniprotId.keggId.isin(lOrganismGenesSet)]
    dfKegg2UniprotId = dfKegg2UniprotId.reset_index(drop=True)

    print(f"  Processing {len(lOrganismGenesSet)} unique genes...")

    # Try full pipeline with external database queries
    try:
        import GPRULERLib as gprL
        print("  Getting data from UniProt + Complex Portal...")
        dfData = gprL.getUniprotAndComplexPortalData(dfKegg2UniprotId)
        print("  Text mining from UniProt...")
        dfData = gprL.textMiningFromUniprot(dfData)
        print("  Getting data from STRING...")
        dfData = gprL.getStringData(dfData)
        print(f"  Getting data from KEGG (organism: {kegg_code})...")
        dfData = gprL.getKeggData(dfData, kegg_code)
        dfData.to_csv(os.path.join(OUTDIR, model_name + "_GenesData.csv"), sep="\t", index=False)
        print("  Merging data...")
        dfData = gprL.mergeData(dfData)
        dfData.to_csv(os.path.join(OUTDIR, model_name + "_GenesRelationships.csv"), sep="\t", index=False)
    except Exception as e2:
        print(f"  Database queries skipped ({e2}), generating simple rules...")

    # Generate GPR rules
    rules = []
    for _, row in dfRxnToGenes.iterrows():
        genes_list = row["Genes"]
        if not isinstance(genes_list, list) or len(genes_list) == 0:
            rules.append("")
        elif len(genes_list) == 1:
            if genes_list[0]:
                rules.append("(" + " and ".join(str(g) for g in genes_list[0]) + ")")
            else:
                rules.append("")
        else:
            flat = []
            for sublist in genes_list:
                if isinstance(sublist, list):
                    flat.extend(sublist)
                else:
                    flat.append(sublist)
            flat = gL.unique(flat)
            if len(flat) == 1:
                rules.append(str(flat[0]))
            else:
                rules.append(" or ".join(str(g) for g in flat))
    dfRxnToGenes["GPR rule"] = rules
    dfRxnToGenes.to_csv(os.path.join(OUTDIR, model_name + "_gprRules.csv"), sep="\t", index=False)
    print(f"  Generated {len(rules)} GPR rules")

except Exception as e:
    print(f"Pipeline error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("GPRuler organism pipeline completed!")
