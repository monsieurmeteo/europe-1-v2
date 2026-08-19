/**
 * Service d'accès à l'API Climatologique officielle Météo-France (DPClim)
 * Permet de récupérer les archives quotidiennes (1950 - Hier) pour toutes les stations françaises.
 */

import { meteoAuth } from './meteoFranceAuth';

const BASE_CLIM_URL = 'https://public-api.meteofrance.fr/public/DPClim/v1';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const meteoFranceClimService = {
    /**
     * Commander et télécharger l'historique quotidien d'une station (1950 à hier)
     * @param {string} stationId Identifiant poste Météo-France (8 chiffres, ex: "59178001")
     * @param {string} startDate Date début YYYY-MM-DD
     * @param {string} endDate Date fin YYYY-MM-DD
     * @param {function} onProgress Callback d'avancement optionnel (message)
     */
    async fetchStationHistory(stationId, startDate, endDate, onProgress = () => {}) {
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

        let token = await meteoAuth.getValidToken();
        const deb = startDate + 'T00:00:00Z';
        const fin = safeEnd + 'T23:59:59Z';

        onProgress('Envoi de la commande à Météo-France…');

        // 1. Commande de la station
        const cmdUrl = `${BASE_CLIM_URL}/commande-station/quotidienne?id-station=${stationId}&date-deb-periode=${encodeURIComponent(deb)}&date-fin-periode=${encodeURIComponent(fin)}`;
        
        let cmdResp = await fetch(cmdUrl, {
            headers: {
                'Authorization': 'Bearer ' + token,
                'Accept': 'application/json'
            }
        });

        // Auto-récupération en cas de 401 (token expiré ou invalidé)
        if (cmdResp.status === 401) {
            console.warn('[meteoFranceClimService] 401 Invalid Token reçu -> Renouvellement forcé du token...');
            token = await meteoAuth.generateToken();
            cmdResp = await fetch(cmdUrl, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Accept': 'application/json'
                }
            });
        }

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
                    'Authorization': 'Bearer ' + token,
                    'Accept': '*/*'
                }
            });

            if (fileResp.status === 200 || fileResp.status === 201) {
                csvText = await fileResp.text();
                break;
            } else if (fileResp.status === 401) {
                token = await meteoAuth.generateToken();
                await sleep(1500);
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
        return this.parseDPClimCSV(csvText);
    },

    /**
     * Parser le CSV DPClim (séparateur point-virgule)
     */
    parseDPClimCSV(csvText) {
        if (!csvText) return [];

        const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) return [];

        const headerLine = lines[0];
        const headers = headerLine.split(';').map(h => h.trim());

        const idxPoste = headers.indexOf('POSTE') !== -1 ? headers.indexOf('POSTE') : headers.indexOf('NUM_POSTE');
        const idxDate = headers.indexOf('DATE');
        const idxRR = headers.indexOf('RR');
        const idxTN = headers.indexOf('TN');
        const idxHTN = headers.indexOf('HTN');
        const idxTX = headers.indexOf('TX');
        const idxHTX = headers.indexOf('HTX');
        const idxTM = headers.indexOf('TM');
        const idxTNTXM = headers.indexOf('TNTXM');
        const idxTAMPLI = headers.indexOf('TAMPLI');
        const idxFXI = headers.indexOf('FXI');
        const idxDXI = headers.indexOf('DXI');
        const idxHXI = headers.indexOf('HXI');
        const idxFXI3S = headers.indexOf('FXI3S');
        const idxDXI3S = headers.indexOf('DXI3S');
        const idxHXI3S = headers.indexOf('HXI3S');
        const idxFF = headers.indexOf('FF');
        const idxDXY = headers.indexOf('DXY');
        const idxORAG = headers.indexOf('ORAG');
        const idxNEIG = headers.indexOf('NEIG');
        const idxGREL = headers.indexOf('GREL');
        const idxBROU = headers.indexOf('BROU');
        const idxGELE = headers.indexOf('GELE');

        const results = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(';').map(c => c.trim());
            if (cols.length < headers.length) continue;

            const rawDate = idxDate !== -1 ? cols[idxDate] : '';
            if (!rawDate || rawDate.length !== 8) continue;

            const formattedDate = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;

            const parseVal = (idx) => {
                if (idx === -1) return null;
                const v = cols[idx];
                if (!v || v === '' || v === 'null') return null;
                const num = parseFloat(v.replace(',', '.'));
                return isNaN(num) ? null : num;
            };

            const parseHour = (idx) => {
                if (idx === -1) return '';
                const v = cols[idx];
                if (!v || v.length < 3) return '';
                const padded = v.padStart(4, '0');
                return `${padded.substring(0, 2)}h${padded.substring(2, 4)}`;
            };

            const tn = parseVal(idxTN);
            const tx = parseVal(idxTX);
            const tm = parseVal(idxTM) ?? parseVal(idxTNTXM) ?? (tn !== null && tx !== null ? parseFloat(((tn + tx) / 2).toFixed(1)) : null);
            const rr = parseVal(idxRR) ?? 0;
            
            // Rafale normalisée OMM (3 secondes) en priorité
            const fxi3sMS = parseVal(idxFXI3S);
            const fxiMS = parseVal(idxFXI);
            const activeFxiMS = fxi3sMS !== null ? fxi3sMS : fxiMS;
            const fxiKmh = activeFxiMS !== null ? Math.round(activeFxiMS * 3.6) : null;
            const hxi = parseHour(idxHXI3S) || parseHour(idxHXI);
            const dxi = parseVal(idxDXI3S) ?? parseVal(idxDXI);

            results.push({
                stationId: idxPoste !== -1 ? cols[idxPoste] : '',
                date: formattedDate,
                rawDate: rawDate,
                tn: tn,
                htn: parseHour(idxHTN),
                tx: tx,
                htx: parseHour(idxHTX),
                tm: tm,
                tampli: parseVal(idxTAMPLI),
                rr: rr,
                fxi: fxiKmh,
                fxiMS: activeFxiMS,
                fxiPeakKmh: fxiMS !== null ? Math.round(fxiMS * 3.6) : null,
                dxi: dxi,
                hxi: hxi,
                ff: parseVal(idxFF),
                dxy: parseVal(idxDXY),
                orag: cols[idxORAG] === '1',
                neig: cols[idxNEIG] === '1',
                grele: cols[idxGREL] === '1',
                brou: cols[idxBROU] === '1',
                gelee: cols[idxGELE] === '1'
            });
        }

        return results.sort((a, b) => a.date.localeCompare(b.date));
    }
};
