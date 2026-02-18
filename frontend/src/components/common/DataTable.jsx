import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import styles from './DataTable.module.css';

export default function DataTable({ columns, data, pageSize = 20, downloadFilename = 'results.csv' }) {
    const [search, setSearch] = useState('');
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState('asc');
    const [page, setPage] = useState(0);

    // Filter
    const filtered = useMemo(() => {
        if (!search) return data;
        const q = search.toLowerCase();
        return data.filter((row) =>
            columns.some((col) => String(row[col.key] ?? '').toLowerCase().includes(q))
        );
    }, [data, search, columns]);

    // Sort
    const sorted = useMemo(() => {
        if (!sortCol) return filtered;
        return [...filtered].sort((a, b) => {
            const va = a[sortCol] ?? '';
            const vb = b[sortCol] ?? '';
            const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [filtered, sortCol, sortDir]);

    // Paginate
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

    const handleSort = (key) => {
        if (sortCol === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortCol(key);
            setSortDir('asc');
        }
        setPage(0);
    };

    const handleDownload = () => {
        const header = columns.map((c) => c.label).join(',');
        const rows = data.map((row) => columns.map((c) => row[c.key] ?? '').join(','));
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadFilename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const SortIndicator = ({ colKey }) => {
        if (sortCol !== colKey) return <ArrowUpDown size={12} className={styles.sortIcon} />;
        return sortDir === 'asc'
            ? <ArrowUp size={12} className={styles.sortIcon} />
            : <ArrowDown size={12} className={styles.sortIcon} />;
    };

    return (
        <div className={styles.tableContainer}>
            <div className={styles.toolbar}>
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="搜索..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                />
                <button className={styles.downloadBtn} onClick={handleDownload}>
                    <Download size={14} /> 导出 CSV
                </button>
            </div>

            <table className={styles.table}>
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th key={col.key} onClick={() => handleSort(col.key)}>
                                {col.label} <SortIndicator colKey={col.key} />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {paged.map((row, i) => (
                        <tr key={i}>
                            {columns.map((col) => (
                                <td key={col.key}>
                                    {col.render ? col.render(row[col.key], row) : (
                                        typeof row[col.key] === 'number' ? row[col.key].toFixed(col.decimals ?? 4) : row[col.key]
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className={styles.pagination}>
                <span>
                    显示 {page * pageSize + 1}-{Math.min((page + 1) * pageSize, sorted.length)} / 共 {sorted.length} 条
                </span>
                <div className={styles.paginationBtns}>
                    <button className={styles.pageBtn} disabled={page === 0} onClick={() => setPage(0)}>
                        首页
                    </button>
                    <button className={styles.pageBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>
                        上一页
                    </button>
                    <button className={styles.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                        下一页
                    </button>
                    <button className={styles.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
                        末页
                    </button>
                </div>
            </div>
        </div>
    );
}
