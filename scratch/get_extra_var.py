import requests
import json
import time

new_candidates = [
    "La Crau", "La Farlède", "Le Revest-les-Eaux", "Signes", "La Londe-les-Maures"
]

results = []
for city in new_candidates:
    url = f"https://geo.api.gouv.fr/communes?nom={city}&codeDepartement=83&fields=nom,centre&boost=population&limit=1"
    res = requests.get(url)
    if res.ok and res.json():
        data = res.json()[0]
        lon, lat = data['centre']['coordinates']
        results.append({"name": data['nom'], "lat": lat, "lon": lon})
    time.sleep(0.1)

print(json.dumps(results, indent=4, ensure_ascii=False))
