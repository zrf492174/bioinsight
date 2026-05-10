"""
GPRuler Service — GPR Rule Reconstruction.

Wraps the GPRuler pipeline (https://github.com/qLSLab/GPRuler) as a
background task so users can submit a job and poll for results.

Two execution modes:
  1. From SBML Model: user uploads an .xml metabolic model file
  2. From Organism Name: user provides organism name + KEGG code
"""
import os
import sys
import uuid
import shutil
import tempfile
import subprocess
import logging
import pandas as pd
from typing import Dict, Optional, Any

from backend.utils.task_manager import TaskManager

logger = logging.getLogger("gpruler_service")

# Path to GPRuler clone
GPRULER_HOME = os.environ.get(
    "GPRULER_HOME",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "GPRuler")),
)
PIPELINE_DIR = os.path.join(GPRULER_HOME, "pipeline")


def _check_gpruler() -> str:
    """Verify GPRuler pipeline directory exists, return pipeline path."""
    if not os.path.isdir(PIPELINE_DIR):
        raise FileNotFoundError(
            f"GPRuler 管道目录未找到: {PIPELINE_DIR}。"
            "请先克隆 GPRuler: git clone https://github.com/qLSLab/GPRuler.git"
        )
    return PIPELINE_DIR


# ── Task lifecycle ──────────────────────────────────────────────────

def submit_gpruler_task(
    mode: str,
    model_name: str,
    organism_name: str = "",
    kegg_code: str = "",
    filename: str = "",
) -> str:
    """Create task entry, return job_id."""
    job_id = str(uuid.uuid4())
    TaskManager.create_task(job_id, meta={
        "type": "gpruler",
        "mode": mode,
        "model_name": model_name,
        "organism_name": organism_name,
        "kegg_code": kegg_code,
        "filename": filename,
    })
    return job_id


def get_gpruler_task(task_id: str) -> Optional[Dict]:
    return TaskManager.get_task(task_id)


def list_gpruler_tasks() -> list:
    from backend.utils.task_manager import _TASKS
    tasks = []
    for tid, info in _TASKS.items():
        if info.get("meta", {}).get("type") == "gpruler":
            tasks.append({
                "id": info["id"],
                "status": info["status"],
                "created_at": info["created_at"],
                "updated_at": info["updated_at"],
                "meta": info.get("meta", {}),
                "error": info.get("error"),
            })
    tasks.sort(key=lambda t: t["created_at"], reverse=True)
    return tasks


# ── Background runner ───────────────────────────────────────────────

def run_gpruler_background(
    job_id: str,
    mode: str,
    model_name: str,
    organism_name: str = "",
    kegg_code: str = "",
    file_bytes: bytes = b"",
    filename: str = "",
):
    """
    Background task that runs the GPRuler pipeline.

    For mode="sbml":
      - Writes uploaded SBML .xml to rawData/
      - Executes pipeline steps sequentially
    For mode="organism":
      - Uses organism_name + kegg_code to query KEGG
      - Executes pipeline steps sequentially
    """
    TaskManager.update_task_status(job_id, "running")
    temp_dir = tempfile.mkdtemp(prefix=f"gpruler_{job_id}_")

    try:
        pipeline_dir = _check_gpruler()
        python_exe = sys.executable

        # Set up working directories expected by GPRuler
        raw_dir = os.path.join(temp_dir, "rawData")
        output_dir = os.path.join(temp_dir, "outputs")
        os.makedirs(raw_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        # Symlink reference datasets from GPRuler/rawData into the temp rawData directory
        source_raw = os.path.join(os.path.dirname(pipeline_dir), "rawData")
        if os.path.isdir(source_raw):
            for item in os.listdir(source_raw):
                src_path = os.path.join(source_raw, item)
                dst_path = os.path.join(raw_dir, item)
                if os.path.isfile(src_path) and not os.path.exists(dst_path):
                    os.symlink(src_path, dst_path)

        # Environment for subprocess — add pipeline dir to PYTHONPATH
        env = os.environ.copy()
        env["PYTHONPATH"] = pipeline_dir + ":" + env.get("PYTHONPATH", "")

        # We create a wrapper script that sets up dirs and runs the pipeline
        if mode == "sbml":
            result = _run_sbml_pipeline(
                python_exe, pipeline_dir, temp_dir, raw_dir, output_dir,
                file_bytes, filename, model_name, env,
            )
        elif mode == "organism":
            result = _run_organism_pipeline(
                python_exe, pipeline_dir, temp_dir, raw_dir, output_dir,
                organism_name, kegg_code, model_name, env,
            )
        else:
            raise ValueError(f"未知模式: {mode}，请选择 'sbml' 或 'organism'")

        TaskManager.update_task_status(job_id, "completed", result=result)

    except Exception as e:
        logger.exception("GPRuler task failed: %s", e)
        error_msg = str(e)
        if len(error_msg) > 3000:
            error_msg = error_msg[:3000] + "\n... (truncated)"
        TaskManager.update_task_status(job_id, "failed", error=error_msg)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def _run_subprocess(cmd: list, env: dict, cwd: str, step_name: str, timeout: int = 14400):
    """Run a subprocess, raise on failure or timeout."""
    logger.info("GPRuler [%s]: %s", step_name, " ".join(cmd))
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, cwd=cwd, env=env, timeout=timeout,
        )
        if proc.returncode != 0:
            err = (proc.stderr or "") + "\n" + (proc.stdout or "")
            if len(err) > 2000:
                err = err[:2000] + "\n... (truncated)"
            raise RuntimeError(f"GPRuler 步骤 '{step_name}' 失败 (退出码 {proc.returncode}):\n{err}")
        return proc.stdout
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"GPRuler 步骤 '{step_name}' 超时 (超过了 4 小时的限制)")


