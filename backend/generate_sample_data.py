"""Generate sample data with strong differential signal for BioInsight demo."""
import numpy as np
import pandas as pd
import os

os.makedirs('/root/test/frontend/public/sample_data', exist_ok=True)

np.random.seed(42)
n_genes = 100
samples = ['ctrl_1','ctrl_2','ctrl_3','treat_1','treat_2','treat_3']

# Base expression with lower variance for clearer signal
base_expr = np.random.uniform(50, 200, size=(n_genes, 1))
noise = np.random.normal(0, 10, size=(n_genes, 6))
expr = base_expr + noise
expr = np.maximum(expr, 1)  # no negatives

gene_names = [f'Gene_{i+1:03d}' for i in range(n_genes)]

# 15 up-regulated genes: treatment is 4-10x higher
for i in range(15):
    factor = np.random.uniform(4, 10)
    expr[i, 3:] = expr[i, :3].mean() * factor + np.random.normal(0, 5, 3)

# 10 down-regulated genes: treatment is 0.1-0.25x
for i in range(15, 25):
    factor = np.random.uniform(0.1, 0.25)
    expr[i, 3:] = expr[i, :3].mean() * factor + np.random.normal(0, 2, 3)

expr = np.maximum(expr, 0.01)

df = pd.DataFrame(expr, index=gene_names, columns=samples)
df.index.name = 'gene'
df.to_csv('/root/test/frontend/public/sample_data/expression_matrix.csv')

sample_info = pd.DataFrame({
    'sample': samples,
    'group': ['control']*3 + ['treatment']*3
})
sample_info.to_csv('/root/test/frontend/public/sample_data/sample_info.csv', index=False)

print(f'Done! Expression: {df.shape}')
print('\\nFirst 3 up-regulated genes (ctrl vs treat):')
for i in range(3):
    ctrl_mean = df.iloc[i, :3].mean()
    treat_mean = df.iloc[i, 3:].mean()
    print(f'  {gene_names[i]}: ctrl={ctrl_mean:.1f}, treat={treat_mean:.1f}, FC={treat_mean/ctrl_mean:.1f}x')
