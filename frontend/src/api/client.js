const API_BASE = '/api';

async function apiFetch(url, options = {}) {
    const res = await fetch(`${API_BASE}${url}`, options);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message);
    return data;
}

/* ── Differential Analysis ── */
export async function runDiffAnalysis(exprFile, sampleFile, controlGroup, treatmentGroup, fcThreshold, pvalueThreshold) {
    const form = new FormData();
    form.append('expression_file', exprFile);
    form.append('sample_file', sampleFile);
    form.append('control_group', controlGroup);
    form.append('treatment_group', treatmentGroup);
    form.append('fc_threshold', fcThreshold);
    form.append('pvalue_threshold', pvalueThreshold);
    return apiFetch('/diff-analysis/run', { method: 'POST', body: form });
}

/* ── Clustering ── */
export async function runClustering(exprFile, k, doPCA) {
    const form = new FormData();
    form.append('expression_file', exprFile);
    form.append('k', k);
    form.append('do_pca', doPCA);
    return apiFetch('/clustering/run', { method: 'POST', body: form });
}

/* ── GO Enrichment ── */
export async function runGOEnrichment(geneList, pvalueCutoff = 0.05) {
    const form = new FormData();
    form.append('gene_list', geneList);
    form.append('pvalue_cutoff', pvalueCutoff);
    return apiFetch('/go-enrichment/run', { method: 'POST', body: form });
}

/* ── KEGG Enrichment ── */
export async function runKEGGEnrichment(geneList, pvalueCutoff = 0.05) {
    const form = new FormData();
    form.append('gene_list', geneList);
    form.append('pvalue_cutoff', pvalueCutoff);
    return apiFetch('/kegg-enrichment/run', { method: 'POST', body: form });
}

/* ── Heatmap ── */
export async function runHeatmap(exprFile, geneList, topN, normalize, clusterRows, clusterCols) {
    const form = new FormData();
    form.append('expression_file', exprFile);
    if (geneList) form.append('gene_list', geneList);
    form.append('top_n', topN);
    form.append('normalize', normalize);
    form.append('cluster_rows', clusterRows);
    form.append('cluster_cols', clusterCols);
    return apiFetch('/heatmap/run', { method: 'POST', body: form });
}

/* ── PPI ── */
export async function runPPI(geneList, species = 9606, scoreThreshold = 400, useDemo = true) {
    const form = new FormData();
    form.append('gene_list', geneList);
    form.append('species', species);
    form.append('score_threshold', scoreThreshold);
    form.append('use_demo', useDemo);
    return apiFetch('/ppi/run', { method: 'POST', body: form });
}

/* ── Gene Conversion ── */
export async function runGeneConvert(geneList, fromType = 'auto', useApi = false) {
    const form = new FormData();
    form.append('gene_list', geneList);
    form.append('from_type', fromType);
    form.append('use_api', useApi);
    return apiFetch('/gene-convert/run', { method: 'POST', body: form });
}

/* ── Metabolism (COBRApy) ── */
export async function getModelInfo() {
    return apiFetch('/metabolism/model-info');
}

export async function uploadModel(modelFile) {
    const form = new FormData();
    form.append('model_file', modelFile);
    return apiFetch('/metabolism/upload-model', { method: 'POST', body: form });
}

function _metabForm(modelFile, objectiveId, medium) {
    const form = new FormData();
    if (modelFile) form.append('model_file', modelFile);
    if (objectiveId) form.append('objective_id', objectiveId);
    if (medium) form.append('medium', JSON.stringify(medium));
    return form;
}

export async function runFBA(modelFile = null, objectiveId = null, medium = null) {
    return apiFetch('/metabolism/fba', { method: 'POST', body: _metabForm(modelFile, objectiveId, medium) });
}

export async function runFVA(fraction = 0.9, modelFile = null, objectiveId = null, medium = null) {
    const form = _metabForm(modelFile, objectiveId, medium);
    form.append('fraction', fraction);
    return apiFetch('/metabolism/fva', { method: 'POST', body: form });
}

export async function runKnockout(geneIds, modelFile = null, objectiveId = null, medium = null) {
    const form = _metabForm(modelFile, objectiveId, medium);
    form.append('gene_ids', geneIds);
    return apiFetch('/metabolism/knockout', { method: 'POST', body: form });
}

export async function runEssentialGenes(modelFile = null, objectiveId = null, medium = null) {
    return apiFetch('/metabolism/essential-genes', { method: 'POST', body: _metabForm(modelFile, objectiveId, medium) });
}

export async function getNetworkData() {
    return apiFetch('/metabolism/network-data');
}

export async function getNetworkDataWithFlux(modelFile = null, objectiveId = null, medium = null, runFbaOverlay = false) {
    const form = _metabForm(modelFile, objectiveId, medium);
    form.append('run_fba_overlay', runFbaOverlay);
    return apiFetch('/metabolism/network-data', { method: 'POST', body: form });
}

/* ── Health ── */
export async function checkHealth() {
    return apiFetch('/health');
}