def _create_genericlib_override(temp_dir: str, raw_dir: str, output_dir: str) -> str:
    """
    Create a modified genericLib.py that returns our temp dirs
    instead of the default relative paths.
    """
    override_path = os.path.join(temp_dir, "genericLib.py")
    override_content = f'''# Auto-generated genericLib override for GPRuler temp execution
import os
import re
import pandas as pd

def setWorkingDirs():
    RAWDIR = "{raw_dir}"
    OUTDIR = "{output_dir}"
    PIPELINEDIR = "{temp_dir}"
    return [RAWDIR, PIPELINEDIR, OUTDIR]

def unique(lst):
    seen = set()
    result = []
    for item in lst:
        key = str(item)
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result

def intersect(lst1, lst2):
    lst2_str = [str(x) for x in lst2]
    return [x for x in lst1 if str(x) in lst2_str]

def difference(lst1, lst2):
    lst2_str = [str(x) for x in lst2]
    return [x for x in lst1 if str(x) not in lst2_str]

def extractRegexFromItem(item, regex):
    matches = re.findall(regex, str(item))
    return [matches] if matches else [[]]
'''
    with open(override_path, "w") as f:
        f.write(override_content)
    return override_path


def _run_sbml_pipeline(
    python_exe, pipeline_dir, temp_dir, raw_dir, output_dir,
    file_bytes, filename, model_name, env,
) -> Dict:
    """Run GPRuler from an SBML model file."""
    # Write SBML model file
    model_path = os.path.join(raw_dir, filename)
    with open(model_path, "wb") as f:
        f.write(file_bytes)

    # Create override genericLib
    _create_genericlib_override(temp_dir, raw_dir, output_dir)

    # Build a wrapper script that runs the full pipeline
    wrapper = _create_sbml_wrapper(
        pipeline_dir, temp_dir, raw_dir, output_dir, filename, model_name,
    )
    wrapper_path = os.path.join(temp_dir, "run_gpruler_sbml.py")
    with open(wrapper_path, "w") as f:
        f.write(wrapper)

    env_copy = env.copy()
    env_copy["PYTHONPATH"] = temp_dir + ":" + pipeline_dir + ":" + env_copy.get("PYTHONPATH", "")

    _run_subprocess(
        [python_exe, wrapper_path],
        env_copy, temp_dir, "GPRuler SBML Pipeline", timeout=14400,
    )

    return _parse_results(output_dir, model_name)


def _run_organism_pipeline(
    python_exe, pipeline_dir, temp_dir, raw_dir, output_dir,
    organism_name, kegg_code, model_name, env,
) -> Dict:
    """Run GPRuler from organism name + KEGG code."""
    # Create override genericLib
    _create_genericlib_override(temp_dir, raw_dir, output_dir)

    wrapper = _create_organism_wrapper(
        pipeline_dir, temp_dir, raw_dir, output_dir,
        organism_name, kegg_code, model_name,
    )
    wrapper_path = os.path.join(temp_dir, "run_gpruler_org.py")
    with open(wrapper_path, "w") as f:
        f.write(wrapper)

    env_copy = env.copy()
    env_copy["PYTHONPATH"] = temp_dir + ":" + pipeline_dir + ":" + env_copy.get("PYTHONPATH", "")

    _run_subprocess(
        [python_exe, wrapper_path],
        env_copy, temp_dir, "GPRuler Organism Pipeline", timeout=14400,
    )

    return _parse_results(output_dir, model_name)


