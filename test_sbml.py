import cobra
import requests
from cobra import Model, Reaction, Metabolite

# Create a tiny valid SBML model
model = Model('test_model')
reaction = Reaction('R1')
reaction.name = 'Test Reaction'
reaction.subsystem = 'Test'
reaction.lower_bound = 0
reaction.upper_bound = 1000
metabolite = Metabolite('M1', formula='H2O', name='Water', compartment='c')
reaction.add_metabolites({metabolite: 1})
reaction.gene_reaction_rule = '(G1 or G2)'
model.add_reactions([reaction])
cobra.io.write_sbml_model(model, "test_model.xml")

# Submit
with open("test_model.xml", "rb") as f:
    resp = requests.post("http://127.0.0.1:8000/api/gpruler/submit", data={"mode": "sbml", "model_name": "testmod"}, files={"file": f})

print("Submit:", resp.json())
task_id = resp.json()["data"]["task_id"]

import time
while True:
    time.sleep(2)
    r = requests.get(f"http://127.0.0.1:8000/api/gpruler/task/{task_id}")
    data = r.json()
    status = data["data"]["status"]
    print("Status:", status)
    if status in ["completed", "failed"]:
        print("Result:", data["data"].get("result"))
        break
