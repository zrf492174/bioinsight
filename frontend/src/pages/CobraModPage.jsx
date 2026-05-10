import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Upload, Play, Search, Download, AlertTriangle, FlaskConical,
    ClipboardCopy, ChevronRight, Activity, Atom, Dna, Network,
    RefreshCw, Link2, PlusCircle, GitMerge
} from 'lucide-react';
import Card from '../components/common/Card';
import {
    uploadModelForCuration,
    submitCurationTask,
    getCurationTaskStatus,
    getCuratedModelDownloadUrl,
} from '../api/client';
import styles from './CobraModPage.module.css';

/* ─────────── constants ─────────── */

const DATABASES = [
    { value: 'KEGG', label: 'KEGG', hint: '如: hsa00010, R00259' },
    { value: 'BIGG', label: 'BiGG Models', hint: '如: PGI, GAPD, atp_c' },
    { value: 'META', label: 'BioCyc / MetaCyc', hint: '如: GLYCOLYSIS, SUCROSE (需要账号)' },
    { value: 'YEAST', label: 'BioCyc — YEAST', hint: '如: GLYCOLYSIS, CPD-12575' },
    { value: 'ECOLI', label: 'BioCyc — ECOLI', hint: '如: GLYCOLYSIS' },
];

const OPERATIONS = [
    {
        value: 'add_pathway',
        label: '添加代谢通路',
        icon: GitMerge,
        hint: '从数据库添加完整通路（所有反应+代谢物）',
        placeholder: '每行一个通路 ID，例如:\nGLYCOLYSIS\nhsa00010',
    },
    {
        value: 'add_reactions',
        label: '添加反应',
        icon: RefreshCw,
        hint: '从数据库添加单个反应。格式：IDENTIFIER, compartment',
        placeholder: '每行一个反应 ID，例如:\nR00259, c\nGAPD, c',
    },
    {
        value: 'add_metabolites',
        label: '添加代谢物',
        icon: Atom,
        hint: '从数据库添加代谢物。格式：IDENTIFIER, compartment',
        placeholder: '每行一个代谢物 ID，例如:\nC00031, c\nglc__D_e, e',
    },
    {
        value: 'add_crossreferences',
        label: '添加交叉引用',
        icon: Link2,
        hint: '自动从数据库扩展模型的交叉引用注释',
        placeholder: '（无需输入 ID，点击运行即可）',
    },
];

const STATUS_LABEL = { pending: '排队中', running: '运行中', completed: '已完成', failed: '失败' };
const STATUS_CLASS = {
    pending: styles.statusPending,
    running: styles.statusRunning,
    completed: styles.statusCompleted,
    failed: styles.statusFailed,
};

/* ─────────── helpers ─────────── */

function DiffCard({ label, before, after, delta }) {
    const cls = delta > 0 ? styles.diffDeltaPos : delta < 0 ? styles.diffDeltaNeg : styles.diffDeltaNeutral;
    return (
        <div className={styles.diffCard}>
            <div className={styles.diffBefore}>{before}</div>
            <div className={styles.diffArrow}>↓</div>
            <div className={styles.diffAfter}>{after}</div>
            <div className={`${styles.diffDelta} ${cls}`}>{delta >= 0 ? '+' : ''}{delta}</div>
            <div className={styles.diffLabel}>{label}</div>
        </div>
    );
}

function ModelSummaryCards({ summary }) {
    return (
        <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
                <div className={styles.summaryValue} style={{ color: 'var(--accent-purple)' }}>
                    {summary.num_reactions}
                </div>
                <div className={styles.summaryLabel}>反应</div>
            </div>
            <div className={styles.summaryCard}>
                <div className={styles.summaryValue} style={{ color: '#3b82f6' }}>
                    {summary.num_metabolites}
                </div>
                <div className={styles.summaryLabel}>代谢物</div>
            </div>
            <div className={styles.summaryCard}>
                <div className={styles.summaryValue} style={{ color: '#f59e0b' }}>
                    {summary.num_genes}
                </div>
                <div className={styles.summaryLabel}>基因</div>
            </div>
            {summary.fba_value !== null && summary.fba_value !== undefined && (
                <div className={styles.summaryCard}>
                    <div className={styles.summaryValue} style={{ color: '#22c55e', fontSize: '1.1rem' }}>
                        {summary.fba_value.toFixed(3)}
                    </div>
                    <div className={styles.summaryLabel}>FBA 目标值</div>
                </div>
            )}
        </div>
    );
}

