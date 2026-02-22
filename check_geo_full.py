import requests
import json

url = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements.geojson"
res = requests.get(url)
data = res.json()

print("Properties of first feature (full version):")
print(data['features'][0]['properties'])
