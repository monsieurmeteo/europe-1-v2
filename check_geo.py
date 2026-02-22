import requests
import json

url = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson"
res = requests.get(url)
data = res.json()

print("Properties of first feature:")
print(data['features'][0]['properties'])
