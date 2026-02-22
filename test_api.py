import requests
import json

lats = "48.85"
lons = "2.35"
hourly_params = "wind_gusts_10m,windspeed_10m,winddirection_10m,temperature_2m,weathercode,precipitation"
daily_params = "temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset"
models = "arome_france,meteofrance_arpege_world,icon_eu,ecmwf_ifs04"
url = f"https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&hourly={hourly_params}&daily={daily_params}&timezone=Europe/Paris&models={models}&forecast_days=10"

with open("results.txt", "w") as f:
    f.write(f"Fetching: {url}\n")
    try:
        res = requests.get(url)
        f.write(f"Status: {res.status_code}\n")
        data = res.json()
        
        if "hourly" in data:
            f.write("Hourly keys found:\n")
            for key in sorted(data["hourly"].keys()):
                v = data["hourly"][key]
                if v and len(v) > 0:
                     f.write(f" - {key}: length {len(v)}\n")
                else:
                     f.write(f" - {key}: empty\n")
                     
        if "daily" in data:
            f.write("Daily keys found:\n")
            for key in sorted(data["daily"].keys()):
                v = data["daily"][key]
                if v and len(v) > 0:
                     f.write(f" - {key}: length {len(v)}\n")
    except Exception as e:
        f.write(str(e))

