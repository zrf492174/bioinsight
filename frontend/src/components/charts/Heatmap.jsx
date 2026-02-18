import Plot from './Plot';

export default function Heatmap({ zValues, geneNames, sampleNames }) {
    if (!zValues || zValues.length === 0) return null;

    const trace = {
        z: zValues,
        x: sampleNames,
        y: geneNames,
        type: 'heatmap',
        colorscale: [
            [0, '#3b82f6'],
            [0.5, '#f8fafc'],
            [1, '#ef4444'],
        ],
        hovertemplate: 'Gene: %{y}<br>Sample: %{x}<br>Z-score: %{z:.2f}<extra></extra>',
        colorbar: {
            title: { text: 'Z-score', font: { color: '#94a3b8' } },
            tickfont: { color: '#94a3b8' },
        },
    };

    const layout = {
        xaxis: {
            title: 'Samples',
            tickangle: -45,
            gridcolor: 'rgba(148,163,184,0.1)',
        },
        yaxis: {
            title: 'Genes',
            autorange: 'reversed',
            gridcolor: 'rgba(148,163,184,0.1)',
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#94a3b8', family: 'Inter, sans-serif', size: 10 },
        margin: { l: 100, r: 40, t: 20, b: 80 },
    };

    return (
        <Plot
            data={[trace]}
            layout={layout}
            useResizeHandler
            style={{ width: '100%', height: '500px' }}
            config={{ displayModeBar: true, displaylogo: false }}
        />
    );
}
