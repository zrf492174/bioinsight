# BioInsight — 生物信息学分析平台

BioInsight 是一个面向生物信息学研究的全栈 Web 分析平台，集成了转录组分析、代谢建模、富集分析、蛋白互作网络等多种常用功能。这是一个持续开发的项目，本意为打造一个兼顾多组学分析，重点关注代谢建模的低代码平台，但由于本人时间不太充裕，已无限期暂停开发，如果想合作开发，可通过GitHub提供的邮箱联系。当前状态很多功能还处于demo阶段。随着agent的迅速风靡，也许开发为agent assistant更符合趋势。目前该平台可使用openai兼容的api接入，chatbot会根据运行的内容给出一定的解读。

## ✨ 功能模块

| 模块 | 描述 |
|------|------|
| **差异表达分析** | DESeq2 风格的转录组差异基因分析，火山图可视化 |
| **聚类分析** | K-Means / 层次聚类，支持 PCA 降维可视化 |
| **热图** | 交互式表达热图，自定义基因筛选 |
| **GO 富集分析** | 基因本体富集分析与可视化 |
| **KEGG 富集分析** | KEGG 通路富集分析 |
| **基因 ID 转换** | 多物种基因 ID 批量转换 |
| **PPI 网络** | STRING 蛋白-蛋白互作网络分析 |
| **代谢建模** | 基于 COBRApy 的 FBA / FVA / 基因敲除 / 必需基因分析 |
| **代谢网络图** | Cytoscape.js 交互式代谢网络可视化，支持 FBA 通量着色 |

## 🏗️ 技术架构

```
├── backend/          # Python 后端
│   ├── main.py       # FastAPI 入口
│   ├── routers/      # API 路由
│   ├── services/     # 业务逻辑
│   └── utils/        # 工具函数
├── frontend/         # React 前端
│   ├── src/
│   │   ├── api/      # API 客户端
│   │   ├── components/  # 通用组件
│   │   └── pages/    # 页面组件
│   └── vite.config.js
└── README.md
```

### 后端

- **框架:** FastAPI
- **代谢建模:** COBRApy (FBA, FVA, 基因敲除, 必需基因)
- **统计分析:** SciPy, NumPy, Pandas, scikit-learn
- **富集分析:** gseapy
- **PPI 网络:** STRING API

### 前端

- **框架:** React 18 + Vite
- **图表:** Plotly.js
- **网络可视化:** Cytoscape.js
- **图标:** Lucide React
- **样式:** CSS Modules

## 🚀 快速开始

### 环境要求

- Python 3.9+
- Node.js 18+
- Conda (推荐)

### 后端启动

```bash
# 创建 conda 环境
conda create -n bioinsight python=3.10 -y
conda activate bioinsight

# 安装依赖
pip install fastapi uvicorn cobra pandas numpy scipy scikit-learn gseapy requests python-multipart

# 启动后端
cd backend
uvicorn main:app --reload --port 8000
```

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

前端默认在 `http://localhost:5173` 运行，API 请求代理至 `http://localhost:8000`。

## 📂 API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/diff-analysis/run` | 差异表达分析 |
| POST | `/api/clustering/run` | 聚类分析 |
| POST | `/api/heatmap/run` | 热图数据 |
| POST | `/api/go-enrichment/run` | GO 富集 |
| POST | `/api/kegg-enrichment/run` | KEGG 富集 |
| POST | `/api/gene-convert/convert` | 基因 ID 转换 |
| POST | `/api/ppi/network` | PPI 网络 |
| GET  | `/api/metabolism/model-info` | 内置模型信息 |
| POST | `/api/metabolism/fba` | FBA 通量分析 |
| POST | `/api/metabolism/fva` | FVA 变化分析 |
| GET  | `/api/metabolism/network-data` | 代谢网络数据 |
| POST | `/api/metabolism/network-data` | 自定义模型网络数据 |

## 📄 许可证

MIT License
