import pandas as pd
import numpy as np

# Generate a small mock dataset: 50 cells, 200 genes (that likely overlap with M168 genes)
np.random.seed(42)
cells = [f"Cell_{i}" for i in range(1, 51)]
genes = [f"Gene_{i}" for i in range(1, 201)]

data = np.random.poisson(lam=5, size=(50, 200))

df = pd.DataFrame(data, index=cells, columns=genes)
df.to_csv("test_sc_sample.csv")
print("test_sc_sample.csv created")
