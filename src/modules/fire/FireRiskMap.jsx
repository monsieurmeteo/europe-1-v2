import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from 'react-router-dom';
import { geoConicConformal, geoPath } from "d3-geo";
import { supabase } from "../../services/api";
import { Flame, RefreshCw, Search, AlertTriangle, MapPin, Thermometer, Droplets, Wind, Info, ChevronDown, Download } from "lucide-react";
import { format, subDays, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import html2canvas from "html2canvas";
import stationNamesData from "../../data/stationNames.json";
import stationsListData from "../../data/stations_list.json";

import { REGIONS } from "../../data/departments";

// Liste des codes de postes météo des 30 plus grandes villes françaises pour affichage ciblé
const MAJOR_STATIONS = [
    "75114001", // Paris Montsouris
    "13055001", // Marseille
    "69387005", // Lyon Bron
    "31555001", // Toulouse Blagnac
    "06088001", // Nice
    "44109001", // Nantes
    "34172001", // Montpellier
    "67124001", // Strasbourg Entzheim
    "33069001", // Bordeaux Mérignac
    "59350001", // Lille Lesquin
    "35238001", // Rennes St-Jacques
    "51454001", // Reims
    "83070001", // Toulon
    "42218001", // Saint-Étienne
    "76351001", // Le Havre
    "38382001", // Grenoble St-Geoirs
    "21054001", // Dijon
    "49007001", // Angers
    "30189001", // Nîmes Courbessac
    "63113001", // Clermont-Ferrand
    "13001001", // Aix-en-Provence
    "29019001", // Brest
    "87085006", // Limoges Bellegarde
    "80021001", // Amiens
    "74010001", // Annecy
    "66136001", // Perpignan
    "57463001", // Metz Frescaty
    "25056001", // Besançon
    "86194004", // Poitiers Biard
    "59178001"  // Douai (poste de référence locale)
];

// ─── Règle des 3×30 ──────────────────────────────────────────────────────────
const RISK_LEVELS = {
    LOW:      { id: 'low',    label: 'Faible',       color: '#22c55e', bg: '#dcfce7', text: '#166534', emoji: '🟢' },
    SENSIBLE: { id: 'sensible',label: 'À surveiller', color: '#10b981', bg: '#ecfdf5', text: '#047857', emoji: '🟢' }, // Vert émeraude brillant
    WARNING:  { id: 'warning',label: 'Vigilance',    color: '#eab308', bg: '#fef9c3', text: '#854d0e', emoji: '🟡' },
    HIGH:     { id: 'high',   label: 'Élevé',        color: '#f97316', bg: '#ffedd5', text: '#9a3412', emoji: '🟠' },
    CRITICAL: { id: 'critical',label:'Très élevé',   color: '#ef4444', bg: '#fee2e2', text: '#991b1b', emoji: '🔴' },
};

const RISK_MESSAGES = {
    low:      'Aucune condition favorable au départ de feux.',
    sensible: 'Un paramètre météo approche des seuils. Surveillance locale conseillée.',
    warning:  'Conditions favorables au déclenchement d\'un incendie. Vigilance recommandée.',
    high:     'Risque élevé de départ et de propagation d\'un incendie.',
    critical: 'Conditions météorologiques très favorables à une propagation rapide des incendies.',
};

function computeRisk(temp, hum, wind) {
    if (temp == null || hum == null) return 'low';

    // 1. Attribution des scores individuels par paramètre
    let tempScore = 0;
    if (temp >= 30) tempScore = 3;      // Critique
    else if (temp >= 28) tempScore = 2; // Élevé
    else if (temp >= 25) tempScore = 1; // Modéré

    let humScore = 0;
    if (hum <= 30) humScore = 3;      // Critique
    else if (hum <= 35) humScore = 2; // Élevé
    else if (hum <= 45) humScore = 1; // Modéré

    let windScore = 0;
    const w = wind || 0;
    if (w >= 30) windScore = 3;      // Critique
    else if (w >= 25) windScore = 2; // Élevé
    else if (w >= 15) windScore = 1; // Modéré

    // 2. Détermination du niveau combiné
    const totalScore = tempScore + humScore + windScore;

    // Niveau Rouge (Très élevé / Critique) : 
    // - Soit au moins deux critères au niveau critique (3)
    // - Soit les 3 critères au moins au niveau élevé (2, 2, 2 -> totalScore >= 6 avec chacun >= 2)
    const criticalCount = [tempScore === 3, humScore === 3, windScore === 3].filter(Boolean).length;
    if (criticalCount >= 2 || (tempScore >= 2 && humScore >= 2 && windScore >= 2)) {
        return 'critical';
    }

    // Niveau Orange (Élevé) :
    // - Soit un critère critique (3) combiné à un autre modéré
    // - Soit au moins deux critères élevés
    if (totalScore >= 5 || (tempScore === 3 || humScore === 3 || windScore === 3)) {
        return 'high';
    }

    // Niveau Jaune (Vigilance) :
    // - Au moins un critère modéré ou plus (score total >= 2)
    if (totalScore >= 2) {
        return 'warning';
    }

    // Niveau Vert Émeraude (À surveiller) :
    // - Un seul critère modéré actif (score total === 1)
    if (totalScore === 1) {
        return 'sensible';
    }

    return 'low';
}

// ─── Haversine distance (km) ─────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Composant principal ──────────────────────────────────────────────────────
const FireRiskMap = () => {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(() =>
        localStorage.getItem('fireRiskDate') || new Date().toISOString().split('T')[0]
    );
    const [viewMode, setViewMode] = useState(() =>
        localStorage.getItem('fireRiskViewMode') || 'live'
    );
    const [geoData, setGeoData] = useState(null);
    const [regionsGeoData, setRegionsGeoData] = useState(null); // GeoJSON des régions
    const [selectedRegionName, setSelectedRegionName] = useState("France"); // "France" ou nom de région
    const [stationData, setStationData] = useState([]); // [{station_id, dept, name, tempMax, humMin, windMean, risk}]
    const [deptRisk, setDeptRisk] = useState({}); // { deptCode: { risk, stations: [] } }
    const [regionRisk, setRegionRisk] = useState({}); // { regionName: { risk, stations: [] } }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [selectedDept, setSelectedDept] = useState(null);
    const [hoveredDept, setHoveredDept] = useState(null);
    const [hoveredRegion, setHoveredRegion] = useState(null); // Région survolée
    const [hoveredStation, setHoveredStation] = useState(null); // Station survolée
    const [lastUpdate, setLastUpdate] = useState(null);
    const [showInfo, setShowInfo] = useState(false);
    const mapContainerRef = useRef(null);

    const WIDTH = 1000;
    const HEIGHT = 1000;

    // Index stations par lat/lon
    const stationLookup = useMemo(() => {
        const map = {};
        if (stationsListData?.features) {
            stationsListData.features.forEach(f => {
                map[f.properties.num] = {
                    lat: f.geometry.coordinates[1],
                    lon: f.geometry.coordinates[0],
                    name: f.properties.nom
                };
            });
        }
        return map;
    }, []);

    // Projection D3 Dynamique avec fitExtent (comme sur les autres cartes) - Légèrement décalée à gauche en mode Région (translation de -80px sur l'axe X)
    const projection = useMemo(() => {
        if (!geoData) return null;
        if (selectedRegionName !== "France" && regionsGeoData) {
            const regionFeature = regionsGeoData.features.find(f => f.properties.nom === selectedRegionName);
            if (regionFeature) {
                const proj = geoConicConformal().fitExtent([[40, 40], [WIDTH - 40, HEIGHT - 80]], regionFeature);
                const currentTranslate = proj.translate();
                // On translate la carte vers la gauche (X - 90) pour faire de la place au widget Top 30 à droite
                return proj.translate([currentTranslate[0] - 90, currentTranslate[1]]);
            }
        }
        // Mode France entière (zoom standard)
        const proj = geoConicConformal().fitExtent([[40, 40], [WIDTH - 40, HEIGHT - 40]], geoData);
        const currentTranslate = proj.translate();
        return proj.translate([currentTranslate[0] - 70, currentTranslate[1]]);
    }, [geoData, regionsGeoData, selectedRegionName]);

    const pathGenerator = useMemo(() => projection ? geoPath().projection(projection) : null, [projection]);

    // Charger GeoJSON départements et régions
    useEffect(() => {
        fetch("/data/departements-version-simplifiee.geojson")
            .then(r => r.json())
            .then(setGeoData)
            .catch(err => console.error("Erreur GeoJSON Dépt:", err));

        fetch("/data/regions-version-simplifiee.geojson")
            .then(r => r.json())
            .then(setRegionsGeoData)
            .catch(err => console.error("Erreur GeoJSON Régions:", err));
    }, []);

    // Fallback : chargement temps réel depuis observations_6mn si get_france_live n'a pas l'humidité
    const loadLiveFromObservations = useCallback(async () => {
        console.log("[FireRiskMap] Chargement live depuis observations_6mn (fallback)...");
        const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const batchSize = 1000;
        const parallelCount = 6;
        const promises = Array.from({ length: parallelCount }, (_, i) =>
            supabase
                .from('observations_6mn')
                .select('station_id, t, u, ff, timestamp')
                .gte('timestamp', since)
                .not('t', 'is', null)
                .not('u', 'is', null)
                .range(i * batchSize, (i + 1) * batchSize - 1)
        );

        const results = await Promise.all(promises);
        const allObs = [];
        results.forEach(res => {
            if (res.data) allObs.push(...res.data);
        });

        if (allObs.length > 0) {
            const stationMap = new Map();
            let maxTimestamp = null;
            allObs.forEach(obs => {
                let sid = String(obs.station_id);
                if (sid.length === 7) sid = "0" + sid;
                const existing = stationMap.get(sid);
                const obsDate = new Date(obs.timestamp);
                if (!maxTimestamp || obsDate > maxTimestamp) maxTimestamp = obsDate;
                if (!existing || obsDate > new Date(existing.timestamp)) {
                    stationMap.set(sid, { ...obs, station_id: sid });
                }
            });
            if (maxTimestamp) setLastUpdate(maxTimestamp);

            const processed = [];
            stationMap.forEach((obs, sid) => {
                const meta = stationLookup[sid];
                const lat = meta?.lat;
                const lon = meta?.lon;
                const temp = obs.t;
                const hum = obs.u;
                const windSpd = obs.ff || 0;
                const risk = computeRisk(temp, hum, windSpd);

                let dept = sid.substring(0, 2);
                if (dept === '20') {
                    const num3 = parseInt(sid.substring(2, 5), 10);
                    dept = num3 < 200 ? '2A' : '2B';
                }

                processed.push({
                    station_id: sid,
                    name: stationNamesData[sid] || meta?.name || sid,
                    dept,
                    lat,
                    lon,
                    tempMax: temp,
                    humMin: hum,
                    windMean: windSpd,
                    risk
                });
            });
            return processed;
        }
        return [];
    }, [stationLookup]);

    // ─── Chargement des données (temps réel ou max journalier) ────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            let processedStations = [];

            if (viewMode === 'live') {
                console.log("[FireRiskMap] Chargement en direct (get_france_live)...");
                let liveData = [];
                let from = 0;
                const batchSize = 1000;
                let hasMore = true;

                while (hasMore) {
                    const { data, error: liveError } = await supabase
                        .rpc('get_france_live')
                        .range(from, from + batchSize - 1);

                    if (liveError) throw liveError;
                    if (data && data.length > 0) {
                        liveData.push(...data);
                        if (data.length < batchSize) hasMore = false;
                        else from += batchSize;
                    } else {
                        hasMore = false;
                    }
                }

                if (liveData.length > 0) {
                    let maxTimestamp = null;
                    liveData.forEach(item => {
                        if (item.obs_time) {
                            const d = new Date(item.obs_time);
                            if (!maxTimestamp || d > maxTimestamp) {
                                maxTimestamp = d;
                            }
                        }
                    });
                    if (maxTimestamp) setLastUpdate(maxTimestamp);

                    processedStations = liveData
                        .filter(item => item.station_id < '96000000' && !item.station_id.startsWith('SIMULATION'))
                        .map(s => {
                            let sid = String(s.station_id);
                            if (sid.length === 7) sid = "0" + sid;

                            const meta = stationLookup[sid];
                            const lat = meta?.lat;
                            const lon = meta?.lon;

                            const temp = s.t; 
                            const hum = s.u !== null && s.u !== undefined ? s.u : s.humidity;  
                            const windSpd = s.wind; 

                            const risk = computeRisk(temp, hum, windSpd);

                            let dept = sid.substring(0, 2);
                            if (dept === '20') {
                                const num3 = parseInt(sid.substring(2, 5), 10);
                                dept = num3 < 200 ? '2A' : '2B';
                            }

                            return {
                                station_id: sid,
                                name: stationNamesData[sid] || meta?.name || sid,
                                dept,
                                lat,
                                lon,
                                tempMax: temp,
                                humMin: hum,
                                windMean: windSpd,
                                risk
                            };
                        });
                }

                // Fallback si pas de données d'humidité dans get_france_live
                if (processedStations.filter(s => s.humMin != null).length === 0) {
                    console.log("[FireRiskMap] Fallback sur observations_6mn...");
                    processedStations = await loadLiveFromObservations();
                }
            } else {
                // Mode Maximums du Jour
                console.log(`[FireRiskMap] Chargement des maximums du jour (${selectedDate})...`);
                
                // 1. Charger les maximums quotidiens (Temp et Vent)
                let allDs = [];
                let from = 0;
                let hasMore = true;
                while (hasMore) {
                    const { data, error: e } = await supabase
                        .from('daily_summaries')
                        .select('station_id, temp_max, wind_mean_max')
                        .eq('date', selectedDate)
                        .not('temp_max', 'is', null)
                        .range(from, from + 999);
                    if (e) throw e;
                    if (data?.length > 0) {
                        allDs = allDs.concat(data);
                        if (data.length < 1000) hasMore = false;
                        else from += 1000;
                    } else hasMore = false;
                }

                // 2. Charger les humidités minimales de la journée (depuis observations_6mn)
                const humMap = {};
                let fromH = 0;
                let hasMoreH = true;
                while (hasMoreH) {
                    const { data: hData, error: e } = await supabase
                        .from('observations_6mn')
                        .select('station_id, u')
                        .gte('timestamp', selectedDate + 'T00:00:00Z')
                        .lt('timestamp', selectedDate + 'T23:59:59Z')
                        .not('u', 'is', null)
                        .range(fromH, fromH + 999);
                    if (e) throw e;
                    if (hData?.length > 0) {
                        hData.forEach(o => {
                            if (humMap[o.station_id] === undefined || o.u < humMap[o.station_id]) {
                                humMap[o.station_id] = o.u;
                            }
                        });
                        if (hData.length < 1000) hasMoreH = false;
                        else fromH += 1000;
                    } else hasMoreH = false;
                }

                setLastUpdate(new Date(selectedDate + 'T18:00:00Z')); // Arbitraire pour la journée

                processedStations = allDs.map(ds => {
                    const sid = ds.station_id;
                    const humMin = humMap[sid] ?? null;
                    const risk = computeRisk(ds.temp_max, humMin, ds.wind_mean_max);
                    const meta = stationLookup[sid];
                    let dept = sid.substring(0, 2);
                    if (dept === '20') {
                        const num3 = parseInt(sid.substring(2, 5), 10);
                        dept = num3 < 200 ? '2A' : '2B';
                    }
                    return {
                        station_id: sid,
                        name: stationNamesData[sid] || meta?.name || sid,
                        dept,
                        lat: meta?.lat,
                        lon: meta?.lon,
                        tempMax: ds.temp_max,
                        humMin,
                        windMean: ds.wind_mean_max,
                        risk
                    };
                });
            }

            // Filtrage final : coordonnées en France métropolitaine et instruments complets
            const filtered = processedStations.filter(s => {
                if (!s.lat || !s.lon) return false;
                const inMetropolitanFrance = s.lat >= 41.0 && s.lat <= 51.5 && s.lon >= -5.5 && s.lon <= 10.0;
                if (!inMetropolitanFrance) return false;

                // Élimination stricte de tout ce qui est null, undefined ou invalide (ex: NaN)
                return s.tempMax != null && s.humMin != null && s.windMean != null && 
                       !isNaN(s.tempMax) && !isNaN(s.humMin) && !isNaN(s.windMean);
            });

            setStationData(filtered);

            // Agréger par département
            const riskOrder = { low: 0, sensible: 1, warning: 2, high: 3, critical: 4 };
            const deptMap = {};
            filtered.forEach(s => {
                if (!deptMap[s.dept]) {
                    deptMap[s.dept] = { risk: s.risk, stations: [] };
                } else if (riskOrder[s.risk] > riskOrder[deptMap[s.dept].risk]) {
                    deptMap[s.dept].risk = s.risk;
                }
                deptMap[s.dept].stations.push(s);
            });
            setDeptRisk(deptMap);

            // Agréger par région
            const regMap = {};
            filtered.forEach(s => {
                let regionName = "Autre";
                for (const [rName, depts] of Object.entries(REGIONS)) {
                    if (depts.includes(s.dept)) {
                        regionName = rName;
                        break;
                    }
                }
                if (!regMap[regionName]) {
                    regMap[regionName] = { risk: s.risk, stations: [] };
                } else if (riskOrder[s.risk] > riskOrder[regMap[regionName].risk]) {
                    regMap[regionName].risk = s.risk;
                }
                regMap[regionName].stations.push(s);
            });
            Object.values(regMap).forEach(r => {
                r.stations.sort((a, b) => riskOrder[b.risk] - riskOrder[a.risk]);
            });
            setRegionRisk(regMap);
        } catch (err) {
            console.error('[FireRiskMap] Erreur:', err);
            setError('Impossible de charger les données.');
        } finally {
            setLoading(false);
        }
    }, [viewMode, selectedDate, stationLookup]);

    useEffect(() => {
        loadData();
        localStorage.setItem('fireRiskDate', selectedDate);
    }, [selectedDate, viewMode, loadData]);

    // Auto-refresh toutes les 30 minutes
    useEffect(() => {
        const interval = setInterval(loadData, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [loadData]);

    // ─── Recherche par code postal ou ville ──────────────────────────────────
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        setSearchError('');
        setSearchResult(null);

        try {
            // API adresse.data.gouv.fr
            const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(searchQuery)}&limit=1`;
            const res = await fetch(url);
            const json = await res.json();

            if (!json.features?.length) {
                setSearchError('Aucune commune trouvée. Essayez un autre nom ou code postal.');
                return;
            }

            const feat = json.features[0];
            const [lon, lat] = feat.geometry.coordinates;
            const cityName = feat.properties.label;
            const deptCode = feat.properties.departement;

            // Trouver la station la plus proche avec données de risque
            let nearest = null;
            let minDist = Infinity;

            // D'abord chercher parmi les stations avec données de risque
            const allWithMeta = [...stationData.filter(s => s.lat && s.lon),
                // Ajouter toutes les stations avec métadonnées si pas de risque
                ...Object.entries(stationLookup)
                    .filter(([sid]) => !stationData.find(s => s.station_id === sid))
                    .map(([sid, m]) => ({ station_id: sid, name: stationNamesData[sid] || m.name, lat: m.lat, lon: m.lon, dept: sid.substring(0,2), risk: 'low', tempMax: null, humMin: null, windMean: null }))
            ];

            allWithMeta.forEach(s => {
                const d = haversine(lat, lon, s.lat, s.lon);
                if (d < minDist) { minDist = d; nearest = s; }
            });

            if (!nearest) {
                setSearchError('Aucune station météo trouvée à proximité.');
                return;
            }

            setSearchResult({
                city: cityName,
                dept: deptCode || nearest.dept,
                station: nearest,
                distance: Math.round(minDist)
            });

            // Sélectionner le département sur la carte
            setSelectedDept(deptCode || nearest.dept);

        } catch (err) {
            setSearchError('Erreur de recherche. Vérifiez votre connexion.');
        } finally {
            setSearchLoading(false);
        }
    };

    // Filtrage des stations de la région sélectionnée
    const filteredStations = useMemo(() => {
        if (selectedRegionName === "France") return stationData;
        const regionDepts = REGIONS[selectedRegionName] || [];
        return stationData.filter(s => regionDepts.includes(s.dept));
    }, [stationData, selectedRegionName]);

    // ─── Couleur d'un département ─────────────────────────────────────────────
    const getDeptColor = (deptCode) => {
        const d = deptRisk[deptCode];
        if (!d) return '#22c55e'; // Vert (faible danger) par défaut pour les départements sans risque
        return RISK_LEVELS[d.risk.toUpperCase()]?.color || '#22c55e';
    };

    // ─── Stats globales ───────────────────────────────────────────────────────
    const globalStats = useMemo(() => {
        const counts = { low: 0, warning: 0, high: 0, critical: 0 };
        Object.values(deptRisk).forEach(d => counts[d.risk]++);
        return counts;
    }, [deptRisk]);

    const selectedDeptData = selectedDept ? deptRisk[selectedDept] : null;

    const handleExport = () => {
        const el = document.getElementById("fire-risk-map-container");
        if (!el) return;
        html2canvas(el, { scale: 2, useCORS: true }).then(canvas => {
            const link = document.createElement("a");
            link.download = `carte-feux-foret-${selectedDate}.png`;
            link.href = canvas.toDataURL();
            link.click();
        });
    };

    return (
        <div style={{ background: '#0f172a', minHeight: '100vh', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", padding: '0' }}>

            {/* ─── HEADER ─── */}
            <div style={{ background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)', padding: '20px 24px', borderBottom: '1px solid #fca5a5' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Flame size={32} style={{ color: '#fbbf24' }} />
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>Risque Feux de Forêt</h1>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#fca5a5' }}>Indice météorologique — Règle des 3×30</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {/* Sélecteur de Région */}
                        <div style={{ position: 'relative' }}>
                            <select
                                value={selectedRegionName}
                                onChange={(e) => {
                                    setSelectedRegionName(e.target.value);
                                    setSelectedDept(null);
                                }}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #fca5a5',
                                    background: '#7f1d1d',
                                    fontSize: '0.85rem',
                                    fontWeight: '700',
                                    color: '#fff',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    appearance: 'none',
                                    paddingRight: '30px'
                                }}
                            >
                                <option value="France">Toute la France</option>
                                {regionsGeoData?.features.map(f => (
                                    <option key={f.properties.nom} value={f.properties.nom}>{f.properties.nom}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#fca5a5' }} />
                        </div>

                        {/* Sélecteur de date */}
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            style={{ background: '#7f1d1d', border: '1px solid #fca5a5', borderRadius: 8, color: '#fff', padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer' }}
                        />

                        {/* Sélecteur Mode de vue (En Direct / Max de la journée) */}
                        <div style={{ display: 'flex', background: '#7f1d1d', border: '1px solid #fca5a5', borderRadius: '8px', padding: '2px', overflow: 'hidden' }}>
                            <button
                                onClick={() => {
                                    setViewMode('live');
                                    localStorage.setItem('fireRiskViewMode', 'live');
                                }}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    background: viewMode === 'live' ? '#ef4444' : 'transparent',
                                    color: '#fff',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                }}
                            >
                                En Direct (6 min)
                            </button>
                            <button
                                onClick={() => {
                                    setViewMode('daily_max');
                                    localStorage.setItem('fireRiskViewMode', 'daily_max');
                                }}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    background: viewMode === 'daily_max' ? '#ef4444' : 'transparent',
                                    color: '#fff',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                }}
                            >
                                Maximums du Jour
                            </button>
                        </div>
                        <button onClick={loadData} disabled={loading} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '6px 12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                            {loading ? 'Chargement...' : 'Actualiser'}
                        </button>
                        <button onClick={handleExport} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '6px 12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} title="Télécharger la carte">
                            <Download size={14} />
                            Télécharger
                        </button>
                        <button onClick={() => setShowInfo(!showInfo)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '6px 10px', color: '#fff', cursor: 'pointer' }}>
                            <Info size={16} />
                        </button>
                    </div>
                </div>

                {/* Panel info */}
                {showInfo && (
                    <div style={{ marginTop: 16, background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '14px 18px', fontSize: '0.82rem', lineHeight: 1.6, color: '#fde68a', border: '1px solid #fbbf24' }}>
                        <strong>⚠️ Avertissement</strong> — Cet indice est un <strong>indicateur météorologique</strong> fondé sur la règle des « 3 × 30 » (T ≥ 30°C, HR ≤ 30%, Vent ≥ 30 km/h).
                        Il <strong>ne remplace pas</strong> les niveaux officiels de danger d'incendie publiés par les autorités compétentes (Préfectures, SDIS, INRAE).
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0, minHeight: 'calc(100vh - 100px)' }}>

                {/* ─── PANNEAU GAUCHE ─── */}
                <div style={{ background: '#1e293b', borderRight: '1px solid #334155', padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Recherche intelligente */}
                    <form onSubmit={handleSearch}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Search size={12} /> RECHERCHE INTELLIGENTE
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Code postal, ville ou adresse..."
                                style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', transition: 'border-color 0.2s' }}
                                onFocus={e => e.target.style.borderColor = '#ef4444'}
                                onBlur={e => e.target.style.borderColor = '#334155'}
                            />
                            <button type="submit" disabled={searchLoading} style={{ background: '#ef4444', border: 'none', borderRadius: 8, padding: '9px 14px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                {searchLoading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
                            </button>
                        </div>

                        {/* Chips d'exemples cliquables */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                            {[
                                { label: '📮 59000', query: '59000' },
                                { label: '🏙️ Marseille', query: 'Marseille' },
                                { label: '🏠 Adresse', query: '15 rue Victor Hugo Douai' },
                            ].map(ex => (
                                <button key={ex.query} type="button"
                                    onClick={() => setSearchQuery(ex.query)}
                                    style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '3px 8px', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#fca5a5'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.color = '#94a3b8'; }}
                                >{ex.label}</button>
                            ))}
                            <button type="button"
                                onClick={() => {
                                    if (!navigator.geolocation) return;
                                    navigator.geolocation.getCurrentPosition(async pos => {
                                        const { latitude, longitude } = pos.coords;
                                        try {
                                            const res = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${longitude}&lat=${latitude}`);
                                            const json = await res.json();
                                            if (json.features?.[0]) setSearchQuery(json.features[0].properties.label);
                                        } catch(e) {}
                                    }, () => alert('Géolocalisation refusée ou indisponible.'));
                                }}
                                style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '3px 8px', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#93c5fd'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.color = '#94a3b8'; }}
                            >📍 Ma position</button>
                        </div>

                        <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: 5 }}>
                            💡 Code postal · ville · adresse · géolocalisation
                        </div>
                        {searchError && <div style={{ color: '#f87171', fontSize: '0.78rem', marginTop: 6 }}>{searchError}</div>}
                    </form>


                    {/* Résultat de recherche */}
                    {searchResult && (
                        <div style={{ background: '#0f172a', border: `2px solid ${RISK_LEVELS[(searchResult.station.risk || 'low').toUpperCase()]?.color || '#334155'}`, borderRadius: 12, padding: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <MapPin size={16} style={{ color: '#f87171' }} />
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{searchResult.city}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Station la plus proche : <strong>{searchResult.station.name}</strong> ({searchResult.distance} km)</div>
                                </div>
                            </div>
                            {/* Niveau de risque */}
                            {(() => {
                                const risk = searchResult.station.risk || 'low';
                                const lvl = RISK_LEVELS[risk.toUpperCase()];
                                return (
                                    <div style={{ background: lvl?.bg, borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                                        <div style={{ fontWeight: 700, fontSize: '1rem', color: lvl?.text }}>
                                            {lvl?.emoji} Risque {lvl?.label}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: lvl?.text, marginTop: 4 }}>
                                            {RISK_MESSAGES[risk]}
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* Paramètres météo */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                {[
                                    { icon: <Thermometer size={14}/>, label: 'T° max', value: searchResult.station.tempMax != null ? `${searchResult.station.tempMax.toFixed(1)}°C` : '—', alert: searchResult.station.tempMax >= 30 },
                                    { icon: <Droplets size={14}/>, label: 'HR min', value: searchResult.station.humMin != null ? `${searchResult.station.humMin}%` : '—', alert: searchResult.station.humMin <= 30 },
                                    { icon: <Wind size={14}/>, label: 'Vent moy', value: searchResult.station.windMean != null ? `${searchResult.station.windMean} km/h` : '—', alert: searchResult.station.windMean >= 30 },
                                ].map((p, i) => (
                                    <div key={i} style={{ background: p.alert ? '#450a0a' : '#1e293b', border: `1px solid ${p.alert ? '#ef4444' : '#334155'}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                        <div style={{ color: p.alert ? '#fca5a5' : '#64748b', marginBottom: 4 }}>{p.icon}</div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: p.alert ? '#ef4444' : '#e2e8f0' }}>{p.value}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{p.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Stats globales */}
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                            RÉSUMÉ DU JOUR — {selectedDate}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {[
                                { key: 'critical', lvl: RISK_LEVELS.CRITICAL },
                                { key: 'high',     lvl: RISK_LEVELS.HIGH },
                                { key: 'warning',  lvl: RISK_LEVELS.WARNING },
                            ].map(({ key, lvl }) => {
                                const count = Object.values(deptRisk).filter(d => d.risk === key).length;
                                return (
                                    <div key={key} style={{ background: count > 0 ? lvl.bg : '#1e293b', border: `1px solid ${count > 0 ? lvl.color : '#334155'}`, borderRadius: 10, padding: '10px 14px' }}>
                                        <div style={{ fontWeight: 700, fontSize: '1.3rem', color: count > 0 ? lvl.color : '#475569' }}>{count}</div>
                                        <div style={{ fontSize: '0.72rem', color: count > 0 ? lvl.text : '#64748b' }}>{lvl.emoji} Dép. {lvl.label}</div>
                                    </div>
                                );
                            })}
                            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px' }}>
                                <div style={{ fontWeight: 700, fontSize: '1.3rem', color: '#eab308' }}>{filteredStations.length}</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Postes concernés</div>
                            </div>
                        </div>
                    </div>

                    {/* Détail du département sélectionné */}
                    {selectedDeptData && selectedDept && (
                        <div style={{ background: '#0f172a', border: `2px solid ${RISK_LEVELS[selectedDeptData.risk.toUpperCase()]?.color}`, borderRadius: 12, padding: 16 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 10 }}>
                                {RISK_LEVELS[selectedDeptData.risk.toUpperCase()]?.emoji} Dépt. {selectedDept}
                                <span style={{ marginLeft: 8, fontSize: '0.78rem', color: RISK_LEVELS[selectedDeptData.risk.toUpperCase()]?.color }}>
                                    {RISK_LEVELS[selectedDeptData.risk.toUpperCase()]?.label}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 8 }}>
                                {selectedDeptData.stations.length} poste(s) en alerte :
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                                {selectedDeptData.stations.map(s => {
                                    const lvl = RISK_LEVELS[s.risk.toUpperCase()];
                                    return (
                                        <div key={s.station_id} style={{ background: '#1e293b', borderLeft: `3px solid ${lvl?.color}`, borderRadius: '0 8px 8px 0', padding: '8px 12px' }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 4 }}>
                                                {lvl?.emoji} {s.name}
                                            </div>
                                            <div style={{ display: 'flex', gap: 12, fontSize: '0.72rem', color: '#94a3b8' }}>
                                                {s.tempMax != null && <span style={{ color: s.tempMax >= 30 ? '#f87171' : '#94a3b8' }}>🌡 {s.tempMax.toFixed(1)}°C</span>}
                                                {s.humMin != null && <span style={{ color: s.humMin <= 30 ? '#f87171' : '#94a3b8' }}>💧 {s.humMin}%</span>}
                                                {s.windMean != null && <span style={{ color: s.windMean >= 30 ? '#f87171' : '#94a3b8' }}>💨 {s.windMean} km/h</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Détail de la région sélectionnée */}
                    {selectedRegionName !== 'France' && regionRisk[selectedRegionName] && (
                        <div style={{ background: '#0f172a', border: `2px solid ${RISK_LEVELS[regionRisk[selectedRegionName].risk.toUpperCase()]?.color}`, borderRadius: 12, padding: 16 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 10 }}>
                                {RISK_LEVELS[regionRisk[selectedRegionName].risk.toUpperCase()]?.emoji} {selectedRegionName}
                                <span style={{ marginLeft: 8, fontSize: '0.78rem', color: RISK_LEVELS[regionRisk[selectedRegionName].risk.toUpperCase()]?.color }}>
                                    {RISK_LEVELS[regionRisk[selectedRegionName].risk.toUpperCase()]?.label}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 8 }}>
                                {regionRisk[selectedRegionName].stations.length} poste(s) en alerte :
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                                {regionRisk[selectedRegionName].stations.map(s => {
                                    const lvl = RISK_LEVELS[s.risk.toUpperCase()];
                                    return (
                                        <div key={s.station_id} style={{ background: '#1e293b', borderLeft: `3px solid ${lvl?.color}`, borderRadius: '0 8px 8px 0', padding: '8px 12px' }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 4 }}>
                                                {lvl?.emoji} {s.name} (Dept {s.dept})
                                            </div>
                                            <div style={{ display: 'flex', gap: 12, fontSize: '0.72rem', color: '#94a3b8' }}>
                                                {s.tempMax != null && <span style={{ color: s.tempMax >= 30 ? '#f87171' : '#94a3b8' }}>🌡 {s.tempMax.toFixed(1)}°C</span>}
                                                {s.humMin != null && <span style={{ color: s.humMin <= 30 ? '#f87171' : '#94a3b8' }}>💧 {s.humMin}%</span>}
                                                {s.windMean != null && <span style={{ color: s.windMean >= 30 ? '#f87171' : '#94a3b8' }}>💨 {s.windMean} km/h</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Légende */}
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>LÉGENDE</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[RISK_LEVELS.CRITICAL, RISK_LEVELS.HIGH, RISK_LEVELS.WARNING, RISK_LEVELS.LOW].map(lvl => (
                                <div key={lvl.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 18, height: 18, borderRadius: 4, background: lvl.color, flexShrink: 0 }} />
                                    <div>
                                        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#e2e8f0' }}>{lvl.label}</span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 6 }}>
                                            {lvl.id === 'critical' && '3 critères (T≥30, HR≤30, V≥30)'}
                                            {lvl.id === 'high'     && '2 critères sur 3'}
                                            {lvl.id === 'warning'  && 'Proche seuil ou 1 critère'}
                                            {lvl.id === 'low'      && 'Aucun seuil'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {lastUpdate && (
                        <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 'auto' }}>
                            Mis à jour : {format(lastUpdate, 'HH:mm', { locale: fr })} — Auto-refresh 30min
                        </div>
                    )}
                </div>

                {/* ─── CARTE SVG ─── */}
                <div id="fire-risk-map-container" style={{ background: '#ffffff', display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: '10px 16px', position: 'relative', overflow: 'hidden', border: '1px solid #000' }}>
                    
                    {/* Encadré Légende intégrée sur l'image téléchargeable (haut-gauche) */}
                    <div style={{
                        position: 'absolute',
                        top: '20px',
                        left: '20px',
                        background: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #000',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 900, color: '#1e293b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            INDICE FEUX DE FORÊT
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {[
                                { lvl: RISK_LEVELS.CRITICAL, desc: '3 critères (T≥30, HR≤30, V≥30)' },
                                { lvl: RISK_LEVELS.HIGH, desc: 'Élevé (2 critères)' },
                                { lvl: RISK_LEVELS.WARNING, desc: 'Vigilance (1 critère/seuil)' },
                                { lvl: RISK_LEVELS.SENSIBLE, desc: 'À surveiller' },
                                { lvl: RISK_LEVELS.LOW, desc: 'Faible' },
                            ].map(({ lvl }) => (
                                <div key={lvl.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: lvl.color, border: '0.5px solid rgba(0,0,0,0.3)', flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1e293b' }}>{lvl.emoji} {lvl.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Encadré Top des stations à risque et sous surveillance (en haut à droite) */}
                    {!loading && filteredStations.length > 0 && (() => {
                        const activeAlerts = filteredStations.filter(s => s.risk !== 'low' && s.risk !== 'sensible');
                        const underSurveillance = filteredStations.filter(s => s.risk === 'sensible');
                        
                        return (
                            <div style={{
                                position: 'absolute',
                                top: '20px',
                                right: '20px',
                                width: '310px',
                                maxHeight: 'calc(100vh - 150px)',
                                background: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid #000',
                                borderRadius: '10px',
                                padding: '12px',
                                boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
                                zIndex: 10,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}>
                                {/* Section 1 : Alertes Actives */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px' }}>
                                    <Flame size={16} style={{ color: '#ef4444' }} />
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e293b' }}>
                                        {selectedRegionName === "France" ? "Postes en alerte active" : `Postes en alerte (${selectedRegionName})`}
                                    </span>
                                </div>
                                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', paddingRight: '4px' }}>
                                    {activeAlerts.length === 0 ? (
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', padding: '4px 8px' }}>Aucun poste en alerte active.</div>
                                    ) : (
                                        activeAlerts
                                            .sort((a, b) => {
                                                const o = { critical: 3, high: 2, warning: 1 };
                                                return o[b.risk] - o[a.risk];
                                            })
                                            .slice(0, 30)
                                            .map(s => {
                                                const lvl = RISK_LEVELS[s.risk.toUpperCase()];
                                                return (
                                                    <div 
                                                        key={s.station_id} 
                                                        onClick={() => {
                                                            setSelectedDept(s.dept);
                                                            setSearchResult({
                                                                city: s.name,
                                                                dept: s.dept,
                                                                station: s,
                                                                distance: 0
                                                            });
                                                        }}
                                                        style={{ 
                                                            background: '#f8fafc', 
                                                            borderLeft: `3px solid ${lvl.color}`, 
                                                            borderRadius: '0 6px 6px 0', 
                                                            padding: '6px 8px',
                                                            cursor: 'pointer',
                                                            transition: 'background 0.2s',
                                                            borderTop: '1px solid #e2e8f0',
                                                            borderRight: '1px solid #e2e8f0',
                                                            borderBottom: '1px solid #e2e8f0'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '185px' }}>
                                                                {s.name} ({s.dept})
                                                            </span>
                                                            <span style={{ fontSize: '0.65rem', background: lvl.bg, color: lvl.text, padding: '1px 4px', borderRadius: '4px', fontWeight: 800 }}>
                                                                {lvl.label}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.65rem', color: '#475569', marginTop: '2px' }}>
                                                            <span>🌡️ {s.tempMax?.toFixed(1)}°C</span>
                                                            <span>💧 {s.humMin}%</span>
                                                            <span>💨 {s.windMean}km/h</span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                    )}
                                </div>

                                {/* Section 2 : Postes sous surveillance (1 critère actif) */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #cbd5e1', borderTop: '1px solid #cbd5e1', padding: '6px 0', marginTop: '4px' }}>
                                    <Info size={14} style={{ color: '#059669' }} />
                                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b' }}>Sous surveillance (1 seuil franchi)</span>
                                </div>
                                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', paddingRight: '4px' }}>
                                    {underSurveillance.length === 0 ? (
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', padding: '4px 8px' }}>Aucun poste sous surveillance.</div>
                                    ) : (
                                        underSurveillance
                                            .sort((a, b) => (b.tempMax || 0) - (a.tempMax || 0))
                                            .map(s => {
                                                const lvl = RISK_LEVELS[s.risk.toUpperCase()];
                                                return (
                                                    <div 
                                                        key={s.station_id} 
                                                        onClick={() => {
                                                            setSelectedDept(s.dept);
                                                            setSearchResult({
                                                                city: s.name,
                                                                dept: s.dept,
                                                                station: s,
                                                                distance: 0
                                                            });
                                                        }}
                                                        style={{ 
                                                            background: '#f8fafc', 
                                                            borderLeft: `3px solid ${lvl.color}`, 
                                                            borderRadius: '0 6px 6px 0', 
                                                            padding: '6px 8px',
                                                            cursor: 'pointer',
                                                            transition: 'background 0.2s',
                                                            borderTop: '1px solid #e2e8f0',
                                                            borderRight: '1px solid #e2e8f0',
                                                            borderBottom: '1px solid #e2e8f0'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '185px' }}>
                                                                {s.name} ({s.dept})
                                                            </span>
                                                            <span style={{ fontSize: '0.62rem', color: '#047857', fontWeight: 700 }}>Surveillance</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.65rem', color: '#475569', marginTop: '2px' }}>
                                                            <span style={{ color: s.tempMax >= 25 ? '#d97706' : '#475569' }}>🌡️ {s.tempMax?.toFixed(1)}°C</span>
                                                            <span style={{ color: s.humMin <= 45 ? '#d97706' : '#475569' }}>💧 {s.humMin}%</span>
                                                            <span style={{ color: s.windMean >= 15 ? '#d97706' : '#475569' }}>💨 {s.windMean}km/h</span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Bloc Titre Image (bas gauche) */}
                    <div style={{ position: 'absolute', bottom: '20px', left: '20px', padding: '10px 16px', background: 'rgba(255,255,255,0.95)', borderRadius: '8px', border: '1px solid #000', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 10 }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#000', textTransform: 'uppercase', lineHeight: '1.2' }}>RISQUE FEUX DE FORÊT</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginTop: '2px' }}>
                            {format(new Date(selectedDate), "EEEE d MMMM yyyy", { locale: fr })}
                        </div>
                    </div>

                    {/* Logo (bas droite) */}
                    <div style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', zIndex: 10 }}>
                        <img src="/logo.jpg" alt="Logo" style={{ height: '48px', borderRadius: '6px', border: '1px solid #000', background: 'white' }} />
                        <span style={{ fontSize: '0.7rem', color: '#000', fontWeight: '900', letterSpacing: '0.05em' }}>WWW.METEO-CLIMAT.PRO</span>
                    </div>

                    {loading && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: '#475569' }}>
                            <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: 12, color: '#ef4444' }} />
                            <div style={{ fontWeight: 700 }}>Chargement des données...</div>
                        </div>
                    )}
                    {!loading && geoData && projection && (
                        <svg
                            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                            style={{ width: '100%', height: '100%', maxHeight: 'calc(100vh - 110px)', cursor: 'default', display: 'block' }}
                        >
                            <defs>
                                <filter id="shadow">
                                    <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.25"/>
                                </filter>
                            </defs>

                            {/* Fond Blanc */}
                            <rect width={WIDTH} height={HEIGHT} fill="#ffffff" />

                            {/* Tracés des départements (filtrés par région s'il y a un zoom) */}
                            {geoData.features
                                .filter(feature => {
                                    if (selectedRegionName === "France") return true;
                                    const regionDepts = REGIONS[selectedRegionName] || [];
                                    return regionDepts.includes(feature.properties.code);
                                })
                                .map(feature => {
                                    const code = feature.properties.code;
                                    const deptData = deptRisk[code];
                                    const fillColor = getDeptColor(code);
                                    const isSelected = selectedDept === code;
                                    const isHovered = hoveredDept === code;
                                    const hasRisk = !!deptData;

                                    // En mode 'daily_max', on ne fait clignoter que le Rouge (critical). En direct, on fait clignoter Rouge et Orange (critical/high)
                                    const isCritical = deptData && (
                                        viewMode === 'daily_max' 
                                            ? deptData.risk === 'critical' 
                                            : (deptData.risk === 'critical' || deptData.risk === 'high')
                                    );

                                    return (
                                        <path
                                            key={`dept-${code}`}
                                            d={pathGenerator(feature)}
                                            fill={fillColor}
                                            stroke={isSelected ? '#000000' : isHovered ? '#000000' : '#334155'}
                                            strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 0.8}
                                            style={{
                                                cursor: hasRisk ? 'pointer' : 'default',
                                                transition: 'stroke 0.15s, stroke-width 0.15s',
                                                filter: isSelected ? 'url(#shadow)' : 'none',
                                                animation: isCritical ? 'pulse-dept-critical 2s infinite ease-in-out' : 'none'
                                            }}
                                            onClick={() => {
                                                if (hasRisk) setSelectedDept(selectedDept === code ? null : code);
                                            }}
                                            onMouseEnter={() => setHoveredDept(code)}
                                            onMouseLeave={() => setHoveredDept(null)}
                                        />
                                    );
                                })
                            }

                            {/* Limites régionales noires au-dessus de la France entière */}
                            {selectedRegionName === "France" && regionsGeoData && (
                                <g fill="none" stroke="#000" strokeWidth="1.8" strokeOpacity="0.7" style={{ pointerEvents: 'none' }}>
                                    {regionsGeoData.features.map((f, idx) => (
                                        <path key={`region-border-${idx}`} d={pathGenerator(f)} />
                                    ))}
                                </g>
                            )}

                            {/* Émojis et compteurs de postes par département */}
                            {geoData.features
                                .filter(feature => {
                                    if (selectedRegionName === "France") return true;
                                    const regionDepts = REGIONS[selectedRegionName] || [];
                                    return regionDepts.includes(feature.properties.code);
                                })
                                .map(feature => {
                                    const code = feature.properties.code;
                                    const deptData = deptRisk[code];
                                    if (!deptData || deptData.risk === 'low') return null;

                                    const isSelected = selectedDept === code;
                                    const isHighRisk = deptData.risk === 'high' || deptData.risk === 'critical';
                                    if (!isHighRisk && !isSelected) return null;

                                    const centroid = pathGenerator.centroid(feature);
                                    if (!centroid || isNaN(centroid[0])) return null;
                                    const lvl = RISK_LEVELS[deptData.risk.toUpperCase()];
                                    return (
                                        <g key={`label-dept-${code}`} style={{ pointerEvents: 'none' }}>
                                            <text
                                                x={centroid[0]}
                                                y={centroid[1]}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fontSize={selectedRegionName === "France" ? "14" : "24"}
                                                style={{ userSelect: 'none' }}
                                            >
                                                {lvl.emoji}
                                            </text>
                                            <text
                                                x={centroid[0]}
                                                y={centroid[1] + (selectedRegionName === "France" ? 14 : 20)}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fontSize={selectedRegionName === "France" ? "9" : "15"}
                                                fill="#000000"
                                                fontWeight="800"
                                                style={{ userSelect: 'none', textShadow: '0 0 4px #ffffff, 0 0 4px #ffffff' }}
                                            >
                                                {deptData.stations.length}p
                                            </text>
                                        </g>
                                    );
                                })
                            }

                            {/* Villes principales (si France ou si Région) */}
                            {stationData
                                .filter(s => {
                                    if (!s.lat || !s.lon) return false;

                                    if (selectedRegionName === "France") {
                                        // À l'échelle nationale : on restreint aux 30 villes majeures actives ET on cache les vertes (low)
                                        if (s.risk === 'low') return false;
                                        return MAJOR_STATIONS.includes(s.station_id);
                                    }
                                    
                                    // À l'échelle régionale : on affiche TOUTES les stations complètes de la région (même les vertes/low)
                                    const regionDepts = REGIONS[selectedRegionName] || [];
                                    return regionDepts.includes(s.dept);
                                })
                                .map(s => {
                                    const coords = projection([s.lon, s.lat]);
                                    if (!coords || isNaN(coords[0])) return null;

                                    const lvl = RISK_LEVELS[s.risk.toUpperCase()];
                                    const isCriticalStation = viewMode === 'daily_max' 
                                        ? s.risk === 'critical' 
                                        : (s.risk === 'critical' || s.risk === 'high');
                                    return (
                                        <g key={`city-point-${s.station_id}`} style={{ cursor: 'pointer' }}
                                            onClick={() => {
                                                setSelectedDept(s.dept);
                                                setSearchResult({
                                                    city: s.name,
                                                    dept: s.dept,
                                                    station: s,
                                                    distance: 0
                                                });
                                            }}
                                            onMouseEnter={() => setHoveredStation(s)}
                                            onMouseLeave={() => setHoveredStation(null)}
                                        >
                                            <circle
                                                cx={coords[0]}
                                                cy={coords[1]}
                                                r={selectedRegionName === "France" ? "5.5" : "7.5"}
                                                fill={lvl.color}
                                                stroke="#000000"
                                                strokeWidth={selectedRegionName === "France" ? "1.5" : "2"}
                                                style={{
                                                    animation: isCriticalStation ? 'pulse-station-critical 1.5s infinite ease-in-out' : 'none',
                                                    transformOrigin: `${coords[0]}px ${coords[1]}px`
                                                }}
                                            />
                                        </g>
                                    );
                                })
                            }

                            {/* Tooltip départements (France uniquement) */}
                            {selectedRegionName === "France" && hoveredDept && deptRisk[hoveredDept] && (() => {
                                const feat = geoData.features.find(f => f.properties.code === hoveredDept);
                                if (!feat) return null;
                                const c = pathGenerator.centroid(feat);
                                if (!c || isNaN(c[0])) return null;
                                const d = deptRisk[hoveredDept];
                                const lvl = RISK_LEVELS[d.risk.toUpperCase()];
                                const worst = d.stations[0];
                                return (
                                    <g style={{ pointerEvents: 'none' }}>
                                        <rect x={Math.min(c[0]-80, WIDTH-180)} y={Math.max(c[1]-80, 5)} width={170} height={70} rx={8} fill="#1e293b" stroke={lvl.color} strokeWidth={1.5} />
                                        <text x={Math.min(c[0]-80,WIDTH-180)+10} y={Math.max(c[1]-80,5)+20} fontSize="11" fill="#e2e8f0" fontWeight="700">{lvl.emoji} Dépt. {hoveredDept} — {lvl.label}</text>
                                        <text x={Math.min(c[0]-80,WIDTH-180)+10} y={Math.max(c[1]-80,5)+36} fontSize="9" fill="#94a3b8">{d.stations.length} poste(s) concerné(s)</text>
                                        {worst && <text x={Math.min(c[0]-80,WIDTH-180)+10} y={Math.max(c[1]-80,5)+52} fontSize="9" fill="#94a3b8">Ex: {worst.name}</text>}
                                        {worst && <text x={Math.min(c[0]-80,WIDTH-180)+10} y={Math.max(c[1]-80,5)+64} fontSize="9" fill="#64748b">T:{worst.tempMax?.toFixed(0)}°C HR:{worst.humMin}% V:{worst.windMean}km/h</text>}
                                    </g>
                                );
                            })()}

                            {/* Tooltip station survolée */}
                            {hoveredStation && (() => {
                                const coords = projection([hoveredStation.lon, hoveredStation.lat]);
                                if (!coords || isNaN(coords[0])) return null;
                                const lvl = RISK_LEVELS[hoveredStation.risk.toUpperCase()];
                                // On décale le tooltip pour qu'il s'affiche au-dessus du point
                                const tx = Math.min(coords[0] - 80, WIDTH - 180);
                                const ty = Math.max(coords[1] - 80, 5);
                                return (
                                    <g style={{ pointerEvents: 'none' }} filter="url(#shadow)">
                                        <rect x={tx} y={ty} width={165} height={66} rx={8} fill="#1e293b" stroke={lvl.color} strokeWidth={1.5} />
                                        <text x={tx + 10} y={ty + 18} fontSize="10.5" fill="#fff" fontWeight="700">{lvl.emoji} {hoveredStation.name}</text>
                                        <text x={tx + 10} y={ty + 34} fontSize="9.5" fill={lvl.color} fontWeight="600">Risque {lvl.label}</text>
                                        <text x={tx + 10} y={ty + 48} fontSize="9" fill="#94a3b8">T:{hoveredStation.tempMax?.toFixed(1)}°C  HR:{hoveredStation.humMin}%</text>
                                        {hoveredStation.windMean > 0 && <text x={tx + 10} y={ty + 58} fontSize="9" fill="#64748b">Vent moy. : {hoveredStation.windMean} km/h</text>}
                                    </g>
                                );
                            })()}
                        </svg>
                    )}

                    {error && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#450a0a', border: '1px solid #ef4444', borderRadius: 10, padding: 20, textAlign: 'center' }}>
                            <AlertTriangle size={32} style={{ color: '#ef4444', marginBottom: 8 }} />
                            <div>{error}</div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes pulse-dept-critical {
                    0% { fill-opacity: 1; }
                    50% { fill-opacity: 0.65; }
                    100% { fill-opacity: 1; }
                }
                @keyframes pulse-station-critical {
                    0% { r: 7.5px; opacity: 1; }
                    50% { r: 10.5px; opacity: 0.7; }
                    100% { r: 7.5px; opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default FireRiskMap;
