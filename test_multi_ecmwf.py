import requests
import json

lats = "48.85"
lons = "2.35"
hourly_params = "temperature_2m"
models = "arome_france,ecmwf_ifs"
url = f"https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&hourly={hourly_params}&models={models}&forecast_days=16&timezone=Europe/Paris"

print(f"Fetching: {url}")
try:
    res = requests.get(url)
    data = res.json()
    if "hourly" in data:
        for k, v in data["hourly"].items():
            print(f"- {k}: {len(v)} entries")
except Exception as e:
    print(e)