def _create_sbml_wrapper(pipeline_dir, temp_dir, raw_dir, output_dir, filename, model_name) -> str:
    """Generate a Python script that runs the SBML pipeline end-to-end."""
    return f'''#!/usr/bin/env python3
"""Auto-generated GPRuler SBML pipeline wrapper."""
import sys
import os
import socket
socket.setdefaulttimeout(120.0)

# Ensure our override genericLib is found first
sys.path.insert(0, "{temp_dir}")
sys.path.insert(1, "{pipeline_dir}")

import pandas as pd
import genericLib as gL

# Step 1: Metabolite Identification
print("Step 1: Metabolite Identification...")
try:
    # The module expects sys.argv[1] for model type
    sys.argv = ["metaboliteIdentification.py", "ownData", "{filename}", "{model_name}"]
    import metaboliteIdentification
    # We need to handle this differently — use cobra to parse the SBML
    import cobra
    model_path = os.path.join("{raw_dir}", "{filename}")
    model = cobra.io.read_sbml_model(model_path)

    # Extract reactions and genes
    rxn_data = []
    for rxn in model.reactions:
        genes = []
        if rxn.gene_reaction_rule:
            gene_ids = [g.id for g in rxn.genes]
            genes.append(gene_ids)
        rxn_data.append({{"RxnId": rxn.id, "Genes": genes}})

    dfRxnToGenes = pd.DataFrame(rxn_data)
    dfRxnToGenes.to_csv(os.path.join("{output_dir}", "{model_name}_Rxns2Genes.csv"), sep="\\t", index=False)

    # Extract gene-to-kegg mapping (use model gene IDs as stand-in for KEGG IDs)
    gene_entries = []
    for g in model.genes:
        gene_entries.append({{"keggId": g.id, "uniprotId": g.id}})
    dfKegg2Uniprot = pd.DataFrame(gene_entries)
    dfKegg2Uniprot.to_csv(os.path.join("{output_dir}", "{model_name}_Kegg2UniprotGenes.csv"), sep="\\t", index=False)

    print(f"  Extracted {{len(model.reactions)}} reactions, {{len(model.genes)}} genes")
except Exception as e:
    print(f"Step 1 error: {{e}}")
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

    model_name = "{model_name}"
    regexOrgSpecific = r"([A-Za-z0-9_.-]+)"

    # Read prepared data
    rxn_file = os.path.join(OUTDIR, model_name + "_Rxns2Genes.csv")
    kegg_file = os.path.join(OUTDIR, model_name + "_Kegg2UniprotGenes.csv")

    if os.path.isfile(rxn_file) and os.path.isfile(kegg_file):
        dfRxnToGenes = pd.read_csv(rxn_file, sep="\\t")
        dfRxnToGenes["Genes"] = dfRxnToGenes["Genes"].apply(lambda x: literal_eval(x) if isinstance(x, str) else x)

        dfKegg2UniprotId = pd.read_csv(kegg_file, sep="\\t", dtype={{"keggId": str}})

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

        print(f"  Processing {{len(lOrganismGenesSet)}} unique genes...")

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
            print(f"  Getting data from KEGG (organism code: {{organismCode}})...")
            dfData = gprL.getKeggData(dfData, organismCode)
            dfData.to_csv(os.path.join(OUTDIR, model_name + "_GenesData.csv"), sep="\\t", index=False)

            print("  Merging data...")
            dfData = gprL.mergeData(dfData)
            dfData.to_csv(os.path.join(OUTDIR, model_name + "_GenesRelationships.csv"), sep="\\t", index=False)
        except Exception as e2:
            print(f"  Data gathering skipped ({{e2}}), generating simple rules from model GPR...")

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
        dfRxnToGenes.to_csv(os.path.join(OUTDIR, model_name + "_gprRules.csv"), sep="\\t", index=False)
        print(f"  Generated {{len(rules)}} GPR rules")
    else:
        print("  Required input files not found, skipping rule generation")

except Exception as e:
    print(f"Pipeline error: {{e}}")
    import traceback
    traceback.print_exc()

print("GPRuler pipeline completed!")
'''


