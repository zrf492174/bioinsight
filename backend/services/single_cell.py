"""Single-cell transcriptomics analysis services."""

import scanpy as sc
import anndata as ad
import pandas as pd
import numpy as np
import gc

# 基因集来自Seurat (用于细胞周期评分)
s_genes = [
    "MCM5", "PCNA", "TYMS", "FEN1", "MCM2", "MCM4", "RRM1",
    "UNG", "GINS2", "MCM6", "CDCA7", "DTL", "PRIM1", "UHRF1",
    "HELLS", "RFC2", "RPA2", "NASP", "RAD51AP1", "GMNN", "WDR76",
    "SLBP", "CCNE2", "UBR7", "POLD3", "MSH2", "ATAD2", "RAD51",
    "RRM2", "CDC45", "CDC6", "EXO1", "TIPIN", "DSCC1", "BLM",
    "CASP8AP2", "USP1", "CLSPN", "POLA1", "CHAF1B", "BRIP1", "E2F8"
]
g2m_genes = [
    "HMGB2", "CDK1", "NUSAP1", "UBE2C", "BIRC5", "TPX2", "TOP2A", "NDC80",
    "CKS2", "NUF2", "CKS1B", "MKI67", "TMPO", "CENPF", "TACC3", "SMC4",
    "CCNB2", "CKAP2L", "CKAP2", "AURKB", "BUB1", "KIF11", "ANP32E", "TUBB4B",
    "GTSE1", "KIF20B", "HJURP", "CDCA3", "CDC20", "TTK", "CDC25C", "KIF2C",
    "RANGAP1", "NCAPD2", "DLGAP5", "CDCA2", "CDCA8", "ECT2", "KIF23", "HMMR",
    "AURKA", "PSRC1", "ANLN", "LBR", "CKAP5", "CENPE", "CTCF", "NEK2",
    "G2E3", "GAS2L3", "CBX5", "CENPA"
]

