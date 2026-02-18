import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    GitCompareArrows,
    Workflow,
    Bot,
    FlaskConical,
    Route,
    Grid3X3,
    Network,
    ArrowLeftRight,
    Beaker,
    Map,
} from 'lucide-react';
import styles from './Sidebar.module.css';

const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
];

const analysisItems = [
    { path: '/diff-analysis', icon: GitCompareArrows, label: '差异表达分析' },
    { path: '/go-enrichment', icon: FlaskConical, label: 'GO 富集分析' },
    { path: '/kegg-enrichment', icon: Route, label: 'KEGG 富集分析' },
    { path: '/heatmap', icon: Grid3X3, label: '热图绘制' },
    { path: '/clustering', icon: Workflow, label: '聚类分析' },
    { path: '/ppi', icon: Network, label: 'PPI 分析' },
    { path: '/gene-convert', icon: ArrowLeftRight, label: '基因名转换' },
    { path: '/metabolism', icon: Beaker, label: '代谢建模' },
    { path: '/metabolic-map', icon: Map, label: '代谢网络图' },
];

const aiItems = [
    { path: '/agent', icon: Bot, label: 'AI Agent' },
];

export default function Sidebar() {
    return (
        <aside className={styles.sidebar}>
            <div className={styles.logo}>
                <span className={styles.logoIcon}>🧬</span>
                <span className={styles.logoText}>BioInsight</span>
            </div>

            <nav className={styles.nav}>
                {navItems.map(({ path, icon: Icon, label }) => (
                    <NavLink
                        key={path}
                        to={path}
                        end={path === '/'}
                        className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                    >
                        <span className={styles.navIcon}><Icon size={18} /></span>
                        <span className={styles.navLabel}>{label}</span>
                    </NavLink>
                ))}

                <div className={styles.sectionLabel}>分析模块</div>
                {analysisItems.map(({ path, icon: Icon, label }) => (
                    <NavLink
                        key={path}
                        to={path}
                        className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                    >
                        <span className={styles.navIcon}><Icon size={18} /></span>
                        <span className={styles.navLabel}>{label}</span>
                    </NavLink>
                ))}

                <div className={styles.sectionLabel}>AI 助手</div>
                {aiItems.map(({ path, icon: Icon, label }) => (
                    <NavLink
                        key={path}
                        to={path}
                        className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                    >
                        <span className={styles.navIcon}><Icon size={18} /></span>
                        <span className={styles.navLabel}>{label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className={styles.versionTag}>BioInsight v0.2.0</div>
        </aside>
    );
}
