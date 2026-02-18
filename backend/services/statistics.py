"""Statistical analysis services for differential expression analysis."""

import numpy as np
import pandas as pd
from scipy import stats


def calculate_fold_change(
    expression_df: pd.DataFrame,
    control_samples: list[str],
    treatment_samples: list[str],
) -> np.ndarray:
    """
    Calculate log2 fold change between treatment and control groups.
    Returns array of log2FC values for each gene.
    """
    control_mean = expression_df[control_samples].mean(axis=1).values
    treatment_mean = expression_df[treatment_samples].mean(axis=1).values

    # Add small pseudocount to avoid log(0)
    pseudocount = 1e-8
    log2fc = np.log2(
        (treatment_mean + pseudocount) / (control_mean + pseudocount)
    )

    return log2fc


def t_test_genes(
    expression_df: pd.DataFrame,
    control_samples: list[str],
    treatment_samples: list[str],
) -> np.ndarray:
    """
    Perform independent two-sample t-test for each gene.
    Returns array of p-values.
    """
    control_data = expression_df[control_samples].values
    treatment_data = expression_df[treatment_samples].values

    p_values = np.zeros(expression_df.shape[0])

    for i in range(expression_df.shape[0]):
        ctrl = control_data[i, :]
        treat = treatment_data[i, :]

        # Skip if variance is zero in both groups
        if np.std(ctrl) == 0 and np.std(treat) == 0:
            p_values[i] = 1.0
            continue

        try:
            _, p = stats.ttest_ind(treat, ctrl, equal_var=False)
            p_values[i] = p if not np.isnan(p) else 1.0
        except Exception:
            p_values[i] = 1.0

    return p_values


def adjust_pvalues_bh(p_values: np.ndarray) -> np.ndarray:
    """
    Benjamini-Hochberg FDR correction.
    Returns adjusted p-values (FDR / q-values).
    """
    n = len(p_values)
    if n == 0:
        return np.array([])

    # Sort p-values and track original indices
    sorted_indices = np.argsort(p_values)
    sorted_pvalues = p_values[sorted_indices]

    # BH correction
    rank = np.arange(1, n + 1)
    adjusted = sorted_pvalues * n / rank

    # Enforce monotonicity (from largest to smallest)
    adjusted = np.minimum.accumulate(adjusted[::-1])[::-1]

    # Cap at 1.0
    adjusted = np.minimum(adjusted, 1.0)

    # Restore original order
    result = np.empty(n)
    result[sorted_indices] = adjusted

    return result


def run_diff_analysis(
    expression_df: pd.DataFrame,
    control_samples: list[str],
    treatment_samples: list[str],
    fc_threshold: float = 1.0,
    pvalue_threshold: float = 0.05,
) -> dict:
    """
    Run complete differential expression analysis.
    Returns dict with gene names, log2fc, p-values, FDR, and summary stats.
    """
    log2fc = calculate_fold_change(expression_df, control_samples, treatment_samples)
    p_values = t_test_genes(expression_df, control_samples, treatment_samples)
    fdr = adjust_pvalues_bh(p_values)

    genes = expression_df.index.tolist()

    # Classify genes
    up_regulated = int(np.sum((log2fc >= fc_threshold) & (fdr < pvalue_threshold)))
    down_regulated = int(np.sum((log2fc <= -fc_threshold) & (fdr < pvalue_threshold)))
    not_significant = len(genes) - up_regulated - down_regulated

    return {
        "genes": genes,
        "log2fc": log2fc.tolist(),
        "pvalues": p_values.tolist(),
        "fdr": fdr.tolist(),
        "summary": {
            "total_genes": len(genes),
            "up_regulated": up_regulated,
            "down_regulated": down_regulated,
            "not_significant": not_significant,
            "fc_threshold": fc_threshold,
            "pvalue_threshold": pvalue_threshold,
        },
    }
