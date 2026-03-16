"""
Metabolic Modeling Service using COBRApy.

Supports built-in E. coli core model and user-uploaded SBML models.
Provides FBA, FVA, gene knockout simulation, essential gene detection,
with configurable objective function and medium/culture conditions.
"""
import io
import json
import tempfile
import os
import subprocess
import uuid
import shutil
import pandas as pd
from typing import List, Dict, Optional




import cobra
from cobra.io import load_model, read_sbml_model
from cobra.flux_analysis import (
    flux_variability_analysis,
    find_essential_genes,
)


# Cache for built-in model
_MODEL_CACHE = {}


def get_builtin_model(model_name: str = "textbook") -> cobra.Model:
    """Load and cache a built-in COBRA model."""
    if model_name not in _MODEL_CACHE:
        _MODEL_CACHE[model_name] = load_model(model_name)
    return _MODEL_CACHE[model_name].copy()


def load_model_from_sbml(file_bytes: bytes) -> cobra.Model:
    """Parse an SBML model from uploaded file bytes."""
    tmp = tempfile.NamedTemporaryFile(suffix=".xml", delete=False)
    try:
        tmp.write(file_bytes)
        tmp.close()
        model = read_sbml_model(tmp.name)
        return model
    finally:
        os.unlink(tmp.name)


def _prepare_model(
    model: cobra.Model,
    objective_id: Optional[str] = None,
    medium_json: Optional[str] = None,
) -> cobra.Model:
    """Apply custom objective and medium to a model copy."""
    m = model.copy()

    # Set custom objective
    if objective_id:
        rxn_ids = [r.id for r in m.reactions]
        if objective_id in rxn_ids:
            m.objective = m.reactions.get_by_id(objective_id)
        else:
            raise ValueError(f"反应 '{objective_id}' 不存在于模型中")

    # Set custom medium
    if medium_json:
        medium_dict = json.loads(medium_json)
        # Reset all exchange reactions to 0 uptake, then apply medium
        for ex in m.exchanges:
            ex.lower_bound = 0  # no uptake by default
        for rxn_id, uptake in medium_dict.items():
            if rxn_id in [r.id for r in m.reactions]:
                rxn = m.reactions.get_by_id(rxn_id)
                rxn.lower_bound = -abs(float(uptake))  # convention: negative = uptake

    return m


def get_model_info(model: cobra.Model) -> Dict:
    """Get model summary information."""
    return {
        "model_id": model.id,
        "model_name": model.name or model.id,
        "num_reactions": len(model.reactions),
        "num_metabolites": len(model.metabolites),
        "num_genes": len(model.genes),
        "objective": str(model.objective.expression),
        "objective_reaction": _get_objective_reaction_id(model),
        "compartments": list(model.compartments.keys()) if model.compartments else [],
    }


def _get_objective_reaction_id(model: cobra.Model) -> Optional[str]:
    """Get the reaction ID of the current objective."""
    try:
        obj_expr = str(model.objective.expression)
        # The expression looks like "1.0*Biomass_Ecoli_core_w_GAM - 1.0*Biomass_Ecoli_core_w_GAM_reverse_..."
        # Find the reaction whose forward_variable name is in the expression
        for rxn in model.reactions:
            if rxn.forward_variable.name in obj_expr:
                return rxn.id
    except Exception:
        pass
    return None


def get_reactions_list(model: cobra.Model) -> List[Dict]:
    """Return all reactions for objective function selection."""
    obj_id = _get_objective_reaction_id(model)
    return [
        {
            "id": r.id,
            "name": r.name,
            "reaction": r.reaction,
            "subsystem": r.subsystem or "",
            "lower_bound": r.lower_bound,
            "upper_bound": r.upper_bound,
            "is_objective": r.id == obj_id,
        }
        for r in model.reactions
    ]


def get_exchange_reactions(model: cobra.Model) -> List[Dict]:
    """Return all exchange reactions for medium configuration."""
    medium = model.medium
    return [
        {
            "id": ex.id,
            "name": ex.name,
            "lower_bound": ex.lower_bound,
            "upper_bound": ex.upper_bound,
            "in_medium": ex.id in medium,
            "uptake_rate": medium.get(ex.id, 0),
        }
        for ex in sorted(model.exchanges, key=lambda r: r.id)
    ]


