"""
Heatmap Data Service.

Prepares expression matrix data for heatmap visualization
with various normalization and filtering options.
"""
import numpy as np
import pandas as pd
from typing import List, Optional, Tuple


def zscore_normalize(matrix: np.ndarray, axis: int = 0) -> np.ndarray:
    """Z-score normalization along given axis."""
    mean = np.mean(matrix, axis=axis, keepdims=True)
    std = np.std(matrix, axis=axis, keepdims=True)
    std[std == 0] = 1  # avoid division by zero
    return (matrix - mean) / std


def top_variable_genes(df: pd.DataFrame, n: int = 50) -> pd.DataFrame:
    """Select top N most variable genes by variance."""
    variances = df.var(axis=1)
    top_idx = variances.nlargest(n).index
    return df.loc[top_idx]


def prepare_heatmap_data(
    df: pd.DataFrame,
    gene_list: Optional[List[str]] = None,
    top_n: int = 50,
    normalize: str = "zscore_row",
    cluster_rows: bool = True,
    cluster_cols: bool = True,
) -> dict:
    """
    Prepare data for heatmap visualization.

    Args:
        df: Expression matrix (genes x samples).
        gene_list: Specific genes to display. If None, uses top variable genes.
        top_n: Number of top variable genes to select (if gene_list is None).
        normalize: Normalization method: 'none', 'zscore_row', 'zscore_col', 'log2'.
        cluster_rows: Whether to cluster rows.
        cluster_cols: Whether to cluster columns.
    """
    # Select genes
    if gene_list:
        valid_genes = [g for g in gene_list if g in df.index]
        if not valid_genes:
            raise ValueError("No matching genes found in expression matrix")
        sub_df = df.loc[valid_genes]
    else:
        sub_df = top_variable_genes(df, min(top_n, len(df)))

    matrix = sub_df.values.astype(float)

    # Normalize
    if normalize == "zscore_row":
        matrix = zscore_normalize(matrix, axis=1)
    elif normalize == "zscore_col":
        matrix = zscore_normalize(matrix, axis=0)
    elif normalize == "log2":
        matrix = np.log2(matrix + 1)

    # Simple hierarchical-like ordering via variance-based sorting
    if cluster_rows and matrix.shape[0] > 1:
        from scipy.cluster.hierarchy import linkage, leaves_list
        from scipy.spatial.distance import pdist
        if matrix.shape[0] > 1:
            try:
                dist = pdist(matrix, metric='euclidean')
                Z = linkage(dist, method='ward')
                row_order = leaves_list(Z)
                matrix = matrix[row_order]
                sub_df = sub_df.iloc[row_order]
            except Exception:
                pass

    if cluster_cols and matrix.shape[1] > 1:
        from scipy.cluster.hierarchy import linkage, leaves_list
        from scipy.spatial.distance import pdist
        try:
            dist = pdist(matrix.T, metric='euclidean')
            Z = linkage(dist, method='ward')
            col_order = leaves_list(Z)
            matrix = matrix[:, col_order]
            sub_df = sub_df.iloc[:, col_order]
        except Exception:
            pass

    # Replace NaN and Inf
    matrix = np.nan_to_num(matrix, nan=0.0, posinf=0.0, neginf=0.0)

    return {
        "z_values": matrix.tolist(),
        "gene_names": list(sub_df.index),
        "sample_names": list(sub_df.columns),
        "normalize_method": normalize,
        "shape": list(matrix.shape),
    }
