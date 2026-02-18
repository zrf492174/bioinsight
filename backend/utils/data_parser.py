"""CSV data parsing and validation utilities for bioinformatics data."""

import io
import pandas as pd
import numpy as np


def parse_expression_matrix(file_content: bytes, filename: str) -> pd.DataFrame:
    """
    Parse an expression matrix CSV/TSV file.
    Expected format: rows = genes, columns = samples.
    First column = gene names/IDs.
    """
    sep = "\t" if filename.endswith((".tsv", ".txt")) else ","

    try:
        df = pd.read_csv(io.BytesIO(file_content), sep=sep, index_col=0)
    except Exception as e:
        raise ValueError(f"无法解析表达矩阵文件: {str(e)}")

    if df.empty:
        raise ValueError("表达矩阵为空")

    # Validate numeric data
    non_numeric = df.select_dtypes(exclude=[np.number]).columns.tolist()
    if non_numeric:
        raise ValueError(f"以下列包含非数值数据: {', '.join(non_numeric)}")

    # Handle missing values - fill with 0
    if df.isnull().any().any():
        df = df.fillna(0)

    return df


def parse_sample_info(file_content: bytes, filename: str) -> pd.DataFrame:
    """
    Parse sample information CSV/TSV file.
    Expected: column 'sample' and column 'group'.
    """
    sep = "\t" if filename.endswith((".tsv", ".txt")) else ","

    try:
        df = pd.read_csv(io.BytesIO(file_content), sep=sep)
    except Exception as e:
        raise ValueError(f"无法解析分组信息文件: {str(e)}")

    if df.empty:
        raise ValueError("分组信息文件为空")

    # Normalize column names to lowercase
    df.columns = [c.strip().lower() for c in df.columns]

    if "sample" not in df.columns:
        raise ValueError("分组信息文件缺少 'sample' 列")
    if "group" not in df.columns:
        raise ValueError("分组信息文件缺少 'group' 列")

    return df


def validate_matching(expression_df: pd.DataFrame, sample_df: pd.DataFrame) -> None:
    """Validate that expression matrix columns match sample info rows."""
    expr_samples = set(expression_df.columns)
    info_samples = set(sample_df["sample"].values)

    missing_in_expr = info_samples - expr_samples
    missing_in_info = expr_samples - info_samples

    if missing_in_expr:
        raise ValueError(
            f"以下样本在表达矩阵中未找到: {', '.join(missing_in_expr)}"
        )
    if missing_in_info:
        raise ValueError(
            f"以下样本在分组信息中未找到: {', '.join(missing_in_info)}"
        )
