import requests
import json

# Manual slugs for geoUrl consistency with gregoiredavid/france-geojson
depts = {
    "04": "alpes-de-haute-provence",
    "06": "alpes-maritimes",
    "13": "bouches-du-rhone",
    "83": "var",
    "84": "vaucluse"
}

config_lines = []

for code, slug in depts.items():
    url = f"https://geo.api.gouv.fr/departements/{code}/communes?fields=nom,population,centre"
    res = requests.get(url)
    if res.ok:
        communes = res.json()
        communes = [c for c in communes if c.get('population') and c.get('centre')]
        # Sort by population descendant
        communes.sort(key=lambda x: x.get('population', 0), reverse=True)
        # Take top 6
        top_communes = communes[:6]
        
        # Get dept info
        dept_url = f"https://geo.api.gouv.fr/departements/{code}?fields=nom"
        dept_res = requests.get(dept_url)
        dept_name = dept_res.json()['nom']
        
        cities = []
        lats = []
        lons = []
        for c in top_communes:
            lon, lat = c['centre']['coordinates']
            cities.append({"name": c['nom'], "lat": lat, "lon": lon})
            lats.append(lat)
            lons.append(lon)
        
        if lats and lons:
            avg_lat = sum(lats) / len(lats)
            avg_lon = sum(lons) / len(lons)
            
            geoUrl = f"https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements/{code}-{slug}/departement-{code}-{slug}.geojson"
            
            # Print as Javascript object literal
            obj = {
                "id": code,
                "name": dept_name.upper(),
                "geoUrl": geoUrl,
                "padding": [60, 20, 20, 20],
                "center": [round(avg_lat, 2), round(avg_lon, 2)],
                "zoom": 9,
                "cities": cities
            }
            # We'll print it in a format easy to copy/paste
            config_lines.append(f"            \"{slug}\": {json.dumps(obj, indent=4, ensure_ascii=False)},")

for line in config_lines:
    print(line)
