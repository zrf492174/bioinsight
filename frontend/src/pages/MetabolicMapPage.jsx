import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import {
    Search, ZoomIn, ZoomOut, Maximize, Download, Play, X, Map as MapIcon,
    Circle, Hexagon, GitBranch, Filter, RotateCcw, Info,
    Settings, Upload, FlaskConical, ChevronDown
} from 'lucide-react';
import Card from '../components/common/Card';
import {
    getNetworkData, getNetworkDataWithFlux,
    getModelInfo, uploadModel
} from '../api/client';
import styles from './MetabolicMapPage.module.css';

const LAYOUTS = [
    { id: 'cose', label: 'Force-Directed (CoSE)' },
    { id: 'circle', label: 'Circle' },
    { id: 'breadthfirst', label: 'Breadth-First' },
    { id: 'grid', label: 'Grid' },
    { id: 'concentric', label: 'Concentric' },
];

const LAYOUT_OPTIONS = {
    cose: {
        name: 'cose',
        animate: false,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 60,
        edgeElasticity: () => 100,
        nestingFactor: 1.2,
        gravity: 0.25,
        numIter: 500,
        padding: 40,
    },
    circle: { name: 'circle', padding: 40, animate: false },
    breadthfirst: { name: 'breadthfirst', directed: true, padding: 40, animate: false, spacingFactor: 1.2 },
    grid: { name: 'grid', padding: 40, animate: false, condense: true },
    concentric: {
        name: 'concentric',
        padding: 40,
        animate: false,
        concentric: (node) => node.degree(),
        levelWidth: () => 2,
    },
};

/* ── Cytoscape style sheet ── */
function getCyStylesheet(hasFlux) {
    return [
        // Metabolite nodes
        {
            selector: 'node[type="metabolite"]',
            style: {
                'shape': 'ellipse',
                'width': 22,
                'height': 22,
                'background-color': '#10b981',
                'border-width': 1.5,
                'border-color': '#065f46',
                'label': 'data(label)',
                'font-size': 8,
                'color': '#94a3b8',
                'text-valign': 'bottom',
                'text-margin-y': 4,
                'text-max-width': 80,
                'text-wrap': 'ellipsis',
                'min-zoomed-font-size': 6,
            },
        },
        // Reaction nodes
        {
            selector: 'node[type="reaction"]',
            style: {
                'shape': 'round-rectangle',
                'width': 28,
                'height': 16,
                'background-color': '#6366f1',
                'border-width': 1.5,
                'border-color': '#3730a3',
                'label': 'data(label)',
                'font-size': 7,
                'color': '#94a3b8',
                'text-valign': 'bottom',
                'text-margin-y': 4,
                'text-max-width': 90,
                'text-wrap': 'ellipsis',
                'min-zoomed-font-size': 5,
            },
        },
        // Exchange reaction nodes
        {
            selector: 'node[?is_exchange]',
            style: {
                'shape': 'diamond',
                'background-color': '#f59e0b',
                'border-color': '#92400e',
            },
        },
        // Objective reaction
        {
            selector: 'node[?is_objective]',
            style: {
                'background-color': '#ec4899',
                'border-color': '#9d174d',
                'width': 34,
                'height': 20,
                'border-width': 2.5,
            },
        },
        // Edges
        {
            selector: 'edge',
            style: {
                'width': 1,
                'line-color': 'rgba(100, 116, 139, 0.35)',
                'target-arrow-color': 'rgba(100, 116, 139, 0.35)',
                'target-arrow-shape': 'triangle',
                'arrow-scale': 0.6,
                'curve-style': 'bezier',
            },
        },
        // Selected node
        {
            selector: 'node:selected',
            style: {
                'border-width': 3,
                'border-color': '#facc15',
                'overlay-color': '#facc15',
                'overlay-opacity': 0.08,
            },
        },
        // Highlighted (search match)
        {
            selector: 'node.highlighted',
            style: {
                'border-width': 3,
                'border-color': '#facc15',
                'background-opacity': 1,
                'z-index': 999,
            },
        },
        {
            selector: 'node.dimmed',
            style: {
                'opacity': 0.15,
            },
        },
        {
            selector: 'edge.dimmed',
            style: {
                'opacity': 0.06,
            },
        },
        // Flux-colored reactions (positive)
        ...(hasFlux ? [{
            selector: 'node[type="reaction"][flux > 0]',
            style: {
                'background-color': 'mapData(flux, 0, 20, #6366f1, #34d399)',
                'width': 'mapData(flux, 0, 20, 28, 48)',
                'height': 'mapData(flux, 0, 20, 16, 24)',
            },
        }, {
            selector: 'node[type="reaction"][flux < 0]',
            style: {
                'background-color': 'mapData(flux, -20, 0, #f87171, #6366f1)',
                'width': 'mapData(flux, -20, 0, 48, 28)',
                'height': 'mapData(flux, -20, 0, 24, 16)',
            },
        }] : []),
    ];
}

