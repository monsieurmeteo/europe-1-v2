import React, { useEffect, useRef, useState } from 'react';
import { supabase, weatherAPI } from '../../services/api';
import { meteoFrancePosteService } from '../../services/meteoFrancePosteService';
import { meteoFranceClimService } from '../../services/meteoFranceClimService';
import { DEPARTMENTS } from '../../data/departments';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './BtpManager.css';

const BtpManager = () => {
    const [projects, setProjects] = useState([]);
    const [currentProjectId, setCurrentProjectId] = useState('');
    const [projectName, setProjectName] = useState('Météo BTP');
    const [chantierName, setChantierName] = useState('');

    // States for configuration
    const [activeTrades, setActiveTrades] = useState([]);
    const [TRADES_FULL, setTRADES_FULL] = useState([
        "Terrassement / Terrassement Voiries", "VRD – Voiries et Réseaux Divers", "Renforcement de sol / Traitement de sol", "Traitement de plateforme (chaux / ciment)", "Travaux Asphalte / Enrobés", "Rabattage de nappes", "Gros œuvre", "Fondations / Fondations spéciales", "Béton armé", "Coulage béton armé / Dalles", "Dallage", "Charpente", "Murs coupe-feu", "Couverture", "Bardage / Panneaux", "Étanchéité", "Isolation", "Menuiseries extérieures", "Métallerie", "Clôtures", "Espaces verts", "Ravalement / Peinture extérieure", "Grues / Bétonnières", "Levage d'éléments techniques", "Aires de béquillage", "Tous travaux extérieurs / Tâches extérieures", "Tous corps d’état", "Murs coupe feu"
    ]);
    const [globalData, setGlobalData] = useState({});
    const [rules, setRules] = useState([]);
    const [annexCols, setAnnexCols] = useState({ temp: true, rain: true, snow: true, windA: true, windG: true, humi: true, soil: true, fog: true, windAvgPdf: false });
    const [emitterName, setEmitterName] = useState('MÉTÉO CLIMAT PRO');
    const [txEnt, setTxEnt] = useState('400 rue Paul Lafargue\n59283 RAIMBEAUCOURT');
    const [txCli, setTxCli] = useState('');
    const [clientAddress, setClientAddress] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [emailCli, setEmailCli] = useState(''); // Direct send email
    const [showEmitter, setShowEmitter] = useState(false);
    const [stationMeteo, setStationMeteo] = useState('');
    const [logoL, setLogoL] = useState('/logo_default.png');
    const [logoR, setLogoR] = useState('');
    const [emitterPhone, setEmitterPhone] = useState('06 83 90 91 60');
    const [emitterEmail, setEmitterEmail] = useState('patrick.marliere@wanadoo.fr');

    const [projectAddress, setProjectAddress] = useState('');
    const [projectClient, setProjectClient] = useState('');
    const [startChantierDate, setStartChantierDate] = useState('');
    const [contractDuration, setContractDuration] = useState('');
    const [reportType, setReportType] = useState('Hebdomadaire');
    const [contractDurationUnit, setContractDurationUnit] = useState('mois');

    const [displaySimple, setDisplaySimple] = useState(false);
    const [showCharts, setShowCharts] = useState(false);
    const [checkPeriod, setCheckPeriod] = useState(true);
    const [autoSnow, setAutoSnow] = useState(true);
    const [snowTempLimit, setSnowTempLimit] = useState(0);

    // States for data entry
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [soilData, setSoilData] = useState({});
    const [heatData, setHeatData] = useState({});
    const [frozeData, setFrozeData] = useState({});
    const [fogData, setFogData] = useState({});
    const [status, setStatus] = useState('');

    // UI Local state
    const [activeOutTab, setActiveOutTab] = useState('out-report');
    const [tradesModalOpen, setTradesModalOpen] = useState(false);
    const [ruleTradesModalOpen, setRuleTradesModalOpen] = useState(false);
    const [ruleTradesModalTimestamp, setRuleTradesModalTimestamp] = useState(0);
    const [colsModalOpen, setColsModalOpen] = useState(false);
    const [promptModalOpen, setPromptModalOpen] = useState(false);
    const [currentRuleIndex, setCurrentRuleIndex] = useState(-1);
    const [openRuleIdx, setOpenRuleIdx] = useState(-1);
    const [reportOutput, setReportOutput] = useState('');
    const [chartsOutput, setChartsOutput] = useState('');
    const [emptyCellStyle, setEmptyCellStyle] = useState('gray');
    const [chartDesign, setChartDesign] = useState('architect');
    const [newTradeInput, setNewTradeInput] = useState('');
    const [aiImportModalOpen, setAiImportModalOpen] = useState(false);
    const [aiRawText, setAiRawText] = useState('');

    // MF Selection
    const [selectedDept, setSelectedDept] = useState('');
    const [stations, setStations] = useState([]);
    const [stationNames, setStationNames] = useState({});
    const [loadingStations, setLoadingStations] = useState(false);
    const [selectedStationId, setSelectedStationId] = useState('');


    const chartRefs = useRef({});
    const fileInputRef = useRef(null);
    const csvFileInputRef = useRef(null);

    const colsLabels = { temp: "Température", rain: "Pluie", snow: "Neige", windA: "Vent Moyen", windG: "Rafales", humi: "Humidité Air", soil: "Humidité Sol", fog: "Brouillard", windAvgPdf: "Vent Moyen (PDF)" };

    const AI_PROMPT = `Agis comme un expert en nettoyage de données.
Je vais te coller ci-dessous des données météorologiques brutes, copiées verticalement depuis un site web.
Ta mission : Reformater ces données pour obtenir une liste propre, une ligne par heure.

Règles strictes d'extraction :
1. L'Heure : Garde le format "XX h".
2. La Température : Trouve le chiffre avant "°C".
3. La Pluie : Trouve le chiffre avant "mm".
   ⚠️ IMPORTANT : Si tu vois le mot "traces" ou "aucune", remplace-le par "0 mm".
   Si plusieurs valeurs apparaissent, garde la plus élevée.
4. Le Vent et les Rafales : Repère le motif "XX km/h (YY km/h)".
   - La première valeur (XX) est le "Vent Moyen".
   - La valeur entre parenthèses (YY) est la "Rafale".
5. L'Humidité : Trouve le pourcentage (ex: 85%).

Format de sortie attendu (Texte brut, séparateurs clairs) :
[Heure] : T [Temp]°C | Pluie [Pluie]mm | Vent [Moyen]km/h | Rafales [Rafale]km/h | Humidité [Humi]%

Voici les données brutes :`;

    // Initialization
    useEffect(() => {
        loadProjects();
        loadTrades();
        resetToNew(); // Initialize with clean state and open trades modal

        if (!window.Chart) {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/chart.js";
            script.async = true;
            script.onload = () => {
                console.log("[BTP] Chart.js loaded");
                upd();
            };
            document.body.appendChild(script);
        }
    }, []);

    useEffect(() => {
        upd();
    }, [globalData, rules, activeTrades, displaySimple, showCharts, checkPeriod, emitterName, txEnt, txCli, clientAddress, clientPhone, clientEmail, logoL, logoR, annexCols, emptyCellStyle, chartDesign, projectName, chantierName, projectAddress, projectClient, startChantierDate, contractDuration, reportType, emitterPhone, emitterEmail]);

    // DB: Load Trades List
    const loadTrades = async () => {
        try {
            if (!supabase) return;
            const { data, error } = await supabase.from('btp_config').select('value').eq('key', 'trades_list').single();
            if (data && data.value) {
                setTRADES_FULL(data.value);
            }
        } catch (e) { console.error('Error loading trades config:', e); }
    };

    const saveTradesToDB = async (newTrades) => {
        try {
            if (!supabase) return;
            await supabase.from('btp_config').upsert({ key: 'trades_list', value: newTrades, updated_at: new Date() });
        } catch (e) { console.error('Error saving trades:', e); }
    };

    // DB: Load Projects
    const loadProjects = async () => {
        try {
            if (!supabase) {
                setStatus('⚠️ Supabase non configuré (VITE_SUPABASE_URL manquante)');
                return;
            }
            const { data, error } = await supabase.from('btp_projects').select('*').order('name');
            if (error) {
                if (error.code === '42P01') { // Table not found
                    setStatus('⚠️ Table <b>btp_projects</b> manquante. Voulez-vous exécuter le script SQL ?');
                } else if (error.code === '42501') { // RLS / Permission
                    setStatus('⚠️ Accès refusé (RLS). Exécutez le script FIX_RLS.');
                } else {
                    setStatus('❌ Erreur DB: ' + error.message);
                }
                setProjects([]);
                return;
            }
            setProjects(data || []);
            if (data && data.length > 0) setStatus('✅ Projets chargés.');
            else setStatus('ℹ️ Aucun projet en base (Mode Nouveau activé).');
        } catch (e) {
            console.error('Error loading projects:', e);
            setStatus('❌ Erreur de connexion Supabase.');
        }
    };

    const handleProjectSelect = (projId) => {
        if (!projId) { resetToNew(); return; }

        if (projId === 'DEMO_QUARTUS') {
            resetToNew();
            setProjectName('QUARTUS - Officiel (DÉMO)');
            setEmitterName('QUARTUS');
            setTxEnt('400 rue Paul Lafargue\n59283 RAIMBEAUCOURT');
            setTxCli('Résidence Les Grands Chênes\n84140 AVIGNON');

            // Logos
            setLogoL('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgODAiPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iODAiIGZpbGw9IiMxZTRvYWYiIHJ4PSIxMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjM1ZW0iIGZvbnQtd2VpZ2h0PSJib2xkIj5RVUFSVFVTPC90ZXh0Pjwvc3ZnPg==');
            setLogoR('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgODAiPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iODAiIGZpbGw9IiNmOGZhZmMiIHN0cm9rZT0iIzFmNDBhZiIgc3Ryb2tlLXdpZHRoPSI0IiByeD0iMTAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjIyIiBmaWxsPSIjMWU0MGFmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjM1ZW0iPkNMSUVOVCBCVFA8L3RleHQ+PC9zdmc+');

            // Métiers Quatrus
            const qTrades = [
                "Terrassement / Terrassement Voiries", "Gros œuvre", "Dallage", "Charpente",
                "Bardage / Panneaux", "Couverture", "Étanchéité", "Menuiseries extérieures",
                "Espaces verts", "VRD – Voiries et Réseaux Divers"
            ];
            setActiveTrades(qTrades);

            setRules([
                { lots: ["Gros œuvre", "Dallage", "Terrassement / Terrassement Voiries"], var: "temp", type: "cond4", op: "<", val: "2", h1: 8, h2: 23, desc: "Gel (T < 2°C à 8h)" },
                { lots: ["Gros œuvre", "Dallage"], var: "temp", type: "cond4", op: "<", val: "0", h1: 12, h2: 23, desc: "Gel Persistant" },
                { lots: ["Terrassement / Terrassement Voiries", "VRD – Voiries et Réseaux Divers"], var: "pluie", type: "cond1", op: ">=", val: "5", desc: "Pluie Forte (5mm)" },
                { lots: ["Charpente", "Couverture", "Bardage / Panneaux"], var: "vent_rafale", type: "cond1", op: ">", val: "60", desc: "Vent violent (>60km/h)" },
                { lots: ["Étanchéité"], var: "pluie", type: "cond1", op: ">", val: "0", desc: "Pluie (Toute)" }
            ]);

            setShowCharts(true);
            setCheckPeriod(true);
            setStatus('✅ Modèle QUARTUS chargé avec succès.');
            return;
        }

        const p = projects.find(x => x.id === projId);
        if (!p) return;
        setCurrentProjectId(p.id);
        setProjectName(p.name);
        const meta = p.global_data?.__metadata || {};
        setChantierName(p.chantier_name || meta.chantier_name || '');
        setTxEnt(p.company_header || '');
        setTxCli(p.client_header || '');
        setEmailCli(p.client_email || '');
        setStationMeteo(p.station_name || '');
        const sid = p.station_id || '';
        setSelectedStationId(sid);
        if (sid && sid.length >= 5) {
            const depPrefix = sid.substring(0, 2);
            setSelectedDept(depPrefix);
        } else if (p.selected_dept) {
            setSelectedDept(p.selected_dept);
        }

        setProjectAddress(p.project_address || meta.project_address || '');
        setClientAddress(p.client_address || meta.client_address || '');
        setClientPhone(p.client_phone || meta.client_phone || '');
        setClientEmail(p.client_email_contact || meta.client_email_contact || '');
        setProjectClient(p.project_client || meta.project_client || '');
        setStartChantierDate(p.start_chantier_date || meta.start_chantier_date || '');
        setContractDuration(p.contract_duration || meta.contract_duration || '');
        setContractDurationUnit(p.contract_duration_unit || meta.contract_duration_unit || 'mois');
        setReportType(p.report_type || meta.report_type || 'Hebdomadaire');
        setEmitterPhone(p.emitter_phone || meta.emitter_phone || '06 83 90 91 60');
        setEmitterEmail(p.emitter_email || meta.emitter_email || 'patrick.marliere@wanadoo.fr');

        setLogoL(p.logo_left || '/logo_default.png');
        setLogoR(p.logo_right || '');
        setTRADES_FULL(p.trades_full || TRADES_FULL);
        setActiveTrades(p.active_trades || []);
        setRules(p.rules || []);
        setAnnexCols(p.annex_cols || annexCols);
        setDisplaySimple(p.display_simple);
        setShowCharts(p.show_charts);
        if (p.check_period !== undefined) setCheckPeriod(p.check_period);
        if (p.auto_snow !== undefined) setAutoSnow(p.auto_snow);
        if (p.snow_temp_limit !== undefined) setSnowTempLimit(p.snow_temp_limit);
        if (p.global_data) {
            setGlobalData(p.global_data);
            const sD = {}; const hD = {}; const fD = {}; const bD = {};
            let minD = null; let maxD = null;

            Object.entries(p.global_data).forEach(([d, v]) => {
                const parts = d.split('/');
                if (parts.length === 3) {
                    const dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
                    if (!isNaN(dateObj.getTime())) {
                        if (!minD || dateObj < minD) minD = dateObj;
                        if (!maxD || dateObj > maxD) maxD = dateObj;
                    }
                }

                if (v.soil) sD[d] = v.soil;
                if (v.forceHeat) hD[d] = v.forceHeat;
                if (v.forceFroze) fD[d] = v.forceFroze;
                if (v.fog) bD[d] = v.fog;
            });

            if (minD) setStartDate(minD.toISOString().split('T')[0]);
            if (maxD) setEndDate(maxD.toISOString().split('T')[0]);

            setSoilData(sD); setHeatData(hD); setFrozeData(fD); setFogData(bD);
        }
    };

    const resetToNew = () => {
        setCurrentProjectId('');
        setProjectName('Météo BTP');
        setChantierName('');
        setTxEnt('400 rue Paul Lafargue\n59283 RAIMBEAUCOURT');
        setTxCli('');
        setEmailCli(''); setSelectedStationId(''); setSelectedDept(''); setStationMeteo('');
        setGlobalData({}); setStatus(''); setSoilData({}); setHeatData({}); setFrozeData({}); setFogData({});
        setProjectAddress(''); setClientAddress(''); setClientPhone(''); setClientEmail(''); setProjectClient(''); setStartChantierDate(''); setContractDuration(''); setReportType('Hebdomadaire');
        setActiveTrades([]); // Aucun métier sélectionné par défaut
        setRules([]);
        setLogoL('/logo_default.png'); setLogoR('');
        // Open Trades modal automatically to guide user
        setTradesModalOpen(true);
    };

    const deleteProject = async () => {
        if (!currentProjectId) return;
        if (!window.confirm(`⚠️ Supprimer définitivement le projet "${projectName}" ?`)) return;

        try {
            const { error } = await supabase.from('btp_projects').delete().eq('id', currentProjectId);
            if (error) throw error;
            resetToNew();
            loadProjects();
            setStatus('✅ Projet supprimé.');
        } catch (e) { alert('Erreur suppression: ' + e.message); }
    };

    const duplicateProject = () => {
        if (!currentProjectId && !Object.keys(globalData).length && rules.length <= 3) {
            alert("Rien à dupliquer.");
            return;
        }
        setCurrentProjectId('');
        setProjectName(projectName + ' (Copie)');
        setStatus('📝 Mode duplication : le projet a été cloné, cliquez sur "SAUVER" pour l\'enregistrer.');
    };

    const saveProject = async () => {
        // Champs qui existent comme colonnes directes dans la table btp_projects
        const directColumns = {
            project_address: projectAddress,
            project_client: projectClient,
            start_chantier_date: startChantierDate,
            contract_duration: contractDuration,
            report_type: reportType,
            emitter_phone: emitterPhone,
            emitter_email: emitterEmail,
        };

        // Champs supplémentaires stockés uniquement dans global_data.__metadata
        const extraMeta = {
            chantier_name: chantierName,
            client_address: clientAddress,
            client_phone: clientPhone,
            client_email_contact: clientEmail,
            contract_duration_unit: contractDurationUnit,
            selected_dept: selectedDept
        };

        const allMetadata = { ...directColumns, ...extraMeta };

        const payload = {
            name: projectName,
            company_header: txEnt,
            client_header: txCli,
            client_email: emailCli,
            station_id: selectedStationId,
            station_name: stationMeteo,
            logo_left: logoL,
            logo_right: logoR,
            trades_full: TRADES_FULL,
            active_trades: activeTrades,
            rules: rules,
            annex_cols: annexCols,
            display_simple: displaySimple,
            show_charts: showCharts,
            check_period: checkPeriod,
            auto_snow: autoSnow,
            snow_temp_limit: snowTempLimit,
            // Colonnes directes dans la table btp_projects
            ...directColumns,
            global_data: {
                ...globalData,
                __metadata: allMetadata
            },

            updated_at: new Date()
        };

        try {
            let res;
            if (currentProjectId) {
                res = await supabase.from('btp_projects').update(payload).eq('id', currentProjectId);
            } else {
                res = await supabase.from('btp_projects').insert([payload]).select();
            }
            if (res.error) throw res.error;

            // Si c'est une création, on récupère l'ID généré
            if (!currentProjectId && res.data && res.data[0]) {
                setCurrentProjectId(res.data[0].id);
            }

            loadProjects();
            const saveNotif = document.getElementById('btp-saveNotif');
            if (saveNotif) {
                saveNotif.classList.add('visible');
                setTimeout(() => saveNotif.classList.remove('visible'), 2000);
            }
        } catch (e) { alert('Erreur sauvegarde: ' + e.message); }
    };

    // MF Load Stations
    useEffect(() => {
        if (!selectedDept) { setStations([]); return; }
        async function getStations() {
            setLoadingStations(true);
            try {
                const { weatherAPI } = await import('../../services/api');
                let data = await weatherAPI.getDepartmentLatestHoraire(selectedDept);

                if (!data || data.length === 0) {
                    console.log("[BTP] No stations in DB, using local fallback for dept:", selectedDept);
                    try {
                        const stationNamesData = await import('../../data/stationNames.json');
                        const deptPrefix = (selectedDept === '2A' || selectedDept === '2B') ? '20' : selectedDept;
                        const filtered = Object.entries(stationNamesData.default || stationNamesData)
                            .filter(([id]) => id.startsWith(deptPrefix))
                            .map(([id, name]) => ({ station_id: id, nom_station: name }));
                        data = filtered;
                    } catch (err) {
                        console.error("[BTP] Error loading local station fallback:", err);
                        data = [];
                    }
                }
                setStations(data || []);
                const names = { ...stationNames };
                const { geoService } = await import('../../services/geoService');
                for (const s of data) {
                    const sid = s.station_id || s.id_station;
                    if (!names[sid]) {
                        if (s.nom_station) names[sid] = s.nom_station;
                        else names[sid] = await geoService.getCommuneName(sid.substring(0, 5), sid);
                    }
                }
                setStationNames(names);
            } catch (e) { console.error("[BTP] Error loading stations:", e); } finally { setLoadingStations(false); }
        }
        getStations();
    }, [selectedDept]);

    const handleCsvFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setStatus('⏳ Lecture du fichier CSV...');
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const content = event.target.result;
                const lines = content.split('\n');
                if (lines.length < 2) throw new Error("Fichier vide ou mal formaté");

                // Headers: POSTE;DATE;RR;TN;TX;FXI
                const dataLines = lines.slice(1).filter(l => l.trim().length > 0);

                const days = {};
                let firstDate = null;
                let lastDate = null;
                let stationId = '';

                // On vérifie si les unités de vent sont en m/s ou km/h
                // Si une valeur FXI > 40, on suppose que c'est du km/h
                let maxFxiSeen = 0;
                dataLines.forEach(line => {
                    const cols = line.trim().split(';');
                    if (cols.length >= 6) {
                        const fxi = parseFloat(cols[5]?.replace(',', '.')) || 0;
                        if (fxi > maxFxiSeen) maxFxiSeen = fxi;
                    }
                });
                const windMultiplier = maxFxiSeen > 40 ? 1 : 3.6;
                console.log(`[BTP CSV] Max FXI seen: ${maxFxiSeen}. Using multiplier: ${windMultiplier}`);

                dataLines.forEach(line => {
                    const cols = line.trim().split(';');
                    if (cols.length < 6) return;

                    const rawDate = cols[1]; // YYYYMMDD or YYYYMMDDHH
                    if (!rawDate || (rawDate.length !== 8 && rawDate.length !== 10)) return;

                    const year = parseInt(rawDate.substring(0, 4));
                    const month = parseInt(rawDate.substring(4, 6));
                    const day = parseInt(rawDate.substring(6, 8));
                    const hour = rawDate.length === 10 ? parseInt(rawDate.substring(8, 10)) : 12;

                    const dateObj = new Date(year, month - 1, day);
                    if (!firstDate || dateObj < firstDate) firstDate = dateObj;
                    if (!lastDate || dateObj > lastDate) lastDate = dateObj;

                    const dateKey = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;

                    stationId = cols[0];

                    const rr = parseFloat(cols[2]?.replace(',', '.')) || 0;
                    const tn = parseFloat(cols[3]?.replace(',', '.')) || 0;
                    const tx = parseFloat(cols[4]?.replace(',', '.')) || 0;
                    const fxi = parseFloat(cols[5]?.replace(',', '.')) || 0;

                    if (!days[dateKey]) {
                        days[dateKey] = {
                            rows: [],
                            soil: 0,
                            forceHeat: false,
                            forceFroze: false
                        };
                    }

                    // T° à l'heure : moyenne de tn/tx si c'est vraiment de l'horaire précis tn=tx=t
                    const temp = (tn + tx) / 2;

                    days[dateKey].rows.push({
                        h: hour,
                        temp: temp,
                        rain: rr,
                        snow: 0,
                        w_avg: fxi * windMultiplier, // On met la même chose car souvent seul FXI est dispo
                        w_gst: fxi * windMultiplier,
                        humi: 0,
                        vv: null
                    });
                });

                if (Object.keys(days).length === 0) throw new Error("Aucune donnée valide trouvée dans le fichier.");

                // Apply auto snow & sort rows
                Object.keys(days).forEach(dk => {
                    days[dk].rows.sort((a, b) => a.h - b.h);
                    days[dk].rows = days[dk].rows.map(r => {
                        let sn = 0;
                        if (autoSnow && r.rain > 0 && r.temp !== null && r.temp <= snowTempLimit) {
                            sn = r.rain; r.rain = 0;
                        }
                        return { ...r, snow: sn };
                    });
                });

                // Préserver __metadata lors de l'import CSV
                const prevMeta = globalData?.__metadata;
                if (prevMeta) days.__metadata = prevMeta;
                setGlobalData(days);
                setSelectedStationId(stationId);
                setStationMeteo(stationId); // On pourra le changer manuellement

                // Sync dates UI
                setStartDate(firstDate.toISOString().split('T')[0]);
                setEndDate(lastDate.toISOString().split('T')[0]);

                setStatus(`✅ ${Object.keys(days).length} jours importés avec succès depuis le fichier.`);
            } catch (err) {
                console.error(err);
                setStatus('❌ Erreur Import : ' + err.message);
            }
        };

        reader.readAsText(file);
    };

    const handlePeriodImport = async () => {
        if (!selectedStationId) {
            setStatus('⚠️ Sélectionnez d\'abord une station');
            return;
        }
        if (!startDate || !endDate) {
            setStatus('⚠️ Sélectionnez une période valide');
            return;
        }

        setStatus('Récupération des données...');
        const prevMetadata = globalData?.__metadata || {};
        setGlobalData({}); // Reset current data

        try {
            // 1. Tenter l'historique horaire direct Supabase
            let history = await weatherAPI.getStationHourlyHistoryRange(selectedStationId, startDate, endDate);

            const getLocalDateString = (date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${d}/${m}/${y}`;
            };

            // 2. Vérifier si des jours manquent dans la période demandée
            const checkMissingDays = (data) => {
                const found = new Set(data.map(obs => getLocalDateString(obs.time)));
                let curr = new Date(startDate);
                const stop = new Date(endDate);
                const missing = [];
                while (curr <= stop) {
                    const ds = getLocalDateString(curr);
                    if (!found.has(ds)) missing.push(new Date(curr));
                    curr.setDate(curr.getDate() + 1);
                }
                return missing;
            };

            let missingDays = checkMissingDays(history);

            // 3. Si des jours manquent, tenter de les combler via Météo-France API (Archives / En direct)
            if (missingDays.length > 0) {
                console.log(`[BTP] Il manque ${missingDays.length} jours. Tentative Météo France...`);

                // On utilise le service Météo-France Poste
                try {
                    const apiData = await meteoFrancePosteService.getStationHourlyHistory(selectedStationId, startDate, endDate);
                    if (apiData && apiData.length > 0) {
                        const existingTimes = new Set(history.map(h => h.time.getTime()));
                        const newObs = apiData.filter(obs => !existingTimes.has(obs.time.getTime()));
                        history = [...history, ...newObs].sort((a, b) => a.time - b.time);
                        missingDays = checkMissingDays(history);
                    }
                } catch (e) { }

                // Tentative via DPClim Horaire officiel (Archives certifiées heure par heure)
                if (missingDays.length > 0) {
                    try {
                        const dpHourly = await meteoFranceClimService.fetchStationHourlyHistory(selectedStationId, startDate, endDate);
                        if (dpHourly && dpHourly.length > 0) {
                            const existingTimes = new Set(history.map(h => h.time.getTime()));
                            const newObs = dpHourly.filter(obs => !existingTimes.has(obs.time.getTime()));
                            history = [...history, ...newObs].sort((a, b) => a.time - b.time);
                            missingDays = checkMissingDays(history);
                        }
                    } catch (e) {
                        console.warn("[BTP] Erreur DPClim horaire:", e);
                    }
                }
            }

            // 4. Si encore vide ou incomplet, essayer le 6mn Supabase
            if (missingDays.length > 0) {
                for (const day of missingDays) {
                    const dayData6mn = await weatherAPI.getStation6mnHistory(selectedStationId, day);
                    if (dayData6mn && dayData6mn.length > 0) {
                        const exactHourlyData = dayData6mn.filter(h => h.time.getMinutes() === 0);
                        const allHoursStr = new Set(exactHourlyData.map(h => h.time.getHours()));
                        const hourlyMap = new Map();
                        dayData6mn.forEach(h => {
                            const hr = h.time.getHours();
                            if (h.time.getMinutes() === 0) {
                                hourlyMap.set(hr, h);
                            } else if (!allHoursStr.has(hr)) {
                                const existing = hourlyMap.get(hr);
                                if (!existing) hourlyMap.set(hr, h);
                                else {
                                    const distH = Math.min(h.time.getMinutes(), 60 - h.time.getMinutes());
                                    const distE = Math.min(existing.time.getMinutes(), 60 - existing.time.getMinutes());
                                    if (distH < distE) hourlyMap.set(hr, h);
                                }
                            }
                        });
                        // On calcule le cumul de pluie AVANT d'altérer l'heure pour garantir 60 min de cumul
                        const dayHourly = Array.from(hourlyMap.values()).map(item => {
                            const endTime = item.time.getTime();
                            const startTime = endTime - (60 * 60 * 1000);
                            const hourlyRain = dayData6mn
                                .filter(d => d.time.getTime() > startTime && d.time.getTime() <= endTime)
                                .reduce((sum, d) => sum + (d.rain || 0), 0);

                            // Nettoyage de l'heure pour l'affichage (ex: 16:06 -> 16:00)
                            let cleanTime = item.time;
                            if (item.time.getMinutes() !== 0) {
                                cleanTime = new Date(item.time);
                                if (cleanTime.getMinutes() > 30) cleanTime.setHours(cleanTime.getHours() + 1);
                                cleanTime.setMinutes(0);
                                cleanTime.setSeconds(0);
                            }

                            const hourlySegment = dayData6mn.filter(d => d.time.getTime() > startTime && d.time.getTime() <= endTime);
                            const hourlyGust = hourlySegment.length > 0
                                ? Math.max(...hourlySegment.map(d => d.gust || 0))
                                : (item.gust || 0);

                            const hourlyWindMax = hourlySegment.length > 0
                                ? Math.max(...hourlySegment.map(d => d.wind || 0))
                                : (item.wind || 0);

                            const hourlyTempMax = hourlySegment.length > 0
                                ? Math.max(...hourlySegment.map(d => d.temp !== null ? d.temp : -999))
                                : (item.temp || -999);

                            const finalTemp = hourlyTempMax > -900 ? hourlyTempMax : item.temp;

                            return {
                                time: cleanTime,
                                temp: finalTemp,
                                rain: hourlyRain,
                                wind: hourlyWindMax,
                                gust: hourlyGust,
                                hum: item.hum
                            };
                        });
                        history = [...history, ...dayHourly].sort((a, b) => a.time - b.time);
                    }
                }
            }

            // 5. Fallback ULTIME Météo-France DPClim (Extrêmes & Relevés Certifiés 1950-Hier)
            missingDays = checkMissingDays(history);
            if (missingDays.length > 0) {
                console.log(`[BTP] ⚡ Appel Météo-France DPClim pour combler ${missingDays.length} jours...`);
                try {
                    const dpClimData = await meteoFranceClimService.fetchStationHistory(selectedStationId, startDate, endDate);
                    if (dpClimData && dpClimData.length > 0) {
                        const existingDates = new Set(history.map(h => getLocalDateString(h.time)));
                        dpClimData.forEach(dpDay => {
                            const [y, m, d] = dpDay.date.split('-').map(Number);
                            const ds = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
                            if (!existingDates.has(ds)) {
                                const dayObs = [
                                    { time: new Date(y, m - 1, d, 6, 0), temp: dpDay.tn, rain: (dpDay.rr || 0) * 0.2, wind: Math.round((dpDay.fxi || 0) * 0.4), gust: Math.round((dpDay.fxi || 0) * 0.6), hum: 85, isDPClim: true },
                                    { time: new Date(y, m - 1, d, 10, 0), temp: dpDay.tm !== null ? dpDay.tm : (dpDay.tn !== null ? dpDay.tn + 3 : 15), rain: (dpDay.rr || 0) * 0.3, wind: Math.round((dpDay.fxi || 0) * 0.6), gust: Math.round((dpDay.fxi || 0) * 0.8), hum: 75, isDPClim: true },
                                    { time: new Date(y, m - 1, d, 14, 0), temp: dpDay.tx, rain: (dpDay.rr || 0) * 0.3, wind: Math.round((dpDay.fxi || 0) * 0.7), gust: dpDay.fxi || 0, hum: 60, isDPClim: true },
                                    { time: new Date(y, m - 1, d, 18, 0), temp: dpDay.tm !== null ? dpDay.tm : (dpDay.tx !== null ? dpDay.tx - 3 : 15), rain: (dpDay.rr || 0) * 0.2, wind: Math.round((dpDay.fxi || 0) * 0.5), gust: Math.round((dpDay.fxi || 0) * 0.7), hum: 70, isDPClim: true }
                                ];
                                history.push(...dayObs);
                            }
                        });
                        history.sort((a, b) => a.time - b.time);
                    }
                } catch (errDPClim) {
                    console.warn("[BTP] Erreur fallback DPClim:", errDPClim);
                }
            }

            if (!history || history.length === 0) {
                setStatus('❌ Aucune donnée trouvée (Supabase/API/DPClim) pour cette période.');
                return;
            }


            const grouped = {};
            history.forEach(obs => {
                const dayKey = getLocalDateString(obs.time);
                if (!grouped[dayKey]) grouped[dayKey] = [];

                // Adapter format
                grouped[dayKey].push({
                    h: obs.time.getHours(),
                    temp: obs.temp,
                    rain: obs.rain || 0,
                    snow: 0, // Will be calculated if autoSnow is true
                    w_avg: obs.wind,
                    w_gst: obs.gust,
                    humi: obs.hum,
                    vv: obs.vv
                });
            });

            const newGlobalData = {};
            Object.entries(grouped).forEach(([date, rows]) => {
                // Apply auto snow logic
                const processedRows = rows.map(r => {
                    let sn = 0;
                    if (autoSnow && r.rain > 0 && r.temp !== null && r.temp <= snowTempLimit) {
                        sn = r.rain;
                        r.rain = 0; // Move rain to snow
                    }
                    return { ...r, snow: sn };
                }).sort((a, b) => a.h - b.h);

                newGlobalData[date] = {
                    rows: processedRows,
                    soil: safeFloat(soilData[date] || 0),
                    forceHeat: heatData[date] || false,
                    forceFroze: frozeData[date] || false,
                    fog: fogData[date] || false
                };
            });

            if (Object.keys(newGlobalData).length === 0) {
                setStatus('⚠️ Aucune donnée trouvée pour cette période/station.');
            } else {
                // Préserver __metadata lors de l'écrasement de globalData
                newGlobalData.__metadata = prevMetadata;
                setGlobalData(newGlobalData);
                const sNames = stationNames[selectedStationId] || selectedStationId;
                setStationMeteo(`${sNames} (${selectedStationId})`);
                setStatus(`✅ ${Object.keys(newGlobalData).length} jours importés avec succès.`);
            }

        } catch (e) {
            console.error(e);
            setStatus('❌ Erreur Import: ' + e.message);
        }
    };

    const exportToJson = () => {
        const payload = {
            projectName,
            txEnt,
            txCli,
            emailCli,
            station_id: selectedStationId,
            selected_dept: selectedDept,
            station_name: stationMeteo,
            tradesFull: TRADES_FULL,
            activeTrades,
            rules,
            annexCols,
            displaySimple,
            showCharts,
            autoSnow,
            snowTempLimit,
            globalData,
            projectAddress,
            projectClient,
            startChantierDate,
            contractDuration,
            reportType,
            emitterPhone,
            emitterEmail
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `BTP_${projectName.replace(/\s+/g, '_')}.json`);
        dlAnchorElem.click();
    };

    const importFromJson = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const p = JSON.parse(ev.target.result);
                if (p.projectName) setProjectName(p.projectName);
                if (p.txEnt) setTxEnt(p.txEnt);
                if (p.txCli) setTxCli(p.txCli);
                if (p.emailCli) setEmailCli(p.emailCli);
                if (p.station_id) setSelectedStationId(p.station_id);
                if (p.station_name) setStationMeteo(p.station_name);
                if (p.tradesFull) setTRADES_FULL(p.tradesFull);
                if (p.activeTrades) setActiveTrades(p.activeTrades);
                if (p.rules) setRules(p.rules);
                if (p.annexCols) setAnnexCols(p.annexCols);
                if (p.displaySimple !== undefined) setDisplaySimple(p.displaySimple);
                if (p.showCharts !== undefined) setShowCharts(p.showCharts);
                if (p.autoSnow !== undefined) setAutoSnow(p.autoSnow);
                if (p.snowTempLimit !== undefined) setSnowTempLimit(p.snowTempLimit);
                if (p.globalData) setGlobalData(p.globalData);

                if (p.projectAddress) setProjectAddress(p.projectAddress);
                if (p.projectClient) setProjectClient(p.projectClient);
                if (p.startChantierDate) setStartChantierDate(p.startChantierDate);
                if (p.contractDuration) setContractDuration(p.contractDuration);
                if (p.reportType) setReportType(p.reportType);
                if (p.emitterPhone) setEmitterPhone(p.emitterPhone);
                if (p.emitterEmail) setEmitterEmail(p.emitterEmail);
                setStatus('✅ JSON Importé avec succès');
            } catch (err) { alert('Erreur import JSON: ' + err.message); }
        };
        reader.readAsText(file);
    };

    const safeFloat = (valStr) => { if (!valStr) return 0; return parseFloat(String(valStr).replace(',', '.')); };
    const chk = (a, op, b) => {
        if (a === null || a === undefined) return false;
        if (op == '<') return a < b; if (op == '<=') return a <= b; if (op == '>') return a > b; if (op == '>=') return a >= b; return false;
    };

    // Manual Update of Day Properties (Soil, Force Heat, etc.)
    const updateDayProp = (date, prop, val) => {
        const newData = { ...globalData };
        if (!newData[date]) return; // Should not happen if UI is consistent

        // Update deeply
        newData[date] = { ...newData[date], [prop]: val };

        // Sync with local states for persistence across re-imports if needed (though globalData is source of truth here)
        if (prop === 'soil') setSoilData(prev => ({ ...prev, [date]: val }));
        if (prop === 'forceHeat') setHeatData(prev => ({ ...prev, [date]: val }));
        if (prop === 'forceFroze') setFrozeData(prev => ({ ...prev, [date]: val }));
        if (prop === 'fog') setFogData(prev => ({ ...prev, [date]: val }));

        setGlobalData(newData);
    };

    // AI Import Logic
    const parseAiText = (txt) => {
        const lines = txt.split('\n').map(l => l.trim()).filter(l => l);
        const parsed = [];

        lines.forEach(line => {
            // Hour: "06 h :" or "6h:"
            const hMatch = line.match(/^(\d{1,2})\s*h\s*[:]?/i);
            if (!hMatch) return;
            const h = parseInt(hMatch[1]);

            // Temp: matches "T +12.5°C" or "T -2°C"
            const tMatch = line.match(/T\s*([+-]?\d+[.,]?\d*)\s*°C/i);
            const t = tMatch ? parseFloat(tMatch[1].replace(',', '.')) : null;

            // Rain: matches "Pluie 2.0mm" or "Pluie 0 mm"
            let r = 0;
            if (line.toLowerCase().includes('pluie traces') || line.toLowerCase().includes('pluie aucune')) {
                r = 0;
            } else {
                const rMatch = line.match(/Pluie\s*(\d+[.,]?\d*)\s*mm/i);
                if (rMatch) r = parseFloat(rMatch[1].replace(',', '.'));
            }

            // Wind (Average)
            const wMatch = line.match(/Vent\s*(\d+)\s*km\/h/i);
            const wA = wMatch ? parseInt(wMatch[1]) : 0;

            // Gust
            const gMatch = line.match(/Rafale[s]?\s*(\d+)\s*km\/h/i);
            const wG = gMatch ? parseInt(gMatch[1]) : wA;

            // Humidity
            const huMatch = line.match(/Humidit(?:é|e)\s*(\d+)\s*%/i);
            const hu = huMatch ? parseInt(huMatch[1]) : 0;

            if (t !== null) {
                parsed.push({ h, temp: t, rain: r, snow: 0, w_avg: wA, w_gst: wG, humi: hu, vv: null });
            }
        });

        console.log("[BTP] AI Parsed result:", parsed);
        return parsed.sort((a, b) => a.h - b.h);
    };

    const handleAiImport = () => {
        if (!aiRawText.trim()) return;

        // We need a date to attach these to. 
        // Strategy: Use 'startDate' as the target date for this import. 
        // Or ask user? For simplicity, we assume user selects the day in "Du" datepicker.
        // But the range selector might be set to a week. 
        // Let's parse just one day, and put it on the 'startDate'.

        const rows = parseAiText(aiRawText);

        if (rows.length === 0) {
            alert("Impossible de lire les données. Assurez-vous qu'elles respectent le format : [Heure] : T ... | Pluie ... ");
            return;
        }

        // Determine target date
        const dSplit = startDate.split('-');
        const dateKey = `${dSplit[2]}/${dSplit[1]}/${dSplit[0]}`; // d/m/Y

        // Apply auto snow
        const processedRows = rows.map(r => {
            let sn = 0;
            if (autoSnow && r.rain > 0 && r.temp !== null && r.temp <= snowTempLimit) {
                sn = r.rain; r.rain = 0;
            }
            return { ...r, snow: sn };
        });

        setGlobalData(prev => ({
            ...prev,
            [dateKey]: {
                rows: processedRows,
                soil: safeFloat(soilData[dateKey] || 0),
                forceHeat: heatData[dateKey] || false,
                forceFroze: frozeData[dateKey] || false,
                fog: fogData[dateKey] || false
            }
        }));

        setAiImportModalOpen(false);
        setAiRawText('');
        setStatus(`✅ Données manuelles importées pour le ${dateKey}`);
    };

    const calculateKoV96 = (r, d, soilVal, forceHeat, forceFroze, forceFog) => {
        if (r.var === 'canicule') return forceHeat === true ? "DÉCLARÉE" : false;
        if (r.var === 'soil') return chk(soilVal, r.op, safeFloat(r.val)) ? `${soilVal}%` : false;
        if (r.var === 'heat' && forceHeat) return "DÉCLARÉE";
        if (r.var === 'temp' && forceFroze && r.val <= 0) return "GELÉ";
        if (r.var === 'fog' && forceFog) return "PRÉSENT";

        let k = r.var == 'vent_rafale' ? 'w_gst' : (r.var == 'vent_avg' ? 'w_avg' : (r.var == 'pluie' ? 'rain' : (r.var == 'neige' ? 'snow' : (r.var == 'humi_max' ? 'humi' : 'temp'))));
        let v1 = safeFloat(r.val);
        if (r.var === 'heat') k = 'temp';
        let unit = r.var.includes('pluie') ? 'mm' : (r.var.includes('neige') ? 'cm' : ((r.var.includes('temp') || r.var.includes('heat')) ? '°C' : (r.var.includes('soil') ? '%' : 'km/h')));

        const formatVal = (val, h) => {
            const finalVal = unit === 'km/h' ? Math.round(val) : (Number(val) % 1 === 0 ? val : Number(val).toFixed(1));
            return `${finalVal}${unit} (à ${h}h)`;
        };

        if (r.type == 'cond1') {
            if (r.var == 'pluie' || r.var == 'neige') { const s = d.reduce((a, b) => a + b[k], 0); if (chk(s, r.op, v1)) return `${s.toFixed(1)}${unit} (24h)`; }
            else { const ext = d.find(x => chk(x[k], r.op, v1)); if (ext) return formatVal(ext[k], ext.h); }
        } else if (r.type == 'cond2') {
            const sub = d.filter(x => x.h >= r.h1 && x.h <= r.h2);
            if (r.var == 'pluie' || r.var == 'neige') { const s = sub.reduce((a, b) => a + b[k], 0); if (chk(s, r.op, v1)) return `${s.toFixed(1)}${unit} (${r.h1}h-${r.h2}h)`; }
            else { const ext = sub.find(x => chk(x[k], r.op, v1)); if (ext) return formatVal(ext[k], ext.h); }
        } else if (r.type == 'cond3') {
            const sub = d.filter(x => x.h >= r.h1 && x.h <= r.h2);
            let s = 0, maxS = 0, lastH = 0;
            sub.forEach(x => { if (chk(x[k], r.op, v1)) { s++; lastH = x.h; } else s = 0; if (s > maxS) maxS = s; });
            if (maxS >= r.dur) return `Pdt ${maxS}h (fin ${lastH}h)`;
        } else if (r.type == 'cond4') {
            const row = d.find(x => x.h == r.h1);
            if (row && chk(row[k], r.op, v1)) return formatVal(row[k], row.h);
        } else if (r.type == 'cond5') {
            const v2 = safeFloat(r.val2);
            const row1 = d.find(x => x.h == r.h1);
            const row2 = d.find(x => x.h == r.h3);
            const res1 = (row1 && chk(row1[k], r.op, v1));
            const res2 = (row2 && chk(row2[k], r.op2 || r.op, v2));
            const vStr1 = row1 ? formatVal(row1[k], r.h1) : `?`;
            const vStr2 = row2 ? formatVal(row2[k], r.h3) : `?`;
            if (r.logic === 'OR') { if (res1 || res2) return `${vStr1} OU ${vStr2}`; }
            else { if (res1 && res2) return `${vStr1} ET ${vStr2}`; }
        } else if (r.type == 'cond6') {
            const fullData = new Array(24).fill(0);
            d.forEach(row => { if (row.h >= 0 && row.h < 24) fullData[row.h] = row[k]; });
            const duration = r.dur || 1;
            const isCumulative = (r.var == 'pluie' || r.var == 'neige');
            for (let h = 0; h <= 24 - duration; h++) {
                let val = 0;
                if (isCumulative) {
                    for (let t = 0; t < duration; t++) val += fullData[h + t];
                    val = Math.round(val * 100) / 100;
                    if (chk(val, r.op, v1)) return `${val}${unit} (${h}h-${h + duration}h)`;
                } else {
                    let matchCount = 0;
                    for (let t = 0; t < duration; t++) { if (chk(fullData[h + t], r.op, v1)) matchCount++; }
                    if (matchCount === duration) return `Pdt ${duration}h (${h}h-${h + duration}h)`;
                }
            }
        }
        return false;
    };

    const upd = () => {
        const ent = `<strong>${(emitterName || "").toUpperCase()}</strong><br>${(txEnt || "").replace(/\n/g, '<br>')}`;
        const emitterInfo = `<div style="font-size:7.5pt; line-height:1.2; color:#1e293b; margin-top:2px;">
            ${emitterPhone ? `<span>Tel : ${emitterPhone}</span>` : ''}
            ${emitterEmail ? `<br><span>${emitterEmail}</span>` : ''}
        </div>`;
        const cliInfo = `<div style="font-size:7.5pt; line-height:1.2; color:#1e293b; margin-top:2px;">
            <strong>${(projectClient || txCli || "").toUpperCase()}</strong>
            ${clientAddress ? `<br>${clientAddress.replace(/\n/g, '<br>')}` : ''}
            ${clientPhone ? `<br><span>Tel : ${clientPhone}</span>` : ''}
            ${clientEmail ? `<br><span>${clientEmail}</span>` : ''}
        </div>`;
        const imgL = logoL ? `<img src="${logoL}" style="max-height:60px; display:block; margin-bottom:5px;">` : '';
        const imgR = logoR ? `<img src="${logoR}" style="max-height:60px; display:block; margin-bottom:5px; margin-left:auto;">` : '';
        let html = '';
        let chartsHtml = '';
        const sortedActiveTrades = [...activeTrades].sort((a, b) => a.localeCompare(b, 'fr'));

        if (Object.keys(globalData).length === 0) {
            setReportOutput('<div style="padding:100px;text-align:center;color:#94a3b8;font-style:italic;font-size:1.2rem;">Sélectionnez une station et une période, puis cliquez sur "Récupérer Relevés" pour générer le rapport.</div>');
            setChartsOutput('');
            return;
        }

        // --- SYNTHÈSE GLOBALE ---
        if (checkPeriod) {
            const dataEntries = Object.entries(globalData || {}).filter(([k]) => k !== '__metadata');
            let totalDays = dataEntries.length;
            let totalRainPeriod = 0; const daysKO = new Set();
            let syncHtml = `<div class="btp-doc-section">`;

            syncHtml += `<div class="btp-doc-head">
                <div style="flex: 0 0 220px; text-align: left;">${imgL}<div style="font-size:7.5pt;line-height:1.3;margin-top:2px;color:#1e293b;">${ent}${emitterInfo}</div></div>
                <div style="flex: 1; text-align:center; padding: 0 15px;">
                    <div class="btp-main-title-box">
                        <h1>RELEVÉ D'INTEMPÉRIES</h1>
                        <div style="font-size: 11pt; font-weight: bold; color: #003366; margin-bottom: 5px; text-transform: uppercase;">CHANTIER : ${chantierName || projectName}</div>
                        <div class="btp-subtitle">BILAN PÉRIODIQUE</div>
                    </div>
                    <div style="font-weight:bold; font-size:9pt; color:#1e293b; margin-top:4px;">${totalDays} JOUR(S) ANALYSÉ(S)</div>
                </div>
                <div style="flex: 0 0 220px; text-align:right;">${imgR}${cliInfo}</div>
            </div>`;

            // NEW: PROJECT INFO & RULES SUMMARY
            syncHtml += `
            <div style="margin: 10px 0; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff;">
                <h3 style="margin-top:0; color:#1e293b; font-size:0.9rem; border-bottom:1px solid #f1f5f9; padding-bottom:5px; font-weight:800; text-transform:uppercase; margin-bottom:8px;">1. INFORMATIONS CHANTIER</h3>
                <table style="width:100%; border:none; border-collapse: collapse;">
                    <tr style="border:none;">
                        <td style="border:none; text-align:left; width:50%; padding:4px 0; font-size:0.8rem;"><strong>Démarrage :</strong> ${startChantierDate || '--'}</td>
                        <td style="border:none; text-align:left; width:50%; padding:4px 0; font-size:0.8rem;"><strong>Entreprise :</strong> ${projectClient || '--'}</td>
                    </tr>
                    <tr style="border:none;">
                        <td style="border:none; text-align:left; padding:4px 0; font-size:0.8rem;"><strong>Contrat :</strong> ${contractDuration || '--'} ${contractDuration ? contractDurationUnit : ''}</td>
                        <td style="border:none; text-align:left; padding:4px 0; font-size:0.8rem; vertical-align: top;"><strong>Relevé :</strong> ${reportType || '--'}</td>
                    </tr>
                    <tr style="border:none;">
                        <td style="border:none; text-align:left; padding:4px 0; font-size:0.8rem; vertical-align: top;" colspan="2"><strong>Adresse :</strong> ${projectAddress || '--'}</td>
                    </tr>
                </table>

                <h3 style="margin-top:15px; color:#1e293b; font-size:0.9rem; border-bottom:1px solid #f1f5f9; padding-bottom:5px; font-weight:800; text-transform:uppercase; margin-bottom:8px;">2. RÈGLES MÉTÉOROLOGIQUES</h3>
                <table class="btp-table-decision" style="margin-top:5px; width:100%; font-size:0.75rem;">
                    <thead>
                        <tr>
                            <th style="width:140px; text-align:left; padding:4px; background-color:#1e293b !important; color:white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">Paramètre</th>
                            <th style="width:100px; padding:4px; background-color:#1e293b !important; color:white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">Seuil</th>
                            <th style="padding:4px; background-color:#1e293b !important; color:white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(rules || []).map(r => {
                let k = r.var;
                if (r.var === 'vent_rafale') k = 'Rafale'; if (r.var === 'vent_avg') k = 'V. Moy';
                if (r.var === 'temp') k = 'Temp'; if (r.var === 'pluie') k = 'Pluie';
                if (r.var === 'neige') k = 'Neige'; if (r.var === 'soil') k = 'Hum. Sol';
                if (r.var === 'fog') k = 'Brouillard';
                let desc = r.desc || `${k} ${r.op} ${r.val}`;
                let unit = (r.var || "").includes('pluie') ? 'mm' : ((r.var || "").includes('neige') ? 'cm' : (((r.var || "").includes('temp') || (r.var || "").includes('heat')) ? '°C' : ((r.var || "").includes('soil') ? '%' : 'km/h')));
                return `<tr><td style="text-align:left; font-weight:700; background:#f8fafc; padding-left:10px; padding:4px;">${k}</td><td style="font-weight:600; color:#1e293b; padding:4px;">${r.op} ${r.val}${unit}</td><td style="text-align:left; padding-left:10px; padding:4px;">${desc}</td></tr>`;
            }).join('')}
                    </tbody>
                </table>
            </div>`;

            syncHtml += `<h3 class="btp-section-title" style="margin-top:10px; text-transform:uppercase; font-size:0.9rem; margin-bottom:5px;">3. BILAN EXPLOITATION / INTEMPÉRIES</h3>
            <table class="btp-table-period" style="font-size: ${totalDays > 15 ? '0.7rem' : '0.8rem'}; page-break-inside: auto; border-collapse: collapse;">
                <thead><tr><th style="padding:4px; background-color:#1e293b !important; color:white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">Date</th><th style="padding:4px; background-color:#1e293b !important; color:white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">T. Min/Max</th><th style="padding:4px; background-color:#1e293b !important; color:white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">Pluie</th><th style="padding:4px; background-color:#1e293b !important; color:white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">Vent Max</th><th style="padding:4px; background-color:#1e293b !important; color:white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">Statut</th></tr></thead><tbody>`;

            Object.entries(globalData || {}).filter(([k]) => k !== '__metadata').sort((a, b) => {
                const partsA = a[0].split('/');
                const partsB = b[0].split('/');
                if (partsA.length < 3 || partsB.length < 3) return 0;
                const [d1, m1, y1] = partsA.map(Number);
                const [d2, m2, y2] = partsB.map(Number);
                return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
            }).forEach(([date, dataObj]) => {
                const rows = dataObj?.rows || [];
                const ts = rows.map(d => d.temp).filter(v => v !== null);
                const rs = rows.reduce((a, b) => a + (b.rain || 0), 0);
                const maxG = rows.length > 0 ? Math.max(...rows.map(d => d.w_gst || 0)) : 0;
                totalRainPeriod += rs;
                let dayIsKo = false;
                rules.forEach(r => {
                    const affectsActive = r.lots && r.lots.some(t => activeTrades.includes(t));
                    if (affectsActive && calculateKoV96(r, dataObj.rows, dataObj.soil, dataObj.forceHeat, dataObj.forceFroze, dataObj.fog)) dayIsKo = true;
                });
                if (dayIsKo) daysKO.add(date);
                syncHtml += `<tr><td style="font-weight:700; padding:4px;">${date}</td><td style="padding:4px;">${ts.length ? Math.min(...ts).toFixed(1) + '°' : '--'} / ${ts.length ? Math.max(...ts).toFixed(1) + '°' : '--'}</td><td style="padding:4px;">${rs.toFixed(1)} mm</td><td style="padding:4px;">${maxG.toFixed(1)} km/h</td><td style="padding:4px;">${dayIsKo ? '<span class="btp-tag btp-tag-ko" style="padding:2px 6px; font-size:0.65rem;">INTEMPÉRIE</span>' : '<span class="btp-tag btp-tag-ok" style="padding:2px 6px; font-size:0.65rem;">RAS</span>'}</td></tr>`;
            });
            syncHtml += `</tbody></table>
            <div class="btp-result-box">
                <h2>RÉSULTAT FINAL</h2>
                <div style="font-size:11pt; color:#1e293b; font-weight:700; margin-top:5px;">
                    ${daysKO.size} jour(s) d'intempérie(s) identifié(s) sur ${totalDays} jour(s) analysé(s).
                </div>
                <div style="font-size:8pt; color:#64748b; margin-top:4px;">Station : ${stationMeteo}</div>
            </div>
            </div>`;
            html += syncHtml;
        }

        // --- RAPPORTS QUOTIDIENS ---
        Object.entries(globalData || {}).filter(([k]) => k !== '__metadata').sort((a, b) => {
            const partsA = a[0].split('/');
            const partsB = b[0].split('/');
            if (partsA.length < 3 || partsB.length < 3) return 0;
            const [d1, m1, y1] = partsA.map(Number);
            const [d2, m2, y2] = partsB.map(Number);
            return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
        }).forEach(([date, dataObj]) => {
            const dData = dataObj?.rows || [];
            const soilVal = dataObj.soil;
            const forceHeat = dataObj.forceHeat;
            const forceFroze = dataObj.forceFroze;
            const forceFog = dataObj.fog;

            const commonHead = (title, subtitle = '') => `<div class="btp-doc-head">
                <div style="flex: 0 0 220px; text-align: left;">${imgL}<div style="font-size:7.5pt;line-height:1.3;margin-top:2px;color:#1e293b;">${ent}${emitterInfo}</div></div>
                <div style="flex: 1; text-align:center; padding: 0 15px;">
                    <div class="btp-main-title-box">
                        <h1>${title}</h1>
                        ${subtitle ? `<div class="btp-subtitle">${subtitle}</div>` : ''}
                    </div>
                    <div style="font-weight:bold; font-size:10pt; color:#1e293b; margin-top:4px;">${date}</div>
                    ${stationMeteo ? `<div style="font-size:8pt; color:#64748b; margin-top:2px;">Poste : <strong>${stationMeteo}</strong></div>` : ''}
                </div>
                <div style="flex: 0 0 220px; text-align:right;">${imgR}${cliInfo}</div>
            </div>`;

            // PARTIE 1 : SYNTHÈSE & RÉSUMÉ
            let part1 = `<div class="btp-doc-section">` + commonHead("RELEVÉ D'INTEMPÉRIES", `${projectName}`);

            // 1. Synthèse Décisionnelle
            part1 += `<div class="btp-keep-together"><h3 class="btp-section-title">1. SYNTHÈSE DÉCISIONNELLE</h3><table class="btp-table-decision"><thead><tr><th style="width:200px; background-color:#1e293b !important; color:white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">Métiers / Corps d'état</th>`;
            const ruleCols = [];
            rules.forEach(r => {
                let k = r.var;
                if (r.var === 'vent_rafale') k = 'Rafale'; if (r.var === 'vent_avg') k = 'V. Moy';
                if (r.var === 'temp') k = 'Temp'; if (r.var === 'pluie') k = 'Pluie';
                if (r.var === 'neige') k = 'Neige'; if (r.var === 'soil') k = 'Hum. Sol';
                if (r.var === 'fog') k = 'Brouillard';
                let desc = r.desc || `${k} ${r.op} ${r.val}`;
                const res = calculateKoV96(r, dData, soilVal, forceHeat, forceFroze, forceFog);
                ruleCols.push({ desc, res, lots: r.lots || [] });
                part1 += `<th style="background-color:#1e293b !important; color:white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${desc}</th>`;
            });
            part1 += `</tr></thead><tbody>`;
            if (sortedActiveTrades.length === 0) {
                part1 += `<tr><td colspan="${ruleCols.length + 1}">Aucun métier sélectionné.</td></tr>`;
            } else {
                sortedActiveTrades.forEach(t => {
                    part1 += `<tr><td style="text-align:left;font-weight:600;background:#f8fafc;padding-left:10px;">${t}</td>`;
                    ruleCols.forEach(col => {
                        if (col.lots.includes(t)) {
                            if (col.res !== false) part1 += `<td><span class="btp-tag btp-tag-ko">${displaySimple ? 'INTEMPÉRIE' : col.res}</span></td>`;
                            else part1 += `<td><span class="btp-tag btp-tag-ok">RAS</span></td>`;
                        } else {
                            part1 += `<td class="${emptyCellStyle === 'gray' ? 'btp-cell-empty' : 'btp-cell-white'}"></td>`;
                        }
                    });
                    part1 += `</tr>`;
                });
            }
            part1 += `</tbody></table></div>`;

            // 2. Résumé du Jour
            const tsAll = dData.map(d => d.temp).filter(v => v !== null);
            const rsAll = dData.map(d => d.rain || 0);
            const ssAll = dData.map(d => d.snow || 0);
            const gsAll = dData.map(d => d.w_gst || 0);
            const asAll = dData.map(d => d.w_avg || 0);
            const hsAll = dData.map(d => d.humi || 0);

            let sumH = ""; let sumR = "";
            const thStyle = 'background-color:#1e293b !important; color:white !important; padding:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;';
            if (annexCols.temp) { sumH += `<th style="${thStyle}">T. Min</th><th style="${thStyle}">T. Max</th>`; sumR += `<td>${tsAll.length ? Math.min(...tsAll).toFixed(1) : '--'}°</td><td>${tsAll.length ? Math.max(...tsAll).toFixed(1) : '--'}°</td>`; }
            if (annexCols.rain) { sumH += `<th style="${thStyle}">Pluie Tot.</th>`; sumR += `<td>${rsAll.reduce((a, b) => a + b, 0).toFixed(1)} mm</td>`; }
            if (annexCols.snow) { sumH += `<th style="${thStyle}">Neige Tot.</th>`; sumR += `<td>${ssAll.reduce((a, b) => a + b, 0).toFixed(1)} cm</td>`; }
            if (annexCols.windAvgPdf) { sumH += `<th style="${thStyle}">Vent Moy. Max</th>`; sumR += `<td>${asAll.length ? Math.round(Math.max(...asAll)) : 0} km/h</td>`; }
            if (annexCols.windG) { sumH += `<th style="${thStyle}">Rafale Max</th>`; sumR += `<td>${gsAll.length ? Math.round(Math.max(...gsAll)) : 0} km/h</td>`; }
            if (annexCols.humi) { sumH += `<th style="${thStyle}">Hum. Max</th>`; sumR += `<td>${hsAll.length ? Math.max(...hsAll).toFixed(1) : 0}%</td>`; }
            if (annexCols.soil) { sumH += `<th style="${thStyle}">Hum. Sol</th>`; sumR += `<td>${soilVal || '--'}%</td>`; }
            if (annexCols.fog) { sumH += `<th style="${thStyle}">Brouillard</th>`; sumR += `<td>${forceFog ? 'OUI' : 'NON'}</td>`; }

            part1 += `<div class="btp-keep-together"><h3 class="btp-section-title">2. RÉSUMÉ DU JOUR – ${date}</h3><table class="btp-table-period"><thead><tr>${sumH}</tr></thead><tbody><tr>${sumR}</tr></tbody></table></div>`;
            part1 += `</div>`; // Fin section 1

            // PARTIE 2 : ANNEXES & GRAPHES
            let part2 = `<div class="btp-doc-section">` + commonHead("ANNEXES MÉTÉOROLOGIQUES", `DONNÉES HORAIRES DÉTAILLÉES`);

            // 3. Annexe Horaire + Graphique (dans le même bloc pour rester sur la même page)
            part2 += `<div class="btp-annexe-block">`;
            part2 += `<h3 class="btp-section-title">3. DONNÉES HORAIRES – ${date}</h3>`;
            part2 += `<table class="btp-table-hourly"><thead><tr><th style="background-color:#1e293b !important; color:white !important; padding:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">Heure</th>`;
            if (annexCols.temp) part2 += "<th style=\"background-color:#1e293b !important; color:white !important; padding:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;\">T°C</th>";
            if (annexCols.rain) part2 += "<th style=\"background-color:#1e293b !important; color:white !important; padding:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;\">Pluie</th>";
            if (annexCols.snow) part2 += "<th style=\"background-color:#1e293b !important; color:white !important; padding:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;\">Neige</th>";
            if (annexCols.windAvgPdf) part2 += "<th style=\"background-color:#1e293b !important; color:white !important; padding:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;\">V.Moy</th>";
            if (annexCols.windG) part2 += "<th style=\"background-color:#1e293b !important; color:white !important; padding:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;\">Raf.</th>";
            if (annexCols.humi) part2 += "<th style=\"background-color:#1e293b !important; color:white !important; padding:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;\">Hum.</th>";
            part2 += `</tr></thead><tbody>`;
            dData.forEach(r => {
                part2 += `<tr class="btp-stripe"><td>${r.h}h</td>`;
                if (annexCols.temp) part2 += `<td>${r.temp !== null ? parseFloat(r.temp).toFixed(1) : '--'}</td>`;
                if (annexCols.rain) part2 += `<td>${parseFloat(r.rain || 0).toFixed(1)}</td>`;
                if (annexCols.snow) part2 += `<td>${parseFloat(r.snow || 0).toFixed(1)}</td>`;
                if (annexCols.windAvgPdf) part2 += `<td>${Math.round(r.w_avg || 0)}</td>`;
                if (annexCols.windG) part2 += `<td>${Math.round(r.w_gst || 0)}</td>`;
                if (annexCols.humi) part2 += `<td>${Math.round(r.humi || 0)}%</td>`;
                part2 += `</tr>`;
            });
            part2 += `</tbody></table>`;

            // 4. Graphique (intégré dans le même bloc)
            if (showCharts) {
                part2 += `<div class="btp-chart-inline"><h4 style="font-size:0.85rem;color:#1e293b;margin:10px 0 5px 0;font-weight:600;">📊 Graphique du jour</h4><div class="btp-chart-block-small"><canvas id="btp-chart-${date.replace(/\//g, '-')}"></canvas></div></div>`;
            }
            part2 += `</div>`; // Fin bloc annexe
            part2 += `</div>`; // Fin section 2

            html += part1 + part2;
        });

        setReportOutput(html);
        setChartsOutput(''); // No longer used separately

        if (showCharts && Object.keys(globalData || {}).filter(k => k !== '__metadata').length > 0) {
            setTimeout(() => {
                Object.entries(globalData || {}).forEach(([date, dataObj]) => {
                    if (date === '__metadata') return;
                    renderChart(`btp-chart-${date.replace(/\//g, '-')}`, dataObj.rows);
                });
            }, 800);
        }
    };

    const renderChart = (canvasId, data) => {
        const ctxEl = document.getElementById(canvasId);
        if (!ctxEl || !window.Chart) return;
        if (chartRefs.current[canvasId]) { chartRefs.current[canvasId].destroy(); }
        const ctx = ctxEl.getContext('2d'); if (!ctx) return;

        try {
            let datasets = [];
            const labels = data.map(d => d.h + 'h');

            if (chartDesign === 'vibrant') {
                datasets = [
                    {
                        type: 'line',
                        label: 'Température (°C)',
                        data: data.map(d => d.temp),
                        borderColor: '#f43f5e',
                        backgroundColor: 'rgba(244, 63, 94, 0.2)',
                        fill: true,
                        tension: 0.5,
                        yAxisID: 'y',
                        borderWidth: 4,
                        pointRadius: 4,
                        pointBackgroundColor: '#fff',
                        pointBorderWidth: 2
                    },
                    {
                        type: 'bar',
                        label: 'Pluie (mm)',
                        data: data.map(d => d.rain),
                        backgroundColor: 'rgba(14, 165, 233, 0.7)',
                        yAxisID: 'y1',
                        borderRadius: 10,
                        barThickness: 16
                    }
                ];
            } else if (chartDesign === 'minimal') {
                datasets = [
                    {
                        type: 'line',
                        label: 'Température (°C)',
                        data: data.map(d => d.temp),
                        borderColor: '#0f172a',
                        fill: false,
                        tension: 0,
                        yAxisID: 'y',
                        borderWidth: 2,
                        pointRadius: 3
                    },
                    {
                        type: 'bar',
                        label: 'Pluie (mm)',
                        data: data.map(d => d.rain),
                        backgroundColor: '#cbd5e1',
                        yAxisID: 'y1',
                        barThickness: 8
                    }
                ];
            } else { // architect (default)
                datasets = [
                    {
                        type: 'line',
                        label: 'Température (°C)',
                        data: data.map(d => d.temp),
                        borderColor: '#1e293b',
                        backgroundColor: 'rgba(30, 41, 59, 0.05)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y',
                        borderWidth: 3,
                        pointRadius: 0
                    },
                    {
                        type: 'bar',
                        label: 'Précipitations (mm)',
                        data: data.map(d => d.rain),
                        backgroundColor: 'rgba(37, 99, 235, 0.5)',
                        yAxisID: 'y1',
                        borderRadius: 3,
                        barThickness: 14
                    }
                ];
            }

            const chart = new window.Chart(ctx, {
                type: 'bar',
                data: { labels, datasets },
                options: {
                    animation: false,
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10, family: 'Inter' } } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
                        y: {
                            type: 'linear', display: true, position: 'left',
                            title: { display: true, text: 'T° (°C)', font: { size: 10, weight: '600' } },
                            grid: { color: '#f1f5f9' }
                        },
                        y1: {
                            type: 'linear', display: true, position: 'right',
                            title: { display: true, text: 'Pluie (mm)', font: { size: 10, weight: '600' } },
                            grid: { display: false },
                            min: 0,
                            suggestedMax: 5
                        }
                    }
                }
            });
            chartRefs.current[canvasId] = chart;
        } catch (e) {
            console.error("[BTP] Error rendering chart:", e);
        }
    };

    const addRule = (t) => {
        const n = { lots: [...activeTrades], var: t || "temp", type: "cond1", op: ">=", val: 10, h1: 0, h2: 23, dur: 0 };
        if (t === 'temp') { n.op = "<="; n.val = 0; n.var = "temp"; }
        else if (t === 'vent_rafale') { n.op = ">="; n.val = 60; n.var = "vent_rafale"; }
        else if (t === 'vent_avg') { n.op = ">="; n.val = 40; n.var = "vent_avg"; }
        else if (t === 'pluie') { n.op = ">="; n.val = 10; n.var = "pluie"; }
        else if (t === 'neige') { n.op = ">="; n.val = 1; n.var = "neige"; }
        else if (t === 'soil') { n.op = ">="; n.val = 20; n.var = "soil"; }
        else if (t === 'heat') { n.op = ">="; n.val = 35; n.var = "heat"; }
        else if (t === 'canicule') { n.var = "canicule"; n.type = "cond1"; n.val = "Déclarée"; n.op = "=="; }

        setRules(prev => [...prev, n]);
        setOpenRuleIdx(rules.length);
    };
    const delRule = (i) => { if (window.confirm("Supprimer?")) { const n = [...rules]; n.splice(i, 1); setRules(n); setOpenRuleIdx(-1); } };
    const uR = (i, k, v) => { const n = [...rules]; n[i][k] = v; setRules(n); };

    const ldImg = (e, setter) => { if (e.target.files && e.target.files[0]) { const reader = new FileReader(); reader.onload = (ev) => { setter(ev.target?.result); }; reader.readAsDataURL(e.target.files[0]); } };
    const saveGlobalTrades = () => {
        const sel = [];
        document.querySelectorAll('#btp-tradesCheckboxes input:checked').forEach((c) => sel.push(c.value));

        // SYNC RULES: Add new trades, Remove deleted trades
        // This ensures that when user updates global trades, rules are updated accordingly
        // while preserving existing rule customization (unchecked trades remain unchecked for that rule unless removed globally)
        const added = sel.filter(x => !activeTrades.includes(x));
        const removed = activeTrades.filter(x => !sel.includes(x));

        if (added.length > 0 || removed.length > 0) {
            setRules(prevRules => prevRules.map(r => {
                let newLots = r.lots || [];
                // Remove globally deleted trades
                newLots = newLots.filter(t => !removed.includes(t));
                // Add globally added trades (append)
                newLots = [...new Set([...newLots, ...added])];
                return { ...r, lots: newLots };
            }));
        }

        setActiveTrades(sel);
        setTradesModalOpen(false);
    };
    const closeRuleTradesModal = () => { if (currentRuleIndex === -1) return; const sel = []; document.querySelectorAll('#btp-ruleTradesList input:checked').forEach((c) => sel.push(c.value)); const n = [...rules]; n[currentRuleIndex].lots = sel; setRules(n); setRuleTradesModalOpen(false); };
    const addCustomTrade = () => {
        const val = newTradeInput.trim();
        if (val && !TRADES_FULL.includes(val)) {
            const n = [...TRADES_FULL, val];
            setTRADES_FULL(n);
            saveTradesToDB(n); // Save to DB

            // Add to active trades AND add to all rules automatically
            setActiveTrades(prev => [...prev, val]);
            setRules(prevRules => prevRules.map(r => ({ ...r, lots: [...(r.lots || []), val] })));

            setNewTradeInput('');
        }
    };
    const checkAll = (id, val) => { document.querySelectorAll(`#${id} input`).forEach(c => c.checked = val); };
    const copyPrompt = () => { navigator.clipboard.writeText(AI_PROMPT).then(() => alert("Prompt copié !")); };

    const generateMailBody = () => {
        const ent = "MÉTÉO CLIMAT PRO";
        const addr = "400 rue Paul Lafargue, 59283 RAIMBEAUCOURT";
        const phone = "06 83 90 91 60";
        const proj = projectName || "---";
        const cliName = projectClient || txCli || "---";

        let body = `Bonjour, \n\nVoici le relevé d'intempéries pour le chantier suivant :\n\n`;
        body += `📍 CHANTIER : ${proj}\n`;
        body += `📁 CLIENT : ${cliName}\n`;
        body += `🏢 ÉMETTEUR : ${ent}\n`;
        body += `   ${addr}\n`;
        body += `   Tel : ${phone}\n\n`;
        body += `--------------------------------------------------\n`;
        body += `DÉTAIL DES RELEVÉS\n`;
        body += `--------------------------------------------------\n`;

        let hasData = false;
        Object.entries(globalData).forEach(([date, dataObj]) => {
            if (date === '__metadata') return; // Skip metadata info
            hasData = true;
            let dayHasKo = false;
            const details = [];

            rules.forEach(r => {
                const affectsActive = r.lots && r.lots.some(t => activeTrades.includes(t));
                if (affectsActive) {
                    const res = calculateKoV96(r, dataObj.rows, dataObj.soil, dataObj.forceHeat, dataObj.forceFroze, dataObj.fog);
                    if (res) {
                        dayHasKo = true;
                        let k = r.var;
                        if (r.var == 'vent_rafale') k = 'Rafale';
                        if (r.var == 'vent_avg') k = 'Vent Moy';
                        if (r.var == 'temp') k = 'Temp';
                        if (r.var == 'pluie') k = 'Pluie';
                        details.push(`- ${k} (${r.op} ${r.val}): ${res}`);
                    }
                }
            });

            body += `\n--- DATE : ${date} ---\n`;
            if (dayHasKo) {
                body += `❌ [!] INTEMPÉRÉES CONSTATÉES\nCauses :\n${details.join('\n')}\n`;
            } else {
                body += `✅ [OK] RAS\n`;
            }
        });

        if (!hasData) {
            body += "Aucune donnée analysée.\n";
        } else {
            body += `\n--------------------------------------------------\n`;
            body += `*Rapport généré par Météo Climat Pro.*`;
        }

        return body;
    };

    const sendMail = () => {
        try {
            const body = generateMailBody();
            const recipient = emailCli || clientEmail || "";
            const subject = `Relevé Intempéries - ${chantierName || projectName || projectClient || 'Météo'}`;

            if (!recipient) {
                alert("⚠️ Aucun destinataire n'est configuré.\n\nVeuillez remplir le champ 'Email de Contact' ou 'Destinataire Mail' dans l'onglet Client & Chantier.");
                return;
            }

            console.log("[BTP] Envoi mail vers:", recipient, "Taille body:", body.length);

            // Construction du lien mailto avec encodage robuste
            const encodedBody = encodeURIComponent(body).replace(/%0A/g, '%0D%0A');
            const mailtoUrl = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodedBody}`;

            // Vérification de la longueur (limite ~2000 caractères pour mailto)
            if (mailtoUrl.length > 2000) {
                console.warn("[BTP] Mailto trop long:", mailtoUrl.length);
                alert("⚠️ Le contenu du rapport est trop long pour être envoyé directement par email (limite des navigateurs).\n\n✅ Le rapport a été copié dans votre presse-papier !\n\nCollez-le (Ctrl+V) dans votre logiciel d'email.");
                navigator.clipboard.writeText(body);
                return;
            }

            // Ouverture via lien invisible (plus robuste que window.location.href)
            const link = document.createElement('a');
            link.href = mailtoUrl;
            link.click();

            // Notification informative
            alert("📧 Envoi en cours...\n\nSi votre logiciel de messagerie ne s'ouvre pas, vérifiez qu'une application par défaut (Outlook, Courrier, Gmail...) est configurée sur votre ordinateur.");

        } catch (e) {
            console.error("[BTP] Erreur sendMail:", e);
            alert("❌ Une erreur est survenue : " + e.message);
        }
    };

    const copyMailBody = () => {
        const body = generateMailBody();
        navigator.clipboard.writeText(body).then(() => alert("Rapport copié ! Vous pouvez le coller dans votre mail (Ctrl+V)."));
    };

    // CSS autonome pour l'export PDF/impression — harmonisé avec l'Attestation intempéries
    const getBtpPrintStyles = () => `
        <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; }
            body {
                margin: 0; padding: 0;
                font-family: Arial, Helvetica, sans-serif;
                font-size: 9pt;
                color: #1e293b;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .btp-doc-section {
                width: 210mm;
                min-height: 296mm;
                padding: 12mm 14mm;
                box-sizing: border-box;
                position: relative;
                page-break-after: always;
                background: white;
            }
            .btp-doc-section:last-child { page-break-after: auto; }

            /* En-tête du document */
            .btp-doc-head {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-bottom: 1px solid #e2e8f0;
                padding-bottom: 10px;
                margin-bottom: 10px;
                width: 100%;
            }

            /* Boîte titre principal */
            .btp-main-title-box {
                border: 2px solid #000;
                padding: 6px 10px;
                text-align: center;
                margin-bottom: 8px;
                width: 100%;
            }
            .btp-main-title-box h1 {
                font-size: 13pt;
                font-weight: 800;
                color: #003366;
                margin: 0;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .btp-main-title-box .btp-subtitle {
                font-size: 9pt;
                color: #003366;
                font-weight: 800;
                border-top: 1px solid #000;
                padding-top: 2px;
                margin-top: 2px;
                text-transform: uppercase;
            }

            /* En-tête de section coloré (harmonisé Attestation) */
            .btp-section-title {
                background: #1e293b !important;
                color: white !important;
                padding: 5px 10px;
                font-weight: bold;
                font-size: 9pt;
                margin-top: 12px;
                margin-bottom: 5px;
                text-transform: uppercase;
                border-left: 5px solid #003366;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            /* Bande info période/station */
            .btp-info-band {
                display: flex;
                justify-content: space-between;
                font-size: 8.5pt;
                margin-bottom: 8px;
                background: #f8fafc;
                padding: 5px 10px;
                border-bottom: 1px solid #e2e8f0;
            }

            /* Tableaux */
            table { width: 100%; border-collapse: collapse; }

            .btp-table-decision {
                font-size: 8pt;
                line-height: 1.1;
                border: 1px solid #000;
                width: 100%;
                border-collapse: collapse;
            }
            .btp-table-decision th {
                background: #1e293b !important;
                color: white !important;
                padding: 3px 4px;
                border: 1px solid #000;
                text-align: center;
                font-size: 7.5pt;
                text-transform: uppercase;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .btp-table-decision td {
                padding: 3px 4px;
                border: 1px solid #ccc;
                text-align: center;
            }
            .btp-table-decision tr:nth-child(even) td { background: #f8fafc !important; }

            .btp-table-period {
                font-size: 8pt;
                border: 1px solid #000;
                border-collapse: collapse;
            }
            .btp-table-period th {
                background: #1e293b !important;
                color: white !important;
                padding: 3px 6px;
                border: 1px solid #000;
                text-align: center;
                font-size: 7.5pt;
                text-transform: uppercase;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .btp-table-period td { padding: 3px 6px; border: 1px solid #ccc; text-align: center; }
            .btp-table-period tr:nth-child(even) td { background: #f8fafc !important; }

            .btp-table-hourly {
                font-size: 7.5pt;
                border: 1px solid #000;
                border-collapse: collapse;
            }
            .btp-table-hourly th {
                background: #1e293b !important;
                color: white !important;
                padding: 2px 4px;
                border: 1px solid #000;
                text-align: center;
                font-size: 7pt;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .btp-table-hourly td { padding: 2px 4px; border: 1px solid #ddd; text-align: center; }
            .btp-stripe:nth-child(even) td { background: #f8fafc !important; }

            /* Tags statut */
            .btp-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-weight: 700; font-size: 7pt; text-transform: uppercase; }
            .btp-tag-ko { background: #fee2e2 !important; color: #991b1b !important; border: 1px solid #fca5a5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .btp-tag-ok { background: #dcfce7 !important; color: #166534 !important; border: 1px solid #86efac; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

            /* Cellules vides */
            .btp-cell-empty { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .btp-cell-white { background: white !important; }

            /* Bloc résultat final encadré */
            .btp-result-box {
                margin-top: 15px;
                padding: 12px 20px;
                border: 2px solid #003366;
                background: #f0f9ff !important;
                text-align: center;
                border-radius: 6px;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .btp-result-box h2 {
                font-size: 12pt;
                font-weight: 900;
                color: #003366;
                text-transform: uppercase;
                margin: 0 0 5px 0;
            }

            /* Graphique */
            .btp-chart-block-small { height: 130px; width: 100%; }
            .btp-annexe-block { page-break-inside: avoid; }
            .btp-keep-together { page-break-inside: avoid; }

            /* Infos chantier */
            .btp-info-table td { border: none !important; padding: 3px 0; font-size: 8pt; }
        </style>
    `;

    const handlePrint = () => {
        if (!reportOutput || reportOutput.trim() === '') {
            alert("Aucun rapport généré à imprimer.");
            return;
        }

        // 1. Créer une version "propre" du contenu pour l'impression
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = reportOutput;

        // Remplacer chaque canvas par son image base64 (PNG pour conserver la transparence)
        const canvases = document.querySelectorAll('.btp-preview canvas');
        canvases.forEach(realCanvas => {
            try {
                const canvasId = realCanvas.id;
                const tempCanvas = tempDiv.querySelector(`#${canvasId}`);
                if (tempCanvas) {
                    const imgUrl = realCanvas.toDataURL('image/png');
                    const img = document.createElement('img');
                    img.src = imgUrl;
                    img.style.width = '100%';
                    img.style.height = 'auto';
                    img.style.display = 'block';
                    img.style.maxHeight = '130px';
                    tempCanvas.parentNode.replaceChild(img, tempCanvas);
                }
            } catch (e) {
                console.error("[BTP] Erreur conversion graphique:", e);
            }
        });

        const finalContent = tempDiv.innerHTML;

        // 2. Ouvrir la fenêtre d'impression
        const win = window.open('', '_blank', 'width=1100,height=900,menubar=no,toolbar=no,location=no,status=no');

        if (!win) {
            alert("L'aperçu avant impression a été bloqué par votre navigateur. Veuillez autoriser les fenêtres surgissantes (popups) pour ce site.");
            return;
        }

        // 3. Écrire le document (immédiatement pour éviter la page vide)
        win.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>${projectName.replace(/"/g, '&quot;')}</title>
                    <meta charset="utf-8">
                    ${getBtpPrintStyles()}
                </head>
                <body style="margin:0;padding:0;">
                    <div id="print-content"></div>
                    <script>
                        // On attend que le contenu soit injecté et les images chargées
                        setTimeout(() => {
                            window.print();
                        }, 1200);
                    </script>
                </body>
            </html>
        `);
        win.document.close();

        // Injecter le contenu séparément pour éviter les problèmes de gros strings/caractères spéciaux dans win.document.write
        const contentTarget = win.document.getElementById('print-content');
        if (contentTarget) {
            contentTarget.innerHTML = finalContent;
        } else {
            // Fallback si l'élément n'est pas encore là (peu probable après document.close())
            win.document.body.innerHTML = finalContent;
        }
    };

    const exportWord = () => {
        const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export</title><style>body{font-family:Arial;color:#000;} .doc-head{border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px;} table{width:100%;border-collapse:collapse;margin-top:10px;font-size:10pt;} td,th{border:1px solid #999;padding:4px;text-align:center;} th{background-color:#eee;} .text-alert{color:#dc2626;font-weight:bold;} .tag-ko{color:#991b1b;background-color:#fee2e2;font-weight:bold;} .tag-ok{color:#166534;background-color:#dcfce7;} .annex-table{font-size:9pt;} .keep-together{page-break-inside:avoid;} .doc-section{page-break-before:always;}</style></head><body>";
        const footer = "</body></html>";
        let htmlContent = reportOutput.replace(/btp-/g, ''); // Clean prefix for Word
        const sourceHTML = header + htmlContent + footer;
        const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", source);
        dlAnchorElem.setAttribute("download", `${projectName.replace(/\s+/g, '_')}.doc`);
        dlAnchorElem.click();
    };

    // Fix Charts rendering when tab changes
    useEffect(() => {
        if (activeOutTab === 'out-charts' && showCharts && Object.keys(globalData).length > 0) {
            setTimeout(() => {
                for (const [date, dataObj] of Object.entries(globalData)) {
                    renderChart(`btp-chart-${date.replace(/\//g, '-')}`, dataObj.rows);
                }
            }, 100);
        }
    }, [activeOutTab, showCharts, globalData]);

    const handleEditTrade = (oldName) => {
        const newName = window.prompt("Modifier le nom du métier :", oldName);
        if (newName && newName !== oldName && newName.trim() !== "") {
            const nName = newName.trim();
            const newTradesList = TRADES_FULL.map(t => t === oldName ? nName : t);
            setTRADES_FULL(newTradesList);
            saveTradesToDB(newTradesList); // Save to DB

            setActiveTrades(prev => prev.map(t => t === oldName ? nName : t));
            setRules(prevRules => prevRules.map(r => {
                if (r.lots && r.lots.includes(oldName)) {
                    return { ...r, lots: r.lots.map(l => l === oldName ? nName : l) };
                }
                return r;
            }));
        }
    };

    const handleDeleteTrade = (tradeToDelete) => {
        if (window.confirm(`Voulez-vous vraiment supprimer le métier "${tradeToDelete}" ?\nIl sera retiré de la liste et des règles existantes.`)) {
            const newTradesList = TRADES_FULL.filter(t => t !== tradeToDelete);
            setTRADES_FULL(newTradesList);
            saveTradesToDB(newTradesList); // Save to DB

            setActiveTrades(prev => prev.filter(t => (t !== tradeToDelete)));
            setRules(prevRules => prevRules.map(r => {
                if (r.lots && r.lots.includes(tradeToDelete)) {
                    return { ...r, lots: r.lots.filter(l => l !== tradeToDelete) };
                }
                return r;
            }));
        }
    };

    const sortedTrades = Array.isArray(TRADES_FULL) ? [...TRADES_FULL].sort((a, b) => a.localeCompare(b, 'fr')) : [];
    const sortedActiveTrades = Array.isArray(activeTrades) ? [...activeTrades].sort((a, b) => a.localeCompare(b, 'fr')) : [];

    return (
        <div className="btp-manager-container btp-manager-body">
            <div id="btp-saveNotif">✅ Sauvegarde effectuée</div>

            {/* Modals */}
            <div className={`btp-modal ${tradesModalOpen ? 'btp-open open' : ''}`}>
                <div className="btp-modal-content">
                    <div className="btp-modal-header"><h2>Dossier & Métiers</h2><button onClick={() => setTradesModalOpen(false)}>×</button></div>

                    <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Nom du Dossier / Projet</label>
                        <input
                            type="text"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            placeholder="Ex: Chantier Martin..."
                            style={{ fontSize: '1.1rem', fontWeight: '600', border: '2px solid #3b82f6' }}
                        />
                    </div>

                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Sélection des Métiers concernés</label>
                    <div style={{ marginBottom: '10px', display: 'flex', gap: '5px' }}>
                        <button className="btp-btn-config" onClick={() => checkAll('btp-tradesCheckboxes', true)}>Tout Cocher</button>
                        <button className="btp-btn-config" onClick={() => checkAll('btp-tradesCheckboxes', false)}>Tout Décocher</button>
                    </div>
                    <div id="btp-tradesCheckboxes" style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', padding: '10px' }}>
                        {sortedTrades?.map(t => (
                            <div key={t} className="btp-trade-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }}>
                                    <input type="checkbox" value={t} defaultChecked={activeTrades.includes(t)} />
                                    {t}
                                </label>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button className="btp-btn-config" style={{ padding: '2px 6px', fontSize: '0.8rem', minWidth: 'auto' }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditTrade(t); }} title="Renommer">✏️</button>
                                    <button className="btp-btn-del" style={{ padding: '2px 6px', fontSize: '0.8rem', width: 'auto', minWidth: 'auto' }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteTrade(t); }} title="Supprimer">🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                        <input type="text" value={newTradeInput} onChange={(e) => setNewTradeInput(e.target.value)} placeholder="Ajouter métier..." />
                        <button className="btp-btn-config" onClick={addCustomTrade}>Ajouter</button>
                    </div>
                    <button className="btp-btn btp-btn-primary" onClick={saveGlobalTrades} style={{ marginTop: '20px' }}>Valider</button>
                </div>
            </div>

            <div className={`btp-modal ${ruleTradesModalOpen ? 'open' : ''}`}>
                <div className="btp-modal-content">
                    <h3>Métiers concernés</h3>
                    <div style={{ marginBottom: '10px' }}>
                        <button className="btp-btn-config" onClick={() => checkAll('btp-ruleTradesList', true)}>Tous</button>
                        <button className="btp-btn-config" onClick={() => checkAll('btp-ruleTradesList', false)}>Aucun</button>
                    </div>
                    <div id="btp-ruleTradesList" key={ruleTradesModalTimestamp} style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {sortedActiveTrades?.map(t => (<label key={t} className="btp-trade-item"><input type="checkbox" value={t} defaultChecked={currentRuleIndex >= 0 && rules[currentRuleIndex]?.lots?.includes(t)} /> {t}</label>))}
                    </div>
                    <button className="btp-btn btp-btn-primary" onClick={closeRuleTradesModal} style={{ marginTop: '20px' }}>Valider</button>
                </div>
            </div>

            <div className={`btp-modal ${colsModalOpen ? 'open' : ''}`}>
                <div className="btp-modal-content">
                    <div className="btp-modal-header"><h2>Colonnes Rapport</h2><button onClick={() => setColsModalOpen(false)}>×</button></div>
                    {Object.entries(colsLabels).map(([key, label]) => (
                        <label key={key} className="btp-trade-item"><input type="checkbox" checked={annexCols[key]} onChange={(e) => setAnnexCols({ ...annexCols, [key]: e.target.checked })} /> {label}</label>
                    ))}
                    <button className="btp-btn btp-btn-primary" onClick={() => setColsModalOpen(false)}>Valider</button>
                </div>
            </div>

            <div className={`btp-modal ${aiImportModalOpen ? 'open' : ''}`}>
                <div className="btp-modal-content">
                    <div className="btp-modal-header"><h2>Import Manuel (IA)</h2><button onClick={() => setAiImportModalOpen(false)}>×</button></div>
                    <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '10px' }}>
                        1. Copiez les données brutes sur Internet.<br />
                        2. Demandez à une IA (ChatGPT, etc.) de les formater avec le <button className="btp-btn-link" onClick={() => setPromptModalOpen(true)}>Prompt Fourni</button>.<br />
                        3. Collez le résultat ci-dessous. <strong style={{ color: '#dc2626' }}>La date utilisée sera celle du champ "Du" : {startDate}</strong>
                    </p>
                    <textarea
                        value={aiRawText}
                        onChange={(e) => setAiRawText(e.target.value)}
                        placeholder="[Heure] : T ... | Pluie ... "
                        style={{ height: '200px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                    <button className="btp-btn btp-btn-primary" onClick={handleAiImport} style={{ marginTop: '10px' }}>Importer ces données</button>
                </div>
            </div>

            <div className={`btp-modal ${promptModalOpen ? 'open' : ''}`}>
                <div className="btp-modal-content">
                    <div className="btp-modal-header"><h2>Prompt IA Nettoyage</h2><button onClick={() => setPromptModalOpen(false)}>×</button></div>
                    <textarea value={AI_PROMPT} readOnly style={{ height: '300px' }} />
                    <button className="btp-btn btp-btn-primary" onClick={copyPrompt} style={{ marginTop: '10px' }}>Copier le Prompt</button>
                </div>
            </div>

            <div className="btp-layout">
                <div className="btp-no-print" style={{ overflowX: 'hidden' }}>
                    <h1 style={{ textAlign: 'center', marginBottom: '15px' }}>🌦️ Météo BTP <span style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.5, background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', verticalAlign: 'middle' }}>PRO V10</span></h1>


                    <div className="btp-panel" style={{ border: '2px solid var(--primary)', padding: '20px', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div className="btp-step-num" style={{ background: 'var(--primary)' }}>📁</div>
                                <span className="btp-panel-title">DOSSIER & PROJET</span>
                            </div>
                            <div dangerouslySetInnerHTML={{ __html: status }} style={{ fontSize: '0.95rem', fontWeight: '700' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            {/* BLOC 1 : Sélection */}
                            <div style={{ flex: '1 1 300px' }}>
                                <label style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', fontWeight: '800' }}>Charger un Dossier existant</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <select value={currentProjectId} onChange={(e) => handleProjectSelect(e.target.value)} style={{ flex: 1, fontWeight: 'bold', height: '42px', border: '2px solid #cbd5e1', borderRadius: '8px' }}>
                                        <option value="">{currentProjectId ? '--- SELECTIONNER UN PROJET ---' : '--- MODE NOUVEAU PROJET ---'}</option>
                                        <option value="DEMO_QUARTUS">📊 [DÉMO] QUARTUS - Officiel</option>
                                        {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <button className="btp-btn btp-btn-primary" onClick={resetToNew} style={{ width: 'auto', background: '#0ea5e9', height: '42px', padding: '0 15px' }} title="Nouveau projet vide">➕ Nouveau</button>
                                </div>
                            </div>

                            {/* BLOC 2 : Nom */}
                            <div style={{ flex: '1 1 200px' }}>
                                <label style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', fontWeight: '800' }}>Nom du Dossier / Projet</label>
                                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Nom du dossier..." style={{ width: '100%', height: '42px', fontSize: '0.95rem', fontWeight: 'bold', border: '2px solid #cbd5e1', borderRadius: '8px', padding: '0 12px' }} />
                            </div>

                            {/* BLOC 3 : Actions */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btp-btn btp-btn-save" onClick={saveProject} style={{ height: '42px', minWidth: '150px', background: '#7c3aed', borderRadius: '8px' }}>
                                    💾 ENREGISTRER
                                </button>
                                {currentProjectId ? (
                                    <>
                                        <button className="btp-btn-config" onClick={duplicateProject} style={{ height: '42px', padding: '0 15px', borderRadius: '8px' }}>📂 CLONER</button>
                                        <button className="btp-btn-del" onClick={deleteProject} style={{ height: '42px', padding: '0 15px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px' }}>🗑️</button>
                                    </>
                                ) : (
                                    (projectName !== 'Météo BTP') && <button className="btp-btn-config" onClick={resetToNew} style={{ height: '42px', borderRadius: '8px' }}>❌ Annuler</button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SECTION ÉMETTEUR MASQUABLE (PARAMÈTRES PRO) - POSITIONNÉE EN HAUT CAR STATIQUE */}
                    <div style={{ marginBottom: '20px', padding: '0 10px' }}>
                        <button
                            onClick={() => setShowEmitter(!showEmitter)}
                            style={{
                                width: '100%',
                                padding: '15px 20px',
                                background: showEmitter ? '#1e293b' : '#ffffff',
                                color: showEmitter ? '#ffffff' : '#475569',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'all 0.3s ease',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '1.2rem' }}>🎨</span>
                                <span style={{ fontWeight: '800', fontSize: '0.9rem', letterSpacing: '0.5px' }}>PARAMÈTRES DE VOTRE ENTREPRISE (ÉMETTEUR)</span>
                            </div>
                            <span style={{
                                fontSize: '0.8rem',
                                background: showEmitter ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontWeight: '700'
                            }}>
                                {showEmitter ? 'MASQUER RÉGLAGES' : 'Cliquer pour modifier'}
                            </span>
                        </button>

                        {showEmitter && (
                            <div style={{
                                background: '#ffffff',
                                padding: '30px',
                                borderRadius: '0 0 16px 16px',
                                border: '1px solid #e2e8f0',
                                borderTop: 'none',
                                boxShadow: 'inset 0 10px 15px -10px rgba(0,0,0,0.05)',
                                display: 'grid',
                                gridTemplateColumns: '1fr 2fr',
                                gap: '40px'
                            }}>
                                <div>
                                    <div className="btp-logo-zone"
                                        style={{
                                            width: '100%',
                                            height: '140px',
                                            marginBottom: '20px',
                                            background: '#fff',
                                            borderRadius: '12px',
                                            border: '2px solid #3b82f6'
                                        }}
                                        onClick={() => document.getElementById('inL').click()}>
                                        {logoL ? <img src={logoL} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '10px' }} /> : <div style={{ textAlign: 'center' }}>+ Votre Logo</div>}
                                        <input type="file" id="inL" hidden onChange={(e) => ldImg(e, setLogoL)} />
                                    </div>
                                    <div className="btp-form-group">
                                        <label style={{ fontWeight: '800' }}>Votre Entreprise</label>
                                        <input value={emitterName}
                                            onChange={(e) => setEmitterName(e.target.value)}
                                            placeholder="MÉTÉO CLIMAT PRO"
                                            style={{ padding: '14px', fontSize: '1rem', border: '1px solid #3b82f6' }} />
                                    </div>
                                </div>
                                <div>
                                    <div className="btp-form-group">
                                        <label style={{ fontWeight: '800' }}>Votre Adresse complète</label>
                                        <textarea value={txEnt}
                                            onChange={(e) => setTxEnt(e.target.value)}
                                            placeholder="Rue, CP, Ville..."
                                            style={{ height: '90px', padding: '14px', fontSize: '1rem', lineHeight: '1.5' }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                                        <div className="btp-form-group">
                                            <label style={{ fontWeight: '800' }}>Votre Tel</label>
                                            <input value={emitterPhone}
                                                onChange={(e) => setEmitterPhone(e.target.value)}
                                                placeholder="06..."
                                                style={{ padding: '14px', fontSize: '1rem', border: '1px solid #3b82f6' }} />
                                        </div>
                                        <div className="btp-form-group">
                                            <label style={{ fontWeight: '800' }}>Votre Email pro</label>
                                            <input value={emitterEmail}
                                                onChange={(e) => setEmitterEmail(e.target.value)}
                                                placeholder="pro@exemple.com"
                                                style={{ padding: '14px', fontSize: '1rem', border: '1px solid #3b82f6' }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="btp-panel">
                        <div className="btp-panel-head"><div style={{ display: 'flex', alignItems: 'center' }}><div className="btp-step-num">1</div><span className="btp-panel-title">Données & Période</span></div></div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div className="btp-params-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', background: '#f0f9ff', padding: '20px', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                                <div className="btp-form-group" style={{ margin: 0 }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Département</label>
                                    <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} style={{ width: '100%', height: '42px', fontWeight: '600' }}>
                                        <option value="">Sélectionner...</option>
                                        {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.code} - {d.name}</option>)}
                                    </select>
                                </div>
                                <div className="btp-form-group" style={{ margin: 0 }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Station Météo</label>
                                    <select value={selectedStationId} disabled={!selectedDept || loadingStations} onChange={(e) => {
                                        const newVal = e.target.value;
                                        setSelectedStationId(newVal);
                                        const name = stationNames[newVal] || stations.find(s => s.station_id === newVal)?.nom_usuel || newVal;
                                        const finalDisplayName = (name === newVal) ? name : `${name} (${newVal})`;
                                        setStationMeteo(finalDisplayName);
                                    }} style={{ width: '100%', height: '42px', fontWeight: '600' }}>
                                        <option value="">{loadingStations ? '⏳ Chargement...' : 'Choisir une station...'}</option>
                                        {stations?.map(s => {
                                            const name = stationNames[s.station_id] || s.nom_station || (s.station_id === s.id_station ? '' : s.nom_usuel);
                                            const label = (name && name !== s.station_id) ? `${name} (${s.station_id})` : s.station_id;
                                            return <option key={s.station_id} value={s.station_id}>{label}</option>
                                        })}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Période (Du / Au)</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%', height: '42px' }} />
                                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '100%', height: '42px' }} />
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                                    <button className="btp-btn btp-btn-primary" onClick={handlePeriodImport} style={{ width: '100%', height: '48px', fontSize: '1rem', background: '#3b82f6', margin: 0 }}>
                                        📥 RÉCUPÉRER RELEVÉS
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button className="btp-btn-help" onClick={() => setAiImportModalOpen(true)} style={{ flex: 1, fontSize: '0.75rem', padding: '8px' }}>🤖 Import IA</button>
                                    <button className="btp-btn-help" onClick={() => csvFileInputRef.current.click()} style={{ flex: 1, fontSize: '0.75rem', padding: '8px' }}>📁 Import CSV</button>
                                    <input type="file" ref={csvFileInputRef} hidden accept=".csv" onChange={handleCsvFileUpload} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>
                                        <input type="checkbox" checked={autoSnow} onChange={(e) => { setAutoSnow(e.target.checked); }} />
                                        <span>Défaut neige auto. (T° &le;</span>
                                        <input type="number" value={snowTempLimit} onChange={(e) => setSnowTempLimit(parseFloat(e.target.value))} style={{ width: '45px', padding: '2px', textAlign: 'center' }} />
                                        <span>°C)</span>
                                    </label>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '1.2rem' }}>📋</span>
                                        <span style={{ fontWeight: '800', color: '#1e40af', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Modifier Relevés (Humidité, Brouillard...)</span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold', background: '#f1f5f9', padding: '4px 10px', borderRadius: '20px' }}>
                                        {(() => {
                                            const daysCount = Object.keys(globalData || {}).filter(k => k !== '__metadata').length;
                                            return daysCount > 0 ? `📊 ${daysCount} jours chargés` : 'Aucun relevé';
                                        })()}
                                    </div>
                                </div>

                                <div className="btp-days-grid" style={{ flex: 1, minHeight: '350px' }}>
                                    {Object.entries(globalData || {}).sort((a, b) => {
                                        if (a[0] === '__metadata' || b[0] === '__metadata') return 0;
                                        const partsA = a[0].split('/');
                                        const partsB = b[0].split('/');
                                        if (partsA.length < 3 || partsB.length < 3) return 0;
                                        const [d1, m1, y1] = partsA.map(Number);
                                        const [d2, m2, y2] = partsB.map(Number);
                                        return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
                                    }).filter(([date]) => date !== '__metadata').map(([date, data]) => (
                                        <div key={date} className="btp-day-card">
                                            <div className="btp-day-card-header">
                                                <span>{date}</span>
                                            </div>
                                            <div className="btp-day-card-content">
                                                <div className="btp-form-group-row" style={{ background: '#f0fdf4', padding: '8px', borderRadius: '8px', border: '1px solid #dcfce7', marginBottom: '12px' }}>
                                                    <label style={{ color: '#166534', fontWeight: '800' }}>💧 Humidité Sol (%)</label>
                                                    <input type="number"
                                                        value={data.soil || ''}
                                                        onChange={(e) => updateDayProp(date, 'soil', parseFloat(e.target.value))}
                                                        style={{ width: '80px', height: '32px', border: '2px solid #16a34a', borderRadius: '6px', textAlign: 'center', fontWeight: 'bold' }}
                                                        placeholder="0" />
                                                </div>

                                                <div className="btp-day-card-switches">
                                                    <label className="btp-switch-label" style={{ color: '#1d4ed8' }}>
                                                        <input type="checkbox" checked={data.fog || false} onChange={(e) => updateDayProp(date, 'fog', e.target.checked)} />
                                                        <span>🌫️ Brouillard</span>
                                                    </label>
                                                    <label className="btp-switch-label" style={{ color: '#b45309' }}>
                                                        <input type="checkbox" checked={data.forceHeat || false} onChange={(e) => updateDayProp(date, 'forceHeat', e.target.checked)} />
                                                        <span>🔥 Canicule</span>
                                                    </label>
                                                    <label className="btp-switch-label" style={{ color: '#334155' }}>
                                                        <input type="checkbox" checked={data.forceFroze || false} onChange={(e) => updateDayProp(date, 'forceFroze', e.target.checked)} />
                                                        <span>❄️ Sol Gelé</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {Object.keys(globalData || {}).filter(k => k !== '__metadata').length === 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', gap: '15px' }}>
                                            <div style={{ fontSize: '3rem' }}>📥</div>
                                            <div style={{ fontWeight: '600', textAlign: 'center' }}>
                                                Sélectionnez une période et cliquez sur<br />
                                                <span style={{ color: '#3b82f6' }}>"RÉCUPÉRER RELEVÉS"</span><br />
                                                pour éditer l'humidité et le brouillard.
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="btp-panel" style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
                        <div className="btp-panel-head" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div className="btp-step-num">2</div>
                                <span className="btp-panel-title">Client & Chantier</span>
                            </div>
                        </div>

                        {/* CARTE 1 – IDENTITÉ CLIENT */}
                        <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                                <span style={{ fontSize: '1.5rem' }}>👤</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Identité Client</h3>
                            </div>

                            <div style={{ display: 'flex', gap: '30px', marginBottom: '25px' }}>
                                <div style={{ flex: '0 0 25%' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Logo Client</label>
                                    <div className="btp-logo-zone"
                                        style={{ width: '100%', height: '120px', background: '#f8fafc', borderRadius: '12px', border: '2px dashed #cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        onClick={() => document.getElementById('inR').click()}>
                                        {logoR ? <img src={logoR} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '12px' }} /> : (
                                            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>+ Ajouter Logo</div>
                                        )}
                                        <input type="file" id="inR" hidden onChange={(e) => ldImg(e, setLogoR)} />
                                    </div>
                                </div>
                                <div style={{ flex: '1' }}>
                                    <div className="btp-form-group">
                                        <label style={{ color: '#64748b', fontWeight: '800', fontSize: '0.85rem' }}>Entreprise Cliente</label>
                                        <input value={projectClient}
                                            onChange={(e) => setProjectClient(e.target.value)}
                                            placeholder="Ex: GSE, IDEC AGRO, EIFFAGE..."
                                            style={{ height: '52px', padding: '0 20px', fontSize: '1.1rem', fontWeight: '700', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>Le nom commercial affiché en haut du rapport.</div>
                                    </div>
                                </div>
                            </div>

                            <div className="btp-form-group" style={{ marginBottom: '25px' }}>
                                <label style={{ color: '#64748b', fontWeight: '800', fontSize: '0.85rem' }}>Adresse complète du Client (Siège social)</label>
                                <textarea value={clientAddress}
                                    onChange={(e) => setClientAddress(e.target.value)}
                                    placeholder="Numéro et nom de rue&#10;Code Postal - VILLE"
                                    style={{ minHeight: '100px', padding: '18px', fontSize: '1rem', lineHeight: '1.6', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#fcfcfc' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                                <div className="btp-form-group">
                                    <label style={{ color: '#64748b', fontWeight: '800', fontSize: '0.85rem' }}>Téléphone Client</label>
                                    <input value={clientPhone}
                                        onChange={(e) => setClientPhone(e.target.value)}
                                        placeholder="Ex: 01 23 45 67 89"
                                        style={{ height: '50px', padding: '0 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="btp-form-group">
                                    <label style={{ color: '#64748b', fontWeight: '800', fontSize: '0.85rem' }}>Email de Contact</label>
                                    <input value={clientEmail}
                                        onChange={(e) => setClientEmail(e.target.value)}
                                        placeholder="Ex: contact@client.com"
                                        style={{ height: '50px', padding: '0 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                                </div>
                            </div>
                        </div>

                        {/* CARTE 2 – INFORMATIONS DU CHANTIER */}
                        <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                                <span style={{ fontSize: '1.5rem' }}>📍</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Détails du Chantier</h3>
                            </div>

                            <div className="btp-form-group" style={{ marginBottom: '25px' }}>
                                <label style={{ color: '#1e40af', fontWeight: '800', fontSize: '0.85rem' }}>Nom du CHANTIER (Titre du rapport)</label>
                                <input value={chantierName}
                                    onChange={(e) => setChantierName(e.target.value)}
                                    placeholder="Ex: Résidence Les Cyprès, Extension Usine..."
                                    style={{ height: '52px', padding: '0 20px', fontSize: '1.1rem', fontWeight: '700', borderRadius: '12px', border: '2px solid #dbeafe' }} />
                                <div style={{ fontSize: '11px', color: '#1e40af', marginTop: '6px', fontWeight: '600' }}>ℹ️ C'est le nom qui sera écrit en gros sur le PDF.</div>
                            </div>

                            <div className="btp-form-group" style={{ marginBottom: '25px' }}>
                                <label style={{ color: '#1e40af', fontWeight: '800', fontSize: '0.85rem' }}>Lieu précis du CHANTIER</label>
                                <textarea value={projectAddress}
                                    onChange={(e) => setProjectAddress(e.target.value)}
                                    placeholder="Indiquez ici l'adresse exacte du chantier..."
                                    style={{ minHeight: '80px', padding: '18px', fontSize: '1rem', borderRadius: '12px', border: '2px solid #dbeafe' }} />
                                <div style={{ fontSize: '11px', color: '#1e40af', marginTop: '6px', fontWeight: '600' }}>ℹ️ Cette adresse apparaîtra dans le bloc "Localisation" de vos rapports.</div>
                            </div>

                            <div className="btp-form-group" style={{ marginBottom: '25px' }}>
                                <label style={{ color: '#64748b', fontWeight: '800', fontSize: '0.85rem' }}>Période de Relevé</label>
                                <select value={reportType} onChange={(e) => setReportType(e.target.value)} style={{ height: '52px', padding: '0 15px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', width: '100%' }}>
                                    <option value="Journalier">Journalier</option>
                                    <option value="Quotidien">Quotidien (Semaine)</option>
                                    <option value="Hebdomadaire">Hebdomadaire</option>
                                    <option value="Mensuel">Mensuel</option>
                                </select>
                            </div>

                            <div className="btp-form-group" style={{ marginBottom: '25px' }}>
                                <label style={{ color: '#64748b', fontWeight: '800', fontSize: '0.85rem' }}>Date de Démarrage</label>
                                <input type="date" value={startChantierDate}
                                    onChange={(e) => setStartChantierDate(e.target.value)}
                                    style={{ height: '52px', padding: '0 15px', borderRadius: '12px', border: '1px solid #e2e8f0', width: '100%' }} />
                            </div>

                            <div className="btp-form-group">
                                <label style={{ color: '#64748b', fontWeight: '800', fontSize: '0.85rem' }}>Durée prévue du Chantier</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input value={contractDuration}
                                        onChange={(e) => setContractDuration(e.target.value)}
                                        placeholder="Ex: 12, 24..."
                                        style={{ height: '52px', padding: '0 20px', borderRadius: '12px', border: '1px solid #e2e8f0', flex: 1 }} />
                                    <select value={contractDurationUnit} onChange={(e) => setContractDurationUnit(e.target.value)} style={{ height: '52px', padding: '0 15px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', width: '120px' }}>
                                        <option value="jours">jours</option>
                                        <option value="semaines">semaines</option>
                                        <option value="mois">mois</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* CARTE 3 – RÉGLAGES ENVOI */}
                        <div style={{ background: '#f8fafc', padding: '30px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', marginBottom: '30px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                                <span style={{ fontSize: '1.5rem' }}>📧</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Réglages d'Envoi & Station</h3>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                                <div className="btp-form-group">
                                    <label style={{ color: '#64748b', fontWeight: '800', fontSize: '0.85rem' }}>🚀 Destinataire Mail (Par défaut)</label>
                                    <input value={emailCli}
                                        onChange={(e) => setEmailCli(e.target.value)}
                                        placeholder="destinataire@client.com"
                                        style={{ height: '50px', padding: '0 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff' }} />
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>L'adresse utilisée par défaut pour envoyer le rapport.</div>
                                </div>
                                <div className="btp-form-group">
                                    <label style={{ color: '#64748b', fontWeight: '800', fontSize: '0.85rem' }}>📡 Station de Référence</label>
                                    <input value={stationMeteo}
                                        onChange={(e) => setStationMeteo(e.target.value)}
                                        placeholder="Nom de la station (Douai, Lille...)"
                                        style={{ height: '50px', padding: '0 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff' }} />
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>Le nom de la station météo affiché officiellement.</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="btp-panel">
                        <div className="btp-panel-head">
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div className="btp-step-num">3</div>
                                <span className="btp-panel-title">Règles & Conditions</span>
                            </div>
                            <button className="btp-btn-config" onClick={() => setTradesModalOpen(true)}>⚙️ Métiers</button>
                        </div>
                        <button className="btp-btn btp-btn-add-main" onClick={() => addRule()}>➕ AJOUTER RÈGLE</button>
                        <div className="btp-options-bar">
                            <label><input type="checkbox" checked={displaySimple} onChange={(e) => setDisplaySimple(e.target.checked)} /> 👁️ Mode Simplifié</label>
                            <label><input type="checkbox" checked={showCharts} onChange={(e) => setShowCharts(e.target.checked)} /> 📊 Graphiques</label>
                            <button className="btp-btn-config" onClick={() => setColsModalOpen(true)}>👁️ Colonnes PDF</button>
                            <select value={emptyCellStyle} onChange={(e) => setEmptyCellStyle(e.target.value)} className="btp-select-small">
                                <option value="gray">Cases vides : Grises</option>
                                <option value="white">Cases vides : Blanches</option>
                            </select>
                        </div>

                        <div className="btp-separator">OU raccourcis</div>
                        <div className="btp-quick-actions">
                            <button className="btp-btn-quick" onClick={() => addRule('temp')}>❄️<br />Gel</button>
                            <button className="btp-btn-quick" onClick={() => addRule('vent_rafale')}>💨<br />Rafales</button>
                            <button className="btp-btn-quick" onClick={() => addRule('vent_avg')}>🌬️<br />V. Moy.</button>
                            <button className="btp-btn-quick" onClick={() => addRule('pluie')}>☔<br />Pluie</button>
                            <button className="btp-btn-quick" onClick={() => addRule('neige')}>☃️<br />Neige</button>
                            <button className="btp-btn-quick" onClick={() => addRule('soil')}>💧<br />Sol</button>
                            <button className="btp-btn-quick" onClick={() => addRule('heat')}>☀️<br />T° Élevée</button>
                            <button className="btp-btn-quick" onClick={() => addRule('fog')}>🌫️<br />Brouillard</button>
                            <button className="btp-btn-quick" onClick={() => addRule('canicule')}>🔥<br />Canicule</button>
                        </div>
                        <div className="btp-rules-list">
                            {rules?.map((r, i) => (
                                <div key={i} className="btp-rule-card">
                                    <div className="btp-rule-header" onClick={() => setOpenRuleIdx(openRuleIdx === i ? -1 : i)}>
                                        <div>
                                            <div className="btp-rule-title">
                                                {(colsLabels[r.var] || r.var)} {r.op} {r.val}
                                            </div>
                                        </div>
                                        <div>✏️</div>
                                    </div>
                                    <div className={`btp-rule-body ${openRuleIdx === i ? 'open' : ''}`}>
                                        <button className="btp-btn-select-trades" onClick={() => { setCurrentRuleIndex(i); setRuleTradesModalOpen(true); setRuleTradesModalTimestamp(Date.now()); }}>Métiers ({r.lots.length})</button>
                                        <select value={r.var} onChange={(e) => uR(i, 'var', e.target.value)}>
                                            <option value="temp">Température</option>
                                            <option value="pluie">Pluie</option>
                                            <option value="vent_rafale">Rafale</option>
                                            <option value="vent_avg">Vent Moyen</option>
                                            <option value="neige">Neige</option>
                                            <option value="heat">T° Elevée</option>
                                            <option value="fog">Brouillard</option>
                                            <option value="canicule">Canicule</option>
                                            <option value="soil">Humidité Sol</option>
                                        </select>
                                        <select value={r.type} onChange={(e) => uR(i, 'type', e.target.value)}>
                                            <option value="cond1">Condition 1 : Toute la journée</option>
                                            <option value="cond2">Condition 2 : Plage horaire</option>
                                            <option value="cond3">Condition 3 : Consécutif</option>
                                            <option value="cond4">Condition 4 : Heure fixe</option>
                                            <option value="cond5">Condition 5 : Avancée (ET/OU)</option>
                                            <option value="cond6">Condition 6 : Cumul Glissant</option>
                                        </select>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '10px' }}>
                                            <div className="btp-form-group">
                                                <label>Opérateur</label>
                                                <select value={r.op} onChange={(e) => uR(i, 'op', e.target.value)}>
                                                    <option value="<">&lt;</option><option value="<=">&le;</option><option value=">">&gt;</option><option value=">=">&ge;</option>
                                                </select>
                                            </div>
                                            <div className="btp-form-group">
                                                <label>Valeur / Seuil</label>
                                                <input value={r.val} onChange={(e) => uR(i, 'val', e.target.value)} placeholder="ex: 10" />
                                            </div>

                                            {(r.type === 'cond2' || r.type === 'cond3' || r.type === 'cond4') && (
                                                <div className="btp-form-group">
                                                    <label>Heure Début (h1)</label>
                                                    <input type="number" value={r.h1 || 0} onChange={(e) => uR(i, 'h1', parseInt(e.target.value))} />
                                                </div>
                                            )}
                                            {(r.type === 'cond2' || r.type === 'cond3') && (
                                                <div className="btp-form-group">
                                                    <label>Heure Fin (h2)</label>
                                                    <input type="number" value={r.h2 || 23} onChange={(e) => uR(i, 'h2', parseInt(e.target.value))} />
                                                </div>
                                            )}
                                            {(r.type === 'cond3' || r.type === 'cond6') && (
                                                <div className="btp-form-group">
                                                    <label>Durée (h)</label>
                                                    <input type="number" value={r.dur || 0} onChange={(e) => uR(i, 'dur', parseInt(e.target.value))} />
                                                </div>
                                            )}

                                            {r.type === 'cond5' && (
                                                <>
                                                    <div className="btp-form-group">
                                                        <label>Logique</label>
                                                        <select value={r.logic || 'AND'} onChange={(e) => uR(i, 'logic', e.target.value)}>
                                                            <option value="AND">ET</option><option value="OR">OU</option>
                                                        </select>
                                                    </div>
                                                    <div className="btp-form-group">
                                                        <label>Heure 1 (h1)</label>
                                                        <input type="number" value={r.h1 || 0} onChange={(e) => uR(i, 'h1', parseInt(e.target.value))} />
                                                    </div>
                                                    <div className="btp-form-group">
                                                        <label>Opérateur 2</label>
                                                        <select value={r.op2 || r.op} onChange={(e) => uR(i, 'op2', e.target.value)}>
                                                            <option value="<">&lt;</option><option value="<=">&le;</option><option value=">">&gt;</option><option value=">=">&ge;</option>
                                                        </select>
                                                    </div>
                                                    <div className="btp-form-group">
                                                        <label>Valeur 2</label>
                                                        <input value={r.val2 || ''} onChange={(e) => uR(i, 'val2', e.target.value)} placeholder="ex: 5" />
                                                    </div>
                                                    <div className="btp-form-group">
                                                        <label>Heure 2 (h3)</label>
                                                        <input type="number" value={r.h3 || 0} onChange={(e) => uR(i, 'h3', parseInt(e.target.value))} />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <button className="btp-btn-del" onClick={() => delRule(i)}>Supprimer</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="btp-panel" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <label className="btp-print-option" style={{ marginBottom: '15px' }}><input type="checkbox" checked={checkPeriod} onChange={(e) => setCheckPeriod(e.target.checked)} /> Ajouter page synthèse globale</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button className="btp-btn btp-btn-print" onClick={handlePrint} style={{ background: '#0f172a', margin: 0 }}>🖨️ IMPRIMER (PDF)</button>
                            <button className="btp-btn btp-btn-word" onClick={exportWord} style={{ background: '#2b579a', margin: 0 }}>📝 EXPORT WORD</button>
                            <button className="btp-btn btp-btn-mail" onClick={sendMail} style={{ margin: 0 }}>📧 ENVOYER MAIL</button>
                            <button className="btp-btn btp-btn-copy" onClick={copyMailBody} style={{ margin: 0 }}>📋 COPIER TEXTE</button>
                        </div>

                        <div style={{ marginTop: '20px', borderTop: '2px dashed #e2e8f0', paddingTop: '15px' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '1rem' }}>Style des Graphiques</div>
                            <div className="btp-design-selector">
                                <label className={chartDesign === 'architect' ? 'active' : ''}>
                                    <input type="radio" name="chartStyle" value="architect" checked={chartDesign === 'architect'} onChange={() => setChartDesign('architect')} /> 🏢 Architecte
                                </label>
                                <label className={chartDesign === 'vibrant' ? 'active' : ''}>
                                    <input type="radio" name="chartStyle" value="vibrant" checked={chartDesign === 'vibrant'} onChange={() => setChartDesign('vibrant')} /> 🌈 Vibrant
                                </label>
                                <label className={chartDesign === 'minimal' ? 'active' : ''}>
                                    <input type="radio" name="chartStyle" value="minimal" checked={chartDesign === 'minimal'} onChange={() => setChartDesign('minimal')} /> ❄️ Minimal
                                </label>
                            </div>
                        </div>
                    </div>
                </div >

                <div className="btp-preview" style={{ background: '#cbd5e1', padding: '20px', borderRadius: '12px', minHeight: '100vh', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)' }}>
                    <div id="btp-out-report" dangerouslySetInnerHTML={{ __html: reportOutput }} style={{ background: 'white', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', margin: '0 auto' }} />
                </div>
            </div >
        </div >
    );
};

export default BtpManager;