def process_single_cell(file_path: str, n_top_genes: int = 500, n_pcs: int = 10, resolution: float = 0.5) -> dict:
    """
    单细胞分析流程重构版：
    参考知乎教程：导入 -> 过滤 -> 双细胞去除(scrublet) -> 归一化 -> 
    寻找高变基因 -> 细胞周期矫正(回归) -> Scale -> PCA -> Harmony整合 -> UMAP -> Leiden聚类。
    """
    try:
        adata = sc.read_h5ad(file_path)
        
        # 考虑到内存限制，对过大数据集进行下采样
        if adata.shape[0] > 5000:
            sc.pp.subsample(adata, n_obs=2000, random_state=42)
            
        # 1. 细胞与基因初步过滤
        sc.pp.filter_cells(adata, min_genes=5)
        sc.pp.filter_genes(adata, min_cells=3)
        
        # 2. 双细胞检测与去除 (Scrublet)
        if adata.shape[0] > 50:
            try:
                import scrublet as scr
                sc.pp.scrublet(adata)
                if 'predicted_doublet' in adata.obs:
                    adata = adata[~adata.obs['predicted_doublet']].copy()
            except ImportError:
                print("未安装scrublet，跳过双细胞去除步骤。")
            except Exception as e:
                print(f"Scrublet 双细胞检测失败，跳过: {e}")

        # 3. 归一化与对数化
        sc.pp.normalize_total(adata, target_sum=1e4)
        sc.pp.log1p(adata)
        
        # 保存原始数据 (教程推荐)
        adata.raw = adata.copy()

        # 4. 寻找并提取高变基因
        n_hvgs = min(n_top_genes, adata.shape[1] // 2)
        sc.pp.highly_variable_genes(adata, n_top_genes=n_hvgs)
        adata = adata[:, adata.var.highly_variable].copy()

        # 5. 细胞周期评分与矫正
        s_genes_in_data = [g for g in s_genes if g in adata.var_names]
        g2m_genes_in_data = [g for g in g2m_genes if g in adata.var_names]
        
        if len(s_genes_in_data) > 0 and len(g2m_genes_in_data) > 0:
            sc.tl.score_genes_cell_cycle(adata, s_genes=s_genes_in_data, g2m_genes=g2m_genes_in_data)
            # 细胞周期回归 (非常消耗内存，因此放在提取高变基因之后)
            try:
                sc.pp.regress_out(adata, ['S_score', 'G2M_score'])
            except Exception as e:
                print(f"细胞周期回归失败，可能是内存不足或矩阵异常: {e}")

        # 6. 数据标准化 (Scale)
        sc.pp.scale(adata, max_value=10)
        
        # 7. PCA 降维
        sc.tl.pca(adata, n_comps=n_pcs)
        
        # 8. 检查是否存在批次信息
        batch_key = None
        for key in ['batch', 'project', 'sampleid']:
            if key in adata.obs.columns and len(adata.obs[key].unique()) > 1:
                batch_key = key
                break
                
        # 9. 构建全数据集的邻接图与UMAP (未整合状态)
        sc.pp.neighbors(adata, n_neighbors=min(20, adata.shape[0]-1), n_pcs=n_pcs, use_rep='X_pca')
        sc.tl.umap(adata)
        
        # 10. 全数据集的 Leiden 聚类
        sc.tl.leiden(adata, resolution=resolution)

        # 提取未整合的图表坐标
        umap_coords = adata.obsm['X_umap'].tolist()
        pca_coords = adata.obsm['X_pca'][:, :2].tolist()
        cell_names = adata.obs_names.tolist()
        labels = adata.obs['leiden'].tolist()
        batches = adata.obs[batch_key].tolist() if batch_key else []
        
        response = {
            "has_batch": bool(batch_key),
            "batch_key": batch_key,
            "pca": {
                "coords": pca_coords,
                "cell_names": cell_names,
                "labels": labels,
                "batches": batches
            },
            "umap": {
                "coords": umap_coords,
                "cell_names": cell_names,
                "labels": labels,
                "batches": batches
            },
            "cluster_count": len(set(labels))
        }

        # 11. 如果存在批次，使用 sc.tl.ingest 进行整合
        if batch_key:
            try:
                # 寻找最大的批次作为 reference
                batch_counts = adata.obs[batch_key].value_counts()
                ref_batch = batch_counts.index[0]
                
                # 分离 reference 和 query
                adata_ref = adata[adata.obs[batch_key] == ref_batch].copy()
                query_batches = [b for b in batch_counts.index if b != ref_batch]
                adatas_query = [adata[adata.obs[batch_key] == b].copy() for b in query_batches]
                
                # 对 reference 重新进行 PCA, Neighbors, UMAP, Leiden
                sc.pp.pca(adata_ref, n_comps=n_pcs)
                sc.pp.neighbors(adata_ref, n_neighbors=min(20, adata_ref.shape[0]-1), n_pcs=n_pcs)
                sc.tl.umap(adata_ref)
                sc.tl.leiden(adata_ref, resolution=resolution)
                
                # 依次 ingest 每个 query batch
                for adata_q in adatas_query:
                    # 映射 leiden 聚类以及 X_umap, X_pca
                    sc.tl.ingest(adata_q, adata_ref, obs="leiden")
                    
                # 拼接整合后的数据 (维持原有 batch_key)
                adata_concat = ad.concat([adata_ref, *adatas_query])
                
                response["umap_integrated"] = {
                    "coords": adata_concat.obsm['X_umap'].tolist(),
                    "cell_names": adata_concat.obs_names.tolist(),
                    "labels": adata_concat.obs['leiden'].tolist(),
                    "batches": adata_concat.obs[batch_key].tolist()
                }
                
                del adata_ref
                del adatas_query
                del adata_concat
                
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"Ingest 整合失败，跳过: {e}")

        # 内存回收
        del adata
        gc.collect()

        return response
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise ValueError(f"单细胞分析流程失败: {str(e)}")
