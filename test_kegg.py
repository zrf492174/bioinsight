import requests
urls = [
    "http://rest.kegg.jp/link/reaction/ko",
    "http://rest.kegg.jp/link/ko/eco"
]
for u in urls:
    try:
        r = requests.get(u)
        print(u, r.status_code, len(r.text.split("\n")))
    except Exception as e:
        print(u, str(e))
