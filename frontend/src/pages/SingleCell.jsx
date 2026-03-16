import React, { useState } from 'react';
import { Play, Activity, Database, Users } from 'lucide-react';
import FileUploader from '../components/common/FileUploader';
import Card, { StatCard } from '../components/common/Card';
import PCAPlot from '../components/charts/PCAPlot';
import { runSingleCell } from '../api/client';
import styles from './SingleCell.module.css';

export default function SingleCell() {
    const [adataFile, setAdataFile] = useState(null);
    const [nTopGenes, setNTopGenes] = useState(500);
    const [nPcs, setNPcs] = useState(10);
    const [resolution, setResolution] = useState(0.5);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const loadSampleData = async () => {
        try {
            const res = await fetch('/sample_data/single_cell_sample.h5ad');
            const blob = await res.blob();
            setAdataFile(new File([blob], 'single_cell_sample.h5ad', { type: 'application/octet-stream' }));
        } catch (e) {
            setError('加载示例数据失败: ' + e.message);
        }
    };

    const handleRun = async () => {
        if (!adataFile) {
            setError('请上传单细胞数据文件 (.h5ad)');
            return;
        }

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const res = await runSingleCell(adataFile, nTopGenes, nPcs, resolution);
            setResult(res.data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <h2 className="page-title">单细胞分析 (Single-Cell)</h2>
            <p className={styles.subtitle}>
                上传单细胞数据 (h5ad)，进行高变基因选择、降维和聚类。
                <button className={styles.sampleDataBtn} onClick={loadSampleData}>
                    <Database size={14} color="currentColor" strokeWidth={2} /> 加载示例数据
                </button>
            </p>

            <div className={styles.grid}>
                <div className={styles.controlPanel}>
                    <Card title="数据上传">
                        <FileUploader
                            label="h5ad 单细胞数据文件"
                            accept=".h5ad"
                            file={adataFile}
                            onFileLoaded={setAdataFile}
                            onClear={() => setAdataFile(null)}
                        />
                    </Card>

                    <Card title="分析参数">
                        <div className={styles.paramGroup}>
                            <label className={styles.paramLabel}>高变基因数 (HVG)</label>
                            <input
                                type="number"
                                className={styles.paramInput}
                                value={nTopGenes}
                                onChange={(e) => setNTopGenes(parseInt(e.target.value))}
                                min="10"
                                max="3000"
                            />
                        </div>
                        <div className={styles.paramGroup}>
                            <label className={styles.paramLabel}>主成分数 (PCs)</label>
                            <input
                                type="number"
                                className={styles.paramInput}
                                value={nPcs}
                                onChange={(e) => setNPcs(parseInt(e.target.value))}
                                min="2"
                                max="50"
                            />
                        </div>
                        <div className={styles.paramGroup}>
                            <label className={styles.paramLabel}>Leiden 聚类分辨率</label>
                            <input
                                type="number"
                                step="0.1"
                                className={styles.paramInput}
                                value={resolution}
                                onChange={(e) => setResolution(parseFloat(e.target.value))}
                                min="0.1"
                                max="2.0"
                            />
                        </div>

                        <button className={styles.runBtn} onClick={handleRun} disabled={loading}>
                            {loading ? (
                                <><span className="spinner"></span> 分析中...</>
                            ) : (
                                <><Play size={16} color="white" strokeWidth={2} /> 运行预处理与聚类</>
                            )}
                        </button>
                    </Card>
                </div>

                <div className={styles.resultsArea}>
                    {error && <div className={styles.errorMessage}>{error}</div>}

                    {result ? (
                        <>
                            <div className={styles.statGrid}>
                                <StatCard
                                    title="细胞总数"
                                    icon={<Users size={18} color="var(--accent-purple)" strokeWidth={2} />}
                                    value={result.umap.cell_names.length}
                                    label="经过质控的细胞"
                                    color="var(--accent-purple)"
                                />
                                <StatCard
                                    title="发现的亚群"
                                    icon={<Activity size={18} color="var(--accent-pink)" strokeWidth={2} />}
                                    value={result.cluster_count}
                                    label="Leiden Cluster 数量"
                                    color="var(--accent-pink)"
                                />
                            </div>

                            {result.has_batch && result.umap_integrated ? (
                                <>
                                    <h3 className={styles.sectionTitle}>
                                        批次整合前 (Unintegrated)
                                        <span className={styles.sectionBadge}>显示明显的批次效应</span>
                                    </h3>
                                    <div className={styles.chartGrid}>
                                        <Card title="UMAP Colored by Cluster" className={styles.chartCard}>
                                            <PCAPlot
                                                coords={result.umap.coords}
                                                sampleNames={result.umap.cell_names}
                                                labels={result.umap.labels.map(l => parseInt(l))}
                                                xAxisLabel="UMAP_1"
                                                yAxisLabel="UMAP_2"
                                                legendPrefix="Cluster "
                                            />
                                        </Card>
                                        <Card title="UMAP Colored by Batch" className={styles.chartCard}>
                                            <PCAPlot
                                                coords={result.umap.coords}
                                                sampleNames={result.umap.cell_names}
                                                labels={result.umap.batches}
                                                xAxisLabel="UMAP_1"
                                                yAxisLabel="UMAP_2"
                                                legendPrefix=""
                                            />
                                        </Card>
                                    </div>
                                    <h3 className={styles.sectionTitle}>
                                        批次整合后 (sc.tl.ingest)
                                        <span className={styles.sectionBadge}>参考批次为 {result.umap_integrated.batches[0]} 并投影其余批次</span>
                                    </h3>
                                    <div className={styles.chartGrid}>
                                        <Card title="Integrated UMAP Colored by Cluster" className={styles.chartCard}>
                                            <PCAPlot
                                                coords={result.umap_integrated.coords}
                                                sampleNames={result.umap_integrated.cell_names}
                                                labels={result.umap_integrated.labels.map(l => parseInt(l))}
                                                xAxisLabel="UMAP_1"
                                                yAxisLabel="UMAP_2"
                                                legendPrefix="Cluster "
                                            />
                                        </Card>
                                        <Card title="Integrated UMAP Colored by Batch" className={styles.chartCard}>
                                            <PCAPlot
                                                coords={result.umap_integrated.coords}
                                                sampleNames={result.umap_integrated.cell_names}
                                                labels={result.umap_integrated.batches}
                                                xAxisLabel="UMAP_1"
                                                yAxisLabel="UMAP_2"
                                                legendPrefix=""
                                            />
                                        </Card>
                                    </div>
                                    <h3 className={styles.sectionTitle}>PCA 降维</h3>
                                    <Card title="PCA 主成分降维" className={styles.chartCard}>
                                        <PCAPlot
                                            coords={result.pca.coords}
                                            sampleNames={result.pca.cell_names}
                                            labels={result.pca.labels.map(l => parseInt(l))}
                                            xAxisLabel="PC_1"
                                            yAxisLabel="PC_2"
                                            legendPrefix="Cluster "
                                        />
                                    </Card>
                                </>
                            ) : (
                                <>
                                    <Card title="UMAP 聚类分布" className={styles.chartCard}>
                                        <PCAPlot
                                            coords={result.umap.coords}
                                            sampleNames={result.umap.cell_names}
                                            labels={result.umap.labels.map(l => parseInt(l))}
                                            xAxisLabel="UMAP_1"
                                            yAxisLabel="UMAP_2"
                                            legendPrefix="Cluster "
                                        />
                                    </Card>

                                    <Card title="PCA 主成分降维" className={styles.chartCard}>
                                        <PCAPlot
                                            coords={result.pca.coords}
                                            sampleNames={result.pca.cell_names}
                                            labels={result.pca.labels.map(l => parseInt(l))}
                                            xAxisLabel="PC_1"
                                            yAxisLabel="PC_2"
                                            legendPrefix="Cluster "
                                        />
                                    </Card>
                                </>
                            )}
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            等待提交分析任务...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
