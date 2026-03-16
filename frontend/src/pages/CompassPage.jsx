import { useState, useEffect, useCallback } from 'react';
import { Play, Search, Upload, AlertTriangle, Activity, Users, ClipboardCopy, Settings2, ChevronDown, ChevronUp, BarChart3, Table2, Grid3X3 } from 'lucide-react';
import Card, { StatCard } from '../components/common/Card';
import Plot from '../components/charts/Plot';
import { submitCompassTask, getCompassTaskStatus, listCompassTasks } from '../api/client';
import styles from './CompassPage.module.css';

const SPECIES_OPTIONS = [
    { value: 'homo_sapiens', label: '人类 (Homo sapiens)' },
    { value: 'mus_musculus', label: '小鼠 (Mus musculus)' },
];

const MODEL_OPTIONS = [
    { value: 'RECON2_mat', label: 'RECON2 (默认)' },
    { value: 'RECON1_mat', label: 'RECON1' },
    { value: 'RECON2.2', label: 'RECON2.2' },
];

export default function CompassPage() {
    // Upload state
    const [file, setFile] = useState(null);
    const [species, setSpecies] = useState('homo_sapiens');
    const [model, setModel] = useState('RECON2_mat');

    // Advanced options
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [numProcesses, setNumProcesses] = useState(1);
    const [numThreads, setNumThreads] = useState(1);
    const [microclusterSize, setMicroclusterSize] = useState('');
    const [lambdaVal, setLambdaVal] = useState(0);
    const [calcMetabolites, setCalcMetabolites] = useState(false);
    const [testMode, setTestMode] = useState(false);

    // Task state
    const [activeTaskId, setActiveTaskId] = useState(null);
    const [taskStatus, setTaskStatus] = useState(null);
    const [taskResult, setTaskResult] = useState(null);
    const [taskError, setTaskError] = useState('');

    // Lookup state
    const [lookupId, setLookupId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState(false);

    // Result tabs
    const [resultTab, setResultTab] = useState('heatmap');

    // ── Handle file upload ──
    const handleFileChange = (e) => {
        const f = e.target.files?.[0];
        if (f) setFile(f);
    };

    // ── Submit task ──
    const handleSubmit = async () => {
        if (!file) {
            setTaskError('请上传基因表达矩阵文件 (.tsv / .mtx)');
            return;
        }

        setSubmitting(true);
        setTaskError('');
        setTaskResult(null);
        setTaskStatus(null);

        try {
            const options = {
                num_processes: numProcesses,
                num_threads: numThreads,
                lambda_val: lambdaVal,
                calc_metabolites: calcMetabolites,
                test_mode: testMode,
            };
            if (microclusterSize && parseInt(microclusterSize) > 0) {
                options.microcluster_size = parseInt(microclusterSize);
            }

            const res = await submitCompassTask(file, species, model, options);
            setActiveTaskId(res.data.task_id);
            setTaskStatus('pending');
        } catch (e) {
            setTaskError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    // ── Lookup task by ID ──
    const handleLookup = async () => {
        const tid = lookupId.trim();
        if (!tid) return;

        setTaskError('');
        setTaskResult(null);
        setTaskStatus(null);

        try {
            const res = await getCompassTaskStatus(tid);
            const task = res.data;
            setActiveTaskId(task.id);
            setTaskStatus(task.status);
            if (task.status === 'completed' && task.result) {
                setTaskResult(task.result);
            } else if (task.status === 'failed') {
                setTaskError(task.error || '任务处理失败');
            }
        } catch (e) {
            setTaskError('查询失败: ' + e.message);
        }
    };

    // ── Poll running task ──
    useEffect(() => {
        let timer;

        if (activeTaskId && (taskStatus === 'pending' || taskStatus === 'running')) {
            const poll = async () => {
                try {
                    const res = await getCompassTaskStatus(activeTaskId);
                    const task = res.data;
                    setTaskStatus(task.status);

                    if (task.status === 'completed') {
                        setTaskResult(task.result);
                    } else if (task.status === 'failed') {
                        setTaskError(task.error || '任务处理失败');
                    }
                } catch (e) {
                    // Don't break on transient errors
                    console.error('Compass poll error:', e);
                }
            };

            timer = setInterval(poll, 5000);
        }

        return () => clearInterval(timer);
    }, [activeTaskId, taskStatus]);

    // ── Copy task ID ──
    const handleCopy = useCallback(() => {
        if (activeTaskId) {
            navigator.clipboard.writeText(activeTaskId);
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 2000);
        }
    }, [activeTaskId]);

    // ── Status badge ──
    const statusLabel = {
        pending: '排队中',
        running: '运行中',
        completed: '已完成',
        failed: '失败',
    };

    const statusClass = {
        pending: styles.statusPending,
        running: styles.statusRunning,
        completed: styles.statusCompleted,
        failed: styles.statusFailed,
    };

    return (
        <div className={styles.page}>
            <h2 className="page-title">Compass 代谢建模</h2>
            <p className="page-subtitle">
                基于单细胞转录组的代谢异质性建模 (FBA)
            </p>

            {/* CPLEX Notice */}
            <div className={styles.noticeBanner}>
                <AlertTriangle size={18} className={styles.noticeIcon} />
                <div>
                    <strong>CPLEX 许可证要求：</strong>Compass 算法依赖 IBM CPLEX 优化器。
                    如果未安装 CPLEX，任务会报错并显示详细原因。
                    CPLEX 对学术用户免费 —&nbsp;
                    <a href="https://www.ibm.com/products/ilog-cplex-optimization-studio" target="_blank" rel="noopener noreferrer"
                       style={{ color: '#fbbf24' }}>
                        获取学术许可
                    </a>
                </div>
            </div>

            <div className={styles.grid}>
                {/* ─── Left: Control Panel ─── */}
                <div className={styles.controlPanel}>
                    <Card title="数据上传">
                        <div className={styles.uploadArea}>
                            <label className={styles.uploadLabel}>
                                <Upload size={28} />
                                <span>选择表达矩阵文件</span>
                                <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    支持 .tsv (行=基因, 列=样本)
                                </span>
                                <input
                                    type="file"
                                    accept=".tsv,.txt,.mtx"
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>
                        {file && (
                            <div className={styles.fileChip}>
                                📄 {file.name}
                                <span className={styles.fileChipClear} onClick={() => setFile(null)}>✕</span>
                            </div>
                        )}
                    </Card>

                    <Card title="分析参数">
                        <div className={styles.paramGroup}>
                            <label className={styles.paramLabel}>物种</label>
                            <select className="form-select" value={species} onChange={e => setSpecies(e.target.value)}>
                                {SPECIES_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.paramGroup}>
                            <label className={styles.paramLabel}>代谢模型</label>
                            <select className="form-select" value={model} onChange={e => setModel(e.target.value)}>
                                {MODEL_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Advanced options toggle */}
                        <div className={styles.advancedToggle} onClick={() => setShowAdvanced(!showAdvanced)}>
                            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            <Settings2 size={14} /> 高级选项
                        </div>

                        {showAdvanced && (
                            <div className={styles.advancedBody}>
                                <div className={styles.paramGroup}>
                                    <label className={styles.paramLabel}>并行进程数</label>
                                    <input type="number" className={styles.paramInput} min="1" max="32"
                                        value={numProcesses} onChange={e => setNumProcesses(parseInt(e.target.value) || 1)} />
                                </div>
                                <div className={styles.paramGroup}>
                                    <label className={styles.paramLabel}>每样本线程数</label>
                                    <input type="number" className={styles.paramInput} min="1" max="16"
                                        value={numThreads} onChange={e => setNumThreads(parseInt(e.target.value) || 1)} />
                                </div>
                                <div className={styles.paramGroup}>
                                    <label className={styles.paramLabel}>微池大小 (可选, 用于降低计算量)</label>
                                    <input type="number" className={styles.paramInput} min="0"
                                        placeholder="留空 = 不使用微池"
                                        value={microclusterSize} onChange={e => setMicroclusterSize(e.target.value)} />
                                </div>
                                <div className={styles.paramGroup}>
                                    <label className={styles.paramLabel}>Lambda (平滑因子, 0-1)</label>
                                    <input type="number" className={styles.paramInput} min="0" max="1" step="0.05"
                                        value={lambdaVal} onChange={e => setLambdaVal(parseFloat(e.target.value) || 0)} />
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                    <input type="checkbox" checked={calcMetabolites} onChange={e => setCalcMetabolites(e.target.checked)} />
                                    计算代谢物摄取/分泌
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} />
                                    测试模式 (仅前100反应)
                                </label>
                            </div>
                        )}

                        <button
                            className={styles.submitBtn}
                            onClick={handleSubmit}
                            disabled={submitting || (activeTaskId && ['pending', 'running'].includes(taskStatus))}
                            style={{ marginTop: '1rem' }}
                        >
                            {submitting ? (
                                <><span className="spinner"></span> 提交中...</>
                            ) : (activeTaskId && ['pending', 'running'].includes(taskStatus)) ? (
                                <><span className="spinner"></span> 任务进行中...</>
                            ) : (
                                <><Play size={16} /> 提交 Compass 任务</>
                            )}
                        </button>

                        {/* Task ID lookup */}
                        <div className={styles.lookupSection}>
                            <label className={styles.paramLabel}>
                                <Search size={13} style={{ verticalAlign: -2 }} /> 通过任务 ID 查询结果
                            </label>
                            <div className={styles.lookupRow}>
                                <input
                                    className={styles.lookupInput}
                                    placeholder="粘贴 task_id..."
                                    value={lookupId}
                                    onChange={e => setLookupId(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleLookup()}
                                />
                                <button className={styles.lookupBtn} onClick={handleLookup}>查询</button>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* ─── Right: Results ─── */}
                <div className={styles.resultsArea}>
                    {/* Active task card */}
                    {activeTaskId && (
                        <div className={styles.taskCard}>
                            <div className={styles.taskHeader}>
                                <span className={styles.taskTitle}>当前任务</span>
                                <span className={`${styles.statusBadge} ${statusClass[taskStatus] || ''}`}>
                                    {taskStatus === 'running' && <span className="spinner" style={{ width: 12, height: 12 }}></span>}
                                    {statusLabel[taskStatus] || taskStatus}
                                </span>
                            </div>
                            <div className={styles.taskIdRow}>
                                <span className={styles.taskIdLabel}>ID:</span>
                                <span className={styles.taskIdValue}>{activeTaskId}</span>
                                <button className={styles.copyBtn} onClick={handleCopy}>
                                    <ClipboardCopy size={12} /> {copyFeedback ? '已复制' : '复制'}
                                </button>
                            </div>
                            {taskStatus && ['pending', 'running'].includes(taskStatus) && (
                                <div className={styles.taskMeta}>
                                    ⏳ 任务正在后台执行，可能需要数分钟至数小时。您可以复制任务 ID 后关闭页面，稍后使用 ID 查询结果。
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error display */}
                    {taskError && (
                        <div className={styles.errorMessage}>
                            {taskError}
                        </div>
                    )}

                    {/* Waiting state */}
                    {activeTaskId && ['pending', 'running'].includes(taskStatus) && (
                        <div className={styles.waitingState}>
                            <div className="spinner" style={{ width: 36, height: 36 }}></div>
                            <div className={styles.waitingMessage}>
                                Compass 分析正在后台运行...
                            </div>
                            <div className={styles.waitingHint}>
                                页面将每 5 秒自动刷新状态，您也可以复制 ID 后关闭页面稍后查询
                            </div>
                        </div>
                    )}

                    {/* Results */}
                    {taskResult && (
                        <>
                            <div className={styles.statGrid}>
                                <StatCard
                                    title="样本数"
                                    icon={<Users size={18} color="var(--accent-purple)" strokeWidth={2} />}
                                    value={taskResult.num_samples || taskResult.samples?.length || 0}
                                    label="完成分析的细胞/样本"
                                    color="var(--accent-purple)"
                                />
                                <StatCard
                                    title="反应评分数"
                                    icon={<Activity size={18} color="var(--accent-pink)" strokeWidth={2} />}
                                    value={taskResult.num_reactions || taskResult.reactions?.length || 0}
                                    label="代谢反应评分"
                                    color="var(--accent-pink)"
                                />
                                <StatCard
                                    title="代谢模型"
                                    icon={<Grid3X3 size={18} color="#3b82f6" strokeWidth={2} />}
                                    value={taskResult.model || model}
                                    label={taskResult.species || species}
                                    color="#3b82f6"
                                />
                            </div>

                            {/* Result tabs */}
                            <div className={styles.resultTabs}>
                                <button
                                    className={`${styles.resultTab} ${resultTab === 'heatmap' ? styles.resultTabActive : ''}`}
                                    onClick={() => setResultTab('heatmap')}
                                >
                                    <Grid3X3 size={14} /> 热图
                                </button>
                                <button
                                    className={`${styles.resultTab} ${resultTab === 'bar' ? styles.resultTabActive : ''}`}
                                    onClick={() => setResultTab('bar')}
                                >
                                    <BarChart3 size={14} /> Top 反应
                                </button>
                                <button
                                    className={`${styles.resultTab} ${resultTab === 'table' ? styles.resultTabActive : ''}`}
                                    onClick={() => setResultTab('table')}
                                >
                                    <Table2 size={14} /> 数据表
                                </button>
                            </div>

                            {/* Heatmap */}
                            {resultTab === 'heatmap' && taskResult.reactions && taskResult.scores && (
                                <Card title="Compass 反应评分热图" className={styles.chartCard}>
                                    <Plot
                                        data={[{
                                            x: taskResult.reactions.length > 50 ? taskResult.reactions.slice(0, 50) : taskResult.reactions,
                                            y: taskResult.samples.length > 100 ? taskResult.samples.slice(0, 100) : taskResult.samples,
                                            z: taskResult.scores.length > 100
                                                ? taskResult.scores.slice(0, 100).map(row => row.length > 50 ? row.slice(0, 50) : row)
                                                : taskResult.scores.map(row => row.length > 50 ? row.slice(0, 50) : row),
                                            type: 'heatmap',
                                            colorscale: 'Viridis',
                                        }]}
                                        layout={{
                                            margin: { l: 100, r: 30, t: 30, b: 120 },
                                            height: 600,
                                            paper_bgcolor: 'transparent',
                                            plot_bgcolor: 'transparent',
                                            font: { family: 'Inter, sans-serif', color: '#334155' },
                                            xaxis: { title: 'Reactions (最多显示 50)', tickfont: { size: 8 }, tickangle: -45 },
                                            yaxis: { title: 'Samples (最多显示 100)', tickfont: { size: 8 } },
                                        }}
                                        useResizeHandler
                                        style={{ width: '100%' }}
                                        config={{ displayModeBar: false }}
                                    />
                                </Card>
                            )}

                            {/* Top reactions bar chart */}
                            {resultTab === 'bar' && taskResult.reactions && taskResult.scores && (
                                <Card title="Top 30 反应平均评分" className={styles.chartCard}>
                                    {(() => {
                                        // Compute mean score per reaction
                                        const means = taskResult.reactions.map((rxn, ci) => {
                                            const vals = taskResult.scores.map(row => row[ci] || 0);
                                            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                                            return { reaction: rxn, mean: avg };
                                        });
                                        means.sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean));
                                        const top = means.slice(0, 30);

                                        return (
                                            <Plot
                                                data={[{
                                                    type: 'bar',
                                                    x: top.map(t => t.mean),
                                                    y: top.map(t => t.reaction),
                                                    orientation: 'h',
                                                    marker: {
                                                        color: top.map(t => t.mean > 0 ? 'rgba(139, 92, 246, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                                                    },
                                                    hovertemplate: '%{y}<br>Mean Score: %{x:.4f}<extra></extra>',
                                                }]}
                                                layout={{
                                                    yaxis: { autorange: 'reversed', tickfont: { size: 9 } },
                                                    xaxis: { title: 'Mean Compass Score' },
                                                    margin: { l: 200, r: 20, t: 10, b: 50 },
                                                    height: 600,
                                                    paper_bgcolor: 'transparent',
                                                    plot_bgcolor: 'transparent',
                                                    font: { family: 'Inter, sans-serif', color: '#334155' },
                                                }}
                                                useResizeHandler
                                                style={{ width: '100%' }}
                                                config={{ displayModeBar: false }}
                                            />
                                        );
                                    })()}
                                </Card>
                            )}

                            {/* Data table */}
                            {resultTab === 'table' && taskResult.reactions && taskResult.scores && (
                                <Card title="反应评分数据表" className={styles.chartCard}>
                                    <div className={styles.tableWrap}>
                                        <table className={styles.dataTable}>
                                            <thead>
                                                <tr>
                                                    <th>Sample</th>
                                                    {(taskResult.reactions.length > 20 ? taskResult.reactions.slice(0, 20) : taskResult.reactions).map(r => (
                                                        <th key={r} style={{ writingMode: 'vertical-lr', fontSize: '0.7rem', maxWidth: 30 }}>{r}</th>
                                                    ))}
                                                    {taskResult.reactions.length > 20 && <th>...</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(taskResult.samples.length > 50 ? taskResult.samples.slice(0, 50) : taskResult.samples).map((s, si) => (
                                                    <tr key={s}>
                                                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{s}</td>
                                                        {(taskResult.reactions.length > 20 ? taskResult.scores[si].slice(0, 20) : taskResult.scores[si]).map((v, vi) => (
                                                            <td key={vi} style={{ fontSize: '0.78rem', textAlign: 'right' }}>{typeof v === 'number' ? v.toFixed(2) : v}</td>
                                                        ))}
                                                        {taskResult.reactions.length > 20 && <td>…</td>}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        显示前 50 行 × 前 20 列 (共 {taskResult.samples?.length || 0} 行 × {taskResult.reactions?.length || 0} 列)
                                    </div>
                                </Card>
                            )}

                            {/* Uptake / Secretion sections if available */}
                            {taskResult.uptake && (
                                <Card title="代谢物摄取评分 (Uptake)" className={styles.chartCard}>
                                    <Plot
                                        data={[{
                                            x: taskResult.uptake.metabolites?.slice(0, 50),
                                            y: taskResult.uptake.samples?.slice(0, 50),
                                            z: taskResult.uptake.scores?.slice(0, 50).map(r => r.slice(0, 50)),
                                            type: 'heatmap',
                                            colorscale: 'Blues',
                                        }]}
                                        layout={{
                                            margin: { l: 100, r: 30, t: 30, b: 120 },
                                            height: 400,
                                            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                                            font: { family: 'Inter, sans-serif', color: '#334155' },
                                            xaxis: { tickfont: { size: 8 }, tickangle: -45 },
                                            yaxis: { tickfont: { size: 8 } },
                                        }}
                                        useResizeHandler style={{ width: '100%' }} config={{ displayModeBar: false }}
                                    />
                                </Card>
                            )}

                            {taskResult.secretions && (
                                <Card title="代谢物分泌评分 (Secretion)" className={styles.chartCard}>
                                    <Plot
                                        data={[{
                                            x: taskResult.secretions.metabolites?.slice(0, 50),
                                            y: taskResult.secretions.samples?.slice(0, 50),
                                            z: taskResult.secretions.scores?.slice(0, 50).map(r => r.slice(0, 50)),
                                            type: 'heatmap',
                                            colorscale: 'Reds',
                                        }]}
                                        layout={{
                                            margin: { l: 100, r: 30, t: 30, b: 120 },
                                            height: 400,
                                            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                                            font: { family: 'Inter, sans-serif', color: '#334155' },
                                            xaxis: { tickfont: { size: 8 }, tickangle: -45 },
                                            yaxis: { tickfont: { size: 8 } },
                                        }}
                                        useResizeHandler style={{ width: '100%' }} config={{ displayModeBar: false }}
                                    />
                                </Card>
                            )}
                        </>
                    )}

                    {/* Empty state */}
                    {!activeTaskId && !taskError && !taskResult && (
                        <div className={styles.emptyState}>
                            <Activity size={48} className={styles.emptyIcon} />
                            <div>上传基因表达矩阵并提交 Compass 分析任务</div>
                            <div style={{ fontSize: '0.82rem' }}>或使用任务 ID 查询已完成的任务结果</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
