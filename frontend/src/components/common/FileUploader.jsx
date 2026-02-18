import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import Papa from 'papaparse';
import styles from './FileUploader.module.css';

export default function FileUploader({ label, accept = '.csv,.tsv,.txt', onFileLoaded, file, onClear }) {
    const [dragOver, setDragOver] = useState(false);
    const [preview, setPreview] = useState(null);
    const inputRef = useRef(null);

    const handleFile = useCallback((f) => {
        if (!f) return;

        // Parse preview (first 5 rows)
        Papa.parse(f, {
            preview: 6, // header + 5 rows
            complete: (results) => {
                if (results.data && results.data.length > 0) {
                    setPreview({
                        headers: results.data[0],
                        rows: results.data.slice(1, 6),
                    });
                }
            },
        });

        onFileLoaded(f);
    }, [onFileLoaded]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        handleFile(f);
    }, [handleFile]);

    const handleClear = () => {
        setPreview(null);
        onClear();
        if (inputRef.current) inputRef.current.value = '';
    };

    const formatSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div>
            {label && <label className="form-label">{label}</label>}

            {!file ? (
                <div
                    className={`${styles.uploader} ${dragOver ? styles.dragOver : ''}`}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                >
                    <div className={styles.uploaderIcon}>
                        <Upload size={32} />
                    </div>
                    <div className={styles.uploaderTitle}>点击或拖拽文件到此处</div>
                    <div className={styles.uploaderHint}>支持 CSV, TSV 格式</div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept={accept}
                        className={styles.uploaderInput}
                        onChange={(e) => handleFile(e.target.files[0])}
                    />
                </div>
            ) : (
                <div className={styles.fileInfo}>
                    <FileText size={18} />
                    <span className={styles.fileName}>{file.name}</span>
                    <span className={styles.fileSize}>{formatSize(file.size)}</span>
                    <button className={styles.removeBtn} onClick={handleClear}>
                        <X size={16} />
                    </button>
                </div>
            )}

            {preview && (
                <div className={styles.preview}>
                    <table>
                        <thead>
                            <tr>
                                {preview.headers.map((h, i) => (
                                    <th key={i}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {preview.rows.map((row, i) => (
                                <tr key={i}>
                                    {row.map((cell, j) => (
                                        <td key={j}>{cell}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