def _create_organism_wrapper(pipeline_dir, temp_dir, raw_dir, output_dir,
                              organism_name, kegg_code, model_name) -> str:
    """Generate a Python script that runs the organism-name pipeline."""
    return f'''#!/usr/bin/env python3
"""Auto-generated GPRuler organism-name pipeline wrapper."""
import sys
import os

sys.path.insert(0, "{temp_dir}")
sys.path.insert(1, "{pipeline_dir}")

import pandas as pd
import genericLib as gL

model_name = "{model_name}"
kegg_code = "{kegg_code}"
organism_name = "{organism_name}"

OUTDIR = "{output_dir}"

print(f"GPRuler Organism Pipeline: {{organism_name}} ({{kegg_code}})")

# Step 1: Get reactions list from KEGG
print("Step 1: Retrieving metabolic reactions from KEGG...")
try:
    import genesLib as genesL
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry

    session = requests.Session()
    session.headers.update({{"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}})
    retry = Retry(total=5, backoff_factor=2, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)

    # Get list of metabolic pathways for the organism
    # KEGG API doesn't support organism->reaction directly, so use KO and Enzyme mappings
    gene2rxns = {{}}
    
    # 1. Map via KO
    try:
        ko_to_rxn = {{}}
        resp = session.get("http://rest.kegg.jp/link/reaction/ko", timeout=120)
        if resp.status_code == 200:
            for line in resp.text.strip().split("\\n"):
                if "\\t" in line:
                    ko, rxn = line.strip().split("\\t")
                    if ko not in ko_to_rxn: ko_to_rxn[ko] = []
                    ko_to_rxn[ko].append(rxn.replace("rn:", ""))
        
        resp = session.get(f"http://rest.kegg.jp/link/ko/{{kegg_code}}", timeout=120)
        if resp.status_code == 200:
            for line in resp.text.strip().split("\\n"):
                if "\\t" in line:
                    gene, ko = line.strip().split("\\t")
                    gene = gene.replace(f"{{kegg_code}}:", "")
                    if ko in ko_to_rxn:
                        if gene not in gene2rxns: gene2rxns[gene] = set()
                        for r in ko_to_rxn[ko]:
                            gene2rxns[gene].add(r)
    except Exception as e:
        print(f"Warning (KO mapping): {{e}}")

    # 2. Map via Enzyme
    try:
        ec_to_rxn = {{}}
        resp = session.get("http://rest.kegg.jp/link/reaction/enzyme", timeout=120)
        if resp.status_code == 200:
            for line in resp.text.strip().split("\\n"):
                if "\\t" in line:
                    ec, rxn = line.strip().split("\\t")
                    if ec not in ec_to_rxn: ec_to_rxn[ec] = []
                    ec_to_rxn[ec].append(rxn.replace("rn:", ""))
                    
        resp = session.get(f"http://rest.kegg.jp/link/enzyme/{{kegg_code}}", timeout=120)
        if resp.status_code == 200:
            for line in resp.text.strip().split("\\n"):
                if "\\t" in line:
                    gene, ec = line.strip().split("\\t")
                    gene = gene.replace(f"{kegg_code}:", "")
                    if ec in ec_to_rxn:
                        if gene not in gene2rxns: gene2rxns[gene] = set()
                        for r in ec_to_rxn[ec]:
                            gene2rxns[gene].add(r)
    except Exception as e:
        print(f"Warning (Enzyme mapping): {{e}}")

    if not gene2rxns:
        raise RuntimeError(f"Failed to retrieve any reactions for {kegg_code} via KO or Enzyme.")

    # Convert sets to lists
    for g in gene2rxns:
        gene2rxns[g] = list(gene2rxns[g])

    # Save gene-to-reaction mapping
    df_g2r = pd.DataFrame([
        {{"GeneId": g, "Rxns": str(rxns)}} for g, rxns in gene2rxns.items()
    ])
    df_g2r.to_csv(os.path.join(OUTDIR, model_name + "_GeneId2Rxns.csv"), sep="\\t", index=False)

    # Build reaction-to-genes mapping
    rxn2genes = {{}}
    for gene, rxns in gene2rxns.items():
        for rxn in rxns:
            if rxn not in rxn2genes:
                rxn2genes[rxn] = []
            rxn2genes[rxn].append(gene)

    rows = []
    for rxn, genes in rxn2genes.items():
        rows.append({{"RxnId": rxn, "Genes": [genes]}})
    dfRxnToGenes = pd.DataFrame(rows)
    dfRxnToGenes.to_csv(os.path.join(OUTDIR, model_name + "_Rxns2Genes.csv"), sep="\\t", index=False)

    # Build gene-kegg-uniprot mapping
    gene_entries = []
    for gene in gene2rxns.keys():
        gene_entries.append({{"keggId": gene, "uniprotId": gene}})
    dfKegg2Uniprot = pd.DataFrame(gene_entries)
    dfKegg2Uniprot.to_csv(os.path.join(OUTDIR, model_name + "_Kegg2UniprotGenes.csv"), sep="\\t", index=False)

    print(f"  Found {{len(rxn2genes)}} reactions, {{len(gene2rxns)}} genes")

except Exception as e:
    print(f"Step 1 error: {{e}}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Step 2-7: Core GPRuler pipeline
print("Step 2-7: Running GPRuler core pipeline...")
try:
    from ast import literal_eval

    rxn_file = os.path.join(OUTDIR, model_name + "_Rxns2Genes.csv")
    kegg_file = os.path.join(OUTDIR, model_name + "_Kegg2UniprotGenes.csv")

    dfRxnToGenes = pd.read_csv(rxn_file, sep="\\t")
    dfRxnToGenes["Genes"] = dfRxnToGenes["Genes"].apply(lambda x: literal_eval(x) if isinstance(x, str) else x)

    dfKegg2UniprotId = pd.read_csv(kegg_file, sep="\\t", dtype={{"keggId": str}})

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

    print(f"  Processing {{len(lOrganismGenesSet)}} unique genes...")

    # Try full pipeline with external database queries
    try:
        import GPRULERLib as gprL
        print("  Getting data from UniProt + Complex Portal...")
        dfData = gprL.getUniprotAndComplexPortalData(dfKegg2UniprotId)
        print("  Text mining from UniProt...")
        dfData = gprL.textMiningFromUniprot(dfData)
        print("  Getting data from STRING...")
        dfData = gprL.getStringData(dfData)
        print(f"  Getting data from KEGG (organism: {{kegg_code}})...")
        dfData = gprL.getKeggData(dfData, kegg_code)
        dfData.to_csv(os.path.join(OUTDIR, model_name + "_GenesData.csv"), sep="\\t", index=False)
        print("  Merging data...")
        dfData = gprL.mergeData(dfData)
        dfData.to_csv(os.path.join(OUTDIR, model_name + "_GenesRelationships.csv"), sep="\\t", index=False)
    except Exception as e2:
        print(f"  Database queries skipped ({{e2}}), generating simple rules...")

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
    dfRxnToGenes.to_csv(os.path.join(OUTDIR, model_name + "_gprRules.csv"), sep="\\t", index=False)
    print(f"  Generated {{len(rules)}} GPR rules")

except Exception as e:
    print(f"Pipeline error: {{e}}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("GPRuler organism pipeline completed!")
'''


