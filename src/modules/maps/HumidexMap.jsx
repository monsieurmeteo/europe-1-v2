import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import { geoConicConformal, geoPath } from "d3-geo";
import { supabase } from "../../services/api";
import { Download, RefreshCw, Thermometer, Calendar, ChevronLeft, ChevronRight, ChevronDown, Info } from "lucide-react";
import html2canvas from "html2canvas";
import { format, subDays, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import stationNamesData from "../../data/stationNames.json";
import stationsMetadata from "../../data/stationsMetadata.json";
import stationsListData from "../../data/stations_list.json";
import { Delaunay } from "d3-delaunay";
import { REGIONS } from "../../data/departments";

// Échelle de couleurs officielle pour l'indice Humidex
const HUMIDEX_SCALE = [
    { min: -Infinity, max: 25, color: '#e0f2fe', label: '< 25 (Frais / Agréable)' },
    { min: 25, max: 30, color: '#86efac', label: '25 - 30 (Aucun inconfort)' },
    { min: 30, max: 35, color: '#fde047', label: '30 - 35 (Inconfort léger)' },
    { min: 35, max: 40, color: '#f97316', label: '35 - 40 (Inconfort généralisé)' },
    { min: 40, max: 45, color: '#ef4444', label: '40 - 45 (Danger : évitez l\'effort)' },
    { min: 45, max: Infinity, color: '#c084fc', label: '> 45 (Danger extrême)' }
];

const getHumidexColor = (value, scale = HUMIDEX_SCALE) => {
    if (value === null || value === undefined || isNaN(value)) return '#f1f5f9';
    const range = scale.find(r => value >= r.min && value < r.max);
    return range ? range.color : '#c084fc';
};

// Formule de calcul de l'Humidex à partir de la température et de l'humidité relative
const calculateHumidex = (temp, hum) => {
    if (temp === null || hum === null || isNaN(temp) || isNaN(hum)) return null;
    
    // Pression de vapeur saturante (en hPa) à la température T
    const alpha = (17.27 * temp) / (237.7 + temp);
    const saturationVaporPressure = 6.112 * Math.exp(alpha);
    
    // Pression de vapeur réelle (en hPa)
    const vaporPressure = saturationVaporPressure * (hum / 100.0);
    
    // Formule Humidex
    const humidex = temp + 0.5555 * (vaporPressure - 10.0);
    
    // L'Humidex est au moins égal à la température de l'air
    return Math.max(temp, Math.round(humidex * 10) / 10);
};

const HumidexMap = () => {
    const navigate = useNavigate();
    
    // Persistance localStorage partagée pour la région
    const [selectedDate, setSelectedDate] = useState(() => localStorage.getItem('humidexDate') || new Date().toISOString().split('T')[0]);
    const [selectedRegionName, setSelectedRegionName] = useState(() => localStorage.getItem('selectedRegionName') || "France");
    const [humidexMode, setHumidexMode] = useState(() => localStorage.getItem('humidexMode') || "live"); // "live" ou "day"
    const [dayStatMode, setDayStatMode] = useState(() => localStorage.getItem('humidexDayStatMode') || "max"); // "max", "avg", "min"
    const [showLabels, setShowLabels] = useState(() => localStorage.getItem('humidexShowLabels') !== 'false');

    const [geoData, setGeoData] = useState(null);
    const [regionsGeoData, setRegionsGeoData] = useState(null);
    const [stations, setStations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRealTime, setIsRealTime] = useState(true);
    const [mapTitle, setMapTitle] = useState("Indice Humidex");
    const [showRegions, setShowRegions] = useState(true);
    const [isSmooth, setIsSmooth] = useState(true);
    const [hoveredStation, setHoveredStation] = useState(null);
    const [lastDataTimestamp, setLastDataTimestamp] = useState(null);
    const mapContainerRef = useRef(null);

    const WIDTH = 1000;
    const HEIGHT = 900;

    // Sauvegarde des états dans le localStorage
    useEffect(() => { localStorage.setItem('humidexDate', selectedDate); }, [selectedDate]);
    useEffect(() => { localStorage.setItem('selectedRegionName', selectedRegionName); }, [selectedRegionName]);
    useEffect(() => { localStorage.setItem('humidexMode', humidexMode); }, [humidexMode]);
    useEffect(() => { localStorage.setItem('humidexDayStatMode', dayStatMode); }, [dayStatMode]);
    useEffect(() => { localStorage.setItem('humidexShowLabels', showLabels); }, [showLabels]);

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

    // Charger le GeoJSON au montage
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
        if (!realTime && humidexMode === "live") {
            setHumidexMode("day");
        }
    }, [selectedDate, humidexMode]);

    useEffect(() => {
        if (humidexMode === "live") {
            setMapTitle("Indice Humidex – Temps Réel");
        } else {
            const labels = { avg: "Moy.", min: "Min.", max: "Max." };
            setMapTitle(`Indice Humidex – ${labels[dayStatMode] || 'Max.'} Journée`);
        }
    }, [humidexMode, dayStatMode]);

    const loadLiveFromObservations = async () => {
        const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const batchSize = 1000;
        const parallelCount = 6;
        const promises = Array.from({ length: parallelCount }, (_, i) =>
            supabase
                .from('observations_6mn')
                .select('station_id, t, u, timestamp')
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

        if (allObs.length === 0) return [];

        // Garder la dernière observation par station
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
            const tVal = parseFloat(obs.t);
            const uVal = parseFloat(obs.u);
            if (isNaN(tVal) || isNaN(uVal)) return;
            const humidexVal = calculateHumidex(tVal, uVal);
            if (humidexVal === null) return;
            const meta = stationsLookup[sid];
            const lat = meta?.lat;
            const lon = meta?.lon;
            if (lat && lon) {
                const geoKey = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;
                if (!uniqueStations.has(geoKey)) {
                    uniqueStations.set(geoKey, {
                        id: sid, lat, lon,
                        value: humidexVal,
                        name: stationNamesData[sid] || meta?.name || sid
                    });
                }
            }
        });

        const result = Array.from(uniqueStations.values());
        console.log(`[HumidexMap] ${result.length} stations humidex depuis observations_6mn (fallback).`);
        return result;
    };

    const loadData = async () => {
        setLoading(true);
        setError(null);

        try {
            let stationList = [];

            if (humidexMode === "live") {
                console.log("[HumidexMap] Chargement Humidex en temps réel...");
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
                            if (!maxTimestamp || d > maxTimestamp) maxTimestamp = d;
                        }
                    });
                    setLastDataTimestamp(maxTimestamp);

                    const uniqueStations = new Map();
                    liveData.forEach(s => {
                        const tempVal = s.t;
                        const humVal = s.u !== null && s.u !== undefined ? s.u : s.humidity;
                        
                        if (tempVal !== null && tempVal !== undefined && !isNaN(tempVal) &&
                            humVal !== null && humVal !== undefined && !isNaN(humVal)) {
                            
                            const humidexVal = calculateHumidex(tempVal, humVal);
                            
                            if (humidexVal !== null) {
                                let sid = String(s.station_id);
                                if (sid.length === 7) sid = "0" + sid;

                                const meta = stationsLookup[sid];
                                const lat = meta?.lat;
                                const lon = meta?.lon;

                                if (lat && lon) {
                                    const geoKey = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;
                                    if (!uniqueStations.has(geoKey)) {
                                        uniqueStations.set(geoKey, {
                                            id: sid, lat, lon,
                                            value: humidexVal,
                                            name: stationNamesData[sid] || meta?.name || sid
                                        });
                                    }
                                }
                            }
                        }
                    });

                    stationList = Array.from(uniqueStations.values());
                    console.log(`[HumidexMap] ${stationList.length} stations depuis get_france_live.`);
                }

                // Fallback : get_france_live sans t+u exploitables → observations_6mn (30 min)
                if (stationList.length === 0) {
                    console.log("[HumidexMap] Fallback sur observations_6mn (30 dernières minutes)...");
                    stationList = await loadLiveFromObservations();
                }
            } else {
                // Mode journée : charger observations_6mn sur la journée pour calculer l'Humidex en parallèle
                console.log(`[HumidexMap] Chargement Humidex journée ${selectedDate} depuis observations_6mn...`);
                const dateStart = `${selectedDate}T00:00:00`;
                const dateEnd = `${selectedDate}T23:59:59`;

                const batchSize = 2000;
                const numBatches = 10;
                const promises = Array.from({ length: numBatches }, (_, i) =>
                    supabase
                        .from('observations_6mn')
                        .select('station_id, t, u, timestamp')
                        .gte('timestamp', dateStart)
                        .lte('timestamp', dateEnd)
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
                    // Grouper par station et calculer les valeurs Humidex
                    const stationGroups = new Map();
                    allObs.forEach(obs => {
                        let sid = String(obs.station_id);
                        if (sid.length === 7) sid = "0" + sid;
                        const tVal = parseFloat(obs.t);
                        const uVal = parseFloat(obs.u);
                        if (isNaN(tVal) || isNaN(uVal)) return;

                        const humidexVal = calculateHumidex(tVal, uVal);
                        if (humidexVal === null) return;

                        if (!stationGroups.has(sid)) {
                            stationGroups.set(sid, { values: [] });
                        }
                        stationGroups.get(sid).values.push(humidexVal);
                    });

                    const uniqueStations = new Map();
                    stationGroups.forEach((group, sid) => {
                        if (group.values.length === 0) return;
                        const vals = group.values;
                        let statVal;
                        if (dayStatMode === "min") {
                            statVal = Math.min(...vals);
                        } else if (dayStatMode === "max") {
                            statVal = Math.max(...vals);
                        } else {
                            statVal = vals.reduce((a, b) => a + b, 0) / vals.length;
                        }

                        const meta = stationsLookup[sid];
                        const lat = meta?.lat;
                        const lon = meta?.lon;
                        if (lat && lon) {
                            const geoKey = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;
                            if (!uniqueStations.has(geoKey)) {
                                uniqueStations.set(geoKey, {
                                    id: sid, lat, lon,
                                    value: Math.round(statVal * 10) / 10,
                                    name: stationNamesData[sid] || meta?.name || sid
                                });
                            }
                        }
                    });

                    stationList = Array.from(uniqueStations.values());
                }
            }

            setStations(stationList.sort((a, b) => b.value - a.value));

            // Capturer le dernier timestamp des observations pour affichage
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
            if (!(humidexMode === "live" && !maxTimestamp && stationList.length > 0)) {
                setLastDataTimestamp(maxTimestamp);
            }

            if (stationList.length === 0) {
                setError(humidexMode === "live"
                    ? "Aucune donnée Humidex en temps réel disponible."
                    : "Aucune donnée Humidex archivée pour cette date.");
            }
        } catch (err) {
            console.error("Erreur chargement données Humidex:", err);
            setError("Impossible de charger les données météo.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedDate, isRealTime, humidexMode, dayStatMode]);

    // Auto-refresh toutes les 3 minutes en temps réel
    useEffect(() => {
        if (humidexMode !== "live" || !isRealTime) return;
        const interval = setInterval(() => {
            console.log("[HumidexMap] Auto-refreshing Humidex...");
            loadData();
        }, 3 * 60 * 1000);
        return () => clearInterval(interval);
    }, [humidexMode, isRealTime, selectedDate]);

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
                    grid.push({
                        x: posX,
                        y: posY,
                        val: valueSum / weightSum,
                        opacity: 0.85,
                        w: WIDTH / gridResX,
                        h: HEIGHT / gridResY
                    });
                }
            }
        }
        return grid;
    }, [isSmooth, visibleStations, projection]);

    const handleExport = () => {
        const el = document.getElementById("humidex-map-container");
        if (!el) return;
        html2canvas(el, { scale: 2, useCORS: true }).then(canvas => {
            const link = document.createElement("a");
            link.download = `carte-humidex-${selectedDate}.png`;
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

    return (
        <div className="wind-map-page" style={{ padding: '20px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Outfit, sans-serif' }}>
            <header style={{
                maxWidth: '1300px', margin: '0 auto 20px', display: 'flex', flexDirection: 'column', gap: '15px',
                background: 'white', padding: '24px', borderRadius: '20px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Thermometer style={{ color: '#ec4899' }} size={28} /> Indice Humidex : {selectedRegionName}
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
                                    onClick={() => setHumidexMode('live')}
                                    style={{
                                        padding: '6px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                        fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s',
                                        background: humidexMode === 'live' ? '#ec4899' : 'transparent',
                                        color: humidexMode === 'live' ? 'white' : '#64748b'
                                    }}
                                >
                                    Temps Réel
                                </button>
                            )}
                            <button
                                onClick={() => setHumidexMode('day')}
                                style={{
                                    padding: '6px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                    fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s',
                                    background: humidexMode === 'day' ? '#ec4899' : 'transparent',
                                    color: humidexMode === 'day' ? 'white' : '#64748b'
                                }}
                            >
                                Journée
                            </button>
                        </div>

                        {/* Sélecteur de statistique journalière */}
                        {humidexMode === 'day' && (
                            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '12px', padding: '3px' }}>
                                {['max', 'avg', 'min'].map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setDayStatMode(mode)}
                                        style={{
                                            padding: '6px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                            fontWeight: '800', fontSize: '0.8rem', transition: 'all 0.2s',
                                            background: dayStatMode === mode ? '#ec4899' : 'transparent',
                                            color: dayStatMode === mode ? 'white' : '#64748b'
                                        }}
                                    >
                                        {mode === 'max' ? 'Max.' : mode === 'avg' ? 'Moy.' : 'Min.'}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Sélecteur de région */}
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

                        {/* Options d'affichage */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button onClick={() => setShowLabels(!showLabels)} style={{ ...navBtnStyle, background: showLabels ? '#fce7f3' : 'transparent', color: showLabels ? '#db2777' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                VALEURS
                            </button>
                            <button onClick={() => setShowRegions(!showRegions)} style={{ ...navBtnStyle, background: showRegions ? '#fce7f3' : 'transparent', color: showRegions ? '#db2777' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                RÉGIONS
                            </button>
                            <button onClick={() => setIsSmooth(!isSmooth)} style={{ ...navBtnStyle, background: isSmooth ? '#fce7f3' : 'transparent', color: isSmooth ? '#db2777' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                LISSAGE
                            </button>
                        </div>

                        {/* Date Picker */}
                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '6px', borderRadius: '14px' }}>
                            <button onClick={() => changeDate(-1)} style={navBtnStyle}><ChevronLeft size={20} /></button>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                <Calendar size={18} style={{ marginRight: '10px', color: '#ec4899' }} />
                                <span style={{ fontWeight: '700', fontSize: '1rem', color: '#1e293b' }}>{format(new Date(selectedDate), "dd MMM yyyy", { locale: fr })}</span>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    max={new Date().toISOString().split('T')[0]}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                                  />
                            </div>
                            <button onClick={() => changeDate(1)} style={navBtnStyle} disabled={selectedDate === new Date().toISOString().split('T')[0]}><ChevronRight size={20} /></button>
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
                        placeholder="Titre de la carte..."
                        style={{
                            flex: 1, padding: '10px 15px', borderRadius: '10px',
                            border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                        }}
                    />
                </div>
            </header>

            <main style={{ maxWidth: '1300px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 340px', gap: '25px', paddingBottom: '30px' }}>
                <div ref={mapContainerRef} id="humidex-map-container" style={{
                    background: 'white', borderRadius: '4px', padding: '0',
                    boxShadow: 'none', position: 'relative',
                    aspectRatio: '1000 / 920', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', border: '1px solid #000'
                }}>
                    {loading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                            <div className="loader" style={{ width: '48px', height: '48px', border: '5px solid #e2e8f0', borderTopColor: '#ec4899', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                            <p style={{ marginTop: '20px', fontWeight: '700', color: '#86198f', fontSize: '1.1rem' }}>Génération de la carte de l'indice Humidex...</p>
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
                            INDICE HUMIDEX
                        </div>
                        {HUMIDEX_SCALE.map(range => (
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
                                <clipPath id="france-clip-humidex">
                                    <path d={combinedPath} />
                                </clipPath>
                                <filter id="grid-blur-humidex">
                                    <feGaussianBlur stdDeviation="12" />
                                </filter>
                                <filter id="shadow">
                                    <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.15" />
                                </filter>
                            </defs>

                            <g clipPath="url(#france-clip-humidex)">
                                {isSmooth && interpolatedGrid ? (
                                    <g filter="url(#grid-blur-humidex)">
                                        {interpolatedGrid.map((p, i) => (
                                            <rect
                                                key={`grid-${i}`}
                                                x={p.x - 1} y={p.y - 1}
                                                width={p.w + 2} height={p.h + 2}
                                                fill={getHumidexColor(p.val)}
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
                                                fill={getHumidexColor(cell.station.value)}
                                                style={{ transition: 'fill 0.4s ease' }}
                                            />
                                        ))}
                                    </g>
                                )}
                            </g>

                            {/* Frontières des départements */}
                            <g fill="none" stroke="black" strokeWidth="0.2" strokeOpacity="0.4">
                                {geoData.features.map((f, idx) => (
                                    <path key={`dept-${f.properties.code || idx}`} d={pathGenerator(f)} />
                                ))}
                            </g>

                            {/* Frontières des régions */}
                            {showRegions && regionsGeoData && (
                                <g fill="none" stroke="black" strokeWidth="1.2" strokeOpacity="1">
                                    {regionsGeoData.features.map((f, idx) => (
                                        <path key={`region-${f.properties.code || f.properties.nom || idx}`} d={pathGenerator(f)} />
                                    ))}
                                </g>
                            )}

                            <path d={combinedPath} fill="none" stroke="black" strokeWidth="1.5" />

                            {/* Labels des stations */}
                            <g>
                                {visibleStations.map(s => {
                                    const coords = projection([s.lon, s.lat]);
                                    if (!coords) return null;

                                    return (
                                        <g key={`station-${s.id}`} transform={`translate(${coords[0]}, ${coords[1]})`}>
                                            <circle r="2.5" fill="black" stroke="white" strokeWidth="0.5" />
                                            {showLabels && (
                                                <g>
                                                    <text
                                                        y={selectedRegionName === "France" ? -6 : 0}
                                                        dy={selectedRegionName === "France" ? 0 : "0.35em"}
                                                        textAnchor="middle"
                                                        fontWeight="900"
                                                        fontFamily="'Inter', sans-serif"
                                                        style={{
                                                            fontSize: selectedRegionName === "France" ? '18px' : '34px',
                                                            textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff',
                                                            pointerEvents: 'none',
                                                            fill: '#1e293b'
                                                        }}
                                                    >
                                                        {Math.round(s.value)}
                                                    </text>
                                                    {/* Zone interactive invisible pour le hover */}
                                                    <circle
                                                        r="12"
                                                        fill="transparent"
                                                        style={{ cursor: 'pointer' }}
                                                        onMouseEnter={() => setHoveredStation(s)}
                                                        onMouseLeave={() => setHoveredStation(null)}
                                                        onClick={() => navigate(`/observations/station/${s.id}`)}
                                                    />
                                                </g>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        </svg>
                    )}

                    {/* Infobulle (Tooltip) au survol d'une station */}
                    {hoveredStation && (
                        <div style={{
                            position: 'absolute',
                            left: `${projection([hoveredStation.lon, hoveredStation.lat])[0] * (mapContainerRef.current?.clientWidth / WIDTH)}px`,
                            top: `${projection([hoveredStation.lon, hoveredStation.lat])[1] * (mapContainerRef.current?.clientHeight / HEIGHT) - 75}px`,
                            transform: 'translateX(-50%)',
                            background: '#1f2937',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            zIndex: 20,
                            pointerEvents: 'none',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
                            whiteSpace: 'nowrap',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontWeight: '800', marginBottom: '2px' }}>{hoveredStation.name}</div>
                            <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Station {hoveredStation.id} — Dpt {hoveredStation.id.substring(0, 2)}</div>
                            <div style={{ marginTop: '4px', fontSize: '1rem', fontWeight: '900', color: '#f472b6' }}>Humidex : {hoveredStation.value}</div>
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

                    {/* Légende Horizontale Bas de Carte */}
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'rgba(255,255,255,0.95)',
                        padding: '6px 12px',
                        borderTop: '1px solid #000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '2px', flexWrap: 'wrap'
                    }}>
                        <span style={{ fontSize: '10px', fontWeight: '1000', color: '#000', marginRight: '6px' }}>Humidex</span>
                        {HUMIDEX_SCALE.filter(r => r.max !== Infinity).map(range => (
                            <div key={range.min} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ width: '28px', height: '14px', background: range.color, border: '0.5px solid rgba(0,0,0,0.3)' }} />
                                <span style={{ fontSize: '7px', fontWeight: '800', color: '#000', marginTop: '1px' }}>{range.min}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Légende Interactive */}
                    <div style={{ background: 'white', borderRadius: '20px', padding: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
                            Indice Humidex
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {HUMIDEX_SCALE.map(range => (
                                <div key={range.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: range.color, border: '1px solid rgba(0,0,0,0.1)' }}></div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>{range.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Valeurs Humidex */}
                    <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 15px', fontSize: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Thermometer size={18} style={{ color: '#ec4899' }} /> {humidexMode === 'live' ? 'Humidex Temps Réel' : `Humidex ${dayStatMode === 'avg' ? 'Moyen' : dayStatMode === 'min' ? 'Minimum' : 'Maximum'}`}
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
                                            background: getHumidexColor(s.value),
                                            color: '#1e293b',
                                            padding: '4px 8px', borderRadius: '6px',
                                            fontSize: '0.85rem', fontWeight: '800'
                                        }}>
                                            {Math.round(s.value * 10) / 10}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>Aucune donnée</p>
                            )}
                        </div>
                    </div>

                    {/* Note informative */}
                    <div style={{ background: '#fdf2f8', borderRadius: '20px', padding: '15px', display: 'flex', gap: '12px' }}>
                        <Info style={{ color: '#be185d' }} size={20} />
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#be185d', lineHeight: '1.4' }}>
                            L'indice Humidex combine la température de l'air et l'humidité relative pour représenter la chaleur ressentie par le corps humain. Un indice supérieur à 40 indique un inconfort très élevé et un danger potentiel en cas d'effort prolongé.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default HumidexMap;
