/**
 * Service Climatologie officiel Météo-France (DPClim)
 * Accès direct aux archives quotidiennes (TN, TX, TM, RR, FXI, DXI, HXI, etc.) de 1950 à hier.
 */

import { meteoAuth } from './meteoFranceAuth';

const BASE_CLIM_URL = '/api-meteo-clim';

/**
 * Attendre un certain délai en millisecondes
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Formater une heure Météo-France (ex: "1514" -> "15h14" ou "520" -> "05h20")
 */
function formatTime(val) {
    if (!val || val === '9999' || val === 'mq') return '';
    const s = val.toString().padStart(4, '0');
    return `${s.slice(0, 2)}h${s.slice(2, 4)}`;
}

/**
 * Parser un nombre décimal français avec virgule
 */
function parseNum(val) {
    if (val === null || val === undefined || val === '' || val === 'mq') return null;
    const n = parseFloat(String(val).replace(',', '.'));
    return isNaN(n) ? null : n;
}

export const meteoFranceClimService = {
    /**
     * Récupérer la liste des stations d'un département
     * @param {string} deptCode Code département (ex: "59", "62", "75")
     */
    async getStations(deptCode) {
        if (!deptCode) return [];
        const token = await meteoAuth.getValidToken();

        const url = `${BASE_CLIM_URL}/liste-stations/quotidienne?id-departement=${deptCode}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erreur stations DPClim (${response.status}): ${errText}`);
        }

        const stations = await response.json();
        return stations.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    },

    /**
     * Commander et télécharger l'historique quotidien d'une station (1950 à hier)
     * @param {string} stationId Identifiant poste Météo-France (8 chiffres, ex: "59178001")
     * @param {string} startDate Date début YYYY-MM-DD
     * @param {string} endDate Date fin YYYY-MM-DD
        if (!stationId || !startDate || !endDate) {
            throw new Error('Paramètres manquants (stationId, startDate, endDate requis)');
        }

        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        let safeEnd = endDate;
        if (safeEnd > yesterday) {
            safeEnd = yesterday;
        }
        if (startDate > yesterday) {
            return [];
        }

        const token = await meteoAuth.getValidToken();
        const deb = `${startDate}T00:00:00Z`;
        const fin = `${safeEnd}T23:59:59Z`;

        onProgress('Envoi de la commande à Météo-France…');

        // 1. Commande de la station
        const cmdUrl = `${BASE_CLIM_URL}/commande-station/quotidienne?id-station=${stationId}&date-deb-periode=${encodeURIComponent(deb)}&date-fin-periode=${encodeURIComponent(fin)}`;
        
        const cmdResp = await fetch(cmdUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!cmdResp.ok) {
            const errText = await cmdResp.text();
            throw new Error(`Erreur commande Météo-France (${cmdResp.status}): ${errText}`);
        }

        const cmdData = await cmdResp.json();
        const idCmde = cmdData?.elaboreProduitAvecDemandeResponse?.return;

        if (!idCmde) {
            throw new Error('Aucun numéro de commande retourné par Météo-France');
        }

        onProgress('Préparation du relevé par Météo-France (2 à 5s)…');

        // 2. Récupération du fichier (polling toutes les 2.5s)
        await sleep(2500);
        const fileUrl = `${BASE_CLIM_URL}/commande/fichier?id-cmde=${idCmde}`;
        let csvText = null;

        for (let attempt = 1; attempt <= 15; attempt++) {
            const fileResp = await fetch(fileUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'text/plain, application/json, */*'
                }
            });

            if (fileResp.status === 200 || fileResp.status === 201) {
                csvText = await fileResp.text();
                break;
            } else if (fileResp.status === 204) {
                onProgress(`Génération du fichier en cours… (tentative ${attempt}/15)`);
                await sleep(2500);
            } else if (fileResp.status === 404 || fileResp.status === 410) {
                break;
            } else {
                const errText = await fileResp.text();
                throw new Error(`Erreur téléchargement (${fileResp.status}): ${errText}`);
            }
        }

        if (!csvText) {
            return [];
        }

        onProgress('Traitement des données…');
        return this.parseClimCSV(csvText, startDate, endDate);
    },

    /**
     * Parser le fichier CSV climatologique officiel Météo-France
     */
    parseClimCSV(csvText, startDate, endDate) {
        if (!csvText) return [];

        const lines = csvText.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) return [];

        const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
        const header = lines[0].split(sep).map(h => h.trim().replace(/"/g, '').toUpperCase());

        const idxPoste = header.indexOf('POSTE');
        const idxDate = header.findIndex(h => h === 'DATE' || h === 'AAAAMMJJ');
        const idxRR = header.indexOf('RR');
        const idxTN = header.indexOf('TN');
        const idxHTN = header.indexOf('HTN');
        const idxTX = header.indexOf('TX');
        const idxHTX = header.indexOf('HTX');
        const idxTM = header.indexOf('TM');
        const idxFXI = header.indexOf('FXI');
        const idxDXI = header.indexOf('DXI');
        const idxHXI = header.indexOf('HXI');
        const idxINST = header.indexOf('INST');
        const idxORAG = header.indexOf('ORAG');
        const idxGRELE = header.indexOf('GRELE');
        const idxNEIG = header.indexOf('NEIG');
        const idxBROU = header.indexOf('BROU');
        const idxGELEE = header.indexOf('GELEE');

        if (idxDate === -1) return [];

        const rows = [];
        const seenDates = new Set();

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''));
            if (cols.length < 2) continue;

            let dateRaw = cols[idxDate] || '';
            let dateISO = dateRaw;
            if (/^\d{8}$/.test(dateRaw)) {
                dateISO = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
            }

            if (startDate && dateISO < startDate) continue;
            if (endDate && dateISO > endDate) continue;
            if (seenDates.has(dateISO)) continue;
            seenDates.add(dateISO);

            const tn = idxTN !== -1 ? parseNum(cols[idxTN]) : null;
            const tx = idxTX !== -1 ? parseNum(cols[idxTX]) : null;
            const tm = idxTM !== -1 ? parseNum(cols[idxTM]) : null;
            const rr = idxRR !== -1 ? parseNum(cols[idxRR]) : null;
            const fxiMS = idxFXI !== -1 ? parseNum(cols[idxFXI]) : null;
            const fxiKmh = fxiMS !== null ? Math.round(fxiMS * 3.6) : null;

            rows.push({
                poste: idxPoste !== -1 ? cols[idxPoste] : '',
                date: dateISO,
                tn: tn !== null ? tn : undefined,
                htn: idxHTN !== -1 ? formatTime(cols[idxHTN]) : '',
                tx: tx !== null ? tx : undefined,
                htx: idxHTX !== -1 ? formatTime(cols[idxHTX]) : '',
                tm: tm !== null ? tm : undefined,
                rr: rr !== null ? rr : 0,
                fxi: fxiKmh !== null ? fxiKmh : undefined,
                fxi_ms: fxiMS !== null ? fxiMS : undefined,
                dxi: idxDXI !== -1 && cols[idxDXI] ? parseInt(cols[idxDXI], 10) : undefined,
                hxi: idxHXI !== -1 ? formatTime(cols[idxHXI]) : '',
                inst: idxINST !== -1 ? parseNum(cols[idxINST]) : null,
                orag: idxORAG !== -1 && cols[idxORAG] === '1',
                grele: idxGRELE !== -1 && cols[idxGRELE] === '1',
                neig: idxNEIG !== -1 && cols[idxNEIG] === '1',
                brou: idxBROU !== -1 && cols[idxBROU] === '1',
                gelee: idxGELEE !== -1 && cols[idxGELEE] === '1'
            });
        }

        return rows.sort((a, b) => b.date.localeCompare(a.date));
    }
};

export default meteoFranceClimService;