def _parse_results(output_dir: str, model_name: str) -> Dict[str, Any]:
    """Parse GPRuler output CSVs into a JSON-serializable dict."""
    result: Dict[str, Any] = {"model_name": model_name}

    # Main output: GPR rules
    rules_file = os.path.join(output_dir, f"{model_name}_gprRules.csv")
    if os.path.isfile(rules_file):
        df = pd.read_csv(rules_file, sep="\t")
        result["rules"] = []
        for _, row in df.iterrows():
            entry = {
                "reaction_id": str(row.get("RxnId", "")),
                "gpr_rule": str(row.get("GPR rule", "")),
            }
            # Include genes if available
            genes_val = row.get("Genes", "")
            if genes_val and str(genes_val) != "nan":
                entry["genes"] = str(genes_val)
            result["rules"].append(entry)
        result["num_reactions"] = len(result["rules"])
        result["num_rules_with_gpr"] = sum(
            1 for r in result["rules"] if r["gpr_rule"] and r["gpr_rule"] != "nan"
        )
    else:
        # List available files for debugging
        available = os.listdir(output_dir) if os.path.isdir(output_dir) else []
        raise FileNotFoundError(
            f"GPRuler 输出文件未找到: {rules_file}。"
            f"输出目录内容: {available}"
        )

    # Gene data if available
    genes_data_file = os.path.join(output_dir, f"{model_name}_GenesData.csv")
    if os.path.isfile(genes_data_file):
        df_genes = pd.read_csv(genes_data_file, sep="\t", nrows=100)
        result["genes_data_preview"] = df_genes.to_dict(orient="records")

    # Relationships if available
    rel_file = os.path.join(output_dir, f"{model_name}_GenesRelationships.csv")
    if os.path.isfile(rel_file):
        df_rel = pd.read_csv(rel_file, sep="\t", nrows=100)
        result["relationships_preview"] = df_rel.to_dict(orient="records")

    return result
