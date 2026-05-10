from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

response = client.post(
    "/api/gpruler/submit",
    data={
        "mode": "organism",
        "model_name": "MyOrgModel",
        "organism_name": "Homo sapiens",
        "kegg_code": "hsa"
    }
)
print("Status:", response.status_code)
print("Body:", response.json())
