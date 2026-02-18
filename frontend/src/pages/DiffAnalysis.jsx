import { useState } from 'react';
import { Play, TrendingUp, TrendingDown, Minus, Database } from 'lucide-react';
import FileUploader from '../components/common/FileUploader';
import DataTable from '../components/common/DataTable';
import Card, { StatCard } from '../components/common/Card';
import VolcanoPlot from '../components/charts/VolcanoPlot';
import { runDiffAnalysis } from '../api/client';
import styles from './DiffAnalysis.module.css';

const resultColumns = [
    { key: 'gene', label: '基因' },
    { key: 'log2fc', label: 'Log2FC', decimals: 3 },
    { key: 'pvalue', label: 'P-value', decimals: 6 },
    { key: 'fdr', label: 'FDR', decimals: 6 },
    {
        key: 'status', label: '状态',
        render: (val) => (
            <span className={`badge ${val === 'Up' ? 'badge-up' : val === 'Down' ? 'badge-down' : 'badge-neutral'}`}>
                {val}
            </span>
        )
    },
];

export default function DiffAnalysis() {
    const [exprFile, setExprFile] = useState(null);
    const [sampleFile, setSampleFile] = useState(null);
    const [controlGroup, setControlGroup] = useState('');
    const [treatmentGroup, setTreatmentGroup] = useState('');
    const [fcThreshold, setFcThreshold] = useState(1.0);
    const [pvalueThreshold, setPvalueThreshold] = useState(0.05);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const loadSampleData = async () => {
        try {
            const [exprRes, sampleRes] = await Promise.all([
                fetch('/sample_data/expression_matrix.csv'),
                fetch('/sample_data/sample_info.csv'),
            ]);
            const exprBlob = await exprRes.blob();
            const sampleBlob = await sampleRes.blob();
            setExprFile(new File([exprBlob], 'expression_matrix.csv', { type: 'text/csv' }));
            setSampleFile(new File([sampleBlob], 'sample_info.csv', { type: 'text/csv' }));
            setControlGroup('control');
            setTreatmentGroup('treatment');
        } catch (e) {
            setError('加载示例数据失败: ' + e.message);
        }
    };

    const handleRun = async () => {
        if (!exprFile || !sampleFile) {
            setError('请上传表达矩阵和分组信息文件');
            return;
        }
        if (!controlGroup || !treatmentGroup) {
            setError('请填写对照组和实验组名称');
            return;
        }

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const res = await runDiffAnalysis(exprFile, sampleFile, controlGroup, treatmentGroup, fcThreshold, pvalueThreshold);
            const data = res.data;

            // Build table data
            const tableData = data.genes.map((gene, i) => {
                const fc = data.log2fc[i];
                const fdr = data.fdr[i];
                let status = 'NS';
                if (fc >= fcThreshold && fdr < pvalueThreshold) status = 'Up';
                else if (fc <= -fcThreshold && fdr < pvalueThreshold) status = 'Down';
                return { gene, log2fc: fc, pvalue: data.pvalues[i], fdr, status };
            });

            setResult({ ...data, tableData });
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <h2 className="page-title">差异表达分析</h2>
            <p className="page-subtitle">
                上传表达矩阵和分组信息，识别差异表达基因。
                <button className={`btn btn-ghost ${styles.sampleDataBtn}`} onClick={loadSampleData}>
                    <Database size={14} /> 加载示例数据
                </button>
            </p>

            {/* File Upload */}
            <div className={styles.uploadSection}>
                <Card title="表达矩阵">
                    <FileUploader
                        label="CSV/TSV - 行=基因, 列=样本"
                        file={exprFile}
                        onFileLoaded={setExprFile}
                        onClear={() => setExprFile(null)}
                    />
                </Card>
                <Card title="分组信息">
                    <FileUploader
                        label="CSV - 需包含 sample 和 group 列"
                        file={sampleFile}
                        onFileLoaded={setSampleFile}
                        onClear={() => setSampleFile(null)}
                    />
                </Card>
            </div>

            {/* Parameters */}
            <Card title="分析参数" className={styles.paramsCard}>
                <div className={styles.paramsGrid}>
                    <div className="form-group">
                        <label className="form-label">对照组名称</label>
                        <input className="form-input" value={controlGroup} onChange={(e) => setControlGroup(e.target.value)} placeholder="如: control" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">实验组名称</label>
                        <input className="form-input" value={treatmentGroup} onChange={(e) => setTreatmentGroup(e.target.value)} placeholder="如: treatment" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">|log2FC| 阈值</label>
                        <input className="form-input" type="number" step="0.1" value={fcThreshold} onChange={(e) => setFcThreshold(parseFloat(e.target.value))} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">FDR 阈值</label>
                        <input className="form-input" type="number" step="0.01" value={pvalueThreshold} onChange={(e) => setPvalueThreshold(parseFloat(e.target.value))} />
                    </div>
                </div>
                <button className={`btn btn-primary ${styles.runBtn}`} onClick={handleRun} disabled={loading}>
                    {loading ? <><span className="spinner"></span> 分析中...</> : <><Play size={16} /> 运行分析</>}
                </button>
            </Card>

            {error && <div className={styles.errorMsg}>{error}</div>}

            {/* Results */}
            {result && (
                <div className={styles.resultsSection}>
                    <div className={styles.summaryRow}>
                        <StatCard title="上调基因" icon={<TrendingUp size={14} />} value={result.summary.up_regulated} label={`|log2FC| ≥ ${fcThreshold} & FDR < ${pvalueThreshold}`} color="var(--accent-red)" />
                        <StatCard title="下调基因" icon={<TrendingDown size={14} />} value={result.summary.down_regulated} label={`|log2FC| ≥ ${fcThreshold} & FDR < ${pvalueThreshold}`} color="var(--accent-blue)" />
                        <StatCard title="不显著" icon={<Minus size={14} />} value={result.summary.not_significant} label="未通过阈值筛选" color="var(--text-muted)" />
                    </div>

                    <Card title="火山图" className={styles.chartCard}>
                        <VolcanoPlot
                            genes={result.genes}
                            log2fc={result.log2fc}
                            pvalues={result.fdr}
                            fcThreshold={fcThreshold}
                            pvalueThreshold={pvalueThreshold}
                        />
                    </Card>

                    <Card title="差异基因列表">
                        <DataTable columns={resultColumns} data={result.tableData} downloadFilename="deg_results.csv" />
                    </Card>
                </div>
            )}
        </div>
    );
}
