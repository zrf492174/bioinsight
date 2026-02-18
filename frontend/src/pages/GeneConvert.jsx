import { useState } from 'react';
import { Play, ArrowLeftRight, Database, CheckCircle, AlertCircle } from 'lucide-react';
import Card, { StatCard } from '../components/common/Card';
import DataTable from '../components/common/DataTable';
import { runGeneConvert } from '../api/client';
import styles from './GeneConvert.module.css';

const SAMPLE_GENES = 'TP53,BRCA1,EGFR,VEGFA,MYC,KRAS,AKT1,PTEN,RB1,CDK2,BCL2,CASP3,TNF,IL6,GAPDH';

const resultColumns = [
    { key: 'input', label: '输入' },
    { key: 'symbol', label: 'Symbol' },
    { key: 'entrez', label: 'Entrez ID' },
    { key: 'ensembl', label: 'Ensembl ID' },
    { key: 'name', label: '全名' },
    {
        key: 'status', label: '状态',
        render: (val) => (
            <span className={`badge ${val === 'found' ? 'badge-up' : 'badge-neutral'}`}>
                {val === 'found' ? '✓' : '✗'}
            </span>
        )
    },
];

export default function GeneConvert() {
    const [geneText, setGeneText] = useState('');
    const [fromType, setFromType] = useState('auto');
    const [useApi, setUseApi] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const handleRun = async () => {
        if (!geneText.trim()) { setError('请输入基因列表'); return; }
        setLoading(true); setError(''); setResult(null);
        try {
            const res = await runGeneConvert(geneText, fromType, useApi);
            setResult(res.data);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    return (
        <div className={styles.page}>
            <h2 className="page-title">基因名转换</h2>
            <p className="page-subtitle">
                在 Gene Symbol、Entrez ID、Ensembl ID 之间进行转换
                <button className={`btn btn-ghost ${styles.sampleBtn}`} onClick={() => setGeneText(SAMPLE_GENES)}>
                    <Database size={14} /> 示例基因
                </button>
            </p>

            <div className={styles.inputSection}>
                <Card title="基因列表">
                    <textarea
                        className={`form-textarea ${styles.geneInput}`}
                        placeholder="输入基因 ID，每行一个或用逗号分隔&#10;支持 Gene Symbol、Entrez ID、Ensembl ID"
                        value={geneText}
                        onChange={(e) => setGeneText(e.target.value)}
                    />
                </Card>
                <Card title="转换参数">
                    <div className={styles.paramsPanel}>
                        <div className="form-group">
                            <label className="form-label">输入 ID 类型</label>
                            <select className="form-select" value={fromType} onChange={(e) => setFromType(e.target.value)}>
                                <option value="auto">自动检测</option>
                                <option value="symbol">Gene Symbol</option>
                                <option value="entrez">Entrez ID</option>
                                <option value="ensembl">Ensembl ID</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">数据源</label>
                            <select className="form-select" value={useApi} onChange={(e) => setUseApi(e.target.value === 'true')}>
                                <option value="false">内置映射表 (Demo)</option>
                                <option value="true">MyGene.info API</option>
                            </select>
                        </div>
                        <button className={`btn btn-primary ${styles.runBtn}`} onClick={handleRun} disabled={loading}>
                            {loading ? <><span className="spinner"></span> 转换中...</> : <><Play size={16} /> 开始转换</>}
                        </button>
                    </div>
                </Card>
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            {result && (
                <div className={styles.resultsSection}>
                    <div className={styles.summaryRow}>
                        <StatCard title="已转换" icon={<CheckCircle size={14} />} value={result.summary.found} label={`/ ${result.summary.total} 个基因`} color="var(--accent-green)" />
                        <StatCard title="未找到" icon={<AlertCircle size={14} />} value={result.summary.not_found} label="无匹配结果" color="var(--accent-red)" />
                        <StatCard title="ID 类型" icon={<ArrowLeftRight size={14} />} value={result.summary.from_type} label={`数据源: ${result.summary.source}`} color="var(--accent-blue)" />
                    </div>

                    <Card title="转换结果">
                        <DataTable columns={resultColumns} data={result.results} downloadFilename="gene_conversion.csv" />
                    </Card>
                </div>
            )}
        </div>
    );
}
