import { useLocation } from 'react-router-dom';
import styles from './Header.module.css';

const pageTitles = {
    '/': 'Dashboard',
    '/diff-analysis': '差异表达分析',
    '/go-enrichment': 'GO 富集分析',
    '/kegg-enrichment': 'KEGG 富集分析',
    '/heatmap': '热图绘制',
    '/clustering': '聚类分析',
    '/ppi': 'PPI 分析',
    '/gene-convert': '基因名转换',
    '/metabolism': '代谢建模',
    '/agent': 'AI Agent',
};

export default function Header() {
    const { pathname } = useLocation();
    const title = pageTitles[pathname] || 'BioInsight';

    return (
        <header className={styles.header}>
            <div className={styles.headerLeft}>
                <h1 className={styles.pageTitle}>{title}</h1>
            </div>
            <div className={styles.statusBadge}>
                <span className={styles.statusDot}></span>
                系统在线
            </div>
        </header>
    );
}
