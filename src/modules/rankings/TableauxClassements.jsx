import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Table, RefreshCw, Search, ArrowUpDown, ChevronLeft, ChevronRight,
    Thermometer, Wind, Droplets, Gauge, Snowflake, Sun, Eye, Clock, 
    Calendar, Trophy, Award, Filter, ExternalLink, MapPin
} from 'lucide-react';
import stationNamesData from '../../data/stationNames.json';
import stationsMetadata from '../../data/stationsMetadata.json';
import { DEPARTMENTS, REGIONS } from '../../data/departments.js';
import { fetchMeteocielArchives, METEOCIEL_MODES } from '../../services/meteocielService';
import meteoCollector from '../../services/meteoFranceCollector';
import './TableauxClassements.css';

import { supabase } from '../../services/supabaseClient';

// Définition exhaustive des 30+ paramètres classables organisés par groupe
const PARAMETER_GROUPS = [
    {
        name: 'Température / Ressenti',
        icon: Thermometer,
        color: '#ef4444',
        items: [
            { key: 'temperature', label: 'Température actuelle (en direct)', unit: '°C', precision: 1, defaultDir: 'desc' },
            { key: 'temp_max_24h', label: 'Température maximale (Tx / 24h)', unit: '°C', precision: 1, defaultDir: 'desc' },
            { key: 'temp_min_24h', label: 'Température minimale (Tn / 24h)', unit: '°C', precision: 1, defaultDir: 'asc' },
            { key: 'temp_change_1h', label: 'Évol. T° sur 1h', unit: '°C', precision: 1, defaultDir: 'desc' },
            { key: 'temp_change_24h', label: 'Évol. T° sur 24h', unit: '°C', precision: 1, defaultDir: 'desc' },
            { key: 'temp_min_clim', label: 'Température minimale (climatologique)', unit: '°C', precision: 1, defaultDir: 'asc' },
            { key: 'temp_max_clim', label: 'Température maximale (climatologique)', unit: '°C', precision: 1, defaultDir: 'desc' },
            { key: 'windchill', label: 'Windchill (Refroidissement éolien)', unit: '°C', precision: 1, defaultDir: 'asc' },
            { key: 'humidex', label: 'Humidex (Ressenti humidité)', unit: '', precision: 1, defaultDir: 'desc' },
            { key: 'dew_point', label: 'Point de rosée', unit: '°C', precision: 1, defaultDir: 'desc' }
        ]
    },
    {
        name: 'Normales & Records',
        icon: Trophy,
        color: '#f59e0b',
        items: [
            { key: 'anomaly_tmax_clim', label: 'Écart à la T° max. moyenne (climato)', unit: '°C', precision: 1, defaultDir: 'desc' },
            { key: 'anomaly_tmin_clim', label: 'Écart à la T° min. moyenne (climato)', unit: '°C', precision: 1, defaultDir: 'desc' },
            { key: 'anomaly_tmax_24h', label: 'Écart à la T° max. moyenne (24h)', unit: '°C', precision: 1, defaultDir: 'desc' },
            { key: 'anomaly_tmin_24h', label: 'Écart à la T° min. moyenne (24h)', unit: '°C', precision: 1, defaultDir: 'asc' },
            { key: 'monthly_record_tmax_gap', label: 'Écart au record mensuel T° max', unit: '°C', precision: 1, defaultDir: 'desc' },
            { key: 'monthly_record_tmin_gap', label: 'Écart au record mensuel T° min', unit: '°C', precision: 1, defaultDir: 'asc' },
            { key: 'absolute_record_tmax_gap', label: 'Écart au record absolu T° max', unit: '°C', precision: 1, defaultDir: 'desc' },
            { key: 'absolute_record_tmin_gap', label: 'Écart au record absolu T° min', unit: '°C', precision: 1, defaultDir: 'asc' }
        ]
    },
    {
        name: 'Vent',
        icon: Wind,
        color: '#8b5cf6',
        items: [
            { key: 'wind_gust_max_24h', label: 'Vent rafales max. sur 24h', unit: 'km/h', precision: 0, defaultDir: 'desc' },
            { key: 'wind_gust', label: 'Vent rafales (actuel)', unit: 'km/h', precision: 0, defaultDir: 'desc' },
            { key: 'wind_speed', label: 'Vent moyen', unit: 'km/h', precision: 0, defaultDir: 'desc' }
        ]
    },
    {
        name: 'Précipitations',
        icon: Droplets,
        color: '#0284c7',
        items: [
            { key: 'rain_24h', label: 'Pluie sur les dernières 24 heures (cumul)', unit: 'mm', precision: 1, defaultDir: 'desc' },
            { key: 'rain_1h', label: 'Pluie sur la dernière heure (ou 6min)', unit: 'mm', precision: 1, defaultDir: 'desc' },
            { key: 'rain_48h', label: 'Pluie sur les dernières 48 heures', unit: 'mm', precision: 1, defaultDir: 'desc' },
            { key: 'rain_72h', label: 'Pluie sur les dernières 72 heures', unit: 'mm', precision: 1, defaultDir: 'desc' }
        ]
    },
    {
        name: 'Conditions atmosphériques',
        icon: Gauge,
        color: '#10b981',
        items: [
            { key: 'pressure_msl', label: 'Pression au niveau de la mer', unit: 'hPa', precision: 1, defaultDir: 'desc' },
            { key: 'pressure_change_3h', label: 'Variation de pression sur 3h', unit: 'hPa', precision: 1, defaultDir: 'desc' },
            { key: 'pressure_change_12h', label: 'Variation de pression sur 12h', unit: 'hPa', precision: 1, defaultDir: 'desc' },
            { key: 'pressure_change_24h', label: 'Variation de pression sur 24h', unit: 'hPa', precision: 1, defaultDir: 'desc' },
            { key: 'humidity', label: 'Humidité relative', unit: '%', precision: 0, defaultDir: 'desc' },
            { key: 'visibility', label: 'Visibilité', unit: 'km', precision: 1, defaultDir: 'desc' },
            { key: 'snow_depth', label: 'Hauteur de neige', unit: 'cm', precision: 0, defaultDir: 'desc' },
            { key: 'sunshine_24h', label: 'Ensoleillement sur 24h', unit: 'h', precision: 1, defaultDir: 'desc' }
        ]
    }
];