def get_genes_list(model: cobra.Model) -> List[Dict]:
    """Return all genes in the model."""
    return [
        {"id": g.id, "name": g.name or g.id}
        for g in sorted(model.genes, key=lambda g: g.id)
    ]


def run_fba(
    model: cobra.Model,
    objective_id: Optional[str] = None,
    medium_json: Optional[str] = None,
) -> Dict:
    """Run Flux Balance Analysis with optional custom objective/medium."""
    m = _prepare_model(model, objective_id, medium_json)
    solution = m.optimize()

    if solution.status != "optimal":
        return {
            "status": solution.status,
            "objective_value": 0,
            "fluxes": [],
            "summary": {"total_reactions": 0, "active_reactions": 0, "inactive_reactions": 0},
        }

    fluxes = []
    for rxn in m.reactions:
        flux = solution.fluxes[rxn.id]
        fluxes.append({
            "reaction_id": rxn.id,
            "reaction_name": rxn.name,
            "flux": round(float(flux), 6),
            "subsystem": rxn.subsystem or "",
            "reaction_string": rxn.reaction,
            "lower_bound": rxn.lower_bound,
            "upper_bound": rxn.upper_bound,
        })

    fluxes.sort(key=lambda x: abs(x["flux"]), reverse=True)

    return {
        "status": "optimal",
        "objective_value": round(float(solution.objective_value), 6),
        "objective_id": objective_id or _get_objective_reaction_id(m),
        "fluxes": fluxes,
        "summary": {
            "total_reactions": len(fluxes),
            "active_reactions": sum(1 for f in fluxes if abs(f["flux"]) > 1e-6),
            "inactive_reactions": sum(1 for f in fluxes if abs(f["flux"]) <= 1e-6),
        },
    }


def run_fva(
    model: cobra.Model,
    fraction: float = 0.9,
    objective_id: Optional[str] = None,
    medium_json: Optional[str] = None,
    reaction_ids: Optional[List[str]] = None,
) -> Dict:
    """Run Flux Variability Analysis."""
    m = _prepare_model(model, objective_id, medium_json)

    reactions = None
    if reaction_ids:
        reactions = [m.reactions.get_by_id(rid) for rid in reaction_ids
                     if rid in [r.id for r in m.reactions]]

    fva_result = flux_variability_analysis(
        m, reaction_list=reactions, fraction_of_optimum=fraction,
    )

    results = []
    for rxn_id in fva_result.index:
        rxn = m.reactions.get_by_id(rxn_id)
        min_flux = float(fva_result.loc[rxn_id, "minimum"])
        max_flux = float(fva_result.loc[rxn_id, "maximum"])
        results.append({
            "reaction_id": rxn_id,
            "reaction_name": rxn.name,
            "min_flux": round(min_flux, 6),
            "max_flux": round(max_flux, 6),
            "range": round(max_flux - min_flux, 6),
            "subsystem": rxn.subsystem or "",
        })
    results.sort(key=lambda x: x["range"], reverse=True)

    return {
        "fraction_of_optimum": fraction,
        "results": results,
        "summary": {
            "total_reactions": len(results),
            "fixed_flux": sum(1 for r in results if r["range"] < 1e-6),
            "variable_flux": sum(1 for r in results if r["range"] >= 1e-6),
        },
    }


def run_gene_knockout(
    gene_ids: List[str],
    model: cobra.Model,
    objective_id: Optional[str] = None,
    medium_json: Optional[str] = None,
) -> Dict:
    """Simulate single gene knockouts."""
    m = _prepare_model(model, objective_id, medium_json)

    wt_solution = m.optimize()
    wt_growth = float(wt_solution.objective_value) if wt_solution.status == "optimal" else 0

    results = []
    model_gene_ids = [g.id for g in m.genes]

    for gene_id in gene_ids:
        gene_id = gene_id.strip()
        if not gene_id:
            continue

        if gene_id not in model_gene_ids:
            results.append({
                "gene_id": gene_id, "status": "not_found",
                "wt_growth": round(wt_growth, 6),
                "ko_growth": None, "growth_ratio": None, "is_essential": None,
            })
            continue

        m_ko = _prepare_model(model, objective_id, medium_json)
        m_ko.genes.get_by_id(gene_id).knock_out()
        ko_solution = m_ko.optimize()
        ko_growth = float(ko_solution.objective_value) if ko_solution.status == "optimal" else 0
        ratio = ko_growth / wt_growth if wt_growth > 0 else 0

        results.append({
            "gene_id": gene_id, "status": "success",
            "wt_growth": round(wt_growth, 6),
            "ko_growth": round(ko_growth, 6),
            "growth_ratio": round(ratio, 4),
            "is_essential": ratio < 0.01,
        })

    return {
        "wt_growth": round(wt_growth, 6),
        "results": results,
        "summary": {
            "total_genes": len(results),
            "essential": sum(1 for r in results if r.get("is_essential") is True),
            "non_essential": sum(1 for r in results if r.get("is_essential") is False),
        },
    }


