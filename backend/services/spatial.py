"""Spatial transcriptomics analysis services."""

import omicverse as ov
import scanpy as sc
import anndata as ad
import pandas as pd
import numpy as np
import gc

def process_spatial(file_path: str, target_gene: str = None) -> dict:
    """
    Load data, extract spatial coordinates and expression for a specific gene.
    Returns spatial coords and expression values optimized for memory.
    """
    try:
        # Load small spatial dataset using OmicVerse utils
        adata = ov.utils.read(file_path)
        
        if 'spatial' not in adata.obsm:
            raise ValueError("The provided .h5ad file does not contain 'spatial' coordinates in obsm.")
            
        coords = adata.obsm['spatial'].tolist()
        spot_names = adata.obs_names.tolist()
        
        expression_values = []
        gene_found = False
        
        if target_gene and target_gene in adata.var_names:
            expr = adata[:, target_gene].X
            if hasattr(expr, "toarray"):
                expr = expr.toarray()
            expression_values = expr.flatten().tolist()
            gene_found = True
        elif target_gene:
            raise ValueError(f"Gene '{target_gene}' not found in the dataset.")
        else:
            # If no gene provided, return total counts as a fallback
            if 'total_counts' in adata.obs:
                expression_values = adata.obs['total_counts'].tolist()
            else:
                expr = np.asarray(adata.X.sum(axis=1))
                expression_values = expr.flatten().tolist()
            gene_found = True

        result = {
            "coords": coords,
            "spot_names": spot_names,
            "expression": expression_values,
            "gene_name": target_gene if target_gene else "Total Counts",
            "available_genes": adata.var_names[:100].tolist() # Return subset for memory constraints
        }
        
        # Cleanup
        del adata
        gc.collect()
        
        return result
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise ValueError(f"Error processing spatial data: {str(e)}")