/* ─────────── main component ─────────── */

export default function CobraModPage() {
    // ── File / model state ──
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [modelSummary, setModelSummary] = useState(null);
    const [modelToken, setModelToken] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [dragOver, setDragOver] = useState(false);

    // ── Model table tab ──
    const [tableTab, setTableTab] = useState('reactions');

    // ── Curation config ──
    const [operation, setOperation] = useState('add_pathway');
    const [database, setDatabase] = useState('KEGG');
    const [items, setItems] = useState('');

    // ── Task state ──
    const [activeTaskId, setActiveTaskId] = useState(null);
    const [taskStatus, setTaskStatus] = useState(null);
    const [taskResult, setTaskResult] = useState(null);
    const [taskError, setTaskError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ── Lookup ──
    const [lookupId, setLookupId] = useState('');
    const [copyFeedback, setCopyFeedback] = useState(false);

    const fileInputRef = useRef(null);

    /* ── File handling ── */
    const handleFile = useCallback(async (f) => {
        if (!f) return;
        setFile(f);
        setUploadError('');
        setModelSummary(null);
        setModelToken('');
        setTaskResult(null);
        setTaskError('');
        setActiveTaskId(null);
        setTaskStatus(null);

        setUploading(true);
        try {
            const res = await uploadModelForCuration(f);
            setModelSummary(res.data);
            setModelToken(res.data.model_token);
        } catch (e) {
            setUploadError('模型解析失败: ' + e.message);
        } finally {
            setUploading(false);
        }
    }, []);

    const handleFileInput = (e) => {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
    };

    /* ── Submit curation ── */
    const handleSubmit = async () => {
        if (!modelToken) { setTaskError('请先上传 SBML 模型文件'); return; }
        const op = OPERATIONS.find(o => o.value === operation);
        if (op?.value !== 'add_crossreferences' && !items.trim()) {
            setTaskError('请输入至少一个标识符');
            return;
        }

        setTaskError('');
        setTaskResult(null);
        setTaskStatus(null);
        setSubmitting(true);

        try {
            const res = await submitCurationTask(
                modelToken,
                file?.name || 'model.xml',
                operation,
                database,
                items,
                'manual',
            );
            setActiveTaskId(res.data.task_id);
            setTaskStatus('pending');
        } catch (e) {
            setTaskError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    /* ── Lookup by task ID ── */
    const handleLookup = async () => {
        const tid = lookupId.trim();
        if (!tid) return;
        setTaskError('');
        setTaskResult(null);
        setTaskStatus(null);
        try {
            const res = await getCurationTaskStatus(tid);
            const task = res.data;
            setActiveTaskId(task.id);
            setTaskStatus(task.status);
            if (task.status === 'completed' && task.result) setTaskResult(task.result);
            else if (task.status === 'failed') setTaskError(task.error || '任务失败');
        } catch (e) {
            setTaskError('查询失败: ' + e.message);
        }
    };

    /* ── Poll ── */
    useEffect(() => {
        let timer;
        if (activeTaskId && (taskStatus === 'pending' || taskStatus === 'running')) {
            const poll = async () => {
                try {
                    const res = await getCurationTaskStatus(activeTaskId);
                    const task = res.data;
                    setTaskStatus(task.status);
                    if (task.status === 'completed') setTaskResult(task.result);
                    else if (task.status === 'failed') setTaskError(task.error || '任务失败');
                } catch (e) {
                    console.error('Curation poll error:', e);
                }
            };
            timer = setInterval(poll, 4000);
        }
        return () => clearInterval(timer);
    }, [activeTaskId, taskStatus]);

    /* ── Copy task ID ── */
    const handleCopy = useCallback(() => {
        if (activeTaskId) {
            navigator.clipboard.writeText(activeTaskId);
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 2000);
        }
    }, [activeTaskId]);

    /* ── Current operation info ── */
    const currentOp = OPERATIONS.find(o => o.value === operation);
    const currentDb = DATABASES.find(d => d.value === database);

    /* ── Download URL ── */
    const downloadUrl = taskResult?.curated_model_token
        ? getCuratedModelDownloadUrl(taskResult.curated_model_token, taskResult.curated_filename || 'curated_model.xml')
        : null;

    return (
        <div className={styles.page}>
            <h2 className="page-title">CobraMod 模型校正</h2>
            <p className="page-subtitle">
                基于 CobraMod 的代谢网络模型路径级校正工具 — 上传 SBML 模型，从数据库添加代谢物、反应或完整通路
            </p>

            {/* Notice */}
            <div className={styles.noticeBanner}>
                <AlertTriangle size={16} className={styles.noticeIcon} />
                <div>
                    <strong>数据库支持：</strong>BioCyc 集合 / MetaCyc 需要账号（暂时可留空）；
                    <strong> KEGG</strong> 和 <strong>BiGG Models</strong> 免费使用，无需注册。
                    &nbsp;
                    <a href="https://cobramod.readthedocs.io/v1.3.0/" target="_blank" rel="noopener noreferrer"
                        style={{ color: '#fbbf24' }}>CobraMod 文档 ↗</a>
                </div>
            </div>

            <div className={styles.grid}>
                {/* ─── Left: Control Panel ─── */}
                <div className={styles.controlPanel}>

                    {/* Step 1: Upload */}
                    <Card title="① 上传 SBML 模型">
                        <div
                            className={`${styles.uploadZone} ${dragOver ? styles.uploadZoneActive : ''}`}
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                        >
                            <Upload size={28} className={styles.uploadIcon} />
                            <span style={{ fontWeight: 500 }}>点击或拖拽上传 SBML 文件</span>
                            <span className={styles.uploadHint}>支持 .xml / .sbml 格式</span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xml,.sbml"
                                onChange={handleFileInput}
                                style={{ display: 'none' }}
                            />
                        </div>
                        {file && (
                            <div className={styles.fileChip}>
                                📄 {file.name}
                                <span className={styles.fileChipClear} onClick={() => {
                                    setFile(null); setModelSummary(null); setModelToken('');
                                    setUploadError(''); setTaskResult(null); setActiveTaskId(null);
                                }}>✕</span>
                            </div>
                        )}
                        {uploading && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                <span className="spinner" style={{ width: 14, height: 14 }} /> 解析模型中...
                            </div>
                        )}
                        {uploadError && (
                            <div className={styles.errorMessage} style={{ marginTop: '0.5rem' }}>{uploadError}</div>
                        )}
                    </Card>

                    {/* Step 2: Curation Config */}
                    <Card title="② 配置校正操作">
                        <div className={styles.paramGroup}>
                            <label className={styles.paramLabel}>数据库</label>
                            <select
                                className={styles.paramSelect}
                                value={database}
                                onChange={e => setDatabase(e.target.value)}
                            >
                                {DATABASES.map(db => (
                                    <option key={db.value} value={db.value}>{db.label}</option>
                                ))}
                            </select>
                            {currentDb && (
                                <span className={styles.hint}>示例 ID: {currentDb.hint}</span>
                            )}
                        </div>

                        <div className={styles.paramGroup}>
                            <label className={styles.paramLabel}>操作类型</label>
                            <div className={styles.stepTabs}>
                                {OPERATIONS.map(op => {
                                    const Icon = op.icon;
                                    return (
                                        <button
                                            key={op.value}
                                            className={`${styles.stepTab} ${operation === op.value ? styles.stepTabActive : ''}`}
                                            onClick={() => setOperation(op.value)}
                                            title={op.hint}
                                        >
                                            <Icon size={12} />
                                            {op.label.replace('添加', '')}
                                        </button>
                                    );
                                })}
                            </div>
                            {currentOp && (
                                <span className={styles.hint}>{currentOp.hint}</span>
                            )}
                        </div>

                        {currentOp?.value !== 'add_crossreferences' && (
                            <div className={styles.paramGroup}>
                                <label className={styles.paramLabel}>标识符列表（每行一个）</label>
                                <textarea
                                    className={styles.paramTextarea}
                                    value={items}
                                    onChange={e => setItems(e.target.value)}
                                    placeholder={currentOp?.placeholder}
                                    rows={5}
                                />
                            </div>
                        )}
                    </Card>

                    {/* Submit */}
                    <button
                        className={styles.submitBtn}
                        onClick={handleSubmit}
                        disabled={!modelToken || submitting || (activeTaskId && ['pending', 'running'].includes(taskStatus))}
                    >
                        {submitting ? (
                            <><span className="spinner" /> 提交中...</>
                        ) : (activeTaskId && ['pending', 'running'].includes(taskStatus)) ? (
                            <><span className="spinner" /> 任务运行中...</>
                        ) : (
                            <><Play size={15} /> {currentOp?.label || '运行校正'}</>
                        )}
                    </button>

                    {/* Task Lookup */}
                    <Card title="任务查询">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label className={styles.paramLabel}>
                                <Search size={12} style={{ verticalAlign: -2 }} /> 通过 Task ID 查询
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

                    {/* Model summary after upload */}
                    {modelSummary && !taskResult && (
                        <Card title={`模型概览 — ${modelSummary.id || modelSummary.filename}`}>
                            <ModelSummaryCards summary={modelSummary} />

                            {/* Table tabs */}
                            <div className={styles.tableTabs}>
                                {[['reactions', '反应'], ['metabolites', '代谢物'], ['genes', '基因']].map(([key, label]) => (
                                    <button
                                        key={key}
                                        className={`${styles.tableTab} ${tableTab === key ? styles.tableTabActive : ''}`}
                                        onClick={() => setTableTab(key)}
                                    >
                                        {label} ({modelSummary[`num_${key}`]})
                                    </button>
                                ))}
                            </div>

                            <div className={styles.tableWrap}>
                                {tableTab === 'reactions' && (
                                    <table className={styles.dataTable}>
                                        <thead><tr><th>ID</th><th>名称</th><th>GPR</th><th>反应式（简）</th></tr></thead>
                                        <tbody>
                                            {(modelSummary.reactions || []).map((r, i) => (
                                                <tr key={i}>
                                                    <td><code>{r.id}</code></td>
                                                    <td>{r.name || '—'}</td>
                                                    <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{r.gpr || '—'}</td>
                                                    <td style={{ maxWidth: 180 }}>{r.formula}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                {tableTab === 'metabolites' && (
                                    <table className={styles.dataTable}>
                                        <thead><tr><th>ID</th><th>名称</th><th>化学式</th><th>电荷</th><th>隔室</th></tr></thead>
                                        <tbody>
                                            {(modelSummary.metabolites || []).map((m, i) => (
                                                <tr key={i}>
                                                    <td><code>{m.id}</code></td>
                                                    <td>{m.name || '—'}</td>
                                                    <td>{m.formula || '—'}</td>
                                                    <td>{m.charge ?? '—'}</td>
                                                    <td>{m.compartment || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                {tableTab === 'genes' && (
                                    <table className={styles.dataTable}>
                                        <thead><tr><th>ID</th><th>名称</th></tr></thead>
                                        <tbody>
                                            {(modelSummary.genes || []).map((g, i) => (
                                                <tr key={i}>
                                                    <td><code>{g.id}</code></td>
                                                    <td>{g.name || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                            <div className={styles.tableFooter}>
                                显示前 200 条 / 共 {modelSummary[`num_${tableTab}`] ?? '?'} 条
                            </div>
                        </Card>
                    )}

                    {/* Active task card */}
                    {activeTaskId && (
                        <div className={styles.taskCard}>
                            <div className={styles.taskHeader}>
                                <span className={styles.taskTitle}>当前任务</span>
                                <span className={`${styles.statusBadge} ${STATUS_CLASS[taskStatus] || ''}`}>
                                    {taskStatus === 'running' && <span className="spinner" style={{ width: 11, height: 11 }} />}
                                    {STATUS_LABEL[taskStatus] || taskStatus}
                                </span>
                            </div>
                            <div className={styles.taskIdRow}>
                                <span className={styles.taskIdLabel}>ID:</span>
                                <span className={styles.taskIdValue}>{activeTaskId}</span>
                                <button className={styles.copyBtn} onClick={handleCopy}>
                                    <ClipboardCopy size={11} /> {copyFeedback ? '已复制' : '复制'}
                                </button>
                            </div>
                            {['pending', 'running'].includes(taskStatus) && (
                                <div className={styles.taskMeta}>
                                    ⏳ CobraMod 正在从 {database} 数据库下载数据并执行校正，请稍候...
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {taskError && (
                        <div className={styles.errorMessage}>{taskError}</div>
                    )}

                    {/* Waiting spinner */}
                    {activeTaskId && ['pending', 'running'].includes(taskStatus) && (
                        <div className={styles.waitingState}>
                            <div className="spinner" style={{ width: 36, height: 36 }} />
                            <div className={styles.waitingMessage}>CobraMod 校正运行中...</div>
                            <div className={styles.waitingHint}>
                                正在从 {database} 数据库下载数据并进行质量检查（化学式验证、质量平衡、非零通量能力检测）
                            </div>
                        </div>
                    )}

                    {/* Results */}
                    {taskResult && (
                        <>
                            {/* Diff stats */}
                            <Card title="校正对比">
                                <div className={styles.diffGrid}>
                                    <DiffCard
                                        label="反应"
                                        before={taskResult.before?.num_reactions}
                                        after={taskResult.after?.num_reactions}
                                        delta={taskResult.diff?.reactions_added ?? 0}
                                    />
                                    <DiffCard
                                        label="代谢物"
                                        before={taskResult.before?.num_metabolites}
                                        after={taskResult.after?.num_metabolites}
                                        delta={taskResult.diff?.metabolites_added ?? 0}
                                    />
                                    <DiffCard
                                        label="基因"
                                        before={taskResult.before?.num_genes}
                                        after={taskResult.after?.num_genes}
                                        delta={taskResult.diff?.genes_added ?? 0}
                                    />
                                </div>

                                {/* FBA comparison */}
                                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                    <div className={styles.fbaRow}>
                                        <Activity size={14} />
                                        <span>校正前 FBA:</span>
                                        <span className={styles.fbaValue}>
                                            {taskResult.before?.fba_value != null ? taskResult.before.fba_value.toFixed(4) : 'N/A'}
                                        </span>
                                    </div>
                                    <div className={styles.fbaRow}>
                                        <Activity size={14} />
                                        <span>校正后 FBA:</span>
                                        <span className={styles.fbaValue}>
                                            {taskResult.after?.fba_value != null ? taskResult.after.fba_value.toFixed(4) : taskResult.after?.fba_status || 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                {/* Download */}
                                {downloadUrl && (
                                    <a className={styles.downloadBtn} href={downloadUrl} download={taskResult.curated_filename || 'curated_model.xml'}>
                                        <Download size={15} /> 下载校正后模型 (.xml)
                                    </a>
                                )}
                            </Card>

                            {/* Errors from curation */}
                            {taskResult.errors?.length > 0 && (
                                <Card title={`操作警告 (${taskResult.errors.length} 项)`}>
                                    <div className={styles.errorList}>
                                        {taskResult.errors.slice(0, 20).map((e, i) => (
                                            <div key={i} className={styles.errorListItem}>
                                                <span>⚠️</span>
                                                <span>{e}</span>
                                            </div>
                                        ))}
                                        {taskResult.errors.length > 20 && (
                                            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                                ...还有 {taskResult.errors.length - 20} 项警告
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            )}

                            {/* Log output */}
                            {taskResult.log && (
                                <Card title="运行日志">
                                    <pre className={styles.logBox}>{taskResult.log}</pre>
                                </Card>
                            )}
                        </>
                    )}

                    {/* Empty state */}
                    {!modelSummary && !activeTaskId && !taskError && !uploading && (
                        <div className={styles.emptyState}>
                            <FlaskConical size={52} className={styles.emptyIcon} />
                            <div style={{ fontWeight: 600, fontSize: '1rem' }}>上传 SBML 模型开始校正</div>
                            <div style={{ maxWidth: 340, lineHeight: 1.6 }}>
                                CobraMod 支持从 KEGG、BiGG、BioCyc 数据库自动获取代谢通路信息，
                                执行质量检查（质量平衡、化学式验证、非零通量检测）并导出校正后的模型
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
