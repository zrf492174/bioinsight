import { useState } from 'react';
import { Play, Network, Database, BarChart3 } from 'lucide-react';
import Card, { StatCard } from '../components/common/Card';
import DataTable from '../components/common/DataTable';
import Plot from '../components/charts/Plot';
import { runPPI } from '../api/client';
import styles from './PPIPage.module.css';

const SAMPLE_GENES = 'Gene_001,Gene_002,Gene_003,Gene_004,Gene_005,Gene_006,Gene_007,Gene_008,Gene_009,Gene_010';

const edgeColumns = [
    { key: 'source', label: '蛋白 A' },
    { key: 'target', label: '蛋白 B' },
    { key: 'score', label: '置信度', decimals: 3 },
    { key: 'type', label: '类型' },
];

function buildNetworkPlot(nodes, edges) {
    // Simple force-directed-like layout using circle placement
    const n = nodes.length;
    const nodePositions = {};
    nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / n;
        const r = 1.5;
        nodePositions[node.id] = { x: r * Math.cos(angle), y: r * Math.sin(angle) };
    });

    // Edge traces
    const edgeX = [];
    const edgeY = [];
    edges.forEach(e => {
        const src = nodePositions[e.source];
        const tgt = nodePositions[e.target];
        if (src && tgt) {
            edgeX.push(src.x, tgt.x, null);
            edgeY.push(src.y, tgt.y, null);
        }
    });

    const edgeTrace = {
        x: edgeX, y: edgeY,
        type: 'scatter', mode: 'lines',
        line: { width: 1.5, color: '#94a3b8' },
        hoverinfo: 'none',
    };

    // Node trace
    const nodeX = nodes.map(n => nodePositions[n.id]?.x || 0);
    const nodeY = nodes.map(n => nodePositions[n.id]?.y || 0);
    const nodeText = nodes.map(n => n.id);
    const nodeEdgeCount = nodes.map(n => {
        return edges.filter(e => e.source === n.id || e.target === n.id).length;
    });

    const nodeTrace = {
        x: nodeX, y: nodeY,
        type: 'scatter', mode: 'markers+text',
        marker: {
            size: nodeEdgeCount.map(c => 16 + c * 4),
            color: nodeEdgeCount,
            colorscale: 'YlOrRd',
            showscale: true,
            colorbar: { title: '连接数', len: 0.5 },
            line: { width: 2, color: 'white' },
        },
        text: nodeText,
        textposition: 'top center',
        textfont: { size: 11, color: '#1e293b' },
        hovertext: nodes.map(n => `${n.id}<br>${n.description}`),
        hoverinfo: 'text',
    };

    return [edgeTrace, nodeTrace];
}

export default function PPIPage() {
    const [geneText, setGeneText] = useState('');
    const [useDemo, setUseDemo] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const handleRun = async () => {
        if (!geneText.trim()) { setError('请输入基因列表'); return; }
        setLoading(true); setError(''); setResult(null);
        try {
            const res = await runPPI(geneText, 9606, 400, useDemo);
            setResult(res.data);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    return (
        <div className={styles.page}>
            <h2 className="page-title">PPI 分析</h2>
            <p className="page-subtitle">
                蛋白质-蛋白质相互作用网络分析
                <button className={`btn btn-ghost ${styles.sampleBtn}`} onClick={() => setGeneText(SAMPLE_GENES)}>
                    <Database size={14} /> 示例基因
                </button>
            </p>

            <div className={styles.inputSection}>
                <Card title="基因 / 蛋白列表">
                    <textarea
                        className={`form-textarea ${styles.geneInput}`}
                        placeholder="输入基因/蛋白名，每行一个或用逗号分隔"
                        value={geneText}
                        onChange={(e) => setGeneText(e.target.value)}
                    />
                </Card>
                <Card title="参数设置">
                    <div className={styles.paramsPanel}>
                        <div className="form-group">
                            <label className="form-label">数据源</label>
                            <select className="form-select" value={useDemo} onChange={(e) => setUseDemo(e.target.value === 'true')}>
                                <option value="true">示例数据 (Demo)</option>
                                <option value="false">STRING API (在线)</option>
                            </select>
                        </div>
                        <button className={`btn btn-primary ${styles.runBtn}`} onClick={handleRun} disabled={loading}>
                            {loading ? <><span className="spinner"></span> 分析中...</> : <><Play size={16} /> 构建 PPI 网络</>}
                        </button>
                    </div>
                </Card>
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            {result && (
                <div className={styles.resultsSection}>
                    <div className={styles.summaryRow}>
                        <StatCard title="节点数" icon={<Network size={14} />} value={result.summary.total_nodes} label="蛋白/基因" color="var(--accent-blue)" />
                        <StatCard title="边数" icon={<BarChart3 size={14} />} value={result.summary.total_edges} label="互作关系" color="var(--accent-green)" />
                    </div>

                    {result.nodes.length > 0 && result.edges.length > 0 && (
                        <Card title="PPI 网络图" className={styles.networkCard}>
                            <Plot
                                data={buildNetworkPlot(result.nodes, result.edges)}
                                layout={{
                                    height: 550,
                                    showlegend: false,
                                    xaxis: { showgrid: false, zeroline: false, showticklabels: false },
                                    yaxis: { showgrid: false, zeroline: false, showticklabels: false, scaleanchor: 'x' },
                                    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                                    margin: { l: 20, r: 20, t: 20, b: 20 },
                                }}
                                config={{ displayModeBar: false, responsive: true }}
                                style={{ width: '100%' }}
                            />
                        </Card>
                    )}

                    <Card title="互作关系列表">
                        <DataTable columns={edgeColumns} data={result.edges} downloadFilename="ppi_edges.csv" />
                    </Card>
                </div>
            )}
        </div>
    );
}
