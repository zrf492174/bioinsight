import Plot from './Plot';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function PCAPlot({ coords, sampleNames, labels, explainedVariance, xAxisLabel, yAxisLabel, legendPrefix="Cluster " }) {
    if (!coords || coords.length === 0) return null;

    // Group by labels
    const uniqueLabels = [...new Set(labels)];
    
    // Sort labels to ensure consistent colors
    uniqueLabels.sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return a.toString().localeCompare(b.toString());
    });
    
    const xName = xAxisLabel || 'PC1';
    const yName = yAxisLabel || 'PC2';

    const traces = uniqueLabels.map((label, idx) => {
        const indices = labels.map((l, i) => l === label ? i : -1).filter((i) => i >= 0);
        return {
            x: indices.map((i) => coords[i][0]),
            y: indices.map((i) => coords[i][1]),
            text: indices.map((i) => sampleNames[i]),
            mode: 'markers+text',
            type: 'scatter',
            name: `${legendPrefix}${label}`,
            marker: { color: COLORS[idx % COLORS.length], size: 12, line: { color: 'rgba(255,255,255,0.3)', width: 1 } },
            textposition: 'top center',
            textfont: { size: 10, color: '#94a3b8' },
            hovertemplate: `<b>%{text}</b><br>${xName}: %{x:.3f}<br>${yName}: %{y:.3f}<extra></extra>`,
        };
    });

    const pc1Var = explainedVariance?.[0] ? ` (${(explainedVariance[0] * 100).toFixed(1)}%)` : '';
    const pc2Var = explainedVariance?.[1] ? ` (${(explainedVariance[1] * 100).toFixed(1)}%)` : '';

    const xTitle = `${xName}${pc1Var}`;
    const yTitle = `${yName}${pc2Var}`;

    const layout = {
        xaxis: { title: xTitle, gridcolor: 'rgba(148,163,184,0.1)', zeroline: true, zerolinecolor: 'rgba(148,163,184,0.2)' },
        yaxis: { title: yTitle, gridcolor: 'rgba(148,163,184,0.1)', zeroline: true, zerolinecolor: 'rgba(148,163,184,0.2)' },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#94a3b8', family: 'Inter, sans-serif' },
        legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(17,24,39,0.8)', bordercolor: 'rgba(148,163,184,0.2)', borderwidth: 1 },
        margin: { l: 60, r: 20, t: 20, b: 60 },
        hovermode: 'closest',
    };

    return (
        <Plot
            data={traces}
            layout={layout}
            useResizeHandler
            style={{ width: '100%', height: '500px' }}
            config={{ displayModeBar: true, displaylogo: false }}
        />
    );
}
