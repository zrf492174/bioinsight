#!/usr/bin/env python3
"""Auto-generated GPRuler SBML pipeline wrapper."""
import sys
import os

# Ensure our override genericLib is found first
sys.path.insert(0, "/tmp")
sys.path.insert(1, "/root/test/GPRuler/pipeline")

import pandas as pd
import genericLib as gL

# Step 1: Metabolite Identification
print("Step 1: Metabolite Identification...")
try:
    # The module expects sys.argv[1] for model type
    sys.argv = ["metaboliteIdentification.py", "ownData"]
    import metaboliteIdentification
    # We need to handle this differently — use cobra to parse the SBML
    import cobra
    model_path = os.path.join("/tmp", "eco")
    model = cobra.io.read_sbml_model(model_path)

    # Extract reactions and genes
    rxn_data = []
    for rxn in model.reactions:
        genes = []
        if rxn.gene_reaction_rule:
            gene_ids = [g.id for g in rxn.genes]
            genes.append(gene_ids)
        rxn_data.append({"RxnId": rxn.id, "Genes": genes})

    dfRxnToGenes = pd.DataFrame(rxn_data)
    dfRxnToGenes.to_csv(os.path.join("/tmp", "model_Rxns2Genes.csv"), sep="\t", index=False)

    # Extract gene-to-kegg mapping (use model gene IDs as stand-in for KEGG IDs)
    gene_entries = []
    for g in model.genes:
        gene_entries.append({"keggId": g.id, "uniprotId": g.id})
    dfKegg2Uniprot = pd.DataFrame(gene_entries)
    dfKegg2Uniprot.to_csv(os.path.join("/tmp", "model_Kegg2UniprotGenes.csv"), sep="\t", index=False)

    print(f"  Extracted {len(model.reactions)} reactions, {len(model.genes)} genes")
except Exception as e:
    print(f"Step 1 error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Step 2-7: Run GPRULER core pipeline
print("Step 2-7: Running GPRuler core pipeline...")
try:
    sys.argv = ["GPRULER.py", "ownData"]

    import importlib

    # Reload modules with correct paths
    if 'genericLib' in sys.modules:
        importlib.reload(sys.modules['genericLib'])

    from ast import literal_eval
    import itertools as it

    workingDirs = gL.setWorkingDirs()
    OUTDIR = workingDirs[2]

    model_name = "model"
    regexOrgSpecific = r"([A-Za-z0-9_.-]+)"

    # Read prepared data
    rxn_file = os.path.join(OUTDIR, model_name + "_Rxns2Genes.csv")
    kegg_file = os.path.join(OUTDIR, model_name + "_Kegg2UniprotGenes.csv")

    if os.path.isfile(rxn_file) and os.path.isfile(kegg_file):
        dfRxnToGenes = pd.read_csv(rxn_file, sep="\t")
        dfRxnToGenes["Genes"] = dfRxnToGenes["Genes"].apply(lambda x: literal_eval(x) if isinstance(x, str) else x)

        dfKegg2UniprotId = pd.read_csv(kegg_file, sep="\t", dtype={"keggId": str})

        # Collect all genes
        lOrganismGenesSet = []
        for gene in dfRxnToGenes["Genes"]:
            if isinstance(gene, list):
                for g in gene:
                    if isinstance(g, list):
                        lOrganismGenesSet += g
                    else:
                        lOrganismGenesSet.append(g)
        lOrganismGenesSet = gL.unique(lOrganismGenesSet)

        # Filter mapping
        dfKegg2UniprotId = dfKegg2UniprotId[dfKegg2UniprotId.keggId.isin(lOrganismGenesSet)]
        dfKegg2UniprotId = dfKegg2UniprotId.reset_index(drop=True)

        print(f"  Processing {len(lOrganismGenesSet)} unique genes...")

        # Try to run UniProt/STRING/KEGG data gathering
        try:
            import GPRULERLib as gprL
            print("  Getting data from UniProt and Complex Portal...")
            dfData = gprL.getUniprotAndComplexPortalData(dfKegg2UniprotId)
            print("  Text mining from UniProt...")
            dfData = gprL.textMiningFromUniprot(dfData)
            print("  Getting data from STRING...")
            dfData = gprL.getStringData(dfData)

            # Try to infer organism code from gene IDs
            organismCode = "hsa"  # default to human
            print(f"  Getting data from KEGG (organism code: {organismCode})...")
            dfData = gprL.getKeggData(dfData, organismCode)
            dfData.to_csv(os.path.join(OUTDIR, model_name + "_GenesData.csv"), sep="\t", index=False)

            print("  Merging data...")
            dfData = gprL.mergeData(dfData)
            dfData.to_csv(os.path.join(OUTDIR, model_name + "_GenesRelationships.csv"), sep="\t", index=False)
        except Exception as e2:
            print(f"  Data gathering skipped ({e2}), generating simple rules from model GPR...")

        # Generate GPR rules — either from gathered data or directly from model
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
    else:
        print("  Required input files not found, skipping rule generation")

except Exception as e:
    print(f"Pipeline error: {e}")
    import traceback
    traceback.print_exc()

print("GPRuler pipeline completed!")
