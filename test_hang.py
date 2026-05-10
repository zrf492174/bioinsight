import requests, threading, time
def submit():
    try:
        r = requests.post("http://127.0.0.1:8000/api/gpruler/submit", data={"mode": "organism", "organism_name": "eco", "kegg_code": "eco", "model_name": "mod"}, timeout=10)
        print("Submit Finished:", r.status_code)
    except Exception as e:
        print("Submit Failed:", e)
t = threading.Thread(target=submit)
t.start()
time.sleep(2)
print("Tasks Ping:")
try:
    r = requests.get("http://127.0.0.1:8000/api/gpruler/tasks", timeout=2)
    print("Tasks:", r.status_code)
except Exception as e:
    print("Tasks failed:", e)
