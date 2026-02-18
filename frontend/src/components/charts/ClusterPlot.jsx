import Plot from './Plot';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function ClusterPlot({ coords, labels, sampleNames }) {
    if (!coords || coords.length === 0) return null;

    const uniqueLabels = [...new Set(labels)];
    const traces = uniqueLabels.map((label, idx) => {
        const indices = labels.map((l, i) => l === label ? i : -1).filter((i) => i >= 0);
        return {
            x: indices.map((i) => coords[i][0]),
            y: indices.map((i) => coords[i][1]),
            text: indices.map((i) => sampleNames[i]),
            mode: 'markers',
            type: 'scatter',
            name: `Cluster ${label}`,
            marker: { color: COLORS[idx % COLORS.length], size: 10, opacity: 0.8 },
            hovertemplate: '<b>%{text}</b><br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>',
        };
    });

    const layout = {
        xaxis: { title: 'Dimension 1', gridcolor: 'rgba(148,163,184,0.1)' },
        yaxis: { title: 'Dimension 2', gridcolor: 'rgba(148,163,184,0.1)' },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#94a3b8', family: 'Inter, sans-serif' },
        legend: { bgcolor: 'rgba(17,24,39,0.8)', bordercolor: 'rgba(148,163,184,0.2)', borderwidth: 1 },
        margin: { l: 60, r: 20, t: 20, b: 60 },
        hovermode: 'closest',
    };

    return (
        <Plot
            data={traces}
            layout={layout}
            useResizeHandler
            style={{ width: '100%', height: '450px' }}
            config={{ displayModeBar: true, displaylogo: false }}
        />
    );
}
