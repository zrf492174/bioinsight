"""Differential expression analysis API router."""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from ..utils.data_parser import parse_expression_matrix, parse_sample_info, validate_matching
from ..services.statistics import run_diff_analysis

router = APIRouter(prefix="/api/diff-analysis", tags=["Differential Analysis"])


@router.post("/run")
async def run_analysis(
    expression_file: UploadFile = File(..., description="Expression matrix CSV/TSV"),
    sample_file: UploadFile = File(..., description="Sample info CSV/TSV"),
    control_group: str = Form(..., description="Control group name"),
    treatment_group: str = Form(..., description="Treatment group name"),
    fc_threshold: float = Form(1.0, description="|log2FC| threshold"),
    pvalue_threshold: float = Form(0.05, description="FDR threshold"),
):
    """Run differential expression analysis."""
    try:
        # Parse files
        expr_content = await expression_file.read()
        sample_content = await sample_file.read()

        expr_df = parse_expression_matrix(expr_content, expression_file.filename)
        sample_df = parse_sample_info(sample_content, sample_file.filename)

        # Validate
        validate_matching(expr_df, sample_df)

        # Get sample groups
        groups = sample_df["group"].unique().tolist()
        if control_group not in groups:
            raise ValueError(f"对照组 '{control_group}' 不在分组信息中。可用分组: {groups}")
        if treatment_group not in groups:
            raise ValueError(f"实验组 '{treatment_group}' 不在分组信息中。可用分组: {groups}")

        control_samples = sample_df[sample_df["group"] == control_group]["sample"].tolist()
        treatment_samples = sample_df[sample_df["group"] == treatment_group]["sample"].tolist()

        # Run analysis
        result = run_diff_analysis(
            expr_df,
            control_samples,
            treatment_samples,
            fc_threshold=fc_threshold,
            pvalue_threshold=pvalue_threshold,
        )

        return {"status": "success", "data": result}

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析出错: {str(e)}")


@router.get("/groups")
async def get_groups(
    sample_file: UploadFile = File(..., description="Sample info CSV/TSV"),
):
    """Extract available groups from sample info file."""
    try:
        content = await sample_file.read()
        sample_df = parse_sample_info(content, sample_file.filename)
        groups = sample_df["group"].unique().tolist()
        return {"status": "success", "groups": groups}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
