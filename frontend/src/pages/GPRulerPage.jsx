import { useState, useEffect, useCallback } from 'react';
import { Play, Search, Upload, AlertTriangle, Dna, Users, ClipboardCopy, Settings2, ChevronDown, ChevronUp, Table2, Download, Globe, FileCode2 } from 'lucide-react';
import Card, { StatCard } from '../components/common/Card';
import { submitGPRulerTask, getGPRulerTaskStatus } from '../api/client';
import styles from './GPRulerPage.module.css';

const MODEL_PRESETS = [
    { value: 'custom', label: '自定义 (上传 SBML)' },
    { value: 'HMRcore', label: 'HMRcore (Human)' },
    { value: 'Recon3', label: 'Recon 3D (Human)' },
    { value: 'Yeast7', label: 'Yeast 7' },
    { value: 'Yeast8', label: 'Yeast 8' },
];

const COMMON_ORGANISMS = [
    { name: 'Homo sapiens', code: 'hsa', label: '人类 (Homo sapiens)' },
    { name: 'Mus musculus', code: 'mmu', label: '小鼠 (Mus musculus)' },
    { name: 'Saccharomyces cerevisiae', code: 'sce', label: '酿酒酵母 (S. cerevisiae)' },
    { name: 'Escherichia coli', code: 'eco', label: '大肠杆菌 (E. coli)' },
    { name: 'Rattus norvegicus', code: 'rno', label: '大鼠 (Rattus norvegicus)' },
];