def find_essential_genes_list(
    model: cobra.Model,
    objective_id: Optional[str] = None,
    medium_json: Optional[str] = None,
) -> Dict:
    """Find all essential genes."""
    m = _prepare_model(model, objective_id, medium_json)
    essential = find_essential_genes(m)

    genes_list = [
        {
            "gene_id": g.id,
            "gene_name": g.name or g.id,
            "num_reactions": len(g.reactions),
            "reactions": [r.id for r in g.reactions][:10],
        }
        for g in sorted(essential, key=lambda x: x.id)
    ]

    return {
        "essential_genes": genes_list,
        "summary": {
            "total_genes": len(m.genes),
            "essential_count": len(genes_list),
            "essential_ratio": round(len(genes_list) / len(m.genes), 4) if len(m.genes) > 0 else 0,
        },
    }


def get_network_data(
    model: cobra.Model,
    objective_id: Optional[str] = None,
    medium_json: Optional[str] = None,
    run_fba_overlay: bool = False,
) -> Dict:
    """Build network graph data (nodes + edges) from a COBRA model.

    Returns Cytoscape.js-compatible elements with metabolite and reaction nodes
    connected by directed edges. Optionally runs FBA and overlays flux values.
    """
    m = _prepare_model(model, objective_id, medium_json)

    # Optionally compute fluxes
    flux_map: Dict[str, float] = {}
    fba_obj_value = None
    if run_fba_overlay:
        solution = m.optimize()
        if solution.status == "optimal":
            fba_obj_value = round(float(solution.objective_value), 6)
            for rxn in m.reactions:
                flux_map[rxn.id] = round(float(solution.fluxes[rxn.id]), 6)

    # Collect unique subsystems
    subsystems = sorted({r.subsystem for r in m.reactions if r.subsystem})

    # Build metabolite nodes
    nodes = []
    for met in m.metabolites:
        nodes.append({
            "data": {
                "id": f"m_{met.id}",
                "label": met.name or met.id,
                "metabolite_id": met.id,
                "type": "metabolite",
                "compartment": met.compartment or "",
                "formula": str(met.formula) if met.formula else "",
            }
        })

    # Build reaction nodes
    obj_id = _get_objective_reaction_id(m)
    for rxn in m.reactions:
        node_data = {
            "id": f"r_{rxn.id}",
            "label": rxn.id,
            "reaction_id": rxn.id,
            "reaction_name": rxn.name,
            "type": "reaction",
            "subsystem": rxn.subsystem or "",
            "reaction_string": rxn.reaction,
            "reversible": rxn.lower_bound < 0,
            "is_exchange": rxn in m.exchanges,
            "is_objective": rxn.id == obj_id,
            "lower_bound": rxn.lower_bound,
            "upper_bound": rxn.upper_bound,
            "gene_rule": rxn.gene_reaction_rule or "",
        }
        if rxn.id in flux_map:
            node_data["flux"] = flux_map[rxn.id]
        nodes.append({"data": node_data})

    # Build edges: metabolite -> reaction (substrates), reaction -> metabolite (products)
    edges = []
    edge_id = 0
    for rxn in m.reactions:
        for met, coeff in rxn.metabolites.items():
            if coeff < 0:  # substrate (consumed)
                edges.append({
                    "data": {
                        "id": f"e_{edge_id}",
                        "source": f"m_{met.id}",
                        "target": f"r_{rxn.id}",
                        "stoichiometry": round(float(coeff), 4),
                        "role": "substrate",
                    }
                })
            else:  # product (produced)
                edges.append({
                    "data": {
                        "id": f"e_{edge_id}",
                        "source": f"r_{rxn.id}",
                        "target": f"m_{met.id}",
                        "stoichiometry": round(float(coeff), 4),
                        "role": "product",
                    }
                })
            edge_id += 1

    return {
        "nodes": nodes,
        "edges": edges,
        "subsystems": subsystems,
        "model_info": get_model_info(m),
        "fba_objective_value": fba_obj_value,
        "has_flux": len(flux_map) > 0,
    }