export default function MetabolicMapPage() {
    const cyRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Data
    const [networkData, setNetworkData] = useState(null);
    const [hasFlux, setHasFlux] = useState(false);
    const [fbaObjValue, setFbaObjValue] = useState(null);

    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [layout, setLayout] = useState('cose');
    const [selectedNode, setSelectedNode] = useState(null);
    const [subsystemFilter, setSubsystemFilter] = useState('');
    const [fbaLoading, setFbaLoading] = useState(false);

    // Model config state
    const [modelFile, setModelFile] = useState(null);
    const [modelData, setModelData] = useState(null);
    const [modelSource, setModelSource] = useState('builtin');
    const [modelLoading, setModelLoading] = useState(false);
    const [objectiveId, setObjectiveId] = useState('');
    const [mediumEdits, setMediumEdits] = useState({});
    const [showConfig, setShowConfig] = useState(false);
    const [showMedium, setShowMedium] = useState(false);

    // Load built-in model info + network on mount
    useEffect(() => {
        loadBuiltinModel();
        loadNetwork();
    }, []);

    // ── Model config handlers ──
    const loadBuiltinModel = async () => {
        setModelLoading(true);
        try {
            const res = await getModelInfo();
            setModelData(res.data);
            setModelFile(null);
            setModelSource('builtin');
            setObjectiveId(res.data.info.objective_reaction || '');
            initMedium(res.data.exchanges);
        } catch (e) { setError(e.message); }
        finally { setModelLoading(false); }
    };

    const handleUploadSBML = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setModelLoading(true); setError('');
        try {
            const res = await uploadModel(file);
            setModelData(res.data);
            setModelFile(file);
            setModelSource('uploaded');
            setObjectiveId(res.data.info.objective_reaction || '');
            initMedium(res.data.exchanges);
            // Reload network with new model
            loadNetworkWithModel(file, res.data.info.objective_reaction || '');
        } catch (e) { setError(e.message); }
        finally { setModelLoading(false); }
    };

    const initMedium = (exchanges) => {
        const m = {};
        exchanges.forEach(ex => { if (ex.in_medium) m[ex.id] = ex.uptake_rate; });
        setMediumEdits(m);
    };

    const toggleMedium = (exId, uptake) => {
        setMediumEdits(prev => {
            const next = { ...prev };
            if (next[exId] !== undefined) delete next[exId];
            else next[exId] = uptake || 1000;
            return next;
        });
    };

    const updateMediumRate = (exId, value) => {
        setMediumEdits(prev => ({ ...prev, [exId]: parseFloat(value) || 0 }));
    };

    const getFile = () => modelSource === 'uploaded' ? modelFile : null;
    const getMediumObj = () => Object.keys(mediumEdits).length > 0 ? mediumEdits : null;

    // ── Network loading ──
    const loadNetwork = async () => {
        setLoading(true);
        setError('');
        setSelectedNode(null);
        setHasFlux(false);
        setFbaObjValue(null);
        try {
            const res = await getNetworkData();
            setNetworkData(res.data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const loadNetworkWithModel = async (file, objId) => {
        setLoading(true);
        setError('');
        setSelectedNode(null);
        setHasFlux(false);
        setFbaObjValue(null);
        try {
            const res = await getNetworkDataWithFlux(file, objId || null, null, false);
            setNetworkData(res.data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const runFbaOverlay = async () => {
        setFbaLoading(true);
        setError('');
        try {
            const medium = getMediumObj();
            const res = await getNetworkDataWithFlux(getFile(), objectiveId || null, medium, true);
            setNetworkData(res.data);
            setHasFlux(res.data.has_flux);
            setFbaObjValue(res.data.fba_objective_value);
        } catch (e) {
            setError(e.message);
        } finally {
            setFbaLoading(false);
        }
    };

    const clearFlux = () => {
        setHasFlux(false);
        setFbaObjValue(null);
        // Reload with current model config but no flux
        if (modelSource === 'uploaded' && modelFile) {
            loadNetworkWithModel(modelFile, objectiveId);
        } else {
            loadNetwork();
        }
    };

    // Build cytoscape elements from network data, applying subsystem filter
    const elements = useMemo(() => {
        if (!networkData) return [];

        let { nodes, edges } = networkData;

        // Filter by subsystem
        if (subsystemFilter) {
            const rxnNodeIds = new Set();
            const metNodeIds = new Set();

            nodes.forEach(n => {
                if (n.data.type === 'reaction' && n.data.subsystem === subsystemFilter) {
                    rxnNodeIds.add(n.data.id);
                }
            });

            edges.forEach(e => {
                if (rxnNodeIds.has(e.data.source)) metNodeIds.add(e.data.target);
                if (rxnNodeIds.has(e.data.target)) metNodeIds.add(e.data.source);
            });

            nodes = nodes.filter(n =>
                rxnNodeIds.has(n.data.id) || metNodeIds.has(n.data.id)
            );
            edges = edges.filter(e =>
                (rxnNodeIds.has(e.data.source) || rxnNodeIds.has(e.data.target)) &&
                nodes.some(n => n.data.id === e.data.source) &&
                nodes.some(n => n.data.id === e.data.target)
            );
        }

        return [...nodes, ...edges];
    }, [networkData, subsystemFilter]);

    // Apply layout
    const applyLayout = useCallback((layoutName) => {
        const cy = cyRef.current;
        if (!cy) return;
        const options = LAYOUT_OPTIONS[layoutName] || LAYOUT_OPTIONS.cose;
        cy.layout(options).run();
    }, []);

    // Handle layout change
    const handleLayoutChange = (e) => {
        const val = e.target.value;
        setLayout(val);
        setTimeout(() => applyLayout(val), 100);
    };

    // Search
    useEffect(() => {
        const cy = cyRef.current;
        if (!cy) return;

        cy.elements().removeClass('highlighted dimmed');
        if (!searchQuery.trim()) return;

        const q = searchQuery.toLowerCase();
        const matched = cy.nodes().filter(n => {
            const label = (n.data('label') || '').toLowerCase();
            const id = (n.data('reaction_id') || n.data('metabolite_id') || '').toLowerCase();
            return label.includes(q) || id.includes(q);
        });

        if (matched.length > 0) {
            cy.elements().addClass('dimmed');
            matched.removeClass('dimmed').addClass('highlighted');
            matched.connectedEdges().removeClass('dimmed');
            matched.neighborhood().nodes().removeClass('dimmed');
            cy.animate({ center: { eles: matched.first() }, zoom: 1.5, duration: 400 });
        }
    }, [searchQuery]);

    // Zoom controls
    const handleZoomIn = () => { if (cyRef.current) cyRef.current.zoom(cyRef.current.zoom() * 1.3); };
    const handleZoomOut = () => { if (cyRef.current) cyRef.current.zoom(cyRef.current.zoom() / 1.3); };
    const handleFit = () => { if (cyRef.current) cyRef.current.fit(undefined, 40); };

    // Export PNG
    const handleExport = () => {
        const cy = cyRef.current;
        if (!cy) return;
        const png64 = cy.png({ output: 'base64uri', bg: '#0f172a', full: true, scale: 2 });
        const link = document.createElement('a');
        link.href = png64;
        link.download = 'metabolic_network.png';
        link.click();
    };

    // cy callback — bind events directly, guarded by instance identity.
    // react-cytoscapejs calls this on every render with the SAME cy instance,
    // so we skip re-binding if the instance hasn't changed. NO state updates here.
    const handleCyRef = useCallback((cy) => {
        if (cyRef.current === cy) return; // same instance, already bound
        cyRef.current = cy;

        // Bind tap events for node detail panel
        cy.on('tap', 'node', (evt) => {
            setSelectedNode(evt.target.data());
        });
        cy.on('tap', (evt) => {
            if (evt.target === cy) setSelectedNode(null);
        });

        // Run initial layout
        setTimeout(() => {
            const opts = LAYOUT_OPTIONS['cose'];
            cy.layout(opts).run();
        }, 200);
    }, []);

    // elements is already computed via useMemo above
    const nodeCount = networkData ? networkData.nodes.length : 0;
    const edgeCount = networkData ? networkData.edges.length : 0;
    const metCount = networkData ? networkData.nodes.filter(n => n.data.type === 'metabolite').length : 0;
    const rxnCount = networkData ? networkData.nodes.filter(n => n.data.type === 'reaction').length : 0;

    return (
        <div className={styles.page}>
            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.title}><MapIcon size={18} /> 代谢网络图</div>
                <span className={styles.divider}></span>

                {/* Search */}
                <div className={styles.searchBox}>
                    <Search size={14} />
                    <input
                        placeholder="搜索反应/代谢物..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <X size={14} style={{ cursor: 'pointer', color: '#94a3b8' }}
                            onClick={() => setSearchQuery('')} />
                    )}
                </div>

                <span className={styles.divider}></span>

                {/* Layout */}
                <select className={styles.layoutSelect} value={layout} onChange={handleLayoutChange}>
                    {LAYOUTS.map(l => (
                        <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                </select>

                {/* Subsystem filter */}
                {networkData?.subsystems?.length > 0 && (
                    <select
                        className={styles.subsystemSelect}
                        value={subsystemFilter}
                        onChange={(e) => setSubsystemFilter(e.target.value)}
                    >
                        <option value="">全部子系统</option>
                        {networkData.subsystems.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                )}

                <span className={styles.divider}></span>

                {/* FBA overlay */}
                {!hasFlux ? (
                    <button
                        className={`${styles.toolBtn} ${styles.toolBtnPrimary}`}
                        onClick={runFbaOverlay}
                        disabled={fbaLoading || loading}
                    >
                        {fbaLoading ? (
                            <><span className="spinner" style={{ width: 12, height: 12 }}></span> 计算中...</>
                        ) : (
                            <><Play size={12} /> FBA 通量着色</>
                        )}
                    </button>
                ) : (
                    <button className={styles.toolBtn} onClick={clearFlux}>
                        <RotateCcw size={12} /> 清除通量
                    </button>
                )}

                {/* Config toggle */}
                <button
                    className={`${styles.toolBtn} ${showConfig ? styles.toolBtnActive : ''}`}
                    onClick={() => setShowConfig(v => !v)}
                    title="模型配置"
                >
                    <Settings size={12} /> 配置
                    <ChevronDown size={10} style={{ transform: showConfig ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>

                {/* Export */}
                <button className={styles.toolBtn} onClick={handleExport} title="导出 PNG">
                    <Download size={12} /> PNG
                </button>

                {/* Reload */}
                <button className={styles.toolBtn} onClick={() => {
                    if (modelSource === 'uploaded' && modelFile) loadNetworkWithModel(modelFile, objectiveId);
                    else loadNetwork();
                }} title="重新加载">
                    <RotateCcw size={12} />
                </button>
            </div>

            {/* Config Panel */}
            {showConfig && (
                <div className={styles.configPanel}>
                    <div className={styles.configGrid}>
                        {/* Model Source */}
                        <div className={styles.configSection}>
                            <h4><Upload size={12} /> 模型来源</h4>
                            <div className={styles.modelBtns}>
                                <button
                                    className={`${styles.modelBtn} ${modelSource === 'builtin' ? styles.modelBtnActive : ''}`}
                                    onClick={() => { loadBuiltinModel(); loadNetwork(); }}
                                    disabled={modelLoading}
                                >
                                    <FlaskConical size={12} /> E. coli Core
                                </button>
                                <label className={styles.uploadLabel}>
                                    <Upload size={12} /> 上传 SBML
                                    <input
                                        type="file"
                                        accept=".xml,.sbml"
                                        onChange={handleUploadSBML}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                            </div>
                            {modelData && (
                                <div className={styles.modelInfoLine}>
                                    <span className={styles.modelId}>{modelData.info.model_id}</span>
                                    <span>{modelData.info.num_reactions}R · {modelData.info.num_metabolites}M · {modelData.info.num_genes}G</span>
                                    {modelSource === 'uploaded' && <span className={styles.modelBadge}>自定义</span>}
                                </div>
                            )}
                        </div>

                        {/* Objective Function */}
                        <div className={styles.configSection}>
                            <h4><Settings size={12} /> 目标函数</h4>
                            <select
                                className={styles.configSelect}
                                value={objectiveId}
                                onChange={(e) => setObjectiveId(e.target.value)}
                            >
                                <option value="">-- 默认目标函数 --</option>
                                {modelData?.reactions?.map(r => (
                                    <option key={r.id} value={r.id}>
                                        {r.id} — {r.name} {r.is_objective ? '(当前)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Medium Conditions */}
                        {modelData?.exchanges && (
                            <div className={styles.mediumArea}>
                                <button
                                    className={styles.mediumToggle}
                                    onClick={() => setShowMedium(v => !v)}
                                >
                                    <FlaskConical size={12} /> 培养基条件
                                    <ChevronDown size={10} style={{ transform: showMedium ? 'rotate(180deg)' : 'none' }} />
                                </button>
                                {showMedium && (
                                    <div className={styles.mediumTableWrap}>
                                        <table className={styles.mediumTable}>
                                            <thead>
                                                <tr>
                                                    <th>启用</th>
                                                    <th>Exchange ID</th>
                                                    <th>名称</th>
                                                    <th>摄取速率</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {modelData.exchanges.map(ex => {
                                                    const active = mediumEdits[ex.id] !== undefined;
                                                    return (
                                                        <tr key={ex.id} className={active ? styles.mediumActive : ''}>
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={active}
                                                                    onChange={() => toggleMedium(ex.id, ex.uptake_rate)}
                                                                />
                                                            </td>
                                                            <td><code>{ex.id}</code></td>
                                                            <td>{ex.name}</td>
                                                            <td>
                                                                {active ? (
                                                                    <input
                                                                        type="number"
                                                                        className={styles.rateInput}
                                                                        value={mediumEdits[ex.id]}
                                                                        onChange={(e) => updateMediumRate(ex.id, e.target.value)}
                                                                        step="0.1"
                                                                    />
                                                                ) : (
                                                                    <span className={styles.rateDisabled}>—</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {error && <div className={styles.errorMsg}>{error}</div>}

            {/* Main content */}
            <div className={styles.content}>
                <div className={styles.cyContainer}>
                    {loading && (
                        <div className={styles.loadingOverlay}>
                            <div className={styles.spinner}></div>
                            <div className={styles.text}>加载代谢网络数据...</div>
                        </div>
                    )}

                    {/* Stats */}
                    {networkData && (
                        <div className={styles.statsBar}>
                            <div className={`${styles.statChip} ${styles.statChipMet}`}>
                                <Circle size={10} /> {metCount} 代谢物
                            </div>
                            <div className={`${styles.statChip} ${styles.statChipRxn}`}>
                                <Hexagon size={10} /> {rxnCount} 反应
                            </div>
                            <div className={`${styles.statChip} ${styles.statChipEdge}`}>
                                <GitBranch size={10} /> {edgeCount} 连接
                            </div>
                            {hasFlux && fbaObjValue != null && (
                                <div className={`${styles.statChip} ${styles.statChipFlux}`}>
                                    <Play size={10} /> 目标值: {fbaObjValue}
                                </div>
                            )}
                        </div>
                    )}

                    {elements.length > 0 && (
                        <CytoscapeComponent
                            elements={elements}
                            stylesheet={getCyStylesheet(hasFlux)}
                            layout={LAYOUT_OPTIONS[layout]}
                            className={styles.cyCanvas}
                            style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
                            cy={handleCyRef}
                            wheelSensitivity={0.3}
                        />
                    )}

                    {/* Zoom controls */}
                    <div className={styles.zoomControls}>
                        <button className={styles.zoomBtn} onClick={handleZoomIn} title="放大"><ZoomIn size={16} /></button>
                        <button className={styles.zoomBtn} onClick={handleZoomOut} title="缩小"><ZoomOut size={16} /></button>
                        <button className={styles.zoomBtn} onClick={handleFit} title="适应"><Maximize size={16} /></button>
                    </div>

                    {/* Legend */}
                    <div className={styles.legend}>
                        <div className={styles.legendTitle}>图例</div>
                        <div className={styles.legendItem}>
                            <div className={styles.legendDot} style={{ background: '#10b981' }}></div>
                            代谢物
                        </div>
                        <div className={styles.legendItem}>
                            <div className={styles.legendRect} style={{ background: '#6366f1' }}></div>
                            反应
                        </div>
                        <div className={styles.legendItem}>
                            <div className={styles.legendDot} style={{ background: '#f59e0b', transform: 'rotate(45deg)', borderRadius: 2 }}></div>
                            Exchange 反应
                        </div>
                        <div className={styles.legendItem}>
                            <div className={styles.legendRect} style={{ background: '#ec4899' }}></div>
                            目标函数
                        </div>
                        {hasFlux && (
                            <>
                                <div className={styles.legendItem}>
                                    <div className={styles.legendRect} style={{ background: 'linear-gradient(90deg, #f87171, #6366f1, #34d399)' }}></div>
                                    通量 (负→正)
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Detail panel */}
                {selectedNode && (
                    <div className={styles.detailPanel}>
                        <div className={styles.detailHeader}>
                            <h3>
                                <Info size={14} />
                                {selectedNode.type === 'reaction' ? '反应详情' : '代谢物详情'}
                            </h3>
                            <button className={styles.detailCloseBtn} onClick={() => setSelectedNode(null)}>
                                <X size={14} />
                            </button>
                        </div>
                        <div className={styles.detailBody}>
                            {selectedNode.type === 'reaction' ? (
                                <>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>反应 ID</span>
                                        <span className={styles.fieldValue}><code>{selectedNode.reaction_id}</code></span>
                                    </div>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>名称</span>
                                        <span className={styles.fieldValue}>{selectedNode.reaction_name}</span>
                                    </div>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>类型</span>
                                        <span className={styles.fieldValue}>
                                            <span className={`${styles.detailBadge} ${styles.badgeReaction}`}>反应</span>
                                            {selectedNode.is_exchange && <span className={`${styles.detailBadge} ${styles.badgeExchange}`} style={{ marginLeft: 4 }}>Exchange</span>}
                                            {selectedNode.is_objective && <span className={`${styles.detailBadge} ${styles.badgeObjective}`} style={{ marginLeft: 4 }}>目标函数</span>}
                                        </span>
                                    </div>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>反应方程</span>
                                        <span className={styles.fieldValue}>{selectedNode.reaction_string}</span>
                                    </div>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>子系统</span>
                                        <span className={styles.fieldValue}>{selectedNode.subsystem || '—'}</span>
                                    </div>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>通量范围</span>
                                        <span className={styles.fieldValue}>[{selectedNode.lower_bound}, {selectedNode.upper_bound}]</span>
                                    </div>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>可逆性</span>
                                        <span className={styles.fieldValue}>{selectedNode.reversible ? '可逆' : '不可逆'}</span>
                                    </div>
                                    {selectedNode.gene_rule && (
                                        <div className={styles.detailField}>
                                            <span className={styles.fieldLabel}>基因规则</span>
                                            <span className={styles.fieldValue}><code>{selectedNode.gene_rule}</code></span>
                                        </div>
                                    )}
                                    {selectedNode.flux !== undefined && (
                                        <div className={styles.detailField}>
                                            <span className={styles.fieldLabel}>FBA 通量</span>
                                            <span className={`${styles.fieldValue} ${styles.fluxValue} ${selectedNode.flux > 0.001 ? styles.fluxPositive : selectedNode.flux < -0.001 ? styles.fluxNegative : styles.fluxZero}`}>
                                                {selectedNode.flux.toFixed(4)}
                                            </span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>代谢物 ID</span>
                                        <span className={styles.fieldValue}><code>{selectedNode.metabolite_id}</code></span>
                                    </div>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>名称</span>
                                        <span className={styles.fieldValue}>{selectedNode.label}</span>
                                    </div>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>类型</span>
                                        <span className={styles.fieldValue}>
                                            <span className={`${styles.detailBadge} ${styles.badgeMetabolite}`}>代谢物</span>
                                        </span>
                                    </div>
                                    <div className={styles.detailField}>
                                        <span className={styles.fieldLabel}>区室</span>
                                        <span className={styles.fieldValue}>{selectedNode.compartment || '—'}</span>
                                    </div>
                                    {selectedNode.formula && (
                                        <div className={styles.detailField}>
                                            <span className={styles.fieldLabel}>化学式</span>
                                            <span className={styles.fieldValue}><code>{selectedNode.formula}</code></span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
