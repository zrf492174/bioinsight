import { Link } from 'react-router-dom';
import {
    GitCompareArrows, Workflow, Bot, BarChart3, FileText, Dna,
    FlaskConical, Route, Grid3X3, Network, ArrowLeftRight,
} from 'lucide-react';
import { StatCard } from '../components/common/Card';
import styles from './Dashboard.module.css';

const modules = [
    {
        path: '/diff-analysis',
        title: '差异表达分析',
        desc: '基于 t-test 与 Fold Change 识别差异表达基因，支持火山图可视化与 FDR 校正。',
        icon: <GitCompareArrows size={24} />,
        color: '#3b82f6',
        tags: ['t-test', 'Fold Change', 'BH 校正', '火山图'],
    },
    {
        path: '/go-enrichment',
        title: 'GO 富集分析',
        desc: '对差异基因进行 Gene Ontology 富集分析，支持气泡图可视化。',
        icon: <FlaskConical size={24} />,
        color: '#f59e0b',
        tags: ['Fisher 检验', 'BH 校正', '气泡图'],
    },
    {
        path: '/kegg-enrichment',
        title: 'KEGG 富集分析',
        desc: '基于 KEGG 通路数据库进行通路富集分析，支持柱状图展示。',
        icon: <Route size={24} />,
        color: '#ef4444',
        tags: ['KEGG 通路', '超几何检验', '柱状图'],
    },
    {
        path: '/heatmap',
        title: '热图绘制',
        desc: '绘制基因表达聚类热图，支持 Z-score 标准化与层次聚类。',
        icon: <Grid3X3 size={24} />,
        color: '#ec4899',
        tags: ['Z-score', '层次聚类', '自定义基因'],
    },
    {
        path: '/clustering',
        title: '聚类分析',
        desc: '使用 K-Means 对样本进行无监督聚类，支持 PCA 降维可视化。',
        icon: <Workflow size={24} />,
        color: '#10b981',
        tags: ['K-Means', 'PCA', '轮廓系数'],
    },
    {
        path: '/ppi',
        title: 'PPI 分析',
        desc: '蛋白质-蛋白质相互作用网络分析与可视化，支持 STRING 数据库。',
        icon: <Network size={24} />,
        color: '#06b6d4',
        tags: ['STRING', '网络图', '互作分析'],
    },
    {
        path: '/gene-convert',
        title: '基因名转换',
        desc: '在 Gene Symbol、Entrez ID 和 Ensembl ID 之间进行批量转换。',
        icon: <ArrowLeftRight size={24} />,
        color: '#8b5cf6',
        tags: ['Symbol', 'Entrez', 'Ensembl', '批量转换'],
    },
    {
        path: '/agent',
        title: 'AI Agent 交互',
        desc: '与 AI 助手对话，辅助分析结果解读、实验设计和文献调研。（即将上线）',
        icon: <Bot size={24} />,
        color: '#64748b',
        tags: ['对话式 AI', '结果解读', '即将上线'],
    },
];

export default function Dashboard() {
    return (
        <div className={styles.dashboard}>
            {/* Welcome Banner */}
            <div className={styles.welcomeBanner}>
                <h1 className={styles.welcomeTitle}>欢迎使用 BioInsight</h1>
                <p className={styles.welcomeSubtitle}>
                    一站式生物信息学分析平台，提供差异表达分析、富集分析、聚类分析等核心功能，
                    并将支持 AI 辅助分析。使用左侧导航栏开始你的分析之旅。
                </p>
            </div>

            {/* Quick Stats */}
            <div className={styles.statsRow}>
                <StatCard
                    title="分析模块"
                    icon={<Dna size={16} />}
                    value="8"
                    label="差异 / GO / KEGG / 热图 / 聚类 / PPI / 转换 / Agent"
                    color="var(--accent-blue)"
                />
                <StatCard
                    title="支持格式"
                    icon={<FileText size={16} />}
                    value="CSV / TSV"
                    label="标准表达矩阵格式"
                    color="var(--accent-cyan)"
                />
                <StatCard
                    title="可视化"
                    icon={<BarChart3 size={16} />}
                    value="7 种"
                    label="火山图 / 热图 / PCA / 聚类 / 气泡图 / 柱状图 / 网络图"
                    color="var(--accent-purple)"
                />
            </div>

            {/* Module Cards */}
            <h2 className={styles.modulesTitle}>功能模块</h2>
            <div className={styles.modulesGrid}>
                {modules.map((mod) => (
                    <Link key={mod.path} to={mod.path} className={styles.moduleCard}>
                        <div
                            className={styles.moduleIconWrap}
                            style={{ background: `${mod.color}15`, color: mod.color }}
                        >
                            {mod.icon}
                        </div>
                        <div className={styles.moduleCardTitle}>{mod.title}</div>
                        <div className={styles.moduleCardDesc}>{mod.desc}</div>
                        <div className={styles.moduleCardTags}>
                            {mod.tags.map((t) => (
                                <span key={t} className={styles.tag}>{t}</span>
                            ))}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
