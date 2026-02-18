import { useState, useEffect } from 'react';
import { Play, Database, Grid3X3, Table } from 'lucide-react';
import Papa from 'papaparse';
import FileUploader from '../components/common/FileUploader';
import Card from '../components/common/Card';
import Heatmap from '../components/charts/Heatmap';
import { runHeatmap } from '../api/client';
import styles from './HeatmapPage.module.css';

export default function HeatmapPage() {
    const [exprFile, setExprFile] = useState(null);
    const [geneList, setGeneList] = useState('');
    const [topN, setTopN] = useState(50);
    const [normalize, setNormalize] = useState('zscore_row');
    const [clusterRows, setClusterRows] = useState(true);
    const [clusterCols, setClusterCols] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const [preview, setPreview] = useState(null);

    // Parse preview whenever file changes
    useEffect(() => {
        if (!exprFile) { setPreview(null); return; }
        Papa.parse(exprFile, {
            preview: 6,
            complete: (results) => {
                if (results.data && results.data.length > 0) {
                    setPreview({
                        headers: results.data[0],
                        rows: results.data.slice(1).filter(r => r.some(c => c !== '')),
                    });
                }
            },
        });
    }, [exprFile]);

    const loadSampleData = async () => {
        try {
            const res = await fetch('/sample_data/expression_matrix.csv');
            const blob = await res.blob();
            const file = new File([blob], 'expression_matrix.csv', { type: 'text/csv' });
            setExprFile(file);
        } catch (e) { setError('加载示例数据失败: ' + e.message); }
    };

    const handleRun = async () => {
        if (!exprFile) { setError('请上传表达矩阵'); return; }
        setLoading(true); setError(''); setResult(null);
        try {
            const res = await runHeatmap(exprFile, geneList || null, topN, normalize, clusterRows, clusterCols);
            setResult(res.data);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    return (
        <div className={styles.page}>
            <h2 className="page-title">热图绘制</h2>
            <p className="page-subtitle">
                上传表达矩阵，绘制聚类热图
                <button className={`btn btn-ghost ${styles.sampleBtn}`} onClick={loadSampleData}>
                    <Database size={14} /> 加载示例数据
                </button>
            </p>

            <div className={styles.configSection}>
                <Card title="数据上传">
                    <FileUploader
                        label="表达矩阵 CSV/TSV - 行=基因, 列=样本"
                        file={exprFile}
                        onFileLoaded={setExprFile}
                        onClear={() => { setExprFile(null); setPreview(null); setResult(null); }}
                    />
                </Card>
                <Card title="热图参数">
                    <div className={styles.paramsGrid}>
                        <div className="form-group">
                            <label className="form-label">Top N 基因</label>
                            <input className="form-input" type="number" value={topN} onChange={(e) => setTopN(parseInt(e.target.value))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">标准化方法</label>
                            <select className="form-select" value={normalize} onChange={(e) => setNormalize(e.target.value)}>
                                <option value="zscore_row">Z-score (行)</option>
                                <option value="zscore_col">Z-score (列)</option>
                                <option value="log2">Log2</option>
                                <option value="none">无</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">行聚类</label>
                            <select className="form-select" value={clusterRows} onChange={(e) => setClusterRows(e.target.value === 'true')}>
                                <option value="true">是</option>
                                <option value="false">否</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">列聚类</label>
                            <select className="form-select" value={clusterCols} onChange={(e) => setClusterCols(e.target.value === 'true')}>
                                <option value="true">是</option>
                                <option value="false">否</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">指定基因 (可选，逗号分隔)</label>
                        <input className="form-input" placeholder="留空则选取高变异基因" value={geneList} onChange={(e) => setGeneList(e.target.value)} />
                    </div>
                    <button className={`btn btn-primary ${styles.runBtn}`} onClick={handleRun} disabled={loading}>
                        {loading ? <><span className="spinner"></span> 绘制中...</> : <><Play size={16} /> 绘制热图</>}
                    </button>
                </Card>
            </div>

            {/* Data Preview */}
            {preview && (
                <Card title={`数据预览 — ${exprFile?.name} (前 ${preview.rows.length} 行)`} className={styles.infoCard}>
                    <div className={styles.previewWrap}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    {preview.headers.map((h, i) => (
                                        <th key={i}>{h || `Col ${i}`}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {preview.rows.map((row, i) => (
                                    <tr key={i}>
                                        {row.map((cell, j) => (
                                            <td key={j}>{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {error && <div className={styles.errorMsg}>{error}</div>}

            {result && (
                <Card title={`表达热图 (${result.shape[0]} × ${result.shape[1]}, ${result.normalize_method})`} className={styles.chartCard}>
                    <Heatmap
                        zValues={result.z_values}
                        geneNames={result.gene_names}
                        sampleNames={result.sample_names}
                    />
                </Card>
            )}
        </div>
    );
}
