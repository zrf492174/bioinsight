"""BioInsight API — FastAPI Application Entry Point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import diff_analysis, clustering, go_enrichment, kegg_enrichment, heatmap, ppi, gene_convert, metabolism, single_cell, spatial, compass, agent

app = FastAPI(
    title="BioInsight API",
    description="Bioinformatics analysis platform API",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(diff_analysis.router)
app.include_router(clustering.router)
app.include_router(go_enrichment.router)
app.include_router(kegg_enrichment.router)
app.include_router(heatmap.router)
app.include_router(ppi.router)
app.include_router(gene_convert.router)
app.include_router(metabolism.router)
app.include_router(single_cell.router)
app.include_router(spatial.router)
app.include_router(compass.router)
app.include_router(agent.router)


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "BioInsight API", "version": "0.2.0"}
