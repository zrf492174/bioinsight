import { useState } from 'react';
import { Play, Route, Database, BarChart3, CheckCircle } from 'lucide-react';
import Card, { StatCard } from '../components/common/Card';
import DataTable from '../components/common/DataTable';
import Plot from '../components/charts/Plot';
import { runKEGGEnrichment } from '../api/client';
import styles from './Enrichment.module.css';

const SAMPLE_GENES = 'Gene_001,Gene_002,Gene_003,Gene_004,Gene_005,Gene_006,Gene_007,Gene_008,Gene_009,Gene_010,Gene_011,Gene_012,Gene_013,Gene_014,Gene_015';

const resultColumns = [
    { key: 'pathway_id', label: 'Pathway ID' },
    { key: 'pathway_name', label: '通路名称' },
    { key: 'count', label: '基因数' },
    { key: 'gene_ratio', label: 'Gene Ratio' },
    { key: 'pvalue', label: 'P-value', decimals: 6 },
    { key: 'fdr', label: 'FDR', decimals: 6 },
];

export default function KEGGEnrichment() {
    const [geneText, setGeneText] = useState('');
    const [pvalueCutoff, setPvalueCutoff] = useState(0.05);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const handleRun = async () => {
        if (!geneText.trim()) { setError('请输入基因列表'); return; }
        setLoading(true); setError(''); setResult(null);
        try {
            const res = await runKEGGEnrichment(geneText, pvalueCutoff);
            setResult(res.data);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const barData = result?.pathways?.slice(0, 15);

    return (
        <div className={styles.page}>
            <h2 className="page-title">KEGG 富集分析</h2>
            <p className="page-subtitle">
                输入差异表达基因列表，进行 KEGG 通路富集分析
                <button className={`btn btn-ghost ${styles.sampleBtn}`} onClick={() => setGeneText(SAMPLE_GENES)}>
                    <Database size={14} /> 示例基因
                </button>
            </p>

            <div className={styles.inputSection}>
                <Card title="基因列表">
                    <textarea
                        className={`form-textarea ${styles.geneInput}`}
                        placeholder="输入基因名，每行一个或用逗号分隔&#10;例如: Gene_001, Gene_002, Gene_003"
                        value={geneText}
                        onChange={(e) => setGeneText(e.target.value)}
                    />
                </Card>
                <Card title="参数设置">
                    <div className={styles.paramsPanel}>
                        <div className="form-group">
                            <label className="form-label">FDR 阈值</label>
                            <input className="form-input" type="number" step="0.01" value={pvalueCutoff} onChange={(e) => setPvalueCutoff(parseFloat(e.target.value))} />
                        </div>
                        <button className={`btn btn-primary ${styles.runBtn}`} onClick={handleRun} disabled={loading}>
                            {loading ? <><span className="spinner"></span> 分析中...</> : <><Play size={16} /> 运行 KEGG 分析</>}
                        </button>
                    </div>
                </Card>
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            {result && (
                <div className={styles.resultsSection}>
                    <div className={styles.summaryRow}>
                        <StatCard title="检测通路" icon={<Route size={14} />} value={result.summary.total_pathways} label="总 KEGG 通路" color="var(--accent-blue)" />
                        <StatCard title="显著富集" icon={<CheckCircle size={14} />} value={result.summary.significant} label={`FDR < ${pvalueCutoff}`} color="var(--accent-green)" />
                        <StatCard title="查询基因" icon={<BarChart3 size={14} />} value={result.summary.query_genes} label={`/ ${result.summary.background_size} 背景基因`} color="var(--accent-purple)" />
                    </div>

                    {barData && barData.length > 0 && (
                        <Card title="KEGG 通路柱状图 (Top 15)" className={styles.chartCard}>
                            <Plot
                                data={[{
                                    x: barData.map(d => d.count),
                                    y: barData.map(d => d.pathway_name),
                                    type: 'bar',
                                    orientation: 'h',
                                    marker: {
                                        color: barData.map(d => -Math.log10(d.fdr)),
                                        colorscale: 'Viridis',
                                        showscale: true,
                                        colorbar: { title: '-log10(FDR)', len: 0.5 },
                                    },
                                    text: barData.map(d => `Count: ${d.count}`),
                                    hoverinfo: 'text+y',
                                }]}
                                layout={{
                                    height: 500,
                                    margin: { l: 250, r: 60, t: 20, b: 50 },
                                    xaxis: { title: 'Gene Count', gridcolor: 'rgba(0,0,0,0.06)' },
                                    yaxis: { autorange: 'reversed', tickfont: { size: 12 } },
                                    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                                    font: { color: '#475569' },
                                }}
                                config={{ displayModeBar: false, responsive: true }}
                                style={{ width: '100%' }}
                            />
                        </Card>
                    )}

                    <Card title="通路富集结果">
                        <DataTable columns={resultColumns} data={result.pathways} downloadFilename="kegg_enrichment.csv" />
                    </Card>
                </div>
            )}
        </div>
    );
}
