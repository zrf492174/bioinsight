import requests
import time

resp = requests.post("http://127.0.0.1:8000/api/gpruler/submit", data={
    "mode": "organism",
    "model_name": "TestEco",
    "organism_name": "Escherichia coli",
    "kegg_code": "eco"
})
task_id = resp.json()["data"]["task_id"]
print(f"Submitted task: {task_id}")

while True:
    res = requests.get(f"http://127.0.0.1:8000/api/gpruler/task/{task_id}").json()
    status = res["data"]["status"]
    print(f"Status: {status}")
    if status in ("completed", "failed"):
        if status == "failed":
            print(res["data"]["error"])
        else:
            print(f"Success! Found {res['data']['result']['num_reactions']} reactions with GPR rules.")
        break
    time.sleep(2)
