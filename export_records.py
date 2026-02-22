import json
import re
import unicodedata

months = {
    'janvier': 1, 'fevrier': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
    'juillet': 7, 'aout': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'decembre': 12
}

def normalize(s):
    nfkd = unicodedata.normalize('NFD', s.lower())
    # Remove combining diacritics
    return ''.join(c for c in nfkd if unicodedata.category(c) != 'Mn')

# Read with BOM detection
with open('records_utf8.json', 'rb') as f:
    raw = f.read()
if raw[:3] == b'\xef\xbb\xbf':
    raw = raw[3:]
data = json.loads(raw.decode('utf-8'))

records = {}
for row in data:
    date = row.get('Date', '')
    if not date:
        continue
    # Replace non-breaking space (\xa0) and other whitespace variants with regular space
    date_clean = date.strip().replace('\xa0', ' ')
    norm = normalize(date_clean)
    # Match pattern: digit(s) + space + word
    m = re.match(r'^(\d+) ([a-z]+)$', norm)
    if not m:
        continue
    day = int(m.group(1))
    month_name = m.group(2)
    month_num = months.get(month_name)
    if not month_num:
        continue
    min_val = row.get('Max', None)  # column "Max" in JSON = min temperature value
    year_val = row.get('Min', None)  # column "Min" in JSON = year
    if min_val is not None and min_val != '':
        try:
            records[f'{month_num}-{day}'] = {'min': float(str(min_val).replace(',', '.')), 'year': int(year_val) if year_val else None}
        except (ValueError, TypeError):
            pass

print(f"Records found: {len(records)}")
for k in sorted(list(records.keys()))[:5]:
    print(k, records[k])

js_content = 'const lilleRecordsMin = ' + json.dumps(records, ensure_ascii=False, separators=(',', ':')) + ';'
with open('lille_records.js', 'w', encoding='utf-8') as f:
    f.write(js_content)
print("Done!")
