import requests
import json

lats = "48.85"
lons = "2.35"
hourly_params = "temperature_2m,precipitation,weathercode,wind_gusts_10m,windspeed_10m,winddirection_10m"
daily_params = "temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset"
models = "arome_france,meteofrance_arpege_world,icon_eu"
url = f"https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&hourly={hourly_params}&daily={daily_params}&models={models}&forecast_days=16&timezone=Europe/Paris"

print(f"Fetching: {url}")
try:
    res = requests.get(url)
    data = res.json()
    with open("results_models_16d.txt", "w") as f:
        f.write(f"Status: {res.status_code}\n")
        if "hourly" in data:
            keys = sorted(data["hourly"].keys())
            for key in keys:
                f.write(f"Hourly {key}: {len(data['hourly'][key])} entries\n")
        if "daily" in data:
            keys = sorted(data["daily"].keys())
            for key in keys:
                f.write(f"Daily {key}: {len(data['daily'][key])} entries\n")
except Exception as e:
    print(e)
