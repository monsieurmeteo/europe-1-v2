import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import { geoConicConformal, geoPath } from "d3-geo";
import { supabase } from "../../services/api";
import { Download, RefreshCw, AlertCircle, Droplets, Calendar, ChevronLeft, ChevronRight, ChevronDown, Info } from "lucide-react";
import html2canvas from "html2canvas";
import { format, isValid, subDays, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import stationNamesData from "../../data/stationNames.json";
import stationsMetadata from "../../data/stationsMetadata.json";
import stationsListData from "../../data/stations_list.json";
import { Delaunay } from "d3-delaunay";
import { REGIONS } from "../../data/departments";

// Échelle de couleurs pour l'humidité relative (0-100%)
const HUMIDITY_SCALE = [
    { min: 0, max: 10, color: '#8B4513', label: '< 10%' },
    { min: 10, max: 20, color: '#CD853F', label: '10 - 20%' },
    { min: 20, max: 30, color: '#DEB887', label: '20 - 30%' },
    { min: 30, max: 40, color: '#F5DEB3', label: '30 - 40%' },
    { min: 40, max: 50, color: '#FFFACD', label: '40 - 50%' },
    { min: 50, max: 60, color: '#E0F7FA', label: '50 - 60%' },
    { min: 60, max: 70, color: '#B3E5FC', label: '60 - 70%' },
    { min: 70, max: 80, color: '#81D4FA', label: '70 - 80%' },
    { min: 80, max: 90, color: '#4FC3F7', label: '80 - 90%' },
    { min: 90, max: 95, color: '#0288D1', label: '90 - 95%' },
    { min: 95, max: Infinity, color: '#01579B', label: '> 95%' },
];

const getHumidityColor = (value, scale = HUMIDITY_SCALE) => {
    if (value === null || value === undefined || isNaN(value)) return '#f0f0f0';
    if (value < 0) return '#f0f0f0';
    if (value >= 100) return '#01579B';
    const range = scale.find(r => value >= r.min && value < r.max);
    return range ? range.color : scale[scale.length - 1].color;
};

const HumidityMap = () => {
    const navigate = useNavigate();
    // Persistance localStorage — l'état est restauré à chaque navigation
    const [selectedDate, setSelectedDate] = useState(() => localStorage.getItem('humidityDate') || new Date().toISOString().split('T')[0]);
    const [geoData, setGeoData] = useState(null);
    const [regionsGeoData, setRegionsGeoData] = useState(null);
    const [deptData, setDeptData] = useState({});
    const [stations, setStations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRealTime, setIsRealTime] = useState(true);
    const [humidityMode, setHumidityMode] = useState(() => localStorage.getItem('humidityMode') || "live"); // "live" ou "day"
    const [mapTitle, setMapTitle] = useState("Humidité relative");
    const [showLabels, setShowLabels] = useState(() => localStorage.getItem('humidityShowLabels') !== 'false');
    const [showRegions, setShowRegions] = useState(true);
    const [isSmooth, setIsSmooth] = useState(true);
    const [selectedRegionName, setSelectedRegionName] = useState("France");
    const [hoveredStation, setHoveredStation] = useState(null);
    const [lastDataTimestamp, setLastDataTimestamp] = useState(null);
    const [dayStatMode, setDayStatMode] = useState(() => localStorage.getItem('humidityDayStatMode') || "avg"); // "avg", "min", "max"
    const mapContainerRef = useRef(null);

    // Sauvegarder l'état dans localStorage à chaque changement
    useEffect(() => { localStorage.setItem('humidityDate', selectedDate); }, [selectedDate]);
    useEffect(() => { localStorage.setItem('humidityMode', humidityMode); }, [humidityMode]);
    useEffect(() => { localStorage.setItem('humidityDayStatMode', dayStatMode); }, [dayStatMode]);
    useEffect(() => { localStorage.setItem('humidityShowLabels', showLabels); }, [showLabels]);

    const WIDTH = 1000;
    const HEIGHT = 900;

    const stationsLookup = useMemo(() => {
        const map = {};
        if (stationsListData && stationsListData.features) {
            stationsListData.features.forEach(f => {
                const sid = f.properties.num;
                map[sid] = {
                    lat: f.geometry.coordinates[1],
                    lon: f.geometry.coordinates[0],
                    name: f.properties.nom
                };
            });
        }
        return map;
    }, []);

    useEffect(() => {
        fetch("/data/departements-version-simplifiee.geojson")
            .then(res => res.json())
            .then(data => setGeoData(data))
            .catch(err => console.error("Erreur GeoJSON Dépt:", err));

        fetch("/data/regions-version-simplifiee.geojson")
            .then(res => res.json())
            .then(data => setRegionsGeoData(data))
            .catch(err => console.error("Erreur GeoJSON Régions:", err));
    }, []);

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        const realTime = selectedDate === today;
        setIsRealTime(realTime);
        if (!realTime && humidityMode === "live") {
            setHumidityMode("day");
        }
    }, [selectedDate, humidityMode]);

    // Auto-update title when mode changes
    useEffect(() => {
        if (humidityMode === "live") {
            setMapTitle("Humidité relative – Temps Réel");
        } else {
            const labels = { avg: "Moy.", min: "Min.", max: "Max." };
            setMapTitle(`Humidité relative – ${labels[dayStatMode] || 'Moy.'} Journée`);
        }
    }, [humidityMode, dayStatMode]);

    const loadData = async () => {
        setLoading(true);
        setError(null);

        try {
            let humidityMap = {};
            let stationList = [];

            try {
                if (humidityMode === "live") {
                    console.log("[HumidityMap] Chargement de l'humidité en temps réel via get_france_live...");
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

                    if (liveData && liveData.length > 0) {
                        let maxTimestamp = null;
                        liveData.forEach(item => {
                            if (item.obs_time) {
                                const d = new Date(item.obs_time);
                                if (!maxTimestamp || d > maxTimestamp) {
                                    maxTimestamp = d;
                                }
                            }
                        });
                        setLastDataTimestamp(maxTimestamp);

                        const uniqueStations = new Map();
                        liveData.forEach(s => {
                            // Le champ humidité dans get_france_live est 'u' ou 'humidity'
                            const humVal = s.u !== null && s.u !== undefined ? s.u : s.humidity;
                            if (humVal !== null && humVal !== undefined && !isNaN(humVal) && humVal >= 0 && humVal <= 100) {
                                let sid = String(s.station_id);
                                if (sid.length === 7) sid = "0" + sid;

                                const meta = stationsLookup[sid];
                                const lat = meta?.lat;
                                const lon = meta?.lon;

                                if (lat && lon) {
                                    const geoKey = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;
                                    const existing = uniqueStations.get(geoKey);
                                    if (!existing) {
                                        uniqueStations.set(geoKey, {
                                            id: sid,
                                            lat,
                                            lon,
                                            value: humVal,
                                            name: stationNamesData[sid] || meta?.name || sid
                                        });
                                    }
                                }
                            }
                        });

                        stationList = Array.from(uniqueStations.values());
                        console.log(`[HumidityMap] ${stationList.length} stations temps réel uniques.`);

                        // Si get_france_live ne retourne pas u/humidity, fallback sur observations_6mn
                        if (stationList.length === 0) {
                            console.log("[HumidityMap] Aucune humidité dans get_france_live, fallback sur observations_6mn...");
                            stationList = await loadLiveFromObservations();
                        }
                    }
                } else {
                    // Mode journée : requête sur observations_6mn pour la date sélectionnée
                    console.log(`[HumidityMap] Chargement humidité journée ${selectedDate} depuis observations_6mn...`);
                    stationList = await loadDayFromObservations(selectedDate, dayStatMode);
                }
            } catch (err) {
                console.error("[HumidityMap] Erreur critique de chargement:", err);
                // Essayer le fallback
                try {
                    if (humidityMode === "live") {
                        stationList = await loadLiveFromObservations();
                    }
                } catch (err2) {
                    console.error("[HumidityMap] Erreur fallback:", err2);
                }
            }

            setDeptData(humidityMap);
            setStations(stationList.sort((a, b) => b.value - a.value));

            // Capturer le timestamp max pour afficher l'heure de mise à jour
            let maxTimestamp = null;
            if (isRealTime) {
                try {
                    const { data: latestObs } = await supabase
                        .from('observations_6mn')
                        .select('timestamp')
                        .order('timestamp', { ascending: false })
                        .limit(1);
                    if (latestObs && latestObs[0]) {
                        maxTimestamp = new Date(latestObs[0].timestamp);
                    }
                } catch (err) {
                    console.warn("Erreur fetch latest obs timestamp:", err);
                }
            }
            if (humidityMode === "live" && !maxTimestamp && stationList.length > 0) {
                // Timestamp déjà extrait ci-dessus depuis obs_time
            } else {
                setLastDataTimestamp(maxTimestamp);
            }

            if (stationList.length === 0) {
                setError(humidityMode === "live"
                    ? "Aucune donnée d'humidité en temps réel disponible."
                    : "Aucune donnée d'humidité archivée pour cette date.");
            }
        } catch (err) {
            console.error("Erreur chargement données humidité:", err);
            setError("Impossible de charger les données météo.");
        } finally {
            setLoading(false);
        }
    };

    // Chargement de l'humidité temps réel depuis observations_6mn (dernière observation par station)
    const loadLiveFromObservations = async () => {
        console.log("[HumidityMap] Chargement humidité live depuis observations_6mn...");
        const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        // Requêtes parallèles pour récupérer les observations des 30 dernières minutes en ~300ms
        const batchSize = 1000;
        const parallelCount = 6; // Jusqu'à 6000 observations récentes
        const promises = Array.from({ length: parallelCount }, (_, i) =>
            supabase
                .from('observations_6mn')
                .select('station_id, u, timestamp')
                .gte('timestamp', since)
                .not('u', 'is', null)
                .range(i * batchSize, (i + 1) * batchSize - 1)
        );

        const results = await Promise.all(promises);
        const allObs = [];
        results.forEach(res => {
            if (res.data) allObs.push(...res.data);
        });

        if (allObs.length > 0) {
            // Grouper par station, prendre la dernière observation
            const stationMap = new Map();
            allObs.forEach(obs => {
                let sid = String(obs.station_id);
                if (sid.length === 7) sid = "0" + sid;
                const existing = stationMap.get(sid);
                if (!existing || new Date(obs.timestamp) > new Date(existing.timestamp)) {
                    stationMap.set(sid, { ...obs, station_id: sid });
                }
            });

            const uniqueStations = new Map();
            stationMap.forEach((obs, sid) => {
                const humVal = obs.u;
                if (humVal !== null && humVal !== undefined && !isNaN(humVal) && humVal >= 0 && humVal <= 100) {
                    const meta = stationsLookup[sid];
                    const lat = meta?.lat;
                    const lon = meta?.lon;
                    if (lat && lon) {
                        const geoKey = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;
                        if (!uniqueStations.has(geoKey)) {
                            uniqueStations.set(geoKey, {
                                id: sid,
                                lat,
                                lon,
                                value: humVal,
                                name: stationNamesData[sid] || meta?.name || sid
                            });
                        }
                    }
                }
            });

            return Array.from(uniqueStations.values());
        }
        return [];
    };

    // Chargement de l'humidité journée depuis observations_6mn avec calcul JS côté client ultra-rapide en parallèle
    const loadDayFromObservations = async (date, statMode) => {
        console.log(`[HumidityMap] Chargement humidité journée ${date} (${statMode})...`);
        const dateStart = `${date}T00:00:00`;
        const dateEnd = `${date}T23:59:59`;

        // 10 requêtes parallèles (couvre jusqu'à 20 000 observations brutes en <1s)
        const batchSize = 2000;
        const numBatches = 10;
        const promises = Array.from({ length: numBatches }, (_, i) =>
            supabase
                .from('observations_6mn')
                .select('station_id, u, timestamp')
                .gte('timestamp', dateStart)
                .lte('timestamp', dateEnd)
                .not('u', 'is', null)
                .range(i * batchSize, (i + 1) * batchSize - 1)
        );

        const results = await Promise.all(promises);
        const allObs = [];
        results.forEach(res => {
            if (res.data) allObs.push(...res.data);
        });

        console.log(`[HumidityMap] ${allObs.length} observations brutes récupérées en parallèle pour le ${date}`);

        if (allObs.length === 0) return [];

        // Grouper par station et calculer min/max/avg
        const stationGroups = new Map();
        allObs.forEach(obs => {
            let sid = String(obs.station_id);
            if (sid.length === 7) sid = "0" + sid;
            const u = parseFloat(obs.u);
            if (isNaN(u) || u < 0 || u > 100) return;

            if (!stationGroups.has(sid)) {
                stationGroups.set(sid, { values: [] });
            }
            stationGroups.get(sid).values.push(u);
        });

        const uniqueStations = new Map();
        stationGroups.forEach((group, sid) => {
            if (group.values.length === 0) return;
            const vals = group.values;
            let statVal;
            if (statMode === "min") {
                statVal = Math.min(...vals);
            } else if (statMode === "max") {
                statVal = Math.max(...vals);
            } else {
                // avg
                statVal = vals.reduce((a, b) => a + b, 0) / vals.length;
            }

            const meta = stationsLookup[sid];
            const lat = meta?.lat;
            const lon = meta?.lon;
            if (lat && lon) {
                const geoKey = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;
                if (!uniqueStations.has(geoKey)) {
                    uniqueStations.set(geoKey, {
                        id: sid,
                        lat,
                        lon,
                        value: Math.round(statVal * 10) / 10,
                        name: stationNamesData[sid] || meta?.name || sid
                    });
                }
            }
        });

        console.log(`[HumidityMap] ${uniqueStations.size} stations uniques pour le ${date}`);
        return Array.from(uniqueStations.values());
    };

    useEffect(() => {
        loadData();
    }, [selectedDate, isRealTime, humidityMode, dayStatMode]);

    // Auto-refresh en mode temps réel toutes les 5 minutes
    useEffect(() => {
        if (humidityMode !== "live" || !isRealTime) return;
        const interval = setInterval(() => {
            console.log("[HumidityMap] Auto-refreshing real-time humidity observations...");
            loadData();
        }, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [humidityMode, isRealTime, selectedDate]);

    const projection = useMemo(() => {
        if (!geoData) return null;
        let proj;
        if (selectedRegionName !== "France" && regionsGeoData) {
            const regionFeature = regionsGeoData.features.find(f => f.properties.nom === selectedRegionName);
            if (regionFeature) proj = geoConicConformal().fitExtent([[20, 20], [WIDTH - 20, HEIGHT - 180]], regionFeature);
        }
        if (!proj) {
            proj = geoConicConformal().fitExtent([[20, 20], [WIDTH - 20, HEIGHT - 180]], geoData);
        }
        const t = proj.translate();
        return proj.translate([t[0] - 70, t[1]]);
    }, [geoData, regionsGeoData, selectedRegionName]);

    const pathGenerator = useMemo(() => projection ? geoPath().projection(projection) : null, [projection]);

    const combinedPath = useMemo(() => {
        if (!geoData || !pathGenerator) return "";
        if (selectedRegionName !== "France" && regionsGeoData) {
            const regionFeature = regionsGeoData.features.find(f => f.properties.nom === selectedRegionName);
            if (regionFeature) return pathGenerator(regionFeature);
        }
        return geoData.features.map(f => pathGenerator(f)).join(" ");
    }, [geoData, regionsGeoData, selectedRegionName, pathGenerator]);

    // Filtrage synchrone des stations par région
    const visibleStations = useMemo(() => {
        if (selectedRegionName === "France" || !REGIONS[selectedRegionName]) return stations;
        const regionDepts = REGIONS[selectedRegionName];
        return stations.filter(s => regionDepts.includes(s.id.startsWith("20") ? "2A" : s.id.substring(0, 2)));
    }, [stations, selectedRegionName]);

    const voronoiCells = useMemo(() => {
        if (!projection || !visibleStations.length) return [];
        const points = visibleStations.map(s => projection([s.lon, s.lat]));
        const delaunay = Delaunay.from(points);
        const voronoi = delaunay.voronoi([0, 0, WIDTH, HEIGHT]);
        return visibleStations.map((s, i) => ({
            station: s,
            path: voronoi.renderCell(i)
        }));
    }, [projection, visibleStations]);

    const interpolatedGrid = useMemo(() => {
        if (!isSmooth || visibleStations.length < 5 || !projection) return null;

        const gridResX = 60;
        const gridResY = 55;
        const grid = [];

        for (let y = 0; y < gridResY; y++) {
            for (let x = 0; x < gridResX; x++) {
                const posX = (x / gridResX) * WIDTH;
                const posY = (y / gridResY) * HEIGHT;

                const geoCoords = projection.invert([posX, posY]);
                if (!geoCoords) continue;

                let weightSum = 0;
                let valueSum = 0;

                visibleStations.forEach(s => {
                    const dx = s.lon - geoCoords[0];
                    const dy = s.lat - geoCoords[1];
                    const d2 = dx * dx + dy * dy;

                    if (d2 < 6) {
                        const w = 1 / (Math.pow(d2, 1.5) + 0.001);
                        weightSum += w;
                        valueSum += s.value * w;
                    }
                });

                if (weightSum > 0) {
                    const finalVal = valueSum / weightSum;
                    // Afficher toutes les valeurs d'humidité (même les basses)
                    grid.push({
                        x: posX,
                        y: posY,
                        val: finalVal,
                        opacity: finalVal < 30 ? 0.4 : finalVal < 60 ? 0.65 : 0.85,
                        w: WIDTH / gridResX,
                        h: HEIGHT / gridResY
                    });
                }
            }
        }
        return grid;
    }, [isSmooth, visibleStations, projection]);

    const handleExport = () => {
        const el = document.getElementById("humidity-map-container");
        if (!el) return;
        html2canvas(el, { scale: 2, useCORS: true }).then(canvas => {
            const link = document.createElement("a");
            link.download = `carte-humidite-${selectedDate}.png`;
            link.href = canvas.toDataURL();
            link.click();
        });
    };

    const changeDate = (days) => {
        const d = new Date(selectedDate);
        const newDate = days > 0 ? addDays(d, days) : subDays(d, Math.abs(days));
        const today = new Date();
        if (newDate <= today) {
            setSelectedDate(newDate.toISOString().split('T')[0]);
        }
    };

    return (
        <div className="wind-map-page" style={{ padding: '20px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Outfit, sans-serif' }}>
            <header style={{
                maxWidth: '1300px',
                margin: '0 auto 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '15px',
                background: 'white',
                padding: '24px',
                borderRadius: '20px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Droplets style={{ color: '#0288D1' }} size={28} /> Humidité relative : {selectedRegionName}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isRealTime ? '#10b981' : '#f59e0b' }}></div>
                            <span style={{ color: '#64748b', fontSize: '0.95rem', fontWeight: '500' }}>
                                {isRealTime ? "Météo-France (Temps Réel)" : `Archives du ${format(new Date(selectedDate), "EEEE d MMMM yyyy", { locale: fr })}`}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '10px' }}>
                        {/* Sélecteur Temps Réel / Journée */}
                        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '12px', padding: '3px' }}>
                            {isRealTime && (
                                <button
                                    onClick={() => setHumidityMode('live')}
                                    style={{
                                        padding: '6px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                        fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s',
                                        background: humidityMode === 'live' ? '#0288D1' : 'transparent',
                                        color: humidityMode === 'live' ? 'white' : '#64748b'
                                    }}
                                >
                                    Temps Réel
                                </button>
                            )}
                            <button
                                onClick={() => setHumidityMode('day')}
                                style={{
                                    padding: '6px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                    fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s',
                                    background: humidityMode === 'day' ? '#0288D1' : 'transparent',
                                    color: humidityMode === 'day' ? 'white' : '#64748b'
                                }}
                            >
                                Journée
                            </button>
                        </div>

                        {/* Sélecteur de statistique journalière */}
                        {humidityMode === 'day' && (
                            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '12px', padding: '3px' }}>
                                {['avg', 'min', 'max'].map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setDayStatMode(mode)}
                                        style={{
                                            padding: '6px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                            fontWeight: '800', fontSize: '0.8rem', transition: 'all 0.2s',
                                            background: dayStatMode === mode ? '#0288D1' : 'transparent',
                                            color: dayStatMode === mode ? 'white' : '#64748b'
                                        }}
                                    >
                                        {mode === 'avg' ? 'Moy.' : mode === 'min' ? 'Min.' : 'Max.'}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div style={{ position: 'relative' }}>
                            <select
                                value={selectedRegionName}
                                onChange={(e) => setSelectedRegionName(e.target.value)}
                                style={{
                                    padding: '8px 12px', borderRadius: '12px', border: '1px solid #e2e8f0',
                                    background: '#f8fafc', fontSize: '0.85rem', fontWeight: '700', color: '#1e293b',
                                    outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '30px'
                                }}
                            >
                                <option value="France">Toute la France</option>
                                {regionsGeoData?.features.map(f => (
                                    <option key={f.properties.nom} value={f.properties.nom}>{f.properties.nom}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button onClick={() => setShowLabels(!showLabels)} style={{ ...navBtnStyle, background: showLabels ? '#e0f2fe' : 'transparent', color: showLabels ? '#0284c7' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                VALEURS
                            </button>
                            <button onClick={() => setShowRegions(!showRegions)} style={{ ...navBtnStyle, background: showRegions ? '#e0f2fe' : 'transparent', color: showRegions ? '#0284c7' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                RÉGIONS
                            </button>
                            <button onClick={() => setIsSmooth(!isSmooth)} style={{ ...navBtnStyle, background: isSmooth ? '#e0f2fe' : 'transparent', color: isSmooth ? '#0284c7' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                LISSAGE
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '6px', borderRadius: '14px' }}>
                            <button onClick={() => changeDate(-1)} style={navBtnStyle}><ChevronLeft size={20} /></button>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                <Calendar size={18} style={{ marginRight: '10px', color: '#0288D1' }} />
                                <span style={{ fontWeight: '700', fontSize: '1rem', color: '#1e293b' }}>{format(new Date(selectedDate), "dd MMM yyyy", { locale: fr })}</span>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    max={new Date().toISOString().split('T')[0]}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                                />
                            </div>
                            <button
                                onClick={() => changeDate(1)}
                                style={navBtnStyle}
                                disabled={selectedDate === new Date().toISOString().split('T')[0]}
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <button onClick={loadData} disabled={loading} style={iconBtnStyle} title="Actualiser">
                            <RefreshCw size={22} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button onClick={handleExport} style={{ ...iconBtnStyle, background: '#1e293b', color: 'white' }} title="Exporter l'image">
                            <Download size={22} />
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '12px 18px', background: '#f8fafc', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#475569', minWidth: 'fit-content' }}>Titre personnalisé :</span>
                    <input
                        type="text"
                        value={mapTitle}
                        onChange={(e) => setMapTitle(e.target.value)}
                        placeholder="Ex: Humidité relative France..."
                        style={{
                            flex: 1, padding: '10px 15px', borderRadius: '10px',
                            border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                        }}
                    />
                </div>
            </header>

            <main style={{ maxWidth: '1300px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 340px', gap: '25px', paddingBottom: '30px' }}>
                <div ref={mapContainerRef} id="humidity-map-container" style={{
                    background: 'white', borderRadius: '4px', padding: '0',
                    boxShadow: 'none', position: 'relative',
                    aspectRatio: '1000 / 920', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', border: '1px solid #000'
                }}>
                    {loading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                            <div className="loader" style={{ width: '48px', height: '48px', border: '5px solid #e2e8f0', borderTopColor: '#0288D1', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                            <p style={{ marginTop: '20px', fontWeight: '700', color: '#01579B', fontSize: '1.1rem' }}>Saisie des mesures météo...</p>
                        </div>
                    )}

                    {/* Légende flottante intégrée au téléchargement (haut-droite) */}
                    <div style={{
                        position: 'absolute', top: '15px', right: '15px',
                        background: 'rgba(255, 255, 255, 0.92)', border: '1px solid #000',
                        borderRadius: '8px', padding: '10px 14px', zIndex: 5,
                        boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                        display: 'flex', flexDirection: 'column', gap: '4px'
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>
                            HUMIDITÉ RELATIVE (%)
                        </div>
                        {HUMIDITY_SCALE.map(range => (
                            <div key={range.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: range.color, border: '0.5px solid rgba(0,0,0,0.2)', flexShrink: 0 }} />
                                <span style={{ fontSize: '10px', fontWeight: '700', color: '#1e293b' }}>{range.label}</span>
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 5, padding: '20px', textAlign: 'center' }}>
                            <Info size={40} style={{ color: '#ef4444', marginBottom: '12px' }} />
                            <p style={{ fontWeight: '700', color: '#64748b', fontSize: '1.1rem', margin: 0 }}>{error}</p>
                        </div>
                    )}

                    {geoData && !error && (
                        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', height: '100%' }}>
                            <defs>
                                <clipPath id="france-clip-humidity">
                                    <path d={combinedPath} />
                                </clipPath>
                                <filter id="grid-blur-humidity">
                                    <feGaussianBlur stdDeviation="12" />
                                </filter>
                            </defs>

                            <g clipPath="url(#france-clip-humidity)">
                                {isSmooth && interpolatedGrid ? (
                                    <g filter="url(#grid-blur-humidity)">
                                        {interpolatedGrid.map((p, i) => (
                                            <rect
                                                key={`grid-${i}`}
                                                x={p.x - 1} y={p.y - 1}
                                                width={p.w + 2} height={p.h + 2}
                                                fill={getHumidityColor(p.val)}
                                                fillOpacity={p.opacity}
                                            />
                                        ))}
                                    </g>
                                ) : (
                                    <g>
                                        {voronoiCells?.map((cell, idx) => (
                                            <path
                                                key={`cell-${cell.station.id}-${idx}`}
                                                d={cell.path}
                                                fill={getHumidityColor(cell.station.value)}
                                                style={{ transition: 'fill 0.4s ease' }}
                                            />
                                        ))}
                                    </g>
                                )}
                            </g>

                            <g fill="none" stroke="black" strokeWidth="0.2" strokeOpacity="0.4">
                                {geoData.features.map((f, idx) => (
                                    <path key={`dept-${f.properties.code || idx}`} d={pathGenerator(f)} />
                                ))}
                            </g>

                            {showRegions && regionsGeoData && (
                                <g fill="none" stroke="black" strokeWidth="1.2" strokeOpacity="1">
                                    {regionsGeoData.features.map((f, idx) => (
                                        <path key={`region-${f.properties.code || f.properties.nom || idx}`} d={pathGenerator(f)} />
                                    ))}
                                </g>
                            )}

                            <path d={combinedPath} fill="none" stroke="black" strokeWidth="1.5" />

                            <g>
                                {visibleStations.map(s => {
                                    const coords = projection([s.lon, s.lat]);
                                    if (!coords) return null;
                                    return (
                                        <g key={`marker-${s.id}`} transform={`translate(${coords[0]}, ${coords[1]})`}
                                            style={{ cursor: 'pointer' }}
                                            onMouseEnter={(e) => {
                                                const rect = mapContainerRef.current?.getBoundingClientRect();
                                                if (rect) setHoveredStation({ ...s, x: e.clientX - rect.left, y: e.clientY - rect.top });
                                            }}
                                            onMouseLeave={() => setHoveredStation(null)}
                                            onClick={() => navigate(`/observations/station/${s.id}`)}
                                        >
                                            <circle r={3} fill="transparent" />
                                            <circle r={0.6} fill="black" fillOpacity="0.2" />
                                            {showLabels && s.value !== null && s.value !== undefined && (
                                                <text
                                                    y={selectedRegionName === "France" ? -6 : 0}
                                                    dy={selectedRegionName === "France" ? 0 : "0.35em"}
                                                    textAnchor="middle"
                                                    style={{
                                                        fontSize: selectedRegionName === "France" ? '14px' : '28px',
                                                        fontWeight: 'bold',
                                                        fill: s.value > 70 ? '#fff' : '#000',
                                                        stroke: s.value > 70 ? '#000' : '#fff',
                                                        strokeWidth: selectedRegionName === "France" ? '2px' : '4px',
                                                        paintOrder: 'stroke',
                                                        pointerEvents: 'none', fontFamily: 'sans-serif'
                                                    }}
                                                >
                                                    {Math.round(s.value)}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        </svg>
                    )}

                    {/* Tooltip au survol */}
                    {hoveredStation && (
                        <div style={{
                            position: 'absolute',
                            left: hoveredStation.x + 15, top: hoveredStation.y - 10,
                            background: 'rgba(15,23,42,0.95)', color: 'white',
                            padding: '8px 12px', borderRadius: '8px',
                            fontSize: '0.8rem', fontWeight: '700',
                            pointerEvents: 'none', zIndex: 20,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            whiteSpace: 'nowrap', maxWidth: '250px'
                        }}>
                            <div style={{ fontWeight: '800', marginBottom: '2px' }}>{hoveredStation.name}</div>
                            <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Station {hoveredStation.id} — Dpt {hoveredStation.id.substring(0, 2)}</div>
                            <div style={{ marginTop: '4px', fontSize: '1rem', fontWeight: '900', color: '#81D4FA' }}>{Math.round(hoveredStation.value)} %</div>
                        </div>
                    )}

                    {/* Bloc Titre Image */}
                    <div style={{ position: 'absolute', bottom: '55px', left: '30px', padding: '12px 20px', background: 'rgba(255,255,255,0.85)', borderRadius: '8px', border: '1px solid #000' }}>
                        <div style={{ fontSize: '1.6rem', fontWeight: '1000', color: '#000', textTransform: 'uppercase', lineHeight: '1.2' }}>{mapTitle}</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#000', marginTop: '4px' }}>
                            {format(new Date(selectedDate), "EEEE d MMMM yyyy", { locale: fr })}
                        </div>
                        {lastDataTimestamp && (
                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#555', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: isRealTime ? '#10b981' : '#f59e0b', flexShrink: 0 }} />
                                Dernière obs. à {lastDataTimestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        )}
                    </div>

                    {/* Logo */}
                    <div style={{ position: 'absolute', bottom: '55px', right: '30px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <img src="/logo.jpg" alt="Logo" style={{ height: '60px', borderRadius: '8px', border: '1px solid #000', background: 'white' }} />
                        <span style={{ fontSize: '0.75rem', color: '#000', fontWeight: '900', letterSpacing: '0.05em' }}>WWW.METEO-CLIMAT.PRO</span>
                    </div>

                    {/* Légende Horizontale */}
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'rgba(255,255,255,0.95)',
                        padding: '6px 12px',
                        borderTop: '1px solid #000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '2px', flexWrap: 'wrap'
                    }}>
                        <span style={{ fontSize: '10px', fontWeight: '1000', color: '#000', marginRight: '6px' }}>%</span>
                        {HUMIDITY_SCALE.filter(r => r.max !== Infinity).map(range => (
                            <div key={range.min} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ width: '28px', height: '14px', background: range.color, border: '0.5px solid rgba(0,0,0,0.3)' }} />
                                <span style={{ fontSize: '7px', fontWeight: '800', color: '#000', marginTop: '1px' }}>{range.min}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Légende */}
                    <div style={{ background: 'white', borderRadius: '20px', padding: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
                            Humidité Relative (%)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                            {HUMIDITY_SCALE.map(range => (
                                <div key={range.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: range.color, border: '1px solid rgba(0,0,0,0.1)' }}></div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>{range.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Humidité */}
                    <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 15px', fontSize: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Droplets size={18} style={{ color: '#0288D1' }} /> {humidityMode === 'live' ? 'Humidité Temps Réel' : `Humidité ${dayStatMode === 'avg' ? 'Moyenne' : dayStatMode === 'min' ? 'Minimum' : 'Maximum'}`}
                        </h3>
                        <div style={{ overflowY: 'auto', flex: 1 }} className="custom-scrollbar">
                            {visibleStations.length > 0 ? (
                                [...visibleStations].sort((a, b) => b.value - a.value).slice(0, 15).map((s, i) => (
                                    <div key={s.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 0', borderBottom: i === 14 ? 'none' : '1px solid #f1f5f9'
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '180px' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Dpt {s.id.substring(0, 2)}</span>
                                        </div>
                                        <div style={{
                                            background: getHumidityColor(s.value),
                                            color: s.value > 70 ? 'white' : '#1e293b',
                                            padding: '4px 8px', borderRadius: '6px',
                                            fontSize: '0.85rem', fontWeight: '800'
                                        }}>
                                            {Math.round(s.value)} <small>%</small>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>Aucune donnée</p>
                            )}
                        </div>
                    </div>

                    {/* Infos API */}
                    <div style={{ background: '#e0f2fe', borderRadius: '20px', padding: '15px', display: 'flex', gap: '12px' }}>
                        <Info style={{ color: '#0369a1' }} size={20} />
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#0369a1', lineHeight: '1.4' }}>
                            Données issues des stations automatiques du réseau Météo-France.
                            {humidityMode === 'live'
                                ? " La valeur affichée est la dernière humidité relative (U) observée en temps réel."
                                : ` La valeur affichée est l'humidité relative ${dayStatMode === 'avg' ? 'moyenne' : dayStatMode === 'min' ? 'minimale' : 'maximale'} de la journée, calculée à partir des observations toutes les 6 minutes.`}
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

const navBtnStyle = {
    padding: '6px', borderRadius: '8px', border: 'none',
    background: 'transparent', cursor: 'pointer', color: '#64748b',
    display: 'flex', alignItems: 'center', transition: 'all 0.2s'
};

const iconBtnStyle = {
    width: '40px', height: '40px', borderRadius: '12px',
    border: '1px solid #e2e8f0', background: 'white',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: '#64748b', transition: 'all 0.2s'
};

export default HumidityMap;
