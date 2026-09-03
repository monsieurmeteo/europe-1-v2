/**
 * Service pour récupérer et parser les données d'archives de Meteociel
 */

const API_METEOCIEL = '/api-meteociel';

export const METEOCIEL_MODES = {
    TEMPERATURE_DIRECT: { id: '0', label: 'Température Actuelle (Direct)', unit: '°C' },
    TEMPERATURE_MAX: { id: '25', label: 'Températures Maximales', unit: '°C' },
    TEMPERATURE_MIN: { id: '26', label: 'Températures Minimales', unit: '°C' },
    WIND_GUSTS: { id: '27', label: 'Rafales de Vent', unit: 'km/h' },
    RAINFALL: { id: '28', label: 'Précipitations', unit: 'mm' },
};

/**
 * Récupère les archives ou le direct pour une date et un mode donnés
 */
export const fetchMeteocielArchives = async (date, modeId) => {
    try {
        const d = new Date(date);
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const isToday = new Date().toISOString().split('T')[0] === date;

        const isLive = isToday && (modeId === '0' || modeId === 0);
        const url = isLive
            ? `${API_METEOCIEL}/obs/classement.php?archive=0&ua=&all=1&mode=0&pays=&ud=0&dec=0&alt=0&u2=1&ma=0&sub=OK`
            : `${API_METEOCIEL}/obs/classement.php?archive=1&ua=&all=1&mode=${modeId}&pays=&ud=0&dec=0&alt=0&u2=1&ma=0&jour=${day}&mois=${month}&annee=${year}&sub=OK`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);

        // Décodage strict en Windows-1252 pour préserver les accents et caractères spéciaux français
        let html = '';
        try {
            const buffer = await response.arrayBuffer();
            html = new TextDecoder('windows-1252').decode(buffer);
        } catch (decErr) {
            html = await response.text();
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Trouver le tableau des stations (recherche multi-sélecteurs tolérante)
        const tables = Array.from(doc.querySelectorAll('table'));
        let targetTable = tables.find(t => {
            const text = t.textContent || '';
            return (text.includes('Station') || text.includes('Poste') || text.includes('Ville')) && 
                   (text.includes('°C') || text.includes('km/h') || text.includes('mm') || text.includes('hPa') || text.includes('Valeur') || text.includes('Temp'));
        });

        if (!targetTable) {
            const headers = Array.from(doc.querySelectorAll('h4, h3, b'));
            const rankingHeader = headers.find(h => h.textContent.includes('Classement'));
            if (rankingHeader) {
                let sibling = rankingHeader.nextElementSibling;
                while (sibling && sibling.tagName !== 'TABLE') {
                    sibling = sibling.nextElementSibling;
                }
                targetTable = sibling;
            }
        }

        if (!targetTable) return [];

        const rows = Array.from(targetTable.querySelectorAll('tr'));
        const data = [];

        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) continue;

            const stationLong = cells[0].textContent.trim().replace(/\s+/g, ' ');
            // Format: "Station Name (Dept)" ou "Station Name"
            const match = stationLong.match(/^(.*?)(?:\s*\(([0-9AB]{2,3})\))?$/i);
            if (!match) continue;

            const station = match[1].trim();
            const dept = match[2] || '';

            // Nettoyer la valeur (remplacer virgule par point, extraire nombre)
            let valueStr = cells[1].textContent.trim().replace(',', '.');
            let value = parseFloat(valueStr.replace(/[^\d.-]/g, ''));

            if (!isNaN(value)) {
                data.push({
                    station,
                    dept,
                    value,
                    displayValue: valueStr
                });
            }
        }

        return data;
    } catch (error) {
        console.warn('[MeteocielService] Error fetching archives/live:', error);
        return [];
    }
};

/**
 * Parse le HTML des observations pour extraire les données
 * @param {string} html Contenu HTML de la page Meteociel
 */
