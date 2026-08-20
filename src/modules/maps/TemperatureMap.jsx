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
import { MapDateNavigator } from "../../components/MapDateNavigator";// Échelle de couleurs officielle pour les températures (extraite de la légende fournie : -12 à 46°C)
const TEMP_SCALE = [
    { min: -Infinity, max: -12, color: '#1a1a6e', label: '< -12' },
    { min: -12, max: -10, color: '#23239e', label: '-12 / -10' },
    { min: -10, max: -8, color: '#2b2bcf', label: '-10 / -8' },
    { min: -8, max: -6, color: '#3366e6', label: '-8 / -6' },
    { min: -6, max: -4, color: '#4d8cf0', label: '-6 / -4' },
    { min: -4, max: -2, color: '#66b3f5', label: '-4 / -2' },
    { min: -2, max: 0, color: '#80d4fc', label: '-2 / 0' },
    { min: 0, max: 2, color: '#99e6ff', label: '0 / 2' },
    { min: 2, max: 4, color: '#b3f0ff', label: '2 / 4' },
    { min: 4, max: 6, color: '#ccffcc', label: '4 / 6' },
    { min: 6, max: 8, color: '#a3e6a3', label: '6 / 8' },
    { min: 8, max: 10, color: '#7acc7a', label: '8 / 10' },
    { min: 10, max: 12, color: '#52b352', label: '10 / 12' },
    { min: 12, max: 14, color: '#339933', label: '12 / 14' },
    { min: 14, max: 16, color: '#669900', label: '14 / 16' },
    { min: 16, max: 18, color: '#99b300', label: '16 / 18' },
    { min: 18, max: 20, color: '#cccc00', label: '18 / 20' },
    { min: 20, max: 22, color: '#e6cc00', label: '20 / 22' },
    { min: 22, max: 24, color: '#ffcc00', label: '22 / 24' },
    { min: 24, max: 26, color: '#ffaa00', label: '24 / 26' },
    { min: 26, max: 28, color: '#ff8800', label: '26 / 28' },
    { min: 28, max: 30, color: '#ff6600', label: '28 / 30' },
    { min: 30, max: 32, color: '#ff4400', label: '30 / 32' },
    { min: 32, max: 34, color: '#ff1a1a', label: '32 / 34' },
    { min: 34, max: 36, color: '#e60000', label: '34 / 36' },
    { min: 36, max: 38, color: '#cc0033', label: '36 / 38' },
    { min: 38, max: 40, color: '#b30059', label: '38 / 40' },
    { min: 40, max: 42, color: '#cc00cc', label: '40 / 42' },
    { min: 42, max: 44, color: '#e066e0', label: '42 / 44' },
    { min: 44, max: 46, color: '#f0b3f0', label: '44 / 46' },
    { min: 46, max: Infinity, color: '#f5d9f5', label: '> 46' },
];

const getTempColor = (value, scale = TEMP_SCALE) => {
    if (value === null || value === undefined) return '#e2e8f0';
    const range = scale.find(r => value >= r.min && value < r.max);
    return range ? range.color : '#f5d9f5';
};

