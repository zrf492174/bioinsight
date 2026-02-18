import { useState, useEffect, useMemo } from 'react';
import { Play, Info, Zap, Scissors, ShieldAlert, Database, Upload, Settings, FlaskConical } from 'lucide-react';
import Plot from '../components/charts/Plot';
import Card from '../components/common/Card';
import {
    getModelInfo,
    uploadModel,
    runFBA,
    runFVA,
    runKnockout,
    runEssentialGenes,
} from '../api/client';
import styles from './MetabolismPage.module.css';

const TABS = [
    { id: 'fba', label: 'FBA 通量分析', icon: Zap },
    { id: 'fva', label: 'FVA 变化分析', icon: Database },
    { id: 'knockout', label: '基因敲除', icon: Scissors },
    { id: 'essential', label: '必需基因', icon: ShieldAlert },
];

export default function MetabolismPage() {
    const [activeTab, setActiveTab] = useState('fba');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Model state
    const [modelFile, setModelFile] = useState(null);    // File object if uploaded
    const [modelData, setModelData] = useState(null);    // { info, reactions, exchanges, genes }
    const [modelSource, setModelSource] = useState('builtin');  // 'builtin' or 'uploaded'
    const [modelLoading, setModelLoading] = useState(false);

    // Config state
    const [objectiveId, setObjectiveId] = useState('');
    const [mediumEdits, setMediumEdits] = useState({}); // { exchange_id: uptake_rate }

    // FBA state
    const [fbaResult, setFbaResult] = useState(null);
    // FVA state
    const [fvaFraction, setFvaFraction] = useState(0.9);
    const [fvaResult, setFvaResult] = useState(null);
    // Knockout state
    const [koGenes, setKoGenes] = useState('');
    const [koResult, setKoResult] = useState(null);
    // Essential state
    const [essentialResult, setEssentialResult] = useState(null);

    // Load built-in model on mount
    useEffect(() => {
        loadBuiltinModel();
    }, []);

    const loadBuiltinModel = async () => {
        setModelLoading(true); setError('');
        try {
            const res = await getModelInfo();
            setModelData(res.data);
            setModelFile(null);
            setModelSource('builtin');
            setObjectiveId(res.data.info.objective_reaction || '');
            initMedium(res.data.exchanges);
            clearResults();
        } catch (e) { setError(e.message); }
        finally { setModelLoading(false); }
    };

    const handleUploadSBML = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setModelLoading(true); setError('');
        try {
            const res = await uploadModel(file);
            setModelData(res.data);
            setModelFile(file);
            setModelSource('uploaded');
            setObjectiveId(res.data.info.objective_reaction || '');
            initMedium(res.data.exchanges);
            clearResults();
        } catch (e) { setError(e.message); }
        finally { setModelLoading(false); }
    };

    const initMedium = (exchanges) => {
        const m = {};
        exchanges.forEach((ex) => {
            if (ex.in_medium) m[ex.id] = ex.uptake_rate;
        });
        setMediumEdits(m);
    };

    const clearResults = () => {
        setFbaResult(null); setFvaResult(null);
        setKoResult(null); setEssentialResult(null);
    };

    const getMediumObj = () => {
        return Object.keys(mediumEdits).length > 0 ? mediumEdits : null;
    };

    const getFile = () => modelSource === 'uploaded' ? modelFile : null;

    // Analysis handlers
    const handleRunFBA = async () => {
        setLoading(true); setError(''); setFbaResult(null);
        try {
            const res = await runFBA(getFile(), objectiveId || null, getMediumObj());
            setFbaResult(res.data);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const handleRunFVA = async () => {
        setLoading(true); setError(''); setFvaResult(null);
        try {
            const res = await runFVA(fvaFraction, getFile(), objectiveId || null, getMediumObj());
            setFvaResult(res.data);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const handleRunKnockout = async () => {
        if (!koGenes.trim()) { setError('请输入基因 ID'); return; }
        setLoading(true); setError(''); setKoResult(null);
        try {
            const res = await runKnockout(koGenes, getFile(), objectiveId || null, getMediumObj());
            setKoResult(res.data);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const handleRunEssential = async () => {
        setLoading(true); setError(''); setEssentialResult(null);
        try {
            const res = await runEssentialGenes(getFile(), objectiveId || null, getMediumObj());
            setEssentialResult(res.data);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const loadSampleKOGenes = () => {
        if (modelData?.genes?.length) {
            setKoGenes(modelData.genes.slice(0, 8).map(g => g.id).join(','));
        }
    };

    // Medium handlers
    const toggleMedium = (exId, uptake) => {
        setMediumEdits(prev => {
            const next = { ...prev };
            if (next[exId] !== undefined) {
                delete next[exId];
            } else {
                next[exId] = uptake || 1000;
            }
            return next;
        });
    };

    const updateMediumRate = (exId, value) => {
        setMediumEdits(prev => ({ ...prev, [exId]: parseFloat(value) || 0 }));
    };

    // Filter for reaction search
    const [rxnSearch, setRxnSearch] = useState('');
    const filteredReactions = useMemo(() => {
        if (!modelData?.reactions) return [];
        if (!rxnSearch) return modelData.reactions;
        const q = rxnSearch.toLowerCase();
        return modelData.reactions.filter(r =>
            r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
        );
    }, [modelData?.reactions, rxnSearch]);

    return (
        <div className={styles.page}>
            <h2 className="page-title">代谢建模</h2>
            <p className="page-subtitle">基于 COBRApy 的约束基代谢建模分析</p>

            {/* Model Configuration Panel */}
            <Card title="模型配置" className={styles.configCard}>
                <div className={styles.configGrid}>
                    {/* Model Source */}
                    <div className={styles.configSection}>
                        <h4 className={styles.configLabel}><Upload size={14} /> 模型来源</h4>
                        <div className={styles.modelBtns}>
                            <button
                                className={`btn ${modelSource === 'builtin' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={loadBuiltinModel}
                                disabled={modelLoading}
                            >
                                <FlaskConical size={14} /> E. coli Core
                            </button>
                            <label className={`btn btn-ghost ${styles.uploadLabel}`}>
                                <Upload size={14} /> 上传 SBML
                                <input
                                    type="file"
                                    accept=".xml,.sbml"
                                    onChange={handleUploadSBML}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>
                        {modelData && (
                            <div className={styles.modelInfo}>
                                <span className={styles.modelId}>{modelData.info.model_id}</span>
                                <span>{modelData.info.num_reactions}R · {modelData.info.num_metabolites}M · {modelData.info.num_genes}G</span>
                                {modelSource === 'uploaded' && <span className={styles.badge}>自定义</span>}
                            </div>
                        )}
                    </div>

                    {/* Objective Function */}
                    <div className={styles.configSection}>
                        <h4 className={styles.configLabel}><Settings size={14} /> 目标函数</h4>
                        <select
                            className="form-select"
                            value={objectiveId}
                            onChange={(e) => setObjectiveId(e.target.value)}
                        >
                            <option value="">-- 默认目标函数 --</option>
                            {modelData?.reactions?.map(r => (
                                <option key={r.id} value={r.id}>
                                    {r.id} — {r.name} {r.is_objective ? '(当前)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Medium / Culture Conditions */}
                {modelData?.exchanges && (
                    <div className={styles.mediumSection}>
                        <h4 className={styles.configLabel}><FlaskConical size={14} /> 培养基条件 (Exchange Reactions)</h4>
                        <div className={styles.mediumTableWrap}>
                            <table className={styles.mediumTable}>
                                <thead>
                                    <tr>
                                        <th>启用</th>
                                        <th>Exchange ID</th>
                                        <th>名称</th>
                                        <th>摄取速率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {modelData.exchanges.map(ex => {
                                        const active = mediumEdits[ex.id] !== undefined;
                                        return (
                                            <tr key={ex.id} className={active ? styles.mediumActive : ''}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={active}
                                                        onChange={() => toggleMedium(ex.id, ex.uptake_rate)}
                                                    />
                                                </td>
                                                <td><code>{ex.id}</code></td>
                                                <td>{ex.name}</td>
                                                <td>
                                                    {active ? (
                                                        <input
                                                            type="number"
                                                            className={styles.rateInput}
                                                            value={mediumEdits[ex.id]}
                                                            onChange={(e) => updateMediumRate(ex.id, e.target.value)}
                                                            step="0.1"
                                                        />
                                                    ) : (
                                                        <span className={styles.rateDisabled}>—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </Card>

            {/* Tabs */}
            <div className={styles.tabs}>
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
                        onClick={() => { setActiveTab(id); setError(''); }}
                    >
                        <Icon size={15} /> {label}
                    </button>
                ))}
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            {/* FBA Tab */}
            {activeTab === 'fba' && (
                <div className={styles.tabContent}>
                    <button className="btn btn-primary" onClick={handleRunFBA} disabled={loading || modelLoading}>
                        {loading ? <><span className="spinner"></span> 计算中...</> : <><Play size={16} /> 运行 FBA</>}
                    </button>

                    {fbaResult && (
                        <>
                            <div className={styles.statsRow}>
                                <div className={styles.stat}>
                                    <div className={styles.statValue}>{fbaResult.objective_value.toFixed(4)}</div>
                                    <div className={styles.statLabel}>目标函数值</div>
                                </div>
                                <div className={styles.stat}>
                                    <div className={styles.statValue}>{fbaResult.summary.active_reactions}</div>
                                    <div className={styles.statLabel}>活跃反应</div>
                                </div>
                                <div className={styles.stat}>
                                    <div className={styles.statValue}>{fbaResult.summary.inactive_reactions}</div>
                                    <div className={styles.statLabel}>不活跃反应</div>
                                </div>
                            </div>

                            <Card title="Top 20 通量分布" className={styles.chartCard}>
                                <Plot
                                    data={[{
                                        type: 'bar',
                                        x: fbaResult.fluxes.slice(0, 20).map(f => f.flux),
                                        y: fbaResult.fluxes.slice(0, 20).map(f => `${f.reaction_id} (${f.reaction_name})`),
                                        orientation: 'h',
                                        marker: { color: fbaResult.fluxes.slice(0, 20).map(f => f.flux > 0 ? '#3b82f6' : '#ef4444') },
                                        hovertemplate: '%{y}<br>Flux: %{x:.4f}<extra></extra>',
                                    }]}
                                    layout={{
                                        yaxis: { autorange: 'reversed', tickfont: { size: 10 } },
                                        xaxis: { title: 'Flux (mmol/gDW/h)' },
                                        margin: { l: 220, r: 20, t: 10, b: 50 },
                                        height: 500,
                                        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                                        font: { family: 'Inter, sans-serif', color: '#334155' },
                                    }}
                                    useResizeHandler style={{ width: '100%' }} config={{ displayModeBar: false }}
                                />
                            </Card>

                            <Card title="通量详情表" className={styles.chartCard}>
                                <div className={styles.tableWrap}>
                                    <table className={styles.dataTable}>
                                        <thead><tr><th>反应 ID</th><th>名称</th><th>通量</th><th>子系统</th></tr></thead>
                                        <tbody>
                                            {fbaResult.fluxes.filter(f => Math.abs(f.flux) > 1e-6).map((f, i) => (
                                                <tr key={i}>
                                                    <td><code>{f.reaction_id}</code></td>
                                                    <td>{f.reaction_name}</td>
                                                    <td className={f.flux > 0 ? styles.positive : styles.negative}>{f.flux.toFixed(4)}</td>
                                                    <td>{f.subsystem}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            )}

            {/* FVA Tab */}
            {activeTab === 'fva' && (
                <div className={styles.tabContent}>
                    <div style={{ display: 'flex', alignItems: 'end', gap: 12 }}>
                        <div className="form-group" style={{ maxWidth: 150 }}>
                            <label className="form-label">最优比例</label>
                            <input className="form-input" type="number" step="0.05" min="0" max="1"
                                value={fvaFraction} onChange={(e) => setFvaFraction(parseFloat(e.target.value))} />
                        </div>
                        <button className="btn btn-primary" onClick={handleRunFVA} disabled={loading || modelLoading}>
                            {loading ? <><span className="spinner"></span> 计算中...</> : <><Play size={16} /> 运行 FVA</>}
                        </button>
                    </div>

                    {fvaResult && (
                        <>
                            <div className={styles.statsRow}>
                                <div className={styles.stat}>
                                    <div className={styles.statValue}>{fvaResult.summary.variable_flux}</div>
                                    <div className={styles.statLabel}>可变通量反应</div>
                                </div>
                                <div className={styles.stat}>
                                    <div className={styles.statValue}>{fvaResult.summary.fixed_flux}</div>
                                    <div className={styles.statLabel}>固定通量反应</div>
                                </div>
                            </div>
                            <Card title="Top 20 通量范围" className={styles.chartCard}>
                                <Plot
                                    data={[
                                        { type: 'bar', name: 'Min', x: fvaResult.results.slice(0, 20).map(r => r.reaction_id), y: fvaResult.results.slice(0, 20).map(r => r.min_flux), marker: { color: '#93c5fd' } },
                                        { type: 'bar', name: 'Max', x: fvaResult.results.slice(0, 20).map(r => r.reaction_id), y: fvaResult.results.slice(0, 20).map(r => r.max_flux), marker: { color: '#3b82f6' } },
                                    ]}
                                    layout={{
                                        barmode: 'group', xaxis: { tickangle: -45, tickfont: { size: 10 } }, yaxis: { title: 'Flux' },
                                        margin: { l: 60, r: 20, t: 10, b: 80 }, height: 400,
                                        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                                        font: { family: 'Inter, sans-serif', color: '#334155' }, legend: { orientation: 'h', y: 1.1 },
                                    }}
                                    useResizeHandler style={{ width: '100%' }} config={{ displayModeBar: false }}
                                />
                            </Card>
                        </>
                    )}
                </div>
            )}

            {/* Knockout Tab */}
            {activeTab === 'knockout' && (
                <div className={styles.tabContent}>
                    <div className="form-group">
                        <label className="form-label">
                            基因 ID (逗号分隔)
                            <button className="btn btn-ghost" style={{ fontSize: 12, marginLeft: 8 }} onClick={loadSampleKOGenes}>
                                <Database size={12} /> 示例基因
                            </button>
                        </label>
                        <input className="form-input" placeholder="例如: b0727,b1241,b2416"
                            value={koGenes} onChange={(e) => setKoGenes(e.target.value)} />
                    </div>
                    <button className="btn btn-primary" onClick={handleRunKnockout} disabled={loading || modelLoading} style={{ marginTop: 12 }}>
                        {loading ? <><span className="spinner"></span> 模拟中...</> : <><Play size={16} /> 运行敲除</>}
                    </button>

                    {koResult && (
                        <>
                            <div className={styles.statsRow}>
                                <div className={styles.stat}><div className={styles.statValue}>{koResult.wt_growth.toFixed(4)}</div><div className={styles.statLabel}>野生型生长率</div></div>
                                <div className={styles.stat}><div className={styles.statValue}>{koResult.summary.essential}</div><div className={styles.statLabel}>必需基因</div></div>
                                <div className={styles.stat}><div className={styles.statValue}>{koResult.summary.non_essential}</div><div className={styles.statLabel}>非必需基因</div></div>
                            </div>
                            <Card title="敲除效果对比" className={styles.chartCard}>
                                <Plot
                                    data={[
                                        { type: 'bar', name: '野生型', x: koResult.results.filter(r => r.status === 'success').map(r => r.gene_id), y: koResult.results.filter(r => r.status === 'success').map(() => koResult.wt_growth), marker: { color: '#93c5fd' } },
                                        { type: 'bar', name: '敲除后', x: koResult.results.filter(r => r.status === 'success').map(r => r.gene_id), y: koResult.results.filter(r => r.status === 'success').map(r => r.ko_growth), marker: { color: koResult.results.filter(r => r.status === 'success').map(r => r.is_essential ? '#ef4444' : '#22c55e') } },
                                    ]}
                                    layout={{
                                        barmode: 'group', xaxis: { title: '基因 ID' }, yaxis: { title: '生长率 (1/h)' },
                                        margin: { l: 60, r: 20, t: 10, b: 60 }, height: 380,
                                        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                                        font: { family: 'Inter, sans-serif', color: '#334155' }, legend: { orientation: 'h', y: 1.1 },
                                    }}
                                    useResizeHandler style={{ width: '100%' }} config={{ displayModeBar: false }}
                                />
                            </Card>
                            <Card title="敲除详情" className={styles.chartCard}>
                                <div className={styles.tableWrap}>
                                    <table className={styles.dataTable}>
                                        <thead><tr><th>基因 ID</th><th>WT</th><th>KO</th><th>比率</th><th>状态</th></tr></thead>
                                        <tbody>
                                            {koResult.results.map((r, i) => (
                                                <tr key={i}>
                                                    <td><code>{r.gene_id}</code></td>
                                                    <td>{r.wt_growth?.toFixed(4) ?? '-'}</td>
                                                    <td>{r.ko_growth?.toFixed(4) ?? '-'}</td>
                                                    <td>{r.growth_ratio != null ? `${(r.growth_ratio * 100).toFixed(1)}%` : '-'}</td>
                                                    <td>{r.status === 'not_found' ? <span className={styles.badgeWarn}>未找到</span> : r.is_essential ? <span className={styles.badgeDanger}>必需</span> : <span className={styles.badgeOk}>非必需</span>}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            )}

            {/* Essential Genes Tab */}
            {activeTab === 'essential' && (
                <div className={styles.tabContent}>
                    <button className="btn btn-primary" onClick={handleRunEssential} disabled={loading || modelLoading}>
                        {loading ? <><span className="spinner"></span> 检测中...</> : <><Play size={16} /> 检测必需基因</>}
                    </button>

                    {essentialResult && (
                        <>
                            <div className={styles.statsRow}>
                                <div className={styles.stat}><div className={styles.statValue}>{essentialResult.summary.total_genes}</div><div className={styles.statLabel}>总基因数</div></div>
                                <div className={styles.stat}><div className={styles.statValue}>{essentialResult.summary.essential_count}</div><div className={styles.statLabel}>必需基因数</div></div>
                                <div className={styles.stat}><div className={styles.statValue}>{(essentialResult.summary.essential_ratio * 100).toFixed(1)}%</div><div className={styles.statLabel}>比例</div></div>
                            </div>
                            <Card title="必需基因列表" className={styles.chartCard}>
                                <div className={styles.tableWrap}>
                                    <table className={styles.dataTable}>
                                        <thead><tr><th>基因 ID</th><th>名称</th><th>关联反应数</th><th>关联反应</th></tr></thead>
                                        <tbody>
                                            {essentialResult.essential_genes.map((g, i) => (
                                                <tr key={i}>
                                                    <td><code>{g.gene_id}</code></td>
                                                    <td>{g.gene_name}</td>
                                                    <td>{g.num_reactions}</td>
                                                    <td className={styles.rxnList}>{g.reactions.join(', ')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
