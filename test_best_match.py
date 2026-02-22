import requests
import json

lats = "48.85"
lons = "2.35"
hourly_params = "temperature_2m"
models = "best_match,arome_france"
url = f"https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&hourly={hourly_params}&models={models}&forecast_days=16&timezone=Europe/Paris"

print(f"Fetching: {url}")
try:
    res = requests.get(url)
    data = res.json()
    if "hourly" in data:
        print("Keys found:", data["hourly"].keys())
        for k, v in data["hourly"].items():
            print(f"- {k}: {len(v)} entries")
except Exception as e:
    print(e)
