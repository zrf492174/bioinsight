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

/* ── Single Cell ── */
export async function runSingleCell(adataFile, nTopGenes, nPCs, resolution) {
    const form = new FormData();
    form.append('adata_file', adataFile);
    form.append('n_top_genes', nTopGenes);
    form.append('n_pcs', nPCs);
    form.append('resolution', resolution);
    return apiFetch('/single-cell/process', { method: 'POST', body: form });
}

/* ── Spatial ── */
export async function runSpatial(adataFile, targetGene = null) {
    const form = new FormData();
    form.append('adata_file', adataFile);
    if (targetGene) form.append('target_gene', targetGene);
    return apiFetch('/spatial/process', { method: 'POST', body: form });
}

/* ── Health ── */
export async function checkHealth() {
    return apiFetch('/health');
}

/* ── scFEA ── */
export async function runScfea(file, species = "human", isScImputation = false) {
    const form = new FormData();
    form.append('file', file);
    form.append('species', species);
    form.append('is_sc_imputation', isScImputation);
    return apiFetch('/metabolism/scfea', { method: 'POST', body: form });
}

/* ── Compass ── */
export async function submitCompassTask(file, species = "homo_sapiens", model = "RECON2_mat", options = {}) {
    const form = new FormData();
    form.append('file', file);
    form.append('species', species);
    form.append('model', model);
    if (options.num_processes) form.append('num_processes', options.num_processes);
    if (options.num_threads) form.append('num_threads', options.num_threads);
    if (options.microcluster_size) form.append('microcluster_size', options.microcluster_size);
    if (options.lambda_val !== undefined) form.append('lambda_val', options.lambda_val);
    if (options.calc_metabolites) form.append('calc_metabolites', options.calc_metabolites);
    if (options.test_mode) form.append('test_mode', options.test_mode);
    return apiFetch('/compass/submit', { method: 'POST', body: form });
}

export async function getCompassTaskStatus(taskId) {
    return apiFetch(`/compass/task/${taskId}`);
}

export async function listCompassTasks() {
    return apiFetch('/compass/tasks');
}

/* ── AI Agent ── */
export async function getAgentTools() {
    return apiFetch('/agent/tools');
}

/**
 * Stream an AI Agent chat via SSE.
 * @param {Array} messages  - [{role, content}, ...]
 * @param {string} botName  - Poe bot name
 * @param {object} callbacks - { onToken, onToolCall, onToolResult, onDone, onError }
 * @returns {AbortController} - call .abort() to cancel the stream
 */
export function streamAgentChat(messages, botName, callbacks = {}) {
    const { onToken, onToolCall, onToolResult, onDone, onError } = callbacks;
    const controller = new AbortController();

    (async () => {
        try {
            const res = await fetch(`${API_BASE}/agent/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages, bot_name: botName }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const err = await res.text();
                onError?.(err);
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // Parse SSE events from buffer
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let currentEvent = 'token';
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        switch (currentEvent) {
                            case 'token':
                                try { onToken?.(JSON.parse(data)); } catch { onToken?.(data); }
                                break;
                            case 'replace':
                                try { callbacks.onReplace?.(JSON.parse(data)); } catch { callbacks.onReplace?.(data); }
                                break;
                            case 'tool_call':
                                try { onToolCall?.(JSON.parse(data)); } catch {}
                                break;
                            case 'tool_result':
                                try { onToolResult?.(JSON.parse(data)); } catch {}
                                break;
                            case 'done':
                                onDone?.();
                                break;
                            case 'error':
                                onError?.(data);
                                break;
                        }
                        currentEvent = 'token';
                    }
                }
            }

            onDone?.();
        } catch (e) {
            if (e.name !== 'AbortError') {
                onError?.(e.message);
            }
        }
    })();

    return controller;
}