export default function GPRulerPage() {
    // Mode state
    const [mode, setMode] = useState('sbml');

    // SBML mode state
    const [file, setFile] = useState(null);
    const [modelName, setModelName] = useState('MyModel');

    // Organism mode state
    const [selectedOrganism, setSelectedOrganism] = useState('');
    const [customOrganism, setCustomOrganism] = useState('');
    const [keggCode, setKeggCode] = useState('');
    const [orgModelName, setOrgModelName] = useState('MyOrgModel');

    // Task state
    const [activeTaskId, setActiveTaskId] = useState(null);
    const [taskStatus, setTaskStatus] = useState(null);
    const [taskResult, setTaskResult] = useState(null);
    const [taskError, setTaskError] = useState('');

    // Lookup
    const [lookupId, setLookupId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState(false);

    // Results
    const [ruleFilter, setRuleFilter] = useState('');
    const [showOnlyWithRules, setShowOnlyWithRules] = useState(false);

    // ── Handle file ──
    const handleFileChange = (e) => {
        const f = e.target.files?.[0];
        if (f) setFile(f);
    };

    // ── Handle organism preset ──
    const handleOrganismSelect = (e) => {
        const val = e.target.value;
        setSelectedOrganism(val);
        if (val) {
            const org = COMMON_ORGANISMS.find(o => o.code === val);
            if (org) {
                setKeggCode(org.code);
                setCustomOrganism(org.name);
            }
        }
    };

    // ── Submit ──
    const handleSubmit = async () => {
        setTaskError('');
        setTaskResult(null);
        setTaskStatus(null);
        setSubmitting(true);

        try {
            if (mode === 'sbml') {
                if (!file) {
                    setTaskError('请上传 SBML 模型文件 (.xml)');
                    setSubmitting(false);
                    return;
                }
                const res = await submitGPRulerTask('sbml', file, {
                    model_name: modelName,
                });
                setActiveTaskId(res.data.task_id);
                setTaskStatus('pending');
            } else {
                if (!keggCode) {
                    setTaskError('请提供 KEGG 生物体代码');
                    setSubmitting(false);
                    return;
                }
                const res = await submitGPRulerTask('organism', null, {
                    model_name: orgModelName,
                    organism_name: customOrganism,
                    kegg_code: keggCode,
                });
                setActiveTaskId(res.data.task_id);
                setTaskStatus('pending');
            }
        } catch (e) {
            setTaskError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    // ── Lookup ──
    const handleLookup = async () => {
        const tid = lookupId.trim();
        if (!tid) return;
        setTaskError('');
        setTaskResult(null);
        setTaskStatus(null);
        try {
            const res = await getGPRulerTaskStatus(tid);
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

    // ── Poll ──
    useEffect(() => {
        let timer;
        if (activeTaskId && (taskStatus === 'pending' || taskStatus === 'running')) {
            const poll = async () => {
                try {
                    const res = await getGPRulerTaskStatus(activeTaskId);
                    const task = res.data;
                    setTaskStatus(task.status);
                    if (task.status === 'completed') {
                        setTaskResult(task.result);
                    } else if (task.status === 'failed') {
                        setTaskError(task.error || '任务处理失败');
                    }
                } catch (e) {
                    console.error('GPRuler poll error:', e);
                }
            };
            timer = setInterval(poll, 5000);
        }
        return () => clearInterval(timer);
    }, [activeTaskId, taskStatus]);

    // ── Copy ID ──
    const handleCopy = useCallback(() => {
        if (activeTaskId) {
            navigator.clipboard.writeText(activeTaskId);
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 2000);
        }
    }, [activeTaskId]);

    // ── Export CSV ──
    const handleExportCSV = () => {
        if (!taskResult?.rules) return;
        const header = 'Reaction ID\tGPR Rule\tGenes\n';
        const rows = taskResult.rules.map(r =>
            `${r.reaction_id}\t${r.gpr_rule}\t${r.genes || ''}`
        ).join('\n');
        const blob = new Blob([header + rows], { type: 'text/tab-separated-values' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${taskResult.model_name || 'GPRuler'}_gprRules.tsv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Filtered rules ──
    const filteredRules = taskResult?.rules?.filter(r => {
        if (showOnlyWithRules && (!r.gpr_rule || r.gpr_rule === 'nan' || r.gpr_rule === '')) return false;
        if (ruleFilter) {
            const q = ruleFilter.toLowerCase();
            return r.reaction_id.toLowerCase().includes(q) || r.gpr_rule.toLowerCase().includes(q);
        }
        return true;
    }) || [];

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
            <h2 className="page-title">GPR 规则重建</h2>
            <p className="page-subtitle">
                基于 GPRuler 自动重建代谢网络的 Gene-Protein-Reaction 规则
            </p>

            {/* Info banner */}
            <div className={styles.noticeBanner}>
                <AlertTriangle size={18} className={styles.noticeIcon} />
                <div>
                    <strong>网络要求：</strong>GPRuler 需要访问 UniProt、STRING、KEGG、ComplexPortal 等外部数据库。
                    运行时间可能较长（数分钟至数小时），取决于基因数量。
                    &nbsp;
                    <a href="https://github.com/qLSLab/GPRuler" target="_blank" rel="noopener noreferrer"
                       style={{ color: '#fbbf24' }}>
                        GPRuler GitHub
                    </a>
                </div>
            </div>

            <div className={styles.grid}>
                {/* ─── Left: Control Panel ─── */}
                <div className={styles.controlPanel}>
                    {/* Mode selector */}
                    <Card title="分析模式">
                        <div className={styles.modeSelector}>
                            <button
                                className={`${styles.modeBtn} ${mode === 'sbml' ? styles.modeBtnActive : ''}`}
                                onClick={() => setMode('sbml')}
                            >
                                <FileCode2 size={16} />
                                从 SBML 模型
                            </button>
                            <button
                                className={`${styles.modeBtn} ${mode === 'organism' ? styles.modeBtnActive : ''}`}
                                onClick={() => setMode('organism')}
                            >
                                <Globe size={16} />
                                从生物体名称
                            </button>
                        </div>
                    </Card>

                    {mode === 'sbml' ? (
                        <>
                            <Card title="上传 SBML 模型">
                                <div className={styles.uploadArea}>
                                    <label className={styles.uploadLabel}>
                                        <Upload size={28} />
                                        <span>选择 SBML 模型文件</span>
                                        <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            支持 .xml 格式的 SBML 代谢模型
                                        </span>
                                        <input
                                            type="file"
                                            accept=".xml,.sbml"
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

                            <Card title="参数设置">
                                <div className={styles.paramGroup}>
                                    <label className={styles.paramLabel}>模型名称 (输出文件前缀)</label>
                                    <input
                                        className={styles.paramInput}
                                        value={modelName}
                                        onChange={e => setModelName(e.target.value)}
                                        placeholder="MyModel"
                                    />
                                </div>
                            </Card>
                        </>
                    ) : (
                        <Card title="生物体信息">
                            <div className={styles.paramGroup}>
                                <label className={styles.paramLabel}>常见生物体</label>
                                <select
                                    className="form-select"
                                    value={selectedOrganism}
                                    onChange={handleOrganismSelect}
                                >
                                    <option value="">-- 选择生物体 --</option>
                                    {COMMON_ORGANISMS.map(o => (
                                        <option key={o.code} value={o.code}>{o.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles.paramGroup}>
                                <label className={styles.paramLabel}>生物体名称</label>
                                <input
                                    className={styles.paramInput}
                                    value={customOrganism}
                                    onChange={e => setCustomOrganism(e.target.value)}
                                    placeholder="e.g. Homo sapiens"
                                />
                            </div>

                            <div className={styles.paramGroup}>
                                <label className={styles.paramLabel}>KEGG 生物体代码 <span style={{ color: 'var(--accent-pink)' }}>*</span></label>
                                <input
                                    className={styles.paramInput}
                                    value={keggCode}
                                    onChange={e => setKeggCode(e.target.value)}
                                    placeholder="e.g. hsa, mmu, sce"
                                />
                            </div>

                            <div className={styles.paramGroup}>
                                <label className={styles.paramLabel}>模型名称 (输出文件前缀)</label>
                                <input
                                    className={styles.paramInput}
                                    value={orgModelName}
                                    onChange={e => setOrgModelName(e.target.value)}
                                    placeholder="MyOrgModel"
                                />
                            </div>
                        </Card>
                    )}

                    <button
                        className={styles.submitBtn}
                        onClick={handleSubmit}
                        disabled={submitting || (activeTaskId && ['pending', 'running'].includes(taskStatus))}
                    >
                        {submitting ? (
                            <><span className="spinner"></span> 提交中...</>
                        ) : (activeTaskId && ['pending', 'running'].includes(taskStatus)) ? (
                            <><span className="spinner"></span> 任务进行中...</>
                        ) : (
                            <><Play size={16} /> 提交 GPRuler 任务</>
                        )}
                    </button>

                    {/* Task ID lookup */}
                    <Card title="任务查询">
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
                    {/* Active task */}
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
                                    ⏳ GPRuler 正在运行，需要从多个数据库获取数据，可能需要数分钟至数小时。您可以复制任务 ID 后关闭页面，稍后查询。
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {taskError && (
                        <div className={styles.errorMessage}>
                            {taskError}
                        </div>
                    )}

                    {/* Waiting */}
                    {activeTaskId && ['pending', 'running'].includes(taskStatus) && (
                        <div className={styles.waitingState}>
                            <div className="spinner" style={{ width: 36, height: 36 }}></div>
                            <div className={styles.waitingMessage}>GPRuler 分析正在后台运行...</div>
                            <div className={styles.waitingHint}>
                                正在从 UniProt / STRING / KEGG / ComplexPortal 获取数据并生成 GPR 规则
                            </div>
                        </div>
                    )}

                    {/* Results */}
                    {taskResult && (
                        <>
                            <div className={styles.statGrid}>
                                <StatCard
                                    title="反应总数"
                                    icon={<Dna size={18} color="var(--accent-purple)" strokeWidth={2} />}
                                    value={taskResult.num_reactions || 0}
                                    label="代谢反应"
                                    color="var(--accent-purple)"
                                />
                                <StatCard
                                    title="GPR 规则数"
                                    icon={<Dna size={18} color="var(--accent-pink)" strokeWidth={2} />}
                                    value={taskResult.num_rules_with_gpr || 0}
                                    label="含 GPR 规则的反应"
                                    color="var(--accent-pink)"
                                />
                                <StatCard
                                    title="模型名称"
                                    icon={<FileCode2 size={18} color="#3b82f6" strokeWidth={2} />}
                                    value={taskResult.model_name || '-'}
                                    label="GPRuler 输出"
                                    color="#3b82f6"
                                />
                            </div>

                            {/* Rules table */}
                            <Card title="GPR 规则结果" className={styles.chartCard}>
                                <div className={styles.tableToolbar}>
                                    <div className={styles.filterRow}>
                                        <Search size={14} />
                                        <input
                                            className={styles.filterInput}
                                            placeholder="搜索反应 ID 或规则..."
                                            value={ruleFilter}
                                            onChange={e => setRuleFilter(e.target.value)}
                                        />
                                    </div>
                                    <label className={styles.filterCheck}>
                                        <input
                                            type="checkbox"
                                            checked={showOnlyWithRules}
                                            onChange={e => setShowOnlyWithRules(e.target.checked)}
                                        />
                                        仅显示有规则的反应
                                    </label>
                                    <button className={styles.exportBtn} onClick={handleExportCSV}>
                                        <Download size={14} /> 导出 TSV
                                    </button>
                                </div>

                                <div className={styles.tableWrap}>
                                    <table className={styles.dataTable}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: 50 }}>#</th>
                                                <th>Reaction ID</th>
                                                <th>GPR Rule</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRules.slice(0, 200).map((r, i) => (
                                                <tr key={i}>
                                                    <td className={styles.rowNum}>{i + 1}</td>
                                                    <td className={styles.rxnId}>{r.reaction_id}</td>
                                                    <td className={styles.gprRule}>
                                                        {r.gpr_rule && r.gpr_rule !== 'nan' ? (
                                                            <code>{r.gpr_rule}</code>
                                                        ) : (
                                                            <span className={styles.noRule}>—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className={styles.tableFooter}>
                                    显示 {Math.min(filteredRules.length, 200)} / {filteredRules.length} 条结果
                                    {filteredRules.length > 200 && '（仅显示前 200 条）'}
                                </div>
                            </Card>
                        </>
                    )}

                    {/* Empty state */}
                    {!activeTaskId && !taskError && !taskResult && (
                        <div className={styles.emptyState}>
                            <Dna size={48} className={styles.emptyIcon} />
                            <div>选择模式并提交 GPRuler 分析任务</div>
                            <div style={{ fontSize: '0.82rem' }}>
                                自动重建代谢反应的 Gene-Protein-Reaction (GPR) 布尔逻辑规则
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
