"""Clustering and dimensionality reduction services."""

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler


def run_pca(
    expression_df: pd.DataFrame,
    n_components: int = 2,
    scale: bool = True,
) -> dict:
    """
    Perform PCA on expression matrix (samples as observations).
    Transpose: genes x samples -> samples x genes for PCA.
    """
    data = expression_df.T.values  # samples x genes

    if scale:
        scaler = StandardScaler()
        data = scaler.fit_transform(data)

    n_components = min(n_components, data.shape[0], data.shape[1])
    pca = PCA(n_components=n_components)
    coords = pca.fit_transform(data)

    return {
        "coords": coords.tolist(),
        "explained_variance": pca.explained_variance_ratio_.tolist(),
        "sample_names": expression_df.columns.tolist(),
    }


def run_kmeans(
    expression_df: pd.DataFrame,
    k: int = 3,
    max_iter: int = 300,
    scale: bool = True,
) -> dict:
    """
    Perform K-Means clustering on samples.
    """
    data = expression_df.T.values  # samples x genes

    if scale:
        scaler = StandardScaler()
        data = scaler.fit_transform(data)

    k = min(k, data.shape[0] - 1)
    k = max(k, 2)

    kmeans = KMeans(n_clusters=k, max_iter=max_iter, n_init=10, random_state=42)
    labels = kmeans.fit_predict(data)

    # Calculate silhouette score (needs at least 2 clusters and more samples than clusters)
    sil_score = -1.0
    if len(set(labels)) > 1 and data.shape[0] > k:
        try:
            sil_score = float(silhouette_score(data, labels))
        except Exception:
            sil_score = -1.0

    return {
        "labels": labels.tolist(),
        "sample_names": expression_df.columns.tolist(),
        "k": k,
        "silhouette_score": sil_score,
        "cluster_sizes": {
            str(i): int(np.sum(labels == i)) for i in range(k)
        },
    }


def run_clustering_analysis(
    expression_df: pd.DataFrame,
    k: int = 3,
    do_pca: bool = True,
    n_pca_components: int = 2,
    max_iter: int = 300,
) -> dict:
    """
    Full clustering pipeline: optional PCA + K-Means.
    Returns PCA coords, cluster labels, heatmap data, and statistics.
    """
    # Run PCA
    pca_result = run_pca(expression_df, n_components=n_pca_components)

    # Run K-Means
    kmeans_result = run_kmeans(expression_df, k=k, max_iter=max_iter)

    # Prepare heatmap data (top variable genes, max 50)
    gene_vars = expression_df.var(axis=1)
    top_genes = gene_vars.nlargest(min(50, len(gene_vars))).index.tolist()
    heatmap_df = expression_df.loc[top_genes]

    # Z-score normalization for heatmap
    heatmap_z = heatmap_df.apply(lambda row: (row - row.mean()) / (row.std() + 1e-8), axis=1)

    return {
        "pca": pca_result,
        "clustering": kmeans_result,
        "heatmap": {
            "z_values": heatmap_z.values.tolist(),
            "gene_names": top_genes,
            "sample_names": expression_df.columns.tolist(),
        },
    }
