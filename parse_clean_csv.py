import csv
import json

months = {
    'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
    'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12
}

records = {}

with open('RECORDNORMALELILLE_clean.csv', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f, delimiter=';')
    for row in reader:
        jour = row['Jour'].strip()
        if not jour:
            continue
        parts = jour.split(' ', 1)
        if len(parts) != 2:
            continue
        day = int(parts[0])
        month_name = parts[1].lower()
        month_num = months.get(month_name)
        if not month_num:
            continue
        key = f'{month_num}-{day}'

        def safe_float(v):
            try: return float(v.replace(',', '.')) if v.strip() else None
            except: return None
        def safe_int(v):
            try: return int(v.strip()) if v.strip() else None
            except: return None

        records[key] = {
            'tn_rec': safe_float(row['Temp_Mini_Record_Absolu']),
            'tn_rec_yr': safe_int(row['Temp_Mini_Record_Absolu_Annee']),
            'tn_norm': safe_float(row['Temp_Mini_Moyenne']),
            'tn_high': safe_float(row['Temp_Mini_La_Plus_Haute']),
            'tn_high_yr': safe_int(row['Temp_Mini_La_Plus_Haute_Annee']),
            'tx_low': safe_float(row['Temp_Maxi_La_Plus_Basse']),
            'tx_low_yr': safe_int(row['Temp_Maxi_La_Plus_Basse_Annee']),
            'tx_norm': safe_float(row['Temp_Maxi_Moyenne']),
            'tx_rec': safe_float(row['Temp_Maxi_Record_Absolu']),
            'tx_rec_yr': safe_int(row['Temp_Maxi_Record_Absolu_Annee']),
        }

print(f'Total records: {len(records)}')
for k in list(records.keys())[:3]:
    print(k, records[k])

js = 'const lilleData = ' + json.dumps(records, ensure_ascii=False, separators=(',', ':')) + ';'
with open('lille_data.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Done!')