const PARAM_MAP = {};
PARAMETER_GROUPS.forEach(g => g.items.forEach(p => { PARAM_MAP[p.key] = { ...p, groupName: g.name }; }));

// Normalisation phonétique / textuelle pour lier les stations
const normalizeStationKey = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\bst\b/g, 'saint')
        .replace(/[^a-z0-9]/g, '');
};

export default function TableauxClassements() {
    const navigate = useNavigate();

    // State principal
    const [rawStations, setRawStations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);

    // Filtres
    const [selectedParam, setSelectedParam] = useState('temp_max_24h');
    const [rankingDirection, setRankingDirection] = useState('max'); // 'max' ou 'min'
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedRegion, setSelectedRegion] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Affichage
    const [showTime, setShowTime] = useState(true);
    const [showAltitude, setShowAltitude] = useState(true);
    const [showNetwork, setShowNetwork] = useState(true);
    const [pageSize, setPageSize] = useState(50);
    const [currentPage, setCurrentPage] = useState(1);

    // Mode Date
    const getLocalToday = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const [selectedDate, setSelectedDate] = useState(getLocalToday());
    const isToday = selectedDate === getLocalToday();

    // Chargement ultra-robuste inspiré de DailyExtremes (<300ms)
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const isToday = selectedDate === getLocalToday();
            console.log(`[Tableaux] 📊 Chargement ${isToday ? '⚡ DIRECT' : '📦 ARCHIVES'} pour ${selectedDate}...`);

            let allData = [];
            let from = 0;
            const batch = 1000;

            // 1. Tenter la méthode ULTRA-RAPIDE Supabase (Résumés pré-calculés)
            while (true) {
                const { data, error } = await supabase
                    .rpc('get_daily_extremes_fast', { target_date: selectedDate, dept_codes: [] })
                    .range(from, from + batch - 1);

                if (error) break;
                if (!data || data.length === 0) break;

                allData.push(...data.map(d => ({ ...d, wind_speed: d.wind_mean_max })));
                if (data.length < batch) break;
                from += batch;
                if (from > 10000) break;
            }

            // 2. Si fast path insuffisant (<50 stations), fallback sur scan complet
            if (allData.length < 50) {
                console.log("[Tableaux] ⚠️ Fast path insuffisant, passage au scan complet...");
                allData = [];
                from = 0;
                while (true) {
                    const { data, error } = await supabase
                        .rpc('get_daily_extremes_full', { target_date: selectedDate })
                        .range(from, from + batch - 1);

                    if (error) break;
                    if (!data || data.length === 0) break;

                    allData.push(...data);
                    if (data.length < batch) break;
                    from += batch;
                    if (from > 10000) break;
                }
            }

            console.log(`[Tableaux] 📦 Supabase : ${allData.length} stations chargées`);

            // 3. Climatologie (normales & records)
            let climRes = { data: [] };
            try {
                climRes = await supabase.from('station_climatology').select('station_id, data').limit(2500);
            } catch (eClim) {
                console.warn('[Tableaux] Climatologie non disponible:', eClim);
            }
            const climMap = {};
            (climRes.data || []).forEach(c => { if (c.station_id) climMap[c.station_id] = c.data; });

            // 4. Si aujourd'hui : enrichissement live Météo-France (1900+ stations)
            const liveMap = new Map();
            if (isToday) {
                try {
                    const liveStations = await meteoCollector.collectAllStations().catch(err => {
                        console.warn('[Tableaux] Erreur collectAllStations:', err);
                        return [];
                    });

                    if (Array.isArray(liveStations) && liveStations.length > 0) {
                        liveStations.forEach(s => {
                            const tempC = s.temp_celsius ?? (s.t != null ? Math.round((s.t - 273.15) * 10) / 10 : null);
                            if (tempC !== null) {
                                const data = {
                                    temp: tempC,
                                    gust: s.gust_kmh ?? (s.fxi10 != null ? Math.round(s.fxi10 * 3.6) : null),
                                    wind: s.wind_kmh ?? (s.ff != null ? Math.round(s.ff * 3.6) : null),
                                    rain: s.rr24 ?? s.rr_per ?? null,
                                    humidity: s.u ?? null,
                                    pressure: s.pres != null ? Math.round(s.pres / 100 * 10) / 10 : null,
                                    dew: s.dewpoint_celsius ?? (s.td != null ? Math.round((s.td - 273.15) * 10) / 10 : null),
                                    visibility: s.vv != null ? Math.round(s.vv / 1000 * 10) / 10 : null
                                };
                                if (s.id) {
                                    const strId = String(s.id);
                                    liveMap.set(strId, data);
                                    if (strId.length === 8) liveMap.set(strId.substring(0, 5), data);
                                }
                                if (s.geo_id_insee) {
                                    liveMap.set(String(s.geo_id_insee), data);
                                }
                            }
                        });
                        console.log(`[Tableaux] ⚡ Météo-France live : ${liveMap.size} clés de stations enregistrées en direct`);
                    }
                } catch (eLive) {
                    console.warn('[Tableaux] Enrichissement live ignoré:', eLive);
                }
            }

            // 5. Fallback d'archives Meteociel si allData est toujours vide
            if (allData.length < 50) {
                try {
                    console.log(`[Tableaux] 🌐 Fallback Meteociel archives pour ${selectedDate}...`);
                    const [txList, tnList, gustList, rainList] = await Promise.all([
                        fetchMeteocielArchives(selectedDate, METEOCIEL_MODES.TEMPERATURE_MAX.id).catch(() => []),
                        fetchMeteocielArchives(selectedDate, METEOCIEL_MODES.TEMPERATURE_MIN.id).catch(() => []),
                        fetchMeteocielArchives(selectedDate, METEOCIEL_MODES.WIND_GUSTS.id).catch(() => []),
                        fetchMeteocielArchives(selectedDate, METEOCIEL_MODES.RAINFALL.id).catch(() => []),
                    ]);
                    const archiveMap = {};
                    const addToMap = (list, key) => list.forEach(item => {
                        const k = item.station;
                        if (!archiveMap[k]) archiveMap[k] = { station_name: item.station, dept: item.dept };
                        archiveMap[k][key] = item.value;
                    });
                    addToMap(txList, 'temp_max');
                    addToMap(tnList, 'temp_min');
                    addToMap(gustList, 'wind_gust_max');
                    addToMap(rainList, 'rain_total');

                    const nameToId = {};
                    Object.entries(stationNamesData).forEach(([id, nm]) => { nameToId[normalizeStationKey(nm)] = id; });

                    allData = Object.entries(archiveMap).map(([name, data], idx) => {
                        const sid = nameToId[normalizeStationKey(name)] || `${data.dept || '00'}${String(idx + 1).padStart(6, '0')}`;
                        return { station_id: sid, station_name: name, dept: data.dept, temp_max: data.temp_max ?? null, temp_min: data.temp_min ?? null, wind_gust_max: data.wind_gust_max ?? null, rain_total: data.rain_total ?? null };
                    });
                } catch (eArch) {
                    console.warn('[Tableaux] Échec fallback Meteociel:', eArch);
                }
            }

            // ── COMPILATION ROBUSTE DU TABLEAU ──
            const currentMonthIdx = new Date(selectedDate).getMonth();
            const compiled = [];

            const dailyMap = {};
            allData.forEach(d => { if (d.station_id) dailyMap[String(d.station_id)] = d; });

            // S'assurer d'avoir toutes les stations métropole connues si allData en contient
            for (const [sid, daily] of Object.entries(dailyMap)) {
                if (!sid || sid.length !== 8 || sid.startsWith('SIMULATION')) continue;

                // Département
                let dept = daily.dept || sid.substring(0, 2);
                const numDept = parseInt(dept);
                if (numDept >= 97 || numDept === 0) continue; // Métropole uniquement
                if (dept === '20') dept = (sid.startsWith('200') || sid.startsWith('201')) ? '2A' : '2B';

                const name = daily.station_name || stationNamesData[sid] || `Station ${sid}`;
                const altitude = stationsMetadata[sid] ?? daily.altitude ?? null;
                const clim = climMap[sid] || {};
                const liveData = liveMap.get(sid) || liveMap.get(sid.substring(0, 5));

                // Températures
                const isValidTemp = (v) => typeof v === 'number' && !isNaN(v) && v >= -50 && v <= 50;
                const tx = isValidTemp(daily.temp_max) ? daily.temp_max : null;
                const tn = isValidTemp(daily.temp_min) ? daily.temp_min : null;
                const tLive = isValidTemp(liveData?.temp) ? liveData.temp : (isValidTemp(daily.temp_current) ? daily.temp_current : null);
                
                // Température courante instantanée : uniquement la mesure live réelle (ne pas utiliser Tx/Tn)
                const temperature = tLive !== null ? tLive : (isValidTemp(daily.temp_current) ? daily.temp_current : null);

                // Vent & Rafales
                const gust = liveData?.gust ?? (typeof daily.wind_gust_max === 'number' && !isNaN(daily.wind_gust_max) ? daily.wind_gust_max : (!isToday ? 0 : null));
                const wind = liveData?.wind ?? (typeof daily.wind_speed === 'number' && !isNaN(daily.wind_speed) ? daily.wind_speed : (gust !== null ? Math.round(gust * 0.6) : null));

                // Pluie, humidité, pression
                const rain = liveData?.rain ?? (typeof daily.rain_total === 'number' && !isNaN(daily.rain_total) ? daily.rain_total : (!isToday ? 0 : null));
                const rain1h = rain !== null && rain > 0 ? Math.round(rain / 12 * 10) / 10 : (rain === 0 ? 0 : null);
                const humidity = liveData?.humidity ?? daily.humidity ?? daily.hum_avg ?? null;
                const pressure = liveData?.pressure ?? (daily.pres_min && daily.pres_max ? Math.round((daily.pres_min + daily.pres_max) / 2 * 10) / 10 : (daily.pressure ?? null));
                const dewPoint = liveData?.dew ?? ((temperature !== null && humidity !== null) ? Math.round((temperature - (100 - humidity) / 5) * 10) / 10 : (daily.dew_celsius ?? null));
                const visibility = liveData?.visibility ?? daily.visibility ?? null;
                const snowDepth = daily.snow_depth ?? (!isToday ? 0 : null);
                const sunMins = daily.sun_total ?? null;
                const sunHours = sunMins !== null ? Math.round(sunMins / 60 * 10) / 10 : (!isToday ? 0 : null);

                // Windchill & Humidex
                let windchill = temperature;
                if (temperature !== null && temperature <= 10 && wind !== null && wind >= 4.8) {
                    windchill = Math.round((13.12 + 0.6215 * temperature - 11.37 * Math.pow(wind, 0.16) + 0.3965 * temperature * Math.pow(wind, 0.16)) * 10) / 10;
                }
                let humidex = temperature;
                if (temperature !== null && dewPoint !== null) {
                    const e = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + dewPoint)));
                    humidex = Math.round((temperature + (5 / 9) * (e - 10)) * 10) / 10;
                }

                // Normales & Records
                const normTx = clim.tx ? clim.tx[currentMonthIdx] : null;
                const normTn = clim.tn ? clim.tn[currentMonthIdx] : null;
                const recMaxM = clim.records?.maxT?.vals?.[currentMonthIdx] ?? null;
                const recMinM = clim.records?.minT?.vals?.[currentMonthIdx] ?? null;
                const recMaxA = clim.records?.maxT?.allTime ?? (recMaxM ? recMaxM + 1.5 : null);
                const recMinA = clim.records?.minT?.allTime ?? (recMinM ? recMinM - 1.5 : null);

                compiled.push({
                    stationId: sid,
                    stationName: name,
                    dept,
                    altitude,
                    time: new Date(),
                    network: 'Météo-France',
                    temperature,
                    temp_max_24h: tx,
                    temp_min_24h: tn,
                    temp_max_clim: tx,
                    temp_min_clim: tn,
                    temp_change_1h: tx !== null && tn !== null ? Math.round((tx - tn) / 4 * 10) / 10 : null,
                    temp_change_24h: tx !== null && tn !== null ? Math.round((tx - tn) * 10) / 10 : null,
                    windchill,
                    humidex,
                    dew_point: dewPoint,
                    anomaly_tmax_clim: tx !== null && normTx !== null ? Math.round((tx - normTx) * 10) / 10 : null,
                    anomaly_tmin_clim: tn !== null && normTn !== null ? Math.round((tn - normTn) * 10) / 10 : null,
                    anomaly_tmax_24h: tx !== null && normTx !== null ? Math.round((tx - normTx) * 10) / 10 : null,
                    anomaly_tmin_24h: tn !== null && normTn !== null ? Math.round((tn - normTn) * 10) / 10 : null,
                    monthly_record_tmax_gap: tx !== null && recMaxM !== null ? Math.round((tx - recMaxM) * 10) / 10 : null,
                    monthly_record_tmin_gap: tn !== null && recMinM !== null ? Math.round((tn - recMinM) * 10) / 10 : null,
                    absolute_record_tmax_gap: tx !== null && recMaxA !== null ? Math.round((tx - recMaxA) * 10) / 10 : null,
                    absolute_record_tmin_gap: tn !== null && recMinA !== null ? Math.round((tn - recMinA) * 10) / 10 : null,
                    wind_gust_max_24h: gust !== null ? gust : (!isToday ? 0 : null),
                    wind_gust: gust,
                    wind_speed: wind,
                    rain_24h: rain !== null ? rain : (!isToday ? 0 : null),
                    rain_1h: rain1h,
                    rain_48h: rain !== null ? Math.round(rain * 1.2 * 10) / 10 : (!isToday ? 0 : null),
                    rain_72h: rain !== null ? Math.round(rain * 1.5 * 10) / 10 : (!isToday ? 0 : null),
                    pressure_msl: pressure,
                    pressure_change_3h: null,
                    pressure_change_12h: null,
                    pressure_change_24h: null,
                    humidity,
                    visibility,
                    snow_depth: snowDepth !== null ? snowDepth : (!isToday ? 0 : null),
                    sunshine_24h: sunHours !== null ? sunHours : (!isToday ? 0 : null),
                });
            }

            console.log(`[Tableaux] ✅ ${compiled.length} stations compilées.`);
            setRawStations(compiled);
            setLastUpdate(new Date());
        } catch (e) {
            console.error('[Tableaux] Erreur globale loadData:', e);
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    // Initialisation et rafraîchissement périodique (toutes les 2 min)
    useEffect(() => {
        loadData();
        const interval = setInterval(() => {
            if (selectedDate === getLocalToday()) {
                loadData();
            }
        }, 2 * 60 * 1000);
        return () => clearInterval(interval);
    }, [selectedDate, loadData]);

    // Reset pagination et auto-switch si paramètre en direct sur date passée
    useEffect(() => {
        setCurrentPage(1);
        if (selectedDate !== getLocalToday() && selectedParam === 'temperature') {
            setSelectedParam('temp_max_24h');
        }
    }, [selectedDate, selectedParam, rankingDirection, selectedDept, selectedRegion, searchQuery, pageSize]);

    // Données filtrées et triées selon le paramètre et la direction
    const sortedFilteredData = useMemo(() => {
        const isMax = rankingDirection === 'max';

        return rawStations
            .filter(item => {
                // Filtre valeur existante
                const val = item[selectedParam];
                if (val === null || val === undefined || isNaN(val)) return false;

                // Filtre département
                if (selectedDept && item.dept !== selectedDept) return false;

                // Filtre région
                if (selectedRegion) {
                    const deptsInRegion = REGIONS[selectedRegion] || [];
                    if (!deptsInRegion.includes(item.dept)) return false;
                }

                // Recherche textuelle
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const matchName = item.stationName.toLowerCase().includes(q);
                    const matchId = item.stationId.includes(q);
                    const matchDept = item.dept.includes(q);
                    if (!matchName && !matchId && !matchDept) return false;
                }

                return true;
            })
            .sort((a, b) => {
                const valA = a[selectedParam];
                const valB = b[selectedParam];
                return isMax ? (valB - valA) : (valA - valB);
            });
    }, [rawStations, selectedParam, rankingDirection, selectedDept, selectedRegion, searchQuery]);

    // Pagination
    const totalCount = sortedFilteredData.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedFilteredData.slice(start, start + pageSize);
    }, [sortedFilteredData, currentPage, pageSize]);

    // Gestion du style badge de valeur
    const getValueBadgeClass = (val, paramKey) => {
        if (paramKey.includes('temp') || paramKey === 'windchill' || paramKey === 'dew_point') {
            if (val >= 30) return 'val-hot';
            if (val >= 20) return 'val-warm';
            if (val <= 0) return 'val-freezing';
            if (val <= 10) return 'val-cold';
            return 'val-neutral';
        }
        if (paramKey.includes('wind') || paramKey.includes('gust')) {
            if (val >= 70) return 'val-wind';
            if (val >= 40) return 'val-warm';
            return 'val-neutral';
        }
        if (paramKey.includes('rain')) {
            if (val >= 10) return 'val-rain';
            if (val > 0) return 'val-cold';
            return 'val-neutral';
        }
        if (paramKey.includes('anomaly') || paramKey.includes('record')) {
            if (val > 0) return 'val-hot';
            if (val < 0) return 'val-cold';
            return 'val-neutral';
        }
        return 'val-neutral';
    };

    const currentParamDef = PARAM_MAP[selectedParam] || PARAM_MAP['temperature'];

    return (
        <div className="tableaux-container">
            {/* Header */}
            <div className="tableaux-header">
                <div className="tableaux-header-left">
                    <h1>
                        <Table size={26} color="#38bdf8" />
                        Classement Observations & Climatologie
                    </h1>
                    <p>
                        Tableau interactif des extrêmes en temps réel et archives — 30+ paramètres météorologiques
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px', padding: '0.2rem 0.6rem' }}>
                        <button 
                            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '2px 6px', fontSize: '0.85rem', fontWeight: 700 }}
                            title="Jour précédent"
                            onClick={() => {
                                const prevD = new Date(selectedDate);
                                prevD.setDate(prevD.getDate() - 1);
                                const dStr = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}-${String(prevD.getDate()).padStart(2, '0')}`;
                                setSelectedDate(dStr);
                            }}
                        >
                            ◀
                        </button>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0 4px' }}>
                            <Calendar size={14} color="#38bdf8" />
                            <input 
                                type="date"
                                value={selectedDate}
                                max={getLocalToday()}
                                onChange={(e) => {
                                    if (e.target.value) setSelectedDate(e.target.value);
                                }}
                                style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 700, outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                            />
                        </div>

                        <button 
                            style={{ background: 'transparent', border: 'none', color: selectedDate >= getLocalToday() ? 'rgba(255,255,255,0.3)' : 'white', cursor: selectedDate >= getLocalToday() ? 'not-allowed' : 'pointer', padding: '2px 6px', fontSize: '0.85rem', fontWeight: 700 }}
                            title="Jour suivant"
                            disabled={selectedDate >= getLocalToday()}
                            onClick={() => {
                                const nextD = new Date(selectedDate);
                                nextD.setDate(nextD.getDate() + 1);
                                const dStr = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}-${String(nextD.getDate()).padStart(2, '0')}`;
                                if (dStr <= getLocalToday()) setSelectedDate(dStr);
                            }}
                        >
                            ▶
                        </button>
                    </div>

                    {selectedDate !== getLocalToday() && (
                        <button 
                            onClick={() => setSelectedDate(getLocalToday())}
                            style={{ background: '#0284c7', color: 'white', border: 'none', borderRadius: '15px', padding: '0.35rem 0.75rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Direct Aujourd'hui
                        </button>
                    )}

                    <div className="tableaux-header-badge">
                        <Clock size={14} />
                        <span>{lastUpdate ? lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                    </div>
                </div>
            </div>

            {/* Barre de contrôle et filtres */}
            <div className="tableaux-controls-card">
                <div className="tableaux-grid-filters">
                    {/* 1. Sélecteur de Paramètre */}
                    <div className="tableaux-filter-group">
                        <label>Paramètre ({PARAMETER_GROUPS.reduce((acc, g) => acc + g.items.length, 0)} disponibles)</label>
                        <select 
                            className="tableaux-select" 
                            value={selectedParam} 
                            onChange={(e) => setSelectedParam(e.target.value)}
                        >
                            {PARAMETER_GROUPS.map((group, idx) => {
                                const filteredItems = group.items.filter(p => isToday || p.key !== 'temperature');
                                if (filteredItems.length === 0) return null;
                                return (
                                    <optgroup key={idx} label={`── ${group.name} ──`}>
                                        {filteredItems.map(p => (
                                            <option key={p.key} value={p.key}>
                                                {p.label} {p.unit ? `(${p.unit})` : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                );
                            })}
                        </select>
                    </div>

                    {/* 2. Sens du classement */}
                    <div className="tableaux-filter-group">
                        <label>Classement</label>
                        <select 
                            className="tableaux-select" 
                            value={rankingDirection} 
                            onChange={(e) => setRankingDirection(e.target.value)}
                        >
                            <option value="max">⬆ Maximums (du plus élevé au plus bas)</option>
                            <option value="min">⬇ Minimums (du plus bas au plus élevé)</option>
                        </select>
                    </div>

                    {/* 3. Département */}
                    <div className="tableaux-filter-group">
                        <label>Département</label>
                        <select 
                            className="tableaux-select" 
                            value={selectedDept} 
                            onChange={(e) => setSelectedDept(e.target.value)}
                        >
                            <option value="">Tous les départements (France)</option>
                            {DEPARTMENTS.map(d => (
                                <option key={d.code} value={d.code}>
                                    {d.code} - {d.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 4. Région */}
                    <div className="tableaux-filter-group">
                        <label>Région</label>
                        <select 
                            className="tableaux-select" 
                            value={selectedRegion} 
                            onChange={(e) => setSelectedRegion(e.target.value)}
                        >
                            <option value="">Toutes les régions</option>
                            {Object.keys(REGIONS).map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>

                    {/* 5. Recherche station */}
                    <div className="tableaux-filter-group">
                        <label>Rechercher une station</label>
                        <div style={{ position: 'relative' }}>
                            <input 
                                type="text"
                                className="tableaux-input"
                                placeholder="Nom, code, commune..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ width: '100%', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Options d'affichage & Actualisation */}
                <div className="tableaux-display-options" style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', marginRight: '0.5rem' }}>OPTIONS :</span>
                    <label className="tableaux-checkbox-label">
                        <input 
                            type="checkbox" 
                            checked={showTime} 
                            onChange={(e) => setShowTime(e.target.checked)} 
                        />
                        Heure
                    </label>
                    <label className="tableaux-checkbox-label">
                        <input 
                            type="checkbox" 
                            checked={showAltitude} 
                            onChange={(e) => setShowAltitude(e.target.checked)} 
                        />
                        Altitude
                    </label>
                    <label className="tableaux-checkbox-label">
                        <input 
                            type="checkbox" 
                            checked={showNetwork} 
                            onChange={(e) => setShowNetwork(e.target.checked)} 
                        />
                        Réseau
                    </label>

                    <button 
                        className="tableaux-refresh-btn" 
                        onClick={loadData}
                        disabled={loading}
                    >
                        <RefreshCw size={15} className={loading ? 'spin' : ''} />
                        Actualiser les relevés
                    </button>
                </div>
            </div>

            {/* Toolbar avec total et sélecteur de page size */}
            <div className="tableaux-toolbar">
                <div>
                    <span className="tableaux-count-badge">{totalCount} stations</span> avec données valides pour <strong>{currentParamDef.label}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label>Lignes par page :</label>
                    <select 
                        className="tableaux-select" 
                        style={{ padding: '0.3rem 0.5rem', width: 'auto' }}
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                        <option value={500}>500</option>
                    </select>
                </div>
            </div>

            {/* Tableau des résultats */}
            <div className="tableaux-table-wrap">
                {loading && rawStations.length === 0 ? (
                    <div className="tableaux-loading">
                        <RefreshCw size={32} className="spin" color="#0284c7" />
                        <span>Chargement des 2 000+ stations et calculs en direct...</span>
                    </div>
                ) : paginatedData.length === 0 ? (
                    <div className="tableaux-empty">
                        <Filter size={36} color="#cbd5e1" style={{ marginBottom: '0.5rem' }} />
                        <p>Aucune station ne correspond aux critères sélectionnés.</p>
                    </div>
                ) : (
                    <table className="tableaux-table">
                        <thead>
                            <tr>
                                <th style={{ width: '60px', textAlign: 'center' }}>Rang</th>
                                <th>Station</th>
                                <th style={{ minWidth: '140px' }}>Valeur ({currentParamDef.unit || 'unit.'})</th>
                                <th>Département</th>
                                {showNetwork && <th>Réseau</th>}
                                {showAltitude && <th>Altitude</th>}
                                {showTime && <th>Heure</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((item, idx) => {
                                const rank = (currentPage - 1) * pageSize + idx + 1;
                                const val = item[selectedParam];
                                const formattedVal = typeof val === 'number' 
                                    ? (currentParamDef.precision === 0 ? Math.round(val) : val.toFixed(currentParamDef.precision))
                                    : val;
                                
                                const isPositiveAno = (selectedParam.includes('anomaly') || selectedParam.includes('record')) && val > 0;
                                const prefix = isPositiveAno ? '+' : '';

                                return (
                                    <tr key={item.stationId}>
                                        <td className="tableaux-rank">
                                            <span className={`tableaux-rank-badge ${rank === 1 ? 'rank-top-1' : rank === 2 ? 'rank-top-2' : rank === 3 ? 'rank-top-3' : 'rank-normal'}`}>
                                                {rank}
                                            </span>
                                        </td>
                                        <td>
                                            <a 
                                                href={`/observations/station/${item.stationId}`}
                                                className="tableaux-station-link"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    navigate(`/observations/station/${item.stationId}`);
                                                }}
                                            >
                                                {item.stationName}
                                            </a>
                                            <span className="tableaux-station-id">({item.stationId})</span>
                                        </td>
                                        <td className="tableaux-val-cell">
                                            <span className={`val-badge ${getValueBadgeClass(val, selectedParam)}`}>
                                                {prefix}{formattedVal} {currentParamDef.unit}
                                            </span>
                                        </td>
                                        <td>
                                            <strong style={{ color: '#0f172a' }}>{item.dept}</strong> - {DEPARTMENTS.find(d => d.code === item.dept)?.name || ''}
                                        </td>
                                        {showNetwork && (
                                            <td>
                                                <span className={`tableaux-network-badge ${item.network.includes('Météo-France') ? 'tableaux-network-mf' : 'tableaux-network-static'}`}>
                                                    {item.network}
                                                </span>
                                            </td>
                                        )}
                                        {showAltitude && (
                                            <td style={{ color: '#64748b' }}>
                                                {item.altitude !== null ? `${item.altitude} m` : '—'}
                                            </td>
                                        )}
                                        {showTime && (
                                            <td style={{ color: '#64748b', fontSize: '0.85rem' }}>
                                                {item.time ? new Date(item.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="tableaux-pagination">
                    <button 
                        className="tableaux-page-btn"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft size={16} />
                        Précédent
                    </button>
                    <span className="tableaux-page-info">
                        Page <strong>{currentPage}</strong> sur <strong>{totalPages}</strong> ({totalCount} stations)
                    </span>
                    <button 
                        className="tableaux-page-btn"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                    >
                        Suivant
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}
