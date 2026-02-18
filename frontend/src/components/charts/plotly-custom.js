/**
 * Custom Plotly bundle with the trace types we need.
 * Using plotly.js/lib/core + selective trace modules to keep bundle small
 * while supporting heatmap, scatter, and bar charts.
 */
import Plotly from 'plotly.js/lib/core';

// Register the trace types we need
import scatter from 'plotly.js/lib/scatter';
import bar from 'plotly.js/lib/bar';
import heatmap from 'plotly.js/lib/heatmap';

Plotly.register([scatter, bar, heatmap]);

export default Plotly;