export const parseStationObservations = (html) => {
    // 1. Extraire les extrêmes (Regex pour être compatible Node/Navigateur)
    const dailyExtremes = {};
    const txMatch = html.match(/Température Maxi\.<br>.*?<\/font><\/b><\/td>.*?<td[^>]*>(.*?)<\/td>/is);
    const tnMatch = html.match(/Température Mini\.<br>.*?<\/font><\/b><\/td>.*?<td[^>]*>(.*?)<\/td>/is);
    const fxMatch = html.match(/Rafale maxi\.<br>.*?<\/font><\/i><\/b><\/td>.*?<td[^>]*>(.*?)<\/td>/is);
    const rrMatch = html.match(/Précipitations<br>.*?<\/font><\/td>.*?<td[^>]*>(.*?)<\/td>/is);

    const cleanVal = (str) => {
        if (!str) return null;
        const val = parseFloat(str.replace(/<[^>]*>/g, '').replace(/[^\d.-]/g, '').replace(',', '.'));
        return isNaN(val) ? null : val;
    };

    if (txMatch) dailyExtremes.tx = cleanVal(txMatch[1]);
    if (tnMatch) dailyExtremes.tn = cleanVal(tnMatch[1]);
    if (fxMatch) dailyExtremes.fxi = cleanVal(fxMatch[1]);
    if (rrMatch) dailyExtremes.rr = cleanVal(rrMatch[1]);

    // 2. Extraire le tableau des observations (Regex pour les lignes)
    // Structure: <tr[^>]*> <td align=center>23h54</td> <td>...</td> ... </tr>
    const observations = [];
    const rowRegex = /<tr[^>]*>\s*<td[^>]*>(\d+h\d*)<\/td>([\s\S]*?)<\/tr>/gi;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const timeStr = match[1];
        const cellsHtml = match[2];
        const cells = cellsHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];

        if (cells.length < 4) continue;

        let hour, minute = 0;
        if (timeStr.includes('h')) {
            const parts = timeStr.split('h');
            hour = parseInt(parts[0]);
            minute = parseInt(parts[1]) || 0;
        }

        const getCellVal = (idx) => {
            if (!cells[idx]) return null;
            const text = cells[idx].replace(/<[^>]*>/g, '').trim();
            if (!text || text === '\u00A0' || text === '&nbsp;' || text === ' ') return null;
            const val = parseFloat(text.replace(/[^\d.-]/g, '').replace(',', '.'));
            return isNaN(val) ? null : val;
        };

        // Heure | Visi | Temp | Humi | Rosée | Humidex | Windchill | Vent | Rafales | Pression | Précip
        // Note: Les indices peuvent varier si certaines colonnes manquent, mais on suit l'ordre standard
        // Temp est généralement en index 1 de cells (après Heure qui est match[1])
        const data = {
            time: timeStr,
            hour,
            minute,
            t: getCellVal(1), // Température
            u: getCellVal(2), // Humidité
            td: getCellVal(3), // Point de rosée
            ff: getCellVal(6), // Vent
            fxi: getCellVal(7), // Rafales
            pres: getCellVal(8), // Pression
        };

        // Précipitations (dernière cellule)
        const precipText = cells[cells.length - 1].toLowerCase();
        if (precipText.includes('aucune')) {
            data.rr = 0;
        } else {
            data.rr = getCellVal(cells.length - 1);
        }

        observations.push(data);
    }

    return {
        extremes: dailyExtremes,
        observations: observations.reverse() // Chronologique
    };
};

/**
 * Récupère le tableau des observations (horaire ou intra-horaire)
 */
export const fetchStationObservations = async (stationId, date, isIntra = false) => {
    try {
        const d = new Date(date);
        const day = d.getDate();
        const month = d.getMonth(); // 0-indexed for mois2
        const year = d.getFullYear();

        const url = `${API_METEOCIEL}/temps-reel/obs_villes.php?code2=${stationId}&jour2=${day}&mois2=${month}&annee2=${year}${isIntra ? '&affint=1' : ''}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);

        const buffer = await response.arrayBuffer();
        const html = new TextDecoder('windows-1252').decode(buffer);

        const parsedData = parseStationObservations(html);

        return {
            date: date,
            stationId,
            ...parsedData
        };
    } catch (error) {
        console.error(`[MeteocielService] Error fetching observations for ${stationId}:`, error);
        return null;
    }
};

/**
 * Rétro-compatibilité : Récupère uniquement les extrêmes quotidiens
 */
export const fetchStationDayExtremes = async (stationId, date) => {
    const data = await fetchStationObservations(stationId, date);
    return data ? { date: data.date, poste: stationId, ...data.extremes } : null;
};

/**
 * Récupère les données sur une période donnée (boucle sur les jours)
 */
export const fetchStationHistory = async (stationId, startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const results = [];

    let current = new Date(start);
    while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const data = await fetchStationDayExtremes(stationId, dateStr);
        if (data) {
            results.push(data);
        }
        current.setDate(current.getDate() + 1);

        // Petite pause pour ne pas spammer et pour laisser le thread libre
        if (results.length % 5 === 0) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    return results;
};

/**
 * Récupère les archives complètes (plusieurs modes) pour une plage de dates
 * Simule les requêtes PowerQuery agrégées (Multi-dates)
 */
export const fetchMultiDateArchives = async (startDate, endDate, modeId) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const allData = [];

    let current = new Date(start);
    while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        try {
            const dailyData = await fetchMeteocielArchives(dateStr, modeId);
            // Ajouter la date à chaque ligne comme dans PowerQuery AddedDate = Table.AddColumn(Data, "Date", each uneDate)
            const dailyWithDate = dailyData.map(item => ({
                ...item,
                date: dateStr
            }));
            allData.push(...dailyWithDate);
        } catch (err) {
            console.error(`Error for date ${dateStr}:`, err);
        }

        current.setDate(current.getDate() + 1);

        // Pause pour éviter d'être bloqué par le serveur (Meteociel archive est sensible)
        await new Promise(r => setTimeout(r, 150));
    }

    return allData;
};
