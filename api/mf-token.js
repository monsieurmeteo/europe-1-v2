export default async function handler(req, res) {
    // Autoriser CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const consumerKey = 'Mhar9YSs8LEluq4neXqP0YeHaaka';
    const consumerSecret = 'nDKPWzVr2_2o5Ej1aPZa7O6hu4Ia';

    try {
        const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        const tokenUrl = 'https://portail-api.meteofrance.fr/token';

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[API mf-token] Météo-France error:', response.status, errText);
            return res.status(response.status).json({ error: 'MeteoFrance token error', details: errText });
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('[API mf-token] Internal error:', error);
        return res.status(500).json({ error: error.message });
    }
}
