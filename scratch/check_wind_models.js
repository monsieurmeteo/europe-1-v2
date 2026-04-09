
const lat = 43.45;
const lon = 4.42;
const models = "arome_france,ecmwf_ifs";
const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,winddirection_10m,windspeed_10m&timezone=Europe/Paris&forecast_days=1&models=${models}`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log(JSON.stringify(data, null, 2));
  })
  .catch(err => console.error(err));