def run_scfea(file_bytes: bytes, filename: str, species: str = "human", is_sc_imputation: bool = False) -> Dict:
    """Run scFEA for single-cell metabolic flux estimation.
    
    Args:
        file_bytes (bytes): The uploaded single-cell file bytes (.h5ad or .csv)
        filename (str): Original filename to determine extension
        species (str): 'human' or 'mouse'
        is_sc_imputation (bool): Whether to perform imputation (magic)
        
    Returns:
        Dict: ScFEA output data containing predicted fluxes.
    """
    job_id = str(uuid.uuid4())
    temp_dir = tempfile.mkdtemp(prefix=f"scfea_{job_id}_")
    
    try:
        input_dir = os.path.join(temp_dir, "input")
        output_dir = os.path.join(temp_dir, "output")
        os.makedirs(input_dir)
        os.makedirs(output_dir)
        
        input_file_path = os.path.join(input_dir, filename)
        with open(input_file_path, "wb") as f:
            f.write(file_bytes)
            
        csv_filename = "input.csv"
        csv_path = os.path.join(input_dir, csv_filename)
        
        if filename.endswith(".h5ad"):
            import anndata
            adata = anndata.read_h5ad(input_file_path)
            
            # Extract dense expression matrix and var_names/obs_names 
            X = adata.X.toarray() if hasattr(adata.X, "toarray") else adata.X
            df = pd.DataFrame(X, index=adata.obs_names, columns=adata.var_names)
            # scFEA expects rows to be cells and columns to be genes 
            df.to_csv(csv_path)
            
        elif filename.endswith(".csv"):
            shutil.copy(input_file_path, csv_path)
        else:
            raise ValueError("不支持此单细胞格式。请上传 .h5ad 或 .csv 文件。")
            
        module_file = "module_gene_m168.csv" if species == "human" else "module_gene_complete_mouse_m168.csv"
        cm_matrix = "cmMat_c70_m168.csv" if species == "human" else "cmMat_complete_mouse_c70_m168.csv"
            
        scfea_base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "scFEA"))
        scfea_src = os.path.join(scfea_base, "src", "scFEA.py")
        scfea_data = os.path.join(scfea_base, "data")
        
        # Determine the correct python interpreter from current environment or fallback to system python
        import sys
        python_exe = sys.executable
        
        cmd = [
            python_exe, scfea_src,
            "--data_dir", scfea_data,
            "--input_dir", input_dir,
            "--res_dir", output_dir,
            "--test_file", csv_filename,
            "--moduleGene_file", module_file,
            "--stoichiometry_matrix", cm_matrix,
            "--sc_imputation", str(is_sc_imputation),
            "--train_epoch", "10", 
        ]
        
        process = subprocess.run(cmd, capture_output=True, text=True, cwd=scfea_base)
        
        if process.returncode != 0:
            raise RuntimeError(f"scFEA 任务失败:\\n{process.stderr}\\n{process.stdout}")
            
        output_files = os.listdir(output_dir)
        flux_file = next((f for f in output_files if f.endswith(".csv") and "module168" in f or "module" in f), None)
        
        if not flux_file:
            raise RuntimeError(f"scFEA 运行完成，但未找到输出通量文件。输出目录: {output_files}")
            
        flux_df = pd.read_csv(os.path.join(output_dir, flux_file), index_col=0)
        
        # Round the dataframe values
        flux_df = flux_df.round(4)
        
        return {
            "fluxes": flux_df.values.tolist(),
            "cells": flux_df.index.astype(str).tolist(),
            "modules": flux_df.columns.astype(str).tolist(),
            "species": species,
            "epochs": 10
        }
        
    finally:
        shutil.rmtree(temp_dir)


