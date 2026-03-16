import { useState } from 'react';
import { Play, Database, Map } from 'lucide-react';
import FileUploader from '../components/common/FileUploader';
import Card, { StatCard } from '../components/common/Card';
import PCAPlot from '../components/charts/PCAPlot';
import { runSpatial } from '../api/client';
import styles from './Spatial.module.css';

export default function Spatial() {
    const [adataFile, setAdataFile] = useState(null);
    const [targetGene, setTargetGene] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const loadSampleData = async () => {
        try {
            const res = await fetch('/sample_data/spatial_sample.h5ad');
            const blob = await res.blob();
            setAdataFile(new File([blob], 'spatial_sample.h5ad', { type: 'application/octet-stream' }));
        } catch (e) {
            setError('加载示例数据失败: ' + e.message);
        }
    };

    const handleRun = async () => {
        if (!adataFile) {
            setError('请上传空间转录组数据文件 (.h5ad)');
            return;
        }

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const res = await runSpatial(adataFile, targetGene);
            setResult(res.data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <h2 className="page-title">空间转录组 (Spatial)</h2>
            <p className={styles.subtitle}>
                上传具有空间坐标的 h5ad 文件，可视化组织切片上的基因表达分布。
                <button className={styles.sampleDataBtn} onClick={loadSampleData}>
                    <Database size={14} /> 加载示例数据
                </button>
            </p>

            <div className={styles.grid}>
                <div className={styles.controlPanel}>
                    <Card title="数据上传">
                        <FileUploader
                            label="h5ad 空间测序文件"
                            accept=".h5ad"
                            file={adataFile}
                            onFileLoaded={setAdataFile}
                            onClear={() => setAdataFile(null)}
                        />
                    </Card>

                    <Card title="分析参数">
                        <div className={styles.paramGroup}>
                            <label className={styles.paramLabel}>目标基因 (留空则显示总表达量)</label>
                            <input
                                type="text"
                                placeholder="e.g. CD4, TP53"
                                className={styles.paramInput}
                                value={targetGene}
                                onChange={(e) => setTargetGene(e.target.value)}
                            />
                        </div>

                        <button className={styles.runBtn} onClick={handleRun} disabled={loading}>
                            {loading ? <><span className="spinner"></span> 分析中...</> : <><Play size={16} /> 提取空间特征</>}
                        </button>
                    </Card>
                </div>

                <div className={styles.resultsArea}>
                    {error && <div className={styles.errorMessage}>{error}</div>}

                    {result ? (
                        <>
                            <div className={styles.statGrid}>
                                <StatCard
                                    title="Spatial Spots"
                                    icon={<Map size={18} />}
                                    value={result.coords.length}
                                    label="测序点数量"
                                    color="var(--accent-cyan)"
                                />
                                <StatCard
                                    title="当前视图"
                                    icon={<Database size={18} />}
                                    value={result.gene_name}
                                    label="表达量特征"
                                    color="var(--accent-blue)"
                                />
                            </div>

                            <Card title={`空间坐标表达散点图 - ${result.gene_name}`} className={styles.chartCard}>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                    可用的示例基因: {result.available_genes.slice(0, 5).join(', ')}...
                                </p>
                                <PCAPlot
                                    coords={result.coords}
                                    sampleNames={result.spot_names}
                                    labels={result.expression}
                                    xAxisLabel="Spatial_X"
                                    yAxisLabel="Spatial_Y"
                                />
                            </Card>
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            等待提交空间数据提取任务...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
