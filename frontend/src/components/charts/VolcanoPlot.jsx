import Plot from './Plot';

export default function VolcanoPlot({ genes, log2fc, pvalues, fcThreshold = 1, pvalueThreshold = 0.05 }) {
    if (!genes || genes.length === 0) return null;

    const negLog10P = pvalues.map((p) => -Math.log10(Math.max(p, 1e-300)));

    // Classify points
    const upIdx = [], downIdx = [], nsIdx = [];
    genes.forEach((_, i) => {
        if (log2fc[i] >= fcThreshold && pvalues[i] < pvalueThreshold) upIdx.push(i);
        else if (log2fc[i] <= -fcThreshold && pvalues[i] < pvalueThreshold) downIdx.push(i);
        else nsIdx.push(i);
    });

    const pick = (arr, indices) => indices.map((i) => arr[i]);

    const traces = [
        {
            x: pick(log2fc, nsIdx), y: pick(negLog10P, nsIdx), text: pick(genes, nsIdx),
            mode: 'markers', type: 'scatter', name: 'Not Significant',
            marker: { color: 'rgba(148,163,184,0.4)', size: 5 },
            hovertemplate: '<b>%{text}</b><br>log2FC: %{x:.3f}<br>-log10(p): %{y:.2f}<extra></extra>',
        },
        {
            x: pick(log2fc, upIdx), y: pick(negLog10P, upIdx), text: pick(genes, upIdx),
            mode: 'markers', type: 'scatter', name: `Up (${upIdx.length})`,
            marker: { color: '#ef4444', size: 6 },
            hovertemplate: '<b>%{text}</b><br>log2FC: %{x:.3f}<br>-log10(p): %{y:.2f}<extra></extra>',
        },
        {
            x: pick(log2fc, downIdx), y: pick(negLog10P, downIdx), text: pick(genes, downIdx),
            mode: 'markers', type: 'scatter', name: `Down (${downIdx.length})`,
            marker: { color: '#3b82f6', size: 6 },
            hovertemplate: '<b>%{text}</b><br>log2FC: %{x:.3f}<br>-log10(p): %{y:.2f}<extra></extra>',
        },
    ];

    const maxX = Math.max(Math.abs(Math.min(...log2fc)), Math.abs(Math.max(...log2fc))) * 1.1;
    const maxY = Math.max(...negLog10P) * 1.1;

    const layout = {
        xaxis: { title: 'log₂(Fold Change)', range: [-maxX, maxX], zeroline: true, gridcolor: 'rgba(148,163,184,0.1)' },
        yaxis: { title: '-log₁₀(P-value)', range: [0, maxY], gridcolor: 'rgba(148,163,184,0.1)' },
        shapes: [
            { type: 'line', x0: fcThreshold, x1: fcThreshold, y0: 0, y1: maxY, line: { color: 'rgba(148,163,184,0.3)', dash: 'dash' } },
            { type: 'line', x0: -fcThreshold, x1: -fcThreshold, y0: 0, y1: maxY, line: { color: 'rgba(148,163,184,0.3)', dash: 'dash' } },
            { type: 'line', x0: -maxX, x1: maxX, y0: -Math.log10(pvalueThreshold), y1: -Math.log10(pvalueThreshold), line: { color: 'rgba(148,163,184,0.3)', dash: 'dash' } },
        ],
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
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
