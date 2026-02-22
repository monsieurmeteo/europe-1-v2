import requests
import json

lats = "48.85"
lons = "2.35"
hourly_params = "wind_gusts_10m,windspeed_10m,winddirection_10m,temperature_2m,weathercode,precipitation"
daily_params = "temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset"
# Test avec le modèle par défaut pour voir s'il va à 16 jours
url = f"https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&hourly={hourly_params}&daily={daily_params}&timezone=Europe/Paris&forecast_days=16"

print(f"Fetching: {url}")
try:
    res = requests.get(url)
    data = res.json()
    with open("results_16d.txt", "w") as f:
        f.write(f"Status: {res.status_code}\n")
        if "hourly" in data:
            for key in data["hourly"].keys():
                f.write(f"Hourly {key}: {len(data['hourly'][key])} entries\n")
        if "daily" in data:
            for key in data["daily"].keys():
                f.write(f"Daily {key}: {len(data['daily'][key])} entries\n")
except Exception as e:
    print(e)