// Échelle alternative Météo-France "Modèle" (légende officielle -24 à 45°C)
const TEMP_SCALE_MF = [
    { min: -Infinity, max: -24, color: '#2a004f', label: '< -24' },
    { min: -24, max: -22, color: '#3d006b', label: '-24/-22' },
    { min: -22, max: -20, color: '#4a0082', label: '-22/-20' },
    { min: -20, max: -18, color: '#2d0099', label: '-20/-18' },
    { min: -18, max: -15, color: '#1500b3', label: '-18/-15' },
    { min: -15, max: -14, color: '#0000cd', label: '-15/-14' },
    { min: -14, max: -12, color: '#0019e6', label: '-14/-12' },
    { min: -12, max: -10, color: '#0040ff', label: '-12/-10' },
    { min: -10, max: -8, color: '#0066ff', label: '-10/-8' },
    { min: -8, max: -6, color: '#0099ff', label: '-8/-6' },
    { min: -6, max: -4, color: '#00bbff', label: '-6/-4' },
    { min: -4, max: -2, color: '#00ddff', label: '-4/-2' },
    { min: -2, max: 0, color: '#55eeff', label: '-2/0' },
    { min: 0, max: 2, color: '#99ffff', label: '0/2' },
    { min: 2, max: 4, color: '#bbffe8', label: '2/4' },
    { min: 4, max: 6, color: '#ccffcc', label: '4/6' },
    { min: 6, max: 8, color: '#80e680', label: '6/8' },
    { min: 8, max: 10, color: '#4dcc4d', label: '8/10' },
    { min: 10, max: 12, color: '#33b333', label: '10/12' },
    { min: 12, max: 14, color: '#339900', label: '12/14' },
    { min: 14, max: 16, color: '#66aa00', label: '14/16' },
    { min: 16, max: 18, color: '#99bb00', label: '16/18' },
    { min: 18, max: 20, color: '#cccc00', label: '18/20' },
    { min: 20, max: 22, color: '#ffe600', label: '20/22' },
    { min: 22, max: 24, color: '#ffcc00', label: '22/24' },
    { min: 24, max: 26, color: '#ffaa00', label: '24/26' },
    { min: 26, max: 28, color: '#ff8800', label: '26/28' },
    { min: 28, max: 30, color: '#ff6600', label: '28/30' },
    { min: 30, max: 32, color: '#ff3300', label: '30/32' },
    { min: 32, max: 34, color: '#e60000', label: '32/34' },
    { min: 34, max: 36, color: '#cc0033', label: '34/36' },
    { min: 36, max: 38, color: '#cc0066', label: '36/38' },
    { min: 38, max: 40, color: '#dd0099', label: '38/40' },
    { min: 40, max: 42, color: '#ee00cc', label: '40/42' },
    { min: 42, max: 44, color: '#ff66dd', label: '42/44' },
    { min: 44, max: Infinity, color: '#ff99ee', label: '> 44' },
];

