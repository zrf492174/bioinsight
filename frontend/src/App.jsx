import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import Dashboard from './pages/Dashboard';
import DiffAnalysis from './pages/DiffAnalysis';
import Clustering from './pages/Clustering';
import AgentChat from './pages/AgentChat';
import GOEnrichment from './pages/GOEnrichment';
import KEGGEnrichment from './pages/KEGGEnrichment';
import HeatmapPage from './pages/HeatmapPage';
import PPIPage from './pages/PPIPage';
import GeneConvert from './pages/GeneConvert';
import MetabolismPage from './pages/MetabolismPage';
import MetabolicMapPage from './pages/MetabolicMapPage';

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-layout">
                <Sidebar />
                <div className="main-content">
                    <Header />
                    <div className="page-content">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/diff-analysis" element={<DiffAnalysis />} />
                            <Route path="/go-enrichment" element={<GOEnrichment />} />
                            <Route path="/kegg-enrichment" element={<KEGGEnrichment />} />
                            <Route path="/heatmap" element={<HeatmapPage />} />
                            <Route path="/clustering" element={<Clustering />} />
                            <Route path="/ppi" element={<PPIPage />} />
                            <Route path="/gene-convert" element={<GeneConvert />} />
                            <Route path="/metabolism" element={<MetabolismPage />} />
                            <Route path="/metabolic-map" element={<MetabolicMapPage />} />
                            <Route path="/agent" element={<AgentChat />} />
                        </Routes>
                    </div>
                </div>
            </div>
        </BrowserRouter>
    );
}
