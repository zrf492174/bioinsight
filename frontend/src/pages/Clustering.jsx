import { useState } from 'react';
import { Play, Layers, BarChart3, Database } from 'lucide-react';
import FileUploader from '../components/common/FileUploader';
import Card, { StatCard } from '../components/common/Card';
import PCAPlot from '../components/charts/PCAPlot';
import Heatmap from '../components/charts/Heatmap';
import { runClustering } from '../api/client';
import styles from './Clustering.module.css';

export default function Clustering() {
    const [exprFile, setExprFile] = useState(null);
    const [k, setK] = useState(3);
    const [doPCA, setDoPCA] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const loadSampleData = async () => {
        try {
            const res = await fetch('/sample_data/expression_matrix.csv');
            const blob = await res.blob();
            setExprFile(new File([blob], 'expression_matrix.csv', { type: 'text/csv' }));
        } catch (e) {
            setError('加载示例数据失败: ' + e.message);
        }
    };

    const handleRun = async () => {
        if (!exprFile) {
            setError('请上传表达矩阵文件');
            return;
        }

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const res = await runClustering(exprFile, k, doPCA);
            setResult(res.data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <h2 className="page-title">聚类分析</h2>
            <p className="page-subtitle">
                上传表达矩阵，对样本进行无监督聚类分析。
                <button className={`btn btn-ghost ${styles.sampleDataBtn}`} onClick={loadSampleData}>
                    <Database size={14} /> 加载示例数据
                </button>
            </p>

            {/* File Upload */}
            <Card title="数据上传" className={styles.uploadSection}>
                <FileUploader
                    label="表达矩阵 CSV/TSV - 行=基因, 列=样本"
                    file={exprFile}
                    onFileLoaded={setExprFile}
                    onClear={() => setExprFile(null)}
                />
            </Card>

            {/* Parameters */}
            <Card title="聚类参数" className={styles.paramsCard}>
                <div className={styles.paramsGrid}>
                    <div className="form-group">
                        <label className="form-label">聚类数 K</label>
                        <input className="form-input" type="number" min="2" max="20" value={k} onChange={(e) => setK(parseInt(e.target.value))} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">PCA 降维</label>
                        <select className="form-select" value={doPCA} onChange={(e) => setDoPCA(e.target.value === 'true')}>
                            <option value="true">是</option>
                            <option value="false">否</option>
                        </select>
                    </div>
                </div>
                <button className={`btn btn-primary ${styles.runBtn}`} onClick={handleRun} disabled={loading}>
                    {loading ? <><span className="spinner"></span> 分析中...</> : <><Play size={16} /> 运行聚类</>}
                </button>
            </Card>

            {error && <div className={styles.errorMsg}>{error}</div>}

            {/* Results */}
            {result && (
                <div className={styles.resultsSection}>
                    <div className={styles.summaryRow}>
                        <StatCard
                            title="聚类数"
                            icon={<Layers size={14} />}
                            value={result.clustering.k}
                            label="K-Means 聚类"
                            color="var(--accent-green)"
                        />
                        <StatCard
                            title="轮廓系数"
                            icon={<BarChart3 size={14} />}
                            value={result.clustering.silhouette_score >= 0 ? result.clustering.silhouette_score.toFixed(3) : 'N/A'}
                            label="聚类质量评估 (-1 ~ 1)"
                            color="var(--accent-cyan)"
                        />
                        {Object.entries(result.clustering.cluster_sizes).map(([cluster, size]) => (
                            <StatCard
                                key={cluster}
                                title={`Cluster ${cluster}`}
                                value={size}
                                label="样本数量"
                                color="var(--accent-purple)"
                            />
                        ))}
                    </div>

                    <div className={styles.chartsGrid}>
                        <Card title="PCA 散点图" className={styles.chartCard}>
                            <PCAPlot
                                coords={result.pca.coords}
                                sampleNames={result.pca.sample_names}
                                labels={result.clustering.labels}
                                explainedVariance={result.pca.explained_variance}
                            />
                        </Card>

                        <Card title="表达热力图 (Top 50 高变基因)" className={styles.chartCard}>
                            <Heatmap
                                zValues={result.heatmap.z_values}
                                geneNames={result.heatmap.gene_names}
                                sampleNames={result.heatmap.sample_names}
                            />
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}