const TemperatureMap = () => {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [geoData, setGeoData] = useState(null);
    const [regionsGeoData, setRegionsGeoData] = useState(null);
    const [stations, setStations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRealTime, setIsRealTime] = useState(true);
    const [mapTitle, setMapTitle] = useState("Températures minimales");
    const [showLabels, setShowLabels] = useState(true);
    const [showRegions, setShowRegions] = useState(true);
    const [isSmooth, setIsSmooth] = useState(true);
    const [selectedRegionName, setSelectedRegionName] = useState("France");
    const [tempMode, setTempMode] = useState("tn"); // "tn" = min, "tx" = max
    const [hoveredStation, setHoveredStation] = useState(null);
    const [useAltScale, setUseAltScale] = useState(false);
    const [lastDataTimestamp, setLastDataTimestamp] = useState(null); // Heure de la dernière donnée
    const mapContainerRef = useRef(null);

    const activeTempScale = useAltScale ? TEMP_SCALE_MF : TEMP_SCALE;

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

    // Charger le GeoJSON des départements et des régions au montage
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
        if (!realTime && tempMode === "actuelle") {
            setTempMode("tn");
        }
    }, [selectedDate, tempMode]);

    // Auto-update title when mode changes
    useEffect(() => {
        if (tempMode === "tn") {
            setMapTitle("Températures minimales");
        } else if (tempMode === "tx") {
            setMapTitle("Températures maximales");
        } else {
            setMapTitle("Températures en Temps Réel");
        }
    }, [tempMode]);

    const loadData = async () => {
        setLoading(true);
        setError(null);

        try {
            let stationList = [];

            try {
                if (tempMode === "actuelle") {
                    console.log("[TemperatureMap] Chargement des températures en temps réel...");
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
                            const tempVal = s.t; // Current temperature is 't' in get_france_live
                            if (tempVal !== null && tempVal !== undefined && !isNaN(tempVal)) {
                                let sid = String(s.station_id);
                                if (sid.length === 7) sid = "0" + sid;

                                const meta = stationsLookup[sid];
                                const lat = meta?.lat;
                                const lon = meta?.lon;

                                if (lat && lon) {
                                    const geoKey = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;
                                    const existing = uniqueStations.get(geoKey);
                                    // Use the first one or keep it simple
                                    if (!existing) {
                                        uniqueStations.set(geoKey, {
                                            id: sid,
                                            lat,
                                            lon,
                                            value: tempVal,
                                            name: stationNamesData[sid] || meta?.name || sid
                                        });
                                    }
                                }
                            }
                        });

                        stationList = Array.from(uniqueStations.values());

                        console.log(`[TemperatureMap] ${stationList.length} stations temps réel uniques.`);
                    }
                } else {
                    // Pagination complète pour ne pas être bloqué à 1000 résultats
                    let allData = [];
                    let from = 0;
                    const batchSize = 1000;
                    let hasMore = true;

                    while (hasMore) {
                        const { data, error: rpcError } = await supabase
                            .rpc('get_daily_extremes_fast', {
                                target_date: selectedDate,
                                dept_codes: []
                            })
                            .range(from, from + batchSize - 1);

                        if (rpcError) break;
                        if (data && data.length > 0) {
                            allData.push(...data);
                            if (data.length < batchSize) hasMore = false;
                            else from += batchSize;
                        } else {
                            hasMore = false;
                        }
                    }

                    // Fallback vers le mode COMPLET si données insuffisantes
                    if (allData.length < 300) {
                        console.log(`[TemperatureMap] Mode FAST incomplet (${allData.length} st.), passage en mode FULL SCAN...`);
                        allData = [];
                        from = 0;
                        hasMore = true;
                        while (hasMore) {
                            const { data, error: rpcError } = await supabase
                                .rpc('get_daily_extremes_full', { target_date: selectedDate })
                                .range(from, from + batchSize - 1);

                            if (rpcError) throw rpcError;
                            if (data && data.length > 0) {
                                allData.push(...data);
                                if (data.length < batchSize) hasMore = false;
                                else from += batchSize;
                            } else {
                                hasMore = false;
                            }
                        }
                    }

                    if (allData.length > 0) {
                        console.log(`[TemperatureMap] ${allData.length} stations traitées pour le ${selectedDate}`);

                        const uniqueStations = new Map();

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

                        allData.forEach(s => {
                            const tempVal = tempMode === "tn" ? s.temp_min : s.temp_max;
                            if (tempVal !== null && tempVal !== undefined && !isNaN(tempVal)) {
                                let sid = String(s.station_id);
                                if (sid.length === 7) sid = "0" + sid;

                                const meta = stationsLookup[sid];
                                const lat = meta?.lat || s.lat;
                                const lon = meta?.lon || s.lon;

                                if (lat && lon) {
                                    // Agrégation: regrouper les stations trop proches (0.05 degré ~ 5km) pour correspondre au Générateur
                                    const geoKey = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;

                                    const existing = uniqueStations.get(geoKey);
                                    // Pour Tn on garde la plus basse, pour Tx la plus haute
                                    const shouldReplace = tempMode === "tn"
                                        ? (!existing || tempVal < existing.value)
                                        : (!existing || tempVal > existing.value);

                                    if (shouldReplace) {
                                        uniqueStations.set(geoKey, {
                                            id: sid,
                                            lat,
                                            lon,
                                            value: tempVal,
                                            name: stationNamesData[sid] || meta?.name || s.station_name || sid
                                        });
                                    }
                                }
                            }
                        });

                        // On n'affiche l'heure que si on a un vrai timestamp issu des données
                        // (pas de fallback à new Date() pour ne pas afficher l'heure courante)
                        setLastDataTimestamp(maxTimestamp);

                        stationList = Array.from(uniqueStations.values());

                        console.log(`[TemperatureMap] ${stationList.length} stations uniques après regroupement.`);
                    }
                }
            } catch (err) {
                console.error("[TemperatureMap] Erreur critique de chargement:", err);
            }

            // Tri : Tn par valeur croissante (les plus froides en premier), Tx/Actuelle par valeur décroissante
            setStations(stationList.sort((a, b) => tempMode === "tn" ? a.value - b.value : b.value - a.value));

            if (stationList.length === 0) {
                setError("Aucune donnée de température archivée pour cette date.");
            }
        } catch (err) {
            console.error("Erreur chargement données température:", err);
            setError("Impossible de charger les données météo.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedDate, isRealTime, tempMode]);

    // Auto-refresh in real-time mode every 3 minutes
    useEffect(() => {
        if (tempMode !== "actuelle" || !isRealTime) return;
        const interval = setInterval(() => {
            console.log("[TemperatureMap] Auto-refreshing real-time observations...");
            loadData();
        }, 3 * 60 * 1000);
        return () => clearInterval(interval);
    }, [tempMode, isRealTime, selectedDate]);

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

    // Filtrage synchrone des stations par région pour éliminer les flashs visuels
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

    // Moteur d'interpolation IDW pour le mode lissage
    const interpolatedGrid = useMemo(() => {
        // Pour les petites régions, on réduit le seuil de stations requis à 5 au lieu de 20
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
                    grid.push({
                        x: posX,
                        y: posY,
                        val: finalVal,
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
        const el = document.getElementById("temp-map-container");
        if (!el) return;
        html2canvas(el, { scale: 2, useCORS: true }).then(canvas => {
            const link = document.createElement("a");
            link.download = `carte-${tempMode}-${selectedDate}.png`;
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

    // Légende réduite pour l'affichage sur la carte (pas tous les paliers)
    const legendScaleFiltered = activeTempScale.filter(r => r.min !== -Infinity && r.max !== Infinity);

    return (
        <div className="wind-map-page" style={{ padding: '20px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Outfit, sans-serif' }}>
            <header style={{
                maxWidth: '1300px', margin: '0 auto 20px', display: 'flex', flexDirection: 'column', gap: '15px',
                background: 'white', padding: '24px', borderRadius: '20px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Thermometer style={{ color: tempMode === 'tn' ? '#3b82f6' : tempMode === 'tx' ? '#ef4444' : '#10b981' }} size={28} />
                            {tempMode === 'tn' ? 'Tn' : tempMode === 'tx' ? 'Tx' : 'Actuelle'} : {selectedRegionName}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isRealTime ? '#10b981' : '#f59e0b' }}></div>
                            <span style={{ color: '#64748b', fontSize: '0.95rem', fontWeight: '500' }}>
                                {isRealTime ? "Météo-France (Temps Réel)" : `Archives du ${format(new Date(selectedDate), "EEEE d MMMM yyyy", { locale: fr })}`}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '10px' }}>
                        {/* Sélecteur Tn / Tx / Actuelle */}
                        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '12px', padding: '3px' }}>
                            {isRealTime && (
                                <button
                                    onClick={() => setTempMode('actuelle')}
                                    style={{
                                        padding: '6px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                        fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s',
                                        background: tempMode === 'actuelle' ? '#10b981' : 'transparent',
                                        color: tempMode === 'actuelle' ? 'white' : '#64748b'
                                    }}
                                >
                                    Temps Réel
                                </button>
                            )}
                            <button
                                onClick={() => setTempMode('tn')}
                                style={{
                                    padding: '6px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                    fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s',
                                    background: tempMode === 'tn' ? '#3b82f6' : 'transparent',
                                    color: tempMode === 'tn' ? 'white' : '#64748b'
                                }}
                            >
                                Tn (Min)
                            </button>
                            <button
                                onClick={() => setTempMode('tx')}
                                style={{
                                    padding: '6px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                    fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s',
                                    background: tempMode === 'tx' ? '#ef4444' : 'transparent',
                                    color: tempMode === 'tx' ? 'white' : '#64748b'
                                }}
                            >
                                Tx (Max)
                            </button>
                        </div>

                        {/* Sélecteur de Région */}
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
                            <button onClick={() => setShowLabels(!showLabels)} style={{ ...navBtnStyle, background: showLabels ? '#fef3c7' : 'transparent', color: showLabels ? '#d97706' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                VALEURS
                            </button>
                            <button onClick={() => setShowRegions(!showRegions)} style={{ ...navBtnStyle, background: showRegions ? '#fef3c7' : 'transparent', color: showRegions ? '#d97706' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                RÉGIONS
                            </button>
                            <button onClick={() => setIsSmooth(!isSmooth)} style={{ ...navBtnStyle, background: isSmooth ? '#fef3c7' : 'transparent', color: isSmooth ? '#d97706' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                LISSAGE
                            </button>
                            <button onClick={() => setUseAltScale(!useAltScale)} style={{ ...navBtnStyle, background: useAltScale ? '#f3e8ff' : 'transparent', color: useAltScale ? '#7c3aed' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                {useAltScale ? 'MODÈLE MF' : 'STANDARD'}
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

                {/* Navigateur & Curseur Temporel Moderne */}
                <MapDateNavigator
                    selectedDate={selectedDate}
                    onChangeDate={(newDate) => setSelectedDate(newDate)}
                    accentColor={tempMode === 'tn' ? '#3b82f6' : tempMode === 'tx' ? '#ef4444' : '#10b981'}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '12px 18px', background: '#f8fafc', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#475569', minWidth: 'fit-content' }}>Titre personnalisé :</span>
                    <input
                        type="text"
                        value={mapTitle}
                        onChange={(e) => setMapTitle(e.target.value)}
                        placeholder="Ex: Vague de froid..."
                        style={{
                            flex: 1, padding: '10px 15px', borderRadius: '10px',
                            border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                        }}
                    />
                </div>
            </header>

            <main style={{ maxWidth: '1300px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 340px', gap: '25px', paddingBottom: '30px' }}>
                <div ref={mapContainerRef} id="temp-map-container" style={{
                    background: 'white', borderRadius: '4px', padding: '0',
                    boxShadow: 'none', position: 'relative',
                    aspectRatio: '1000 / 920', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', border: '1px solid #000'
                }}>
                    {loading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                            <div className="loader" style={{ width: '48px', height: '48px', border: '5px solid #e2e8f0', borderTopColor: tempMode === 'tn' ? '#3b82f6' : tempMode === 'tx' ? '#ef4444' : '#10b981', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                            <p style={{ marginTop: '20px', fontWeight: '700', color: '#1e40af', fontSize: '1.1rem' }}>Saisie des mesures météo...</p>
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
                            {tempMode === 'tn' ? 'TEMP. MINIMALE (°C)' : tempMode === 'tx' ? 'TEMP. MAXIMALE (°C)' : 'TEMPÉRATURE (°C)'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px' }}>
                            {activeTempScale.filter(r => r.min !== -Infinity).map(range => (
                                <div key={range.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: range.color, border: '0.5px solid rgba(0,0,0,0.2)', flexShrink: 0 }} />
                                    <span style={{ fontSize: '9.5px', fontWeight: '700', color: '#1e293b' }}>{range.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {geoData && !error && (
                        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', height: '100%' }}>
                            <defs>
                                <clipPath id="france-clip-temp">
                                    <path d={combinedPath} />
                                </clipPath>
                                <filter id="grid-blur-temp">
                                    <feGaussianBlur stdDeviation="12" />
                                </filter>
                            </defs>

                            {/* Fond blanc sous le clip pour que les températures basses soient visibles */}
                            <g clipPath="url(#france-clip-temp)">
                                <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#e2e8f0" />
                            </g>

                            <g clipPath="url(#france-clip-temp)">
                                {isSmooth && interpolatedGrid ? (
                                    <g filter="url(#grid-blur-temp)">
                                        {interpolatedGrid.map((p, i) => (
                                            <rect
                                                key={`grid-${i}`}
                                                x={p.x - 1} y={p.y - 1}
                                                width={p.w + 2} height={p.h + 2}
                                                fill={getTempColor(p.val, activeTempScale)}
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
                                                fill={getTempColor(cell.station.value, activeTempScale)}
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

                            {/* Frontières des Régions */}
                            {showRegions && regionsGeoData && (
                                <g fill="none" stroke="black" strokeWidth="1.2" strokeOpacity="1">
                                    {regionsGeoData.features.map((f, idx) => (
                                        <path key={`region-${f.properties.code || f.properties.nom || idx}`} d={pathGenerator(f)} />
                                    ))}
                                </g>
                            )}

                            {/* Contour de la France */}
                            <path d={combinedPath} fill="none" stroke="black" strokeWidth="1.5" />

                            {/* Points des Stations et Valeurs */}
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
                                            {showLabels && (
                                                <text
                                                    y={selectedRegionName === "France" ? -6 : 0}
                                                    dy={selectedRegionName === "France" ? 0 : "0.35em"}
                                                    textAnchor="middle"
                                                    style={{
                                                        fontSize: selectedRegionName === "France" ? '14px' : '28px', 
                                                        fontWeight: 'bold',
                                                        fill: (s.value < -2 || s.value > 35) ? '#fff' : '#000',
                                                        stroke: (s.value < -2 || s.value > 35) ? '#000' : '#fff',
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
                            <div style={{ marginTop: '4px', fontSize: '1rem', fontWeight: '900', color: tempMode === 'tn' ? '#38bdf8' : tempMode === 'tx' ? '#f87171' : '#34d399' }}>{hoveredStation.value.toFixed(1)} °C</div>
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

                    {/* Légende Horizontale (sous la carte, pas de chevauchement) */}
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'rgba(255,255,255,0.95)',
                        padding: '6px 8px',
                        borderTop: '1px solid #000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '1px', flexWrap: 'wrap'
                    }}>
                        <span style={{ fontSize: '10px', fontWeight: '1000', color: '#000', marginRight: '4px' }}>°C</span>
                        {legendScaleFiltered.filter((_, i) => i % 2 === 0).map(range => (
                            <div key={range.min} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ width: '22px', height: '14px', background: range.color, border: '0.5px solid rgba(0,0,0,0.3)' }} />
                                <span style={{ fontSize: '7px', fontWeight: '800', color: '#000', marginTop: '1px' }}>{range.min}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Légende Panneau Latéral */}
                    <div style={{ background: 'white', borderRadius: '20px', padding: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
                            {tempMode === 'tn' ? 'Temp. Minimale (°C)' : tempMode === 'tx' ? 'Temp. Maximale (°C)' : 'Temp. Actuelle (°C)'}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
                            {activeTempScale.filter(r => r.min !== -Infinity).map(range => (
                                <div key={range.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', background: range.color, border: '1px solid rgba(0,0,0,0.1)' }}></div>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569' }}>{range.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Températures */}
                    <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 15px', fontSize: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Thermometer size={18} style={{ color: tempMode === 'tn' ? '#3b82f6' : tempMode === 'tx' ? '#ef4444' : '#10b981' }} />
                            {tempMode === 'tn' ? 'Top Froid (Tn)' : tempMode === 'tx' ? 'Top Chaleur (Tx)' : 'Top Températures (Actuelle)'}
                        </h3>
                        <div style={{ overflowY: 'auto', flex: 1 }} className="custom-scrollbar">
                            {visibleStations.length > 0 ? (
                                visibleStations.slice(0, 15).map((s, i) => (
                                    <div key={s.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 0', borderBottom: i === 14 ? 'none' : '1px solid #f1f5f9'
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '180px' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Dpt {s.id.substring(0, 2)}</span>
                                        </div>
                                        <div style={{
                                            background: getTempColor(s.value, activeTempScale),
                                            color: (s.value < -2 || s.value > 35) ? 'white' : '#1e293b',
                                            padding: '4px 8px', borderRadius: '6px',
                                            fontSize: '0.85rem', fontWeight: '800'
                                        }}>
                                            {Math.round(s.value)} <small>°C</small>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>Aucune donnée</p>
                            )}
                        </div>
                    </div>

                    {/* Infos API */}
                    <div style={{ background: tempMode === 'tn' ? '#dbeafe' : tempMode === 'tx' ? '#fee2e2' : '#d1fae5', borderRadius: '20px', padding: '15px', display: 'flex', gap: '12px' }}>
                        <Info style={{ color: tempMode === 'tn' ? '#1d4ed8' : tempMode === 'tx' ? '#dc2626' : '#059669' }} size={20} />
                        <p style={{ margin: 0, fontSize: '0.75rem', color: tempMode === 'tn' ? '#1e40af' : tempMode === 'tx' ? '#991b1b' : '#065f46', lineHeight: '1.4' }}>
                            Données issues des stations automatiques du réseau Météo-France.
                            {tempMode === 'tn'
                                ? " La valeur affichée est la température minimale (Tn) enregistrée sur 24h."
                                : tempMode === 'tx'
                                ? " La valeur affichée est la température maximale (Tx) enregistrée sur 24h."
                                : " La valeur affichée est la température instantanée mesurée en temps réel (mise à jour toutes les 6 minutes)."
                            }
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

export default TemperatureMap;
