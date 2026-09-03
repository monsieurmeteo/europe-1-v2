import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { weatherAPI, supabase } from '../../services/api';
import { geoService } from '../../services/geoService';
import {
    Thermometer, Wind, Droplets, MapPin,
    ArrowLeft, Activity, Info, Clock,
    ChevronLeft, ChevronRight, Calendar, Table, LineChart as ChartIcon, FileDown, FileText, History,
    Flame, Snowflake, Award, Sun
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, ReferenceLine
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import MonthlyClimateTable from '../climatology/MonthlyClimateTable';
import StationClimArchivesTab from './StationClimArchivesTab';
import { MapDateNavigator } from '../../components/MapDateNavigator';
import stationNamesData from '../../data/stationNames.json';
import stationsMetadata from '../../data/stationsMetadata.json';
import './Observations.css';

export default function StationDetail() {
    const { stationId } = useParams();
    const [fullHistory, setFullHistory] = useState([]);
    const [yesterdayHistory, setYesterdayHistory] = useState([]); // Données J-1
    const [stationInfo, setStationInfo] = useState(() => ({
        id: stationId,
        name: stationNamesData[stationId] || stationId,
        altitude: stationsMetadata[stationId]?.alt || null
    }));
    const [loading, setLoading] = useState(false);
    const [showInfra, setShowInfra] = useState(false);
    const [showComparison, setShowComparison] = useState(false); // Checkbox comparateur
    const [selectedDateStr, setSelectedDateStr] = useState(new Date().toISOString().split('T')[0]);
    const selectedDate = useMemo(() => {
        const [y, m, d] = selectedDateStr.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0);
    }, [selectedDateStr]);
    const [activeTab, setActiveTab] = useState('obs'); // 'obs' or 'climatology'
    const [normals, setNormals] = useState(null);

    useEffect(() => {
        let isCancelled = false;
        async function load() {
            setLoading(true);
            try {
                const todayStr = new Date().toISOString().split('T')[0];
                const isPast = selectedDateStr < todayStr;

                const dY = new Date(selectedDate);
                dY.setDate(dY.getDate() - 1);
                const prevDateStr = `${dY.getFullYear()}-${String(dY.getMonth() + 1).padStart(2, '0')}-${String(dY.getDate()).padStart(2, '0')}`;

                // Chargement en parallèle date sélectionnée + veille J-1
                const [dataRes, dataYRes] = await Promise.all([
                    (async () => {
                        let res = [];
                        if (!isPast) {
                            try { res = await weatherAPI.getStation6mnHistory(stationId, selectedDate); } catch (e) { }
                        }
                        if (!res || res.length === 0) {
                            try {
                                const { meteoFranceClimService } = await import('../../services/meteoFranceClimService');
                                const dpHourly = await meteoFranceClimService.fetchStationHourlyHistory(stationId, selectedDateStr, selectedDateStr);
                                if (dpHourly && dpHourly.length > 0) res = dpHourly;
                            } catch (e) { }
                        }
                        return res || [];
                    })(),
                    (async () => {
                        let res = [];
                        if (prevDateStr === todayStr) {
                            try { res = await weatherAPI.getStation6mnHistory(stationId, dY); } catch (e) { }
                        }
                        if (!res || res.length === 0) {
                            try {
                                const { meteoFranceClimService } = await import('../../services/meteoFranceClimService');
                                const dpHourlyY = await meteoFranceClimService.fetchStationHourlyHistory(stationId, prevDateStr, prevDateStr);
                                if (dpHourlyY && dpHourlyY.length > 0) res = dpHourlyY;
                            } catch (e) { }
                        }
                        return res || [];
                    })()
                ]);

                if (!isCancelled) {
                    setFullHistory(dataRes);
                    setYesterdayHistory(dataYRes);
                }

                // Complément métadonnées en arrière-plan
                if (!stationInfo?.altitude) {
                    supabase.from('stations').select('*').eq('id', stationId).single().then(({ data: meta }) => {
                        if (meta && !isCancelled) {
                            setStationInfo(prev => ({
                                id: stationId,
                                name: prev?.name || meta.name || stationId,
                                altitude: meta.altitude || prev?.altitude
                            }));
                        }
                    }).catch(() => {});
                }

                // Normales climatiques
                if (!normals) {
                    try {
                        const normalsUrl = `https://object.files.data.gouv.fr/meteofrance/data/synchro_ftp/REF_STATION/FICHECLIM_${stationId}.data`;
                        const res = await fetch(normalsUrl);
                        if (res.ok && !isCancelled) {
                            const text = await res.text();
                            const lines = text.split('\n');
                            const parsedNormals = {
                                tx: [], tn: [], pr: [],
                                records: {
                                    maxT: { vals: [], dates: [] },
                                    minT: { vals: [], dates: [] },
                                    maxRain: { vals: [], dates: [] }
                                }
                            };

                            lines.forEach((line, idx) => {
                                if (line.includes('Température maximale (Moyenne en °C)')) {
                                    const vals = lines[idx + 2].split(';').map(v => v.trim()).filter(v => v !== '' && !isNaN(v.replace(',', '.')));
                                    parsedNormals.tx = vals.slice(0, 12).map(v => parseFloat(v.replace(',', '.')));
                                }
                                if (line.includes('Température minimale (Moyenne en °C)')) {
                                    const vals = lines[idx + 2].split(';').map(v => v.trim()).filter(v => v !== '' && !isNaN(v.replace(',', '.')));
                                    parsedNormals.tn = vals.slice(0, 12).map(v => parseFloat(v.replace(',', '.')));
                                }
                                if (line.includes('Précipitations : Hauteur moyenne mensuelle (mm)')) {
                                    const vals = lines[idx + 2].split(';').map(v => v.trim()).filter(v => v !== '' && !isNaN(v.replace(',', '.')));
                                    parsedNormals.pr = vals.slice(0, 12).map(v => parseFloat(v.replace(',', '.')));
                                }
                                if (line.includes('La température la plus élevée (°C)')) {
                                    const vals = lines[idx + 2].split(';').map(v => v.trim()).filter(v => v !== '' && !isNaN(v.replace(',', '.')));
                                    const dates = lines[idx + 3].split(';').map(v => v.trim()).filter(v => v !== '' && !v.includes('Date'));
                                    parsedNormals.records.maxT.vals = vals.map(v => parseFloat(v.replace(',', '.')));
                                    parsedNormals.records.maxT.dates = dates;
                                }
                                if (line.includes('La température la plus basse (°C)')) {
                                    const vals = lines[idx + 2].split(';').map(v => v.trim()).filter(v => v !== '' && !isNaN(v.replace(',', '.')));
                                    const dates = lines[idx + 3].split(';').map(v => v.trim()).filter(v => v !== '' && !v.includes('Date'));
                                    parsedNormals.records.minT.vals = vals.map(v => parseFloat(v.replace(',', '.')));
                                    parsedNormals.records.minT.dates = dates;
                                }
                                if (line.includes('Précipitations : Hauteur quotidienne maximale (mm)')) {
                                    const vals = lines[idx + 2].split(';').map(v => v.trim()).filter(v => v !== '' && !isNaN(v.replace(',', '.')));
                                    const dates = lines[idx + 3].split(';').map(v => v.trim()).filter(v => v !== '' && !v.includes('Date'));
                                    parsedNormals.records.maxRain.vals = vals.map(v => parseFloat(v.replace(',', '.')));
                                    parsedNormals.records.maxRain.dates = dates;
                                }
                            });
                            setNormals(parsedNormals);
                        }
                    } catch (eNorm) { }
                }
            } catch (e) {
                console.error(e);
            } finally {
                if (!isCancelled) setLoading(false);
            }
        }

        load();

        const isToday = selectedDate.toDateString() === new Date().toDateString();
        let interval;
        if (isToday) {
            interval = setInterval(load, 2 * 60 * 1000);
        }
        return () => {
            isCancelled = true;
            if (interval) clearInterval(interval);
        };
    }, [stationId, selectedDateStr]);

    const displayData = useMemo(() => {
        let base;

        if (!showInfra) {
            // 1. On cherche d'abord la liste des heures disponibles avec pile :00
            const exactHourlyData = fullHistory.filter(h => h.time.getMinutes() === 0);

            // 2. On identifie les heures "pleines" de la dernière journée
            const allHoursStr = new Set(exactHourlyData.map(h => `${h.time.getDate()}-${h.time.getHours()}`));

            // 3. Pour chaque 6mn, on rajoute ou complète
            const hourlyMap = new Map();
            fullHistory.forEach(h => {
                const hourId = `${h.time.getDate()}-${h.time.getHours()}`;

                // Si on a déjà une donnée parfaite (pile poil 00) pour cette heure-là, on privilégie
                if (h.time.getMinutes() === 0) {
                    hourlyMap.set(hourId, h);
                } else if (!allHoursStr.has(hourId)) {
                    // Si on n'a PAS de donnée parfaite et qu'on cherche la plus proche de 00
                    const existing = hourlyMap.get(hourId);
                    if (!existing) {
                        hourlyMap.set(hourId, h);
                    } else {
                        // On prend la plus proche entre :06 et :54 (0 et 60)
                        const distH = Math.min(h.time.getMinutes(), 60 - h.time.getMinutes());
                        const distE = Math.min(existing.time.getMinutes(), 60 - existing.time.getMinutes());
                        if (distH < distE) {
                            hourlyMap.set(hourId, h);
                        }
                    }
                }
            });

            // Sort chronological ASCENDING (oldest first, newest last)
            const bestHourlyItems = Array.from(hourlyMap.values()).sort((a, b) => a.time.getTime() - b.time.getTime());

            // ET on cumule la pluie sur l'heure glissante AVANT d'altérer l'heure
            base = bestHourlyItems.map(hourlyItem => {
                const endTime = hourlyItem.time.getTime();
                const startTime = endTime - (60 * 60 * 1000); // 1h avant
                const hourlySegment = fullHistory.filter(d => d.time.getTime() > startTime && d.time.getTime() <= endTime);

                // Somme des pluies des 60 dernières minutes
                const hourlyRain = hourlySegment.reduce((sum, d) => sum + (d.rain || 0), 0);

                // Rafale Max sur l'heure glissante
                const hourlyGust = hourlySegment.length > 0
                    ? Math.max(...hourlySegment.map(d => d.gust || 0))
                    : (hourlyItem.gust || 0);

                // Vent Moyen Max sur l'heure glissante
                const hourlyWindMax = hourlySegment.length > 0
                    ? Math.max(...hourlySegment.map(d => d.wind || 0))
                    : (hourlyItem.wind || 0);

                // Température Max sur l'heure glissante
                const hourlyTempMax = hourlySegment.length > 0
                    ? Math.max(...hourlySegment.map(d => d.temp !== null ? d.temp : -999))
                    : (hourlyItem.temp || -999);

                // Si -999, on garde la valeur instantanée ou null
                const finalTemp = hourlyTempMax > -900 ? hourlyTempMax : hourlyItem.temp;

                // Nettoyage de l'heure pour l'affichage (ex: 16:06 -> 16:00)
                let cleanTime = hourlyItem.time;
                if (hourlyItem.time.getMinutes() !== 0) {
                    cleanTime = new Date(hourlyItem.time);
                    if (cleanTime.getMinutes() > 30) {
                        cleanTime.setHours(cleanTime.getHours() + 1);
                    }
                    cleanTime.setMinutes(0);
                    cleanTime.setSeconds(0);
                }

                return {
                    ...hourlyItem,
                    time: cleanTime,
                    rain: hourlyRain,
                    gust: hourlyGust,
                    wind: hourlyWindMax,
                    temp: finalTemp
                };
            });
        } else {
            // Mode 6mn : Données brutes
            base = fullHistory;
        }

        // Indexer J-1 par "HH:mm" pour jointure rapide
        const yMap = new Map();
        if (showComparison) {
            yesterdayHistory.forEach(h => {
                const key = `${h.time.getHours()}:${h.time.getMinutes()}`;
                yMap.set(key, h);
            });
        }

        // Calculer les indices
        return base.map(h => {
            const windKmH = (h.wind || 0);

            // Windchill (si T < 10)
            let windchill = h.temp;
            if (h.temp !== null && windKmH !== null && h.temp <= 10) {
                windchill = 13.12 + 0.6215 * h.temp - 11.37 * Math.pow(windKmH, 0.16) + 0.3965 * h.temp * Math.pow(windKmH, 0.16);
            }

            // Humidex (si T > 15)
            let humidex = h.temp;
            if (h.temp !== null && h.hum !== null && h.temp >= 15) {
                const e = (6.112 * Math.exp((17.67 * h.temp) / (h.temp + 243.5)) * (h.hum / 100));
                humidex = h.temp + 0.5555 * (e - 10.0);
            }

            const timeKey = `${h.time.getHours()}:${h.time.getMinutes()}`;
            const yData = showComparison ? yMap.get(timeKey) : null;

            return {
                ...h,
                humidex: Math.round(humidex * 10) / 10,
                windchill: Math.round(windchill * 10) / 10,
                tempY: yData ? yData.temp : null // Température J-1
            };
        });
    }, [fullHistory, yesterdayHistory, showInfra, showComparison]);

    const stats = useMemo(() => {
        if (!fullHistory.length) return {};

        // --- CALCULS Journée Civile (00h-24h Locale) ---
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const combinedHistory = [...yesterdayHistory, ...fullHistory];

        const obsCivil = combinedHistory.filter(o => {
            const t = o.time.getTime();
            return t >= startOfDay.getTime() && t <= endOfDay.getTime();
        });

        // Extraction Tx (Civil)
        const txVals = obsCivil.map(o => o.temp).filter(v => v !== null);
        const tx = txVals.length > 0 ? Math.max(...txVals) : null;

        // Extraction Tn (Civil)
        const tnVals = obsCivil.map(o => o.temp).filter(v => v !== null);
        const tn = tnVals.length > 0 ? Math.min(...tnVals) : null;

        // Rafale Max (Civil)
        const gusts = obsCivil.map(h => h.gust).filter(g => g !== null);
        const maxGust = gusts.length > 0 ? Math.max(...gusts) : 0;

        // RR (Civil)
        const totalRain = obsCivil.reduce((acc, h) => acc + (h.rain > 0 ? h.rain : 0), 0);

        // Soleil (Civil)
        const totalSun = obsCivil.reduce((acc, h) => acc + (h.sun > 0 ? h.sun : 0), 0);

        // Humidité Moyenne
        const hums = obsCivil.map(o => o.hum).filter(v => v !== null);
        const avgHum = hums.length > 0 ? hums.reduce((a, b) => a + b, 0) / hums.length : null;

        // Pression
        const pressures = obsCivil.map(o => o.pressure).filter(v => v !== null);
        const maxPres = pressures.length > 0 ? Math.max(...pressures) : null;
        const minPres = pressures.length > 0 ? Math.min(...pressures) : null;

        let maxTTime = null;
        let minTTime = null;
        let maxGustTime = null;
        let maxGustDir = null;
        let maxWind = 0;
        let maxHum = null;
        let minHum = null;
        let maxHumidex = null;
        let minWindchill = null;
        let maxDewpoint = null;
        let minDewpoint = null;

        obsCivil.forEach(o => {
            if (o.temp !== null && o.temp === tx && !maxTTime) {
                maxTTime = o.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            }
            if (o.temp !== null && o.temp === tn && !minTTime) {
                minTTime = o.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            }
            if (o.gust !== null && o.gust === maxGust && !maxGustTime) {
                maxGustTime = o.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                maxGustDir = o.dir;
            }
            if (o.wind !== null && o.wind > maxWind) {
                maxWind = o.wind;
            }
            if (o.hum !== null) {
                if (maxHum === null || o.hum > maxHum) maxHum = o.hum;
                if (minHum === null || o.hum < minHum) minHum = o.hum;
            }
            if (o.humidex !== null && o.humidex !== undefined) {
                if (maxHumidex === null || o.humidex > maxHumidex) maxHumidex = o.humidex;
            }
            if (o.windchill !== null && o.windchill !== undefined) {
                if (minWindchill === null || o.windchill < minWindchill) minWindchill = o.windchill;
            }
            if (o.dewpoint !== null && o.dewpoint !== undefined) {
                if (maxDewpoint === null || o.dewpoint > maxDewpoint) maxDewpoint = o.dewpoint;
                if (minDewpoint === null || o.dewpoint < minDewpoint) minDewpoint = o.dewpoint;
            }
        });

        const avgTemp = (tx !== null && tn !== null) ? (tx + tn) / 2 : null;
        const amplitude = (tx !== null && tn !== null) ? (tx - tn) : null;

        return {
            maxT: tx,
            maxTTime,
            minT: tn,
            minTTime,
            avgTemp,
            amplitude,
            maxGust: maxGust,
            maxGustTime,
            maxGustDir,
            maxWind,
            totalRain: totalRain,
            totalSun: totalSun,
            avgHum: avgHum,
            maxHum,
            minHum,
            maxHumidex,
            minWindchill,
            maxDewpoint,
            minDewpoint,
            maxPres: maxPres,
            minPres: minPres,
            minVis: obsCivil.map(o => o.vv).filter(v => v !== null).length > 0 ? Math.min(...obsCivil.map(o => o.vv).filter(v => v !== null)) : null
        };
    }, [fullHistory, yesterdayHistory, selectedDate]);

    // Données de Normales & Records pour le mois sélectionné
    const monthIdx = selectedDate.getMonth(); // 0-11
    const monthNames = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    const currentMonthName = monthNames[monthIdx];

    const currentNormTx = (typeof normals?.tx?.[monthIdx] === 'number' && !isNaN(normals.tx[monthIdx])) ? normals.tx[monthIdx] : null;
    const currentNormTn = (typeof normals?.tn?.[monthIdx] === 'number' && !isNaN(normals.tn[monthIdx])) ? normals.tn[monthIdx] : null;
    const currentNormPr = (typeof normals?.pr?.[monthIdx] === 'number' && !isNaN(normals.pr[monthIdx])) ? normals.pr[monthIdx] : null;

    const diffTx = (typeof stats.maxT === 'number' && !isNaN(stats.maxT) && typeof currentNormTx === 'number' && !isNaN(currentNormTx)) ? (stats.maxT - currentNormTx) : null;
    const diffTn = (typeof stats.minT === 'number' && !isNaN(stats.minT) && typeof currentNormTn === 'number' && !isNaN(currentNormTn)) ? (stats.minT - currentNormTn) : null;

    const monthRecMaxT = (typeof normals?.records?.maxT?.vals?.[monthIdx] === 'number' && !isNaN(normals.records.maxT.vals[monthIdx])) ? normals.records.maxT.vals[monthIdx] : null;
    const monthRecMaxTDate = normals?.records?.maxT?.dates?.[monthIdx] ?? null;

    const monthRecMinT = (typeof normals?.records?.minT?.vals?.[monthIdx] === 'number' && !isNaN(normals.records.minT.vals[monthIdx])) ? normals.records.minT.vals[monthIdx] : null;
    const monthRecMinTDate = normals?.records?.minT?.dates?.[monthIdx] ?? null;

    const monthRecRain = (typeof normals?.records?.maxRain?.vals?.[monthIdx] === 'number' && !isNaN(normals.records.maxRain.vals[monthIdx])) ? normals.records.maxRain.vals[monthIdx] : null;
    const monthRecRainDate = normals?.records?.maxRain?.dates?.[monthIdx] ?? null;

    const [chartMode, setChartMode] = useState('temp'); // 'temp' | 'wind' | 'rain_pres'
    const [showNormalsTable, setShowNormalsTable] = useState(false);

    // Formateur ultra-sécurisé anti-crash
    const fmt = (v, precision = 1, unit = '') => {
        if (typeof v === 'number' && !isNaN(v)) {
            return `${precision === 0 ? Math.round(v) : v.toFixed(precision)}${unit}`;
        }
        return '--';
    };

    const handleDownloadPDF = () => {
        const doc = new jsPDF();
        const stationName = stationInfo?.name || stationId;
        const dateStr = selectedDate.toLocaleDateString('fr-FR');

        doc.setFontSize(16);
        doc.text(`Rapport Météo : ${stationName}`, 14, 20);
        doc.setFontSize(11);
        doc.text(`Date : ${dateStr} - Station ID : ${stationId}`, 14, 28);

        // Summary Stats
        doc.setFontSize(10);
        doc.text(`Tx : ${fmt(stats.maxT, 1)}°C (${stats.maxTTime || '--'}) | Tn : ${fmt(stats.minT, 1)}°C (${stats.minTTime || '--'}) | Rafale Max : ${stats.maxGust || '--'} km/h | Pluie 24h : ${fmt(stats.totalRain, 1)} mm`, 14, 38);

        const tableData = displayData.map(h => [
            h.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            fmt(h.temp, 1),
            fmt(h.dewpoint, 1),
            (h.hum != null ? `${h.hum}%` : '--'),
            (h.wind != null ? `${Math.round(h.wind)} km/h` : '--'),
            (h.gust != null ? `${Math.round(h.gust)} km/h` : '--'),
            fmt(h.rain, 1),
            fmt(h.pressure, 1),
            (h.vv != null && !isNaN(h.vv) ? fmt(h.vv / 1000, 1) : '--')
        ]);

        autoTable(doc, {
            startY: 48,
            head: [['Heure', 'Temp. (°C)', 'Pt. Rosée', 'Hum.', 'Vent', 'Raf.', 'Pluie', 'Pres.', 'Vis. (km)']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] },
            styles: { fontSize: 9 },
        });

        doc.save(`meteo_${stationName}_${dateStr.replace(/\//g, '-')}.pdf`);
    };

    return (
        <div className="station-detail-v2 animate-fade-in">
            {/* TOP HEADER */}
            <header className="detail-header">
                <div className="header-left">
                    <div className="title-row">
                        <div className="blue-bar"></div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h1>Observations météo à {stationInfo?.name}</h1>
                                {loading && (
                                    <Activity className="spin" size={20} style={{ color: '#2563eb' }} title="Actualisation des données en arrière-plan..." />
                                )}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#64748b', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <span>Station ID: {stationId}</span>
                                {stationInfo?.altitude && (
                                    <>
                                        <span>•</span>
                                        <span>Alt. {stationInfo.altitude}m</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="header-right buttons">
                    <a
                        href={`https://donneespubliques.meteofrance.fr/FichesClim/FICHECLIM_${stationId}.pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-outline decoration-none"
                        style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                    >
                        <FileText size={16} style={{ marginRight: '8px' }} />
                        Fiche Climatologique (PDF)
                    </a>
                    <button className="btn-outline" onClick={handleDownloadPDF} style={{ display: 'flex', alignItems: 'center' }}>
                        <FileDown size={16} style={{ marginRight: '8px' }} />
                        Exporter Rapport PDF
                    </button>
                </div>
            </header>

            {/* TAB SELECTOR */}
            <div className="detail-tabs">
                <button
                    className={`tab-btn ${activeTab === 'obs' ? 'active' : ''}`}
                    onClick={() => setActiveTab('obs')}
                >
                    <Table size={16} style={{ marginBottom: '-2px', marginRight: '6px' }} />
                    Relevés & Graphiques du Jour
                </button>
                <button
                    className={`tab-btn ${activeTab === 'climatology' ? 'active' : ''}`}
                    onClick={() => setActiveTab('climatology')}
                >
                    <Calendar size={16} style={{ marginBottom: '-2px', marginRight: '6px' }} />
                    Bilan Climatologique Mensuel
                </button>
                <button
                    className={`tab-btn ${activeTab === 'archives' ? 'active' : ''}`}
                    onClick={() => setActiveTab('archives')}
                >
                    <History size={16} style={{ marginBottom: '-2px', marginRight: '6px' }} />
                    Archives Météo-France (1950 - Hier)
                </button>
            </div>

            {/* DATE SELECTOR (Only for Obs) */}
            {activeTab === 'obs' && (
                <div style={{ margin: '15px 0' }}>
                    <MapDateNavigator
                        selectedDate={selectedDateStr}
                        onChangeDate={(newDate) => setSelectedDateStr(newDate)}
                        accentColor="#2563eb"
                    />
                </div>
            )}



            {/* OBS CONTENT */}
            {activeTab === 'obs' && (
                <>
                    {/* SECTION 1 : 4 SUPER-CARDS CLIMATOLOGIQUES AVEC NORMALES & RECORDS */}
                    <div className="climat-pro-grid">
                        {/* CARTE TX */}
                        <div className="climat-pro-card red-theme">
                            <div className="card-top">
                                <span className="card-title">Température Maximale (Tx)</span>
                                <Flame size={20} className="icon-badge red" />
                            </div>
                            <div className="main-metric">
                                <span className="metric-val red">
                                    {fmt(stats.maxT, 1)}
                                </span>
                                <span className="metric-unit">°C</span>
                                {stats.maxTTime && (
                                    <span className="metric-time">à {stats.maxTTime}</span>
                                )}
                            </div>
                            <div className="card-sub-stats">
                                <div className="sub-stat-row">
                                    <span className="sub-label">Normale 1991-2020 ({currentMonthName}) :</span>
                                    <span className="sub-value">{currentNormTx !== null ? `${fmt(currentNormTx, 1)}°C` : '--'}</span>
                                </div>
                                {diffTx !== null && (
                                    <div className="sub-stat-row">
                                        <span className="sub-label">Écart à la normale :</span>
                                        <span className={`diff-badge ${diffTx >= 0 ? 'hot' : 'cold'}`}>
                                            {diffTx >= 0 ? `+${fmt(diffTx, 1)}°C` : `${fmt(diffTx, 1)}°C`}
                                        </span>
                                    </div>
                                )}
                                {monthRecMaxT !== null && (
                                    <div className="sub-stat-row record-row">
                                        <span className="sub-label">Record {currentMonthName} :</span>
                                        <span className="sub-value record-val">{fmt(monthRecMaxT, 1)}°C <small>({monthRecMaxTDate || '--'})</small></span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* CARTE TN */}
                        <div className="climat-pro-card blue-theme">
                            <div className="card-top">
                                <span className="card-title">Température Minimale (Tn)</span>
                                <Snowflake size={20} className="icon-badge blue" />
                            </div>
                            <div className="main-metric">
                                <span className="metric-val blue">
                                    {fmt(stats.minT, 1)}
                                </span>
                                <span className="metric-unit">°C</span>
                                {stats.minTTime && (
                                    <span className="metric-time">à {stats.minTTime}</span>
                                )}
                            </div>
                            <div className="card-sub-stats">
                                <div className="sub-stat-row">
                                    <span className="sub-label">Normale 1991-2020 ({currentMonthName}) :</span>
                                    <span className="sub-value">{currentNormTn !== null ? `${fmt(currentNormTn, 1)}°C` : '--'}</span>
                                </div>
                                {diffTn !== null && (
                                    <div className="sub-stat-row">
                                        <span className="sub-label">Écart à la normale :</span>
                                        <span className={`diff-badge ${diffTn >= 0 ? 'hot' : 'cold'}`}>
                                            {diffTn >= 0 ? `+${fmt(diffTn, 1)}°C` : `${fmt(diffTn, 1)}°C`}
                                        </span>
                                    </div>
                                )}
                                {monthRecMinT !== null && (
                                    <div className="sub-stat-row record-row">
                                        <span className="sub-label">Record {currentMonthName} :</span>
                                        <span className="sub-value record-val">{fmt(monthRecMinT, 1)}°C <small>({monthRecMinTDate || '--'})</small></span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* CARTE RAFALE */}
                        <div className="climat-pro-card orange-theme">
                            <div className="card-top">
                                <span className="card-title">Rafale Maximale (FXI)</span>
                                <Wind size={20} className="icon-badge orange" />
                            </div>
                            <div className="main-metric">
                                <span className="metric-val orange">
                                    {stats.hasWind && typeof stats.maxGust === 'number' && !isNaN(stats.maxGust) ? Math.round(stats.maxGust) : <span style={{ fontSize: '1.2rem', color: '#94a3b8', fontStyle: 'italic' }}>Non mesuré</span>}
                                </span>
                                {stats.hasWind && <span className="metric-unit">km/h</span>}
                                {stats.hasWind && stats.maxGustTime && (
                                    <span className="metric-time">à {stats.maxGustTime}</span>
                                )}
                            </div>
                            <div className="card-sub-stats">
                                <div className="sub-stat-row">
                                    <span className="sub-label">Vent moyen maximal :</span>
                                    <span className="sub-value">{stats.hasWind && stats.maxWind ? `${Math.round(stats.maxWind)} km/h` : (stats.hasWind ? '--' : 'Non mesuré')}</span>
                                </div>
                                <div className="sub-stat-row">
                                    <span className="sub-label">Direction de la rafale :</span>
                                    <span className="sub-value">{stats.hasWind && stats.maxGustDir !== null ? `${stats.maxGustDir}°` : (stats.hasWind ? '--' : 'Non mesuré')}</span>
                                </div>
                                <div className="sub-stat-row">
                                    <span className="sub-label">Poste anémomètre :</span>
                                    <span className="sub-value">{stats.hasWind ? 'Opérationnel' : 'Non équipé'}</span>
                                </div>
                            </div>
                        </div>

                        {/* CARTE PLUIE */}
                        <div className="climat-pro-card cyan-theme">
                            <div className="card-top">
                                <span className="card-title">Précipitations (24h)</span>
                                <Droplets size={20} className="icon-badge cyan" />
                            </div>
                            <div className="main-metric">
                                <span className="metric-val cyan">
                                    {stats.hasRain && typeof stats.totalRain === 'number' && !isNaN(stats.totalRain) ? fmt(stats.totalRain, 1) : <span style={{ fontSize: '1.2rem', color: '#94a3b8', fontStyle: 'italic' }}>Non mesuré</span>}
                                </span>
                                {stats.hasRain && <span className="metric-unit">mm</span>}
                                {stats.hasRain && <span className="metric-time">Cumul 24h</span>}
                            </div>
                            <div className="card-sub-stats">
                                <div className="sub-stat-row">
                                    <span className="sub-label">Normale Mensuelle ({currentMonthName}) :</span>
                                    <span className="sub-value">{currentNormPr !== null ? `${fmt(currentNormPr, 1)} mm` : '--'}</span>
                                </div>
                                {monthRecRain !== null && (
                                    <div className="sub-stat-row record-row">
                                        <span className="sub-label">Record 24h ({currentMonthName}) :</span>
                                        <span className="sub-value record-val">{fmt(monthRecRain, 1)} mm <small>({monthRecRainDate || '--'})</small></span>
                                    </div>
                                )}
                                <div className="sub-stat-row">
                                    <span className="sub-label">Humidité moyenne :</span>
                                    <span className="sub-value">{stats.avgHum ? `${Math.round(stats.avgHum)}%` : '--'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECTION 2 : 8 INDICATEURS COMPLÉMENTAIRES D'EXPERTISE */}
                    <div className="indicators-compact-row">
                        <div className="ind-pill">
                            <span className="ind-label">T° Moyenne</span>
                            <span className="ind-val">{fmt(stats.avgTemp, 1, '°C')}</span>
                        </div>
                        <div className="ind-pill">
                            <span className="ind-label">Amplitude</span>
                            <span className="ind-val">{fmt(stats.amplitude, 1, '°C')}</span>
                        </div>
                        <div className="ind-pill">
                            <span className="ind-label">Humidex Max</span>
                            <span className="ind-val" style={{ color: stats.maxHumidex > 30 ? '#ea580c' : 'inherit' }}>
                                {fmt(stats.maxHumidex, 1)}
                            </span>
                        </div>
                        <div className="ind-pill">
                            <span className="ind-label">Windchill Min</span>
                            <span className="ind-val" style={{ color: stats.minWindchill < 10 ? '#2563eb' : 'inherit' }}>
                                {fmt(stats.minWindchill, 1)}
                            </span>
                        </div>
                        <div className="ind-pill">
                            <span className="ind-label">Humidité Min/Max</span>
                            <span className="ind-val">{stats.minHum !== null && stats.maxHum !== null ? `${stats.minHum}% / ${stats.maxHum}%` : '--'}</span>
                        </div>
                        <div className="ind-pill">
                            <span className="ind-label">Pt Rosée Min/Max</span>
                            <span className="ind-val">{stats.minDewpoint !== null && stats.maxDewpoint !== null ? `${fmt(stats.minDewpoint, 1)}° / ${fmt(stats.maxDewpoint, 1)}°` : '--'}</span>
                        </div>
                        <div className="ind-pill">
                            <span className="ind-label">Pression Min/Max</span>
                            <span className="ind-val">{stats.hasPres && stats.minPres !== null && stats.maxPres !== null ? `${fmt(stats.minPres, 0)} / ${fmt(stats.maxPres, 0)} hPa` : (stats.hasPres ? '--' : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>Non mesuré</span>)}</span>
                        </div>
                        <div className="ind-pill">
                            <span className="ind-label">Ensoleillement</span>
                            <span className="ind-val" style={{ color: '#eab308' }}>
                                {stats.hasSun && typeof stats.totalSun === 'number' && !isNaN(stats.totalSun) ? `${fmt(stats.totalSun / 60, 1)} h` : (stats.hasSun ? '--' : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>Non mesuré</span>)}
                            </span>
                        </div>
                    </div>

                    {/* SECTION 3 : TABLEAU CLIMATOLOGIQUE DÉPLIABLE DES NORMALES & RECORDS 12 MOIS */}
                    {normals && (
                        <div className="normals-toggle-box">
                            <button
                                className="btn-normals-toggle"
                                onClick={() => setShowNormalsTable(!showNormalsTable)}
                            >
                                <Award size={18} style={{ color: '#2563eb' }} />
                                <span>{showNormalsTable ? 'Masquer' : 'Afficher'} le tableau officiel des Normales 1991-2020 & Records Météo-France (12 mois)</span>
                                <ChevronRight size={18} style={{ transform: showNormalsTable ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>

                            {showNormalsTable && (
                                <div className="normals-table-wrapper animate-fade-in card">
                                    <table className="normals-full-table">
                                        <thead>
                                            <tr>
                                                <th>Mois</th>
                                                <th>Tn Normale</th>
                                                <th>Tx Normale</th>
                                                <th>Précip. Norm.</th>
                                                <th>Record Chaud (Tx)</th>
                                                <th>Record Froid (Tn)</th>
                                                <th>Record Pluie (24h)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {monthNames.map((mName, i) => (
                                                <tr key={i} className={i === monthIdx ? 'active-month-row' : ''}>
                                                    <td className="month-name-col">
                                                        <strong>{mName}</strong>
                                                        {i === monthIdx && <span className="active-badge">Mois actuel</span>}
                                                    </td>
                                                    <td className="blue-val">{typeof normals.tn?.[i] === 'number' && !isNaN(normals.tn[i]) ? `${normals.tn[i].toFixed(1)}°C` : '--'}</td>
                                                    <td className="red-val">{typeof normals.tx?.[i] === 'number' && !isNaN(normals.tx[i]) ? `${normals.tx[i].toFixed(1)}°C` : '--'}</td>
                                                    <td className="cyan-val">{typeof normals.pr?.[i] === 'number' && !isNaN(normals.pr[i]) ? `${normals.pr[i].toFixed(1)} mm` : '--'}</td>
                                                    <td className="record-col">
                                                        <strong>{typeof normals.records?.maxT?.vals?.[i] === 'number' && !isNaN(normals.records.maxT.vals[i]) ? `${normals.records.maxT.vals[i].toFixed(1)}°C` : '--'}</strong>
                                                        <small>{normals.records?.maxT?.dates?.[i] || ''}</small>
                                                    </td>
                                                    <td className="record-col">
                                                        <strong>{typeof normals.records?.minT?.vals?.[i] === 'number' && !isNaN(normals.records.minT.vals[i]) ? `${normals.records.minT.vals[i].toFixed(1)}°C` : '--'}</strong>
                                                        <small>{normals.records?.minT?.dates?.[i] || ''}</small>
                                                    </td>
                                                    <td className="record-col">
                                                        <strong>{typeof normals.records?.maxRain?.vals?.[i] === 'number' && !isNaN(normals.records.maxRain.vals[i]) ? `${normals.records.maxRain.vals[i].toFixed(1)} mm` : '--'}</strong>
                                                        <small>{normals.records?.maxRain?.dates?.[i] || ''}</small>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="main-obs-layout">
                        {/* LEFT COLUMN: TABLE */}
                        <div className="data-column table-section">
                            <div className="section-head">
                                <h3><Table size={18} /> Relevés météo détaillés</h3>
                                <div className="table-filters">
                                    <label className="switch-label">
                                        <span>Données 6 mins</span>
                                        <input type="checkbox" checked={showInfra} onChange={() => setShowInfra(!showInfra)} />
                                        <span className="slider"></span>
                                    </label>
                                </div>
                            </div>

                            <div className="table-wrapper card">
                                <table className="obs-table">
                                    <thead>
                                        <tr>
                                            <th>Heure</th>
                                            <th>Temp. (°C)</th>
                                            <th>Hum. (%)</th>
                                            <th>Pt. Rosée</th>
                                            <th>Humidex</th>
                                            <th>Windchill</th>
                                            <th colSpan="2">Vent (raf/moy)</th>
                                            <th>Pression</th>
                                            <th>Soleil (min)</th>
                                            <th>Vis. (km)</th>
                                            <th>Pluie (1h/6mn)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayData.slice().reverse().map((h, i, arr) => {
                                            const prev = arr[i + 1];
                                            const trend = (prev && h.pressure && prev.pressure)
                                                ? (h.pressure > prev.pressure ? '↗' : h.pressure < prev.pressure ? '↘' : '→')
                                                : null;

                                            return (
                                                <tr key={i} className={h.time.getMinutes() === 0 ? 'hour-row' : ''}>
                                                    <td className="time-col" style={{ fontSize: '0.8rem' }}>
                                                        {h.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                    <td className="temp-col" style={{
                                                        color: h.temp === stats.maxT ? '#ef4444' : h.temp === stats.minT ? '#3b82f6' : '#1e293b',
                                                        fontWeight: (h.temp === stats.maxT || h.temp === stats.minT) ? '700' : '500',
                                                        background: h.temp === stats.maxT ? 'rgba(239, 68, 68, 0.05)' : h.temp === stats.minT ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                                                    }}>
                                                        {typeof h.temp === 'number' && !isNaN(h.temp) ? h.temp.toFixed(1) : '--'}
                                                    </td>
                                                    <td style={{ color: '#64748b' }}>{h.hum != null ? <>{h.hum}<small>%</small></> : <span style={{ color: '#cbd5e1' }}>--</span>}</td>
                                                    <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{typeof h.dewpoint === 'number' && !isNaN(h.dewpoint) ? h.dewpoint.toFixed(1) : '--'}</td>
                                                    <td style={{
                                                        background: h.humidex > h.temp ? 'rgba(234, 88, 12, 0.04)' : 'transparent',
                                                        color: h.humidex > h.temp ? '#ea580c' : '#94a3b8',
                                                        fontWeight: h.humidex > h.temp ? '600' : '400'
                                                    }}>
                                                        {typeof h.humidex === 'number' && !isNaN(h.humidex) ? h.humidex.toFixed(1) : '--'}
                                                    </td>
                                                    <td style={{
                                                        background: h.windchill < h.temp ? 'rgba(37, 99, 235, 0.04)' : 'transparent',
                                                        color: h.windchill < h.temp ? '#2563eb' : '#94a3b8',
                                                        fontWeight: h.windchill < h.temp ? '600' : '400'
                                                    }}>
                                                        {typeof h.windchill === 'number' && !isNaN(h.windchill) ? h.windchill.toFixed(1) : '--'}
                                                    </td>
                                                    <td style={{ width: '24px', paddingRight: '0' }}>
                                                        {h.dir != null ? (
                                                            <svg viewBox="0 0 24 24" width="14" height="14" style={{ transform: `rotate(${h.dir + 180}deg)`, color: '#64748b' }}>
                                                                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="currentColor" />
                                                            </svg>
                                                        ) : <span style={{ color: '#cbd5e1' }}>--</span>}
                                                    </td>
                                                    <td className="wind-col" style={{ textAlign: 'left', paddingLeft: '4px', whiteSpace: 'nowrap' }}>
                                                        {h.gust != null || h.wind != null ? (
                                                            <>
                                                                <span style={{ fontWeight: '700', color: '#1e293b' }}>{h.gust != null ? Math.round(h.gust) : '--'}</span>
                                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '4px' }}>({h.wind != null ? Math.round(h.wind) : '--'})</span>
                                                                <small style={{ fontSize: '0.65rem', color: '#cbd5e1', marginLeft: '2px' }}>km/h</small>
                                                            </>
                                                        ) : <span style={{ color: '#cbd5e1' }}>--</span>}
                                                    </td>
                                                    <td className="pres-col" style={{ fontSize: '0.85rem' }}>
                                                        {typeof h.pressure === 'number' && !isNaN(h.pressure) ? h.pressure.toFixed(1) : <span style={{ color: '#cbd5e1' }}>--</span>}
                                                        {trend && (
                                                            <span style={{
                                                                marginLeft: '4px',
                                                                color: trend === '↗' ? '#22c55e' : trend === '↘' ? '#ef4444' : '#94a3b8',
                                                                fontSize: '1rem'
                                                            }}>
                                                                {trend}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ fontSize: '0.85rem', color: '#eab308', fontWeight: '500' }}>
                                                        {h.sun != null ? h.sun : <span style={{ color: '#cbd5e1' }}>--</span>}
                                                    </td>
                                                    <td style={{ fontSize: '0.85rem', color: '#6366f1', fontWeight: '600' }}>
                                                        {h.vv != null ? (h.vv / 1000).toFixed(1) : <span style={{ color: '#cbd5e1' }}>--</span>}
                                                    </td>
                                                    <td className={h.rain > 0 ? 'rain-val' : ''} style={{ fontSize: '0.85rem' }}>
                                                        {typeof h.rain === 'number' && !isNaN(h.rain) ? (
                                                            h.rain > 0 ? <strong>{h.rain.toFixed(1)}</strong> : <span style={{ color: '#cbd5e1' }}>0.0</span>
                                                        ) : <span style={{ color: '#cbd5e1' }}>--</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: PROFESSIONAL CHARTS */}
                        <div className="data-column charts-section">
                            <div className="chart-mode-tabs">
                                <button
                                    className={`chart-tab-btn ${chartMode === 'temp' ? 'active' : ''}`}
                                    onClick={() => setChartMode('temp')}
                                >
                                    <Thermometer size={14} /> Températures & Ressenti
                                </button>
                                <button
                                    className={`chart-tab-btn ${chartMode === 'wind' ? 'active' : ''}`}
                                    onClick={() => setChartMode('wind')}
                                >
                                    <Wind size={14} /> Vent & Rafales
                                </button>
                                <button
                                    className={`chart-tab-btn ${chartMode === 'rain_pres' ? 'active' : ''}`}
                                    onClick={() => setChartMode('rain_pres')}
                                >
                                    <Droplets size={14} /> Pluie & Pression
                                </button>
                            </div>

                            {/* CHART 1: TEMP & HUMIDEX & DEWPOINT */}
                            {chartMode === 'temp' && (
                                <div className="mini-chart-card card animate-fade-in">
                                    <div className="chart-header-row">
                                        <h4>ÉVOLUTION DE LA TEMPÉRATURE (°C)</h4>
                                        <div className="chart-legend-pills">
                                            <span className="legend-dot temp"></span> Température
                                            <span className="legend-dot humidex"></span> Humidex
                                            <span className="legend-dot dew"></span> Pt Rosée
                                        </div>
                                    </div>
                                    <ResponsiveContainer width="100%" height={340}>
                                        <AreaChart data={displayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis dataKey="time" tickFormatter={(t) => t.getHours() + 'h'} fontSize={11} minTickGap={30} stroke="#94a3b8" />
                                            <YAxis fontSize={11} domain={['auto', 'auto']} unit="°" stroke="#94a3b8" />
                                            <Tooltip
                                                contentStyle={{ background: '#0f172a', borderRadius: '8px', color: '#fff', border: 'none', fontSize: '0.85rem' }}
                                                labelFormatter={(t) => t.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                            />
                                            {typeof currentNormTx === 'number' && !isNaN(currentNormTx) && (
                                                <ReferenceLine y={currentNormTx} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Normale Tx (${currentNormTx.toFixed(1)}°)`, fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
                                            )}
                                            {typeof currentNormTn === 'number' && !isNaN(currentNormTn) && (
                                                <ReferenceLine y={currentNormTn} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: `Normale Tn (${currentNormTn.toFixed(1)}°)`, fill: '#3b82f6', fontSize: 10, position: 'insideBottomRight' }} />
                                            )}
                                            <Area type="monotone" dataKey="temp" stroke="#ef4444" fill="url(#tempGradient)" strokeWidth={2.5} dot={false} name="Température" />
                                            <Line type="monotone" dataKey="humidex" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="3 3" name="Humidex" />
                                            <Line type="monotone" dataKey="dewpoint" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="Pt Rosée" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* CHART 2: WIND & GUSTS */}
                            {chartMode === 'wind' && (
                                <div className="mini-chart-card card animate-fade-in">
                                    <div className="chart-header-row">
                                        <h4>VENT MOYEN ET RAFALES MAXIMALES (KM/H)</h4>
                                        <div className="chart-legend-pills">
                                            <span className="legend-dot gust"></span> Rafales
                                            <span className="legend-dot wind"></span> Vent moyen
                                        </div>
                                    </div>
                                    <ResponsiveContainer width="100%" height={340}>
                                        <AreaChart data={displayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="gustGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis dataKey="time" tickFormatter={(t) => t.getHours() + 'h'} fontSize={11} minTickGap={30} stroke="#94a3b8" />
                                            <YAxis fontSize={11} domain={[0, 'auto']} unit=" km/h" stroke="#94a3b8" />
                                            <Tooltip
                                                contentStyle={{ background: '#0f172a', borderRadius: '8px', color: '#fff', border: 'none', fontSize: '0.85rem' }}
                                                labelFormatter={(t) => t.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                            />
                                            <Area type="monotone" dataKey="gust" stroke="#f97316" fill="url(#gustGradient)" strokeWidth={2} dot={false} name="Rafale Max" />
                                            <Line type="monotone" dataKey="wind" stroke="#475569" strokeWidth={2} dot={false} name="Vent Moyen" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* CHART 3: RAIN & PRESSURE */}
                            {chartMode === 'rain_pres' && (
                                <div className="mini-chart-card card animate-fade-in">
                                    <div className="chart-header-row">
                                        <h4>PRÉCIPITATIONS (MM) & PRESSION BAROMÉTRIQUE (HPA)</h4>
                                        <div className="chart-legend-pills">
                                            <span className="legend-dot rain"></span> Pluie
                                            <span className="legend-dot pressure"></span> Pression
                                        </div>
                                    </div>
                                    <ResponsiveContainer width="100%" height={340}>
                                        <BarChart data={displayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis dataKey="time" tickFormatter={(t) => t.getHours() + 'h'} fontSize={11} minTickGap={30} stroke="#94a3b8" />
                                            <YAxis yAxisId="rain" fontSize={11} unit=" mm" stroke="#0ea5e9" orientation="left" />
                                            <Tooltip
                                                contentStyle={{ background: '#0f172a', borderRadius: '8px', color: '#fff', border: 'none', fontSize: '0.85rem' }}
                                                labelFormatter={(t) => t.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                            />
                                            <Bar yAxisId="rain" dataKey="rain" fill="#0ea5e9" name="Pluie" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* CLIMATOLOGY CONTENT */}
            {activeTab === 'climatology' && (
                <MonthlyClimateTable
                    stationId={stationId}
                    stationName={stationInfo?.name || stationId}
                />
            )}

            {/* ARCHIVES CLIMATOLOGIQUES METEO-FRANCE CONTENT */}
            {activeTab === 'archives' && (
                <StationClimArchivesTab
                    stationId={stationId}
                    stationName={stationInfo?.name || stationId}
                />
            )}

            <footer className="obs-footer">
                Données via Météo-France
            </footer>
        </div>
    );
}
