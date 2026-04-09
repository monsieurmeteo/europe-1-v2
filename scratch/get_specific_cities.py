import requests
import json
import time

cities_var = [
    "Rians", "Saint-Zacharie", "Saint-Cyr-sur-Mer", "Saint-Maximin-la-Sainte-Baume",
    "Signes", "Toulon", "Hyères", "Puget-Ville", "Brignoles", "Barjols", "Salernes",
    "Collobrières", "Rayol-Canadel-sur-Mer", "Le Luc", "Saint-Tropez", "Fréjus",
    "Seillans", "Draguignan", "Trigance", "Bandol", "Sanary-sur-Mer",
    "Six-Fours-les-Plages", "La Seyne-sur-Mer", "Ollioules"
]

results = []
lats = []
lons = []

for city in cities_var:
    # URL encoded city name
    url = f"https://geo.api.gouv.fr/communes?nom={city}&codeDepartement=83&fields=nom,centre&boost=population&limit=1"
    res = requests.get(url)
    if res.ok and res.json():
        data = res.json()[0]
        lon, lat = data['centre']['coordinates']
        results.append({"name": data['nom'], "lat": lat, "lon": lon})
        lats.append(lat)
        lons.append(lon)
    else:
        print(f"FAILED to find {city}")
    time.sleep(0.1)

avg_lat = sum(lats) / len(lats) if lats else 43.3
avg_lon = sum(lons) / len(lons) if lons else 6.36

slug = "var"
code = "83"
geoUrl = f"https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements/{code}-{slug}/departement-{code}-{slug}.geojson"

obj = {
    "id": code,
    "name": "VAR",
    "geoUrl": geoUrl,
    "padding": [60, 20, 20, 20],
    "center": [round(avg_lat, 2), round(avg_lon, 2)],
    "zoom": 9,
    "cities": results
}

print(json.dumps(obj, indent=4, ensure_ascii=False))
