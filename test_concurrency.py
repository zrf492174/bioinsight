import requests
import time

print("Submitting task...")
resp = requests.post("http://127.0.0.1:8000/api/gpruler/submit", data={
    "mode": "organism",
    "model_name": "TestEco",
    "organism_name": "Escherichia coli",
    "kegg_code": "eco"
}, timeout=5)

print("Started: ", resp.json())
task_id = resp.json()["data"]["task_id"]

# Now rapidly ping the tasks endpoint to see if it hangs
for i in range(5):
    t0 = time.time()
    try:
        r = requests.get("http://127.0.0.1:8000/api/gpruler/tasks", timeout=2)
        elapsed = time.time() - t0
        print(f"Ping {i+1} took {elapsed:.3f}s. Status code: {r.status_code}")
    except Exception as e:
        print(f"Ping {i+1} failed: {e}")
    time.sleep(0.5)
