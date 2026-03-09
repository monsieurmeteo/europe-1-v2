import json

# Load stations index
with open('c:/Users/grego/Documents/applicaiton meteociel/src/data/stations_index.json', 'r', encoding='utf-8') as f:
    stations = json.load(f)

# HDF Departments
hdf_depts = ['02', '59', '60', '62', '80']

# Filter HDF stations and keep only those with valid lat/lon (not Lambert)
hdf_stations = {}
for s in stations:
    if s['dept'] in hdf_depts:
        try:
            lat = float(s['lat'])
            lon = float(s['lon'])
            if lat > 40 and lat < 60: # Rough check for Lat/Lon vs Lambert
                hdf_stations[s['id']] = {
                    'name': s['name'],
                    'lat': lat,
                    'lon': lon,
                    'dept': s['dept']
                }
        except:
            continue

# Load global records
with open('c:/Users/grego/Documents/applicaiton meteociel/src/data/global_daily_records.json', 'r', encoding='utf-8') as f:
    global_records = json.load(f)

# Extract records for HDF stations
hdf_daily_records = {}
for mm_dd, stations_records in global_records.items():
    hdf_daily_records[mm_dd] = {}
    for station_id, record in stations_records.items():
        if station_id in hdf_stations:
            hdf_daily_records[mm_dd][station_id] = record

# Output as JS file
output = {
    'stations': hdf_stations,
    'records': hdf_daily_records
}

with open('c:/Users/grego/Documents/europe 1 V2/hdf_records.js', 'w', encoding='utf-8') as f:
    f.write(f"const hdfRecordsData = {json.dumps(output, ensure_ascii=False)};")

print(f"Exported HDF records for {len(hdf_stations)} stations.")
