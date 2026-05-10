import requests

url = "http://127.0.0.1:8000/api/gpruler/submit"
data = {
    "mode": "organism",
    "model_name": "MyOrgModel",
    "organism_name": "Homo sapiens",
    "kegg_code": "hsa"
}
response = requests.post(url, data=data)
print(response.status_code)
print(response.json())
