
const cities = [
  { name: "Saintes-Maries-de-la-Mer", lat: 43.45, lon: 4.42 },
  { name: "Marseille", lat: 43.296, lon: 5.381 },
  { name: "Aix-en-Provence", lat: 43.52, lon: 5.44 },
  { name: "Arles", lat: 43.67, lon: 4.63 }
];
const lats = cities.map(c => c.lat).join(',');
const lons = cities.map(c => c.lon).join(',');

const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&daily=temperature_2m_max&timezone=Europe/Paris&forecast_days=1`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    const results = Array.isArray(data) ? data : [data];
    results.forEach((d, i) => {
      console.log(`${cities[i].name}: ${d.daily.temperature_2m_max[0]}°C`);
    });
  })
  .catch(err => console.error(err));
