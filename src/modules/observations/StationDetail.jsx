import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { weatherAPI, supabase } from '../../services/api';
import { geoService } from '../../services/geoService';
import {
    Thermometer, Wind, Droplets, MapPin,
    ArrowLeft, Activity, Info, Clock,
    ChevronLeft, ChevronRight, Calendar, Table, LineChart as ChartIcon, FileDown, FileText, History
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar
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

        return {
            maxT: tx,
            minT: tn,
            maxGust: maxGust,
            totalRain: totalRain,
            totalSun: totalSun,
            avgHum: avgHum,
            maxPres: maxPres,
            minPres: minPres,
            minVis: obsCivil.map(o => o.vv).filter(v => v !== null).length > 0 ? Math.min(...obsCivil.map(o => o.vv).filter(v => v !== null)) : null
        };
    }, [fullHistory, yesterdayHistory, selectedDate]);

    const handleDownloadPDF = () => {
        const doc = new jsPDF();
        const stationName = stationInfo?.name || stationId;
        const dateStr = selectedDate.toLocaleDateString('fr-FR');

        // Title
        doc.setFontSize(18);
        doc.text(`Rapport Météo - ${stationName}`, 14, 20);
        doc.setFontSize(12);
        doc.text(`Date : ${dateStr}`, 14, 30);
        doc.text(`Station ID : ${stationId}`, 14, 36);

        // Summary Stats
        doc.setFontSize(14);
        doc.text('Résumé de la journée', 14, 48);
        doc.setFontSize(10);
        doc.text(`Température Max : ${stats.maxT?.toFixed(1) || '--'} °C`, 14, 56);
        doc.text(`Température Min : ${stats.minT?.toFixed(1) || '--'} °C`, 70, 56);
        doc.text(`Rafale Max : ${stats.maxGust?.toFixed(0) || '--'} km/h`, 14, 62);
        doc.text(`Précipitations : ${stats.totalRain?.toFixed(1) || '--'} mm`, 70, 62);

        // Data Table
        const tableData = displayData.slice().reverse().map(h => [
            h.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            (h.temp ?? 0).toFixed(1),
            (h.dewpoint ?? 0).toFixed(1),
            (h.hum ?? '--') + '%',
            (h.gust || 0).toFixed(0),
            (h.rain ?? 0).toFixed(1),
            (h.pressure ?? 0).toFixed(1),
            (h.vv ? (h.vv / 1000).toFixed(1) : '--')
        ]);

        autoTable(doc, {
            startY: 70,
            head: [['Heure', 'Temp. (°C)', 'Pt. Rosée', 'Hum.', 'Vent', 'Raf.', 'Pluie', 'Pres.', 'Vis. (km)']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] }, // Blue header
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
                    <button className="btn-outline" onClick={handleDownloadPDF}>
                        <FileDown size={16} style={{ marginRight: '8px' }} />
                        Rapport du Jour (PDF)
                    </button>
                </div>
            </header>

            {/* TABS NAVIGATION (TOP) */}
            <div className="tabs-nav" style={{ marginBottom: '10px', display: 'flex', gap: '8px', paddingBottom: '15px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                <button
                    className={`tab-btn ${activeTab === 'obs' ? 'active' : ''}`}
                    onClick={() => setActiveTab('obs')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        background: activeTab === 'obs' ? '#2563eb' : 'white',
                        color: activeTab === 'obs' ? 'white' : '#64748b',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: activeTab === 'obs' ? '0 2px 4px rgba(37,99,235,0.2)' : 'none'
                    }}
                >
                    <Activity size={16} style={{ marginBottom: '-2px', marginRight: '6px' }} />
                    Détail Quotidien
                </button>
                <button
                    className={`tab-btn ${activeTab === 'climatology' ? 'active' : ''}`}
                    onClick={() => setActiveTab('climatology')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        background: activeTab === 'climatology' ? '#2563eb' : 'white',
                        color: activeTab === 'climatology' ? 'white' : '#64748b',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: activeTab === 'climatology' ? '0 2px 4px rgba(37,99,235,0.2)' : 'none'
                    }}
                >
                    <Calendar size={16} style={{ marginBottom: '-2px', marginRight: '6px' }} />
                    Climatologie Mensuelle
                </button>
                <button
                    className={`tab-btn ${activeTab === 'archives' ? 'active' : ''}`}
                    onClick={() => setActiveTab('archives')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        background: activeTab === 'archives' ? '#2563eb' : 'white',
                        color: activeTab === 'archives' ? 'white' : '#64748b',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: activeTab === 'archives' ? '0 2px 4px rgba(37,99,235,0.2)' : 'none'
                    }}
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
                    <div className="summary-grid">
                        <div className="stat-card">
                            <span className="label">Température maximale</span>
                            <span className="value red">
                                {typeof stats.maxT === 'number' && !isNaN(stats.maxT) ? stats.maxT.toFixed(1) : '--'}°C
                            </span>
                            <span className="sub">Aujourd'hui</span>
                        </div>
                        <div className="stat-card">
                            <span className="label">Température minimale</span>
                            <span className="value blue">
                                {typeof stats.minT === 'number' && !isNaN(stats.minT) ? stats.minT.toFixed(1) : '--'}°C
                            </span>
                            <span className="sub">Aujourd'hui</span>
                        </div>
                        <div className="stat-card">
                            <span className="label">Rafale maximale</span>
                            <span className="value orange">{typeof stats.maxGust === 'number' && !isNaN(stats.maxGust) ? stats.maxGust.toFixed(0) : '--'} km/h</span>
                            <span className="sub">Aujourd'hui</span>
                        </div>
                        <div className="stat-card">
                            <span className="label">Cumul Pluie</span>
                            <span className="value" style={{ color: '#0ea5e9' }}>
                                {typeof stats.totalRain === 'number' && !isNaN(stats.totalRain) ? stats.totalRain.toFixed(1) : '--'} mm
                            </span>
                            <span className="sub">Cumul 24h</span>
                        </div>
                        <div className="stat-card">
                            <span className="label">Ensoleillement</span>
                            <span className="value" style={{ color: '#eab308' }}>
                                {typeof stats.totalSun === 'number' && !isNaN(stats.totalSun) ? (stats.totalSun / 60).toFixed(1) : '--'} h
                            </span>
                            <span className="sub">Aujourd'hui</span>
                        </div>
                        <div className="stat-card">
                            <span className="label">Humidité Moyenne</span>
                            <span className="value" style={{ color: '#10b981' }}>
                                {typeof stats.avgHum === 'number' && !isNaN(stats.avgHum) ? Math.round(stats.avgHum) : '--'}%
                            </span>
                            <span className="sub">Aujourd'hui</span>
                        </div>
                        <div className="stat-card">
                            <span className="label">Pression (min/max)</span>
                            <div className="value-range" style={{ fontSize: '1rem', fontWeight: 'bold', color: '#64748b' }}>
                                <span>{stats.minPres?.toFixed(1) || '--'}</span>
                                <small style={{ margin: '0 4px', opacity: 0.5 }}>/</small>
                                <span>{stats.maxPres?.toFixed(1) || '--'}</span>
                            </div>
                            <span className="sub">hPa aujourd'hui</span>
                        </div>
                        <div className="stat-card">
                            <span className="label">Visibilité minimale</span>
                            <span className="value" style={{ color: '#6366f1' }}>
                                {stats.minVis !== null && stats.minVis !== undefined ? (stats.minVis / 1000).toFixed(1) : 'N/A'} km
                            </span>
                            <span className="sub">Aujourd'hui</span>
                        </div>
                    </div>

                    <div className="climatology-passport-link card" style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f0f9ff', border: '1px solid #bae6fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, color: '#0369a1', fontSize: '1rem' }}>Passeport Climatologique complet</h3>
                            <p style={{ margin: '4px 0 0', color: '#0ea5e9', fontSize: '0.85rem' }}>Consulter les normales 1991-2020, records historiques et statistiques de cette station.</p>
                        </div>
                        <Link to={`/climatologie?station=${stationId}`} className="btn-primary" style={{ textDecoration: 'none', background: '#0ea5e9', color: 'white', padding: '8px 16px', borderRadius: '8px', fontWeight: 700 }}>
                            Accéder au Passeport <ChevronRight size={18} />
                        </Link>
                    </div>

                    <div className="main-obs-layout">
                        {/* LEFT COLUMN: TABLE */}
                        <div className="data-column table-section">
                            <div className="section-head">
                                <h3><Table size={18} /> Relevés météo</h3>
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

                        {/* RIGHT COLUMN: CHARTS */}
                        <div className="data-column charts-section">
                            {/* TEMP CHART */}
                            <div className="mini-chart-card card">
                                <h4>TEMPÉRATURE (°C)</h4>
                                <ResponsiveContainer width="100%" height={220}>
                                    <AreaChart data={displayData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                        <XAxis dataKey="time" tickFormatter={(t) => t.getHours() + 'h'} fontSize={10} minTickGap={40} />
                                        <YAxis fontSize={10} domain={['auto', 'auto']} unit="°" />
                                        <Tooltip labelFormatter={(t) => t.toLocaleString()} />
                                        <Area type="monotone" dataKey="temp" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.05} strokeWidth={2} dot={false} name="T° Actuelle" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* RAIN CHART */}
                            <div className="mini-chart-card card" style={{ marginTop: '1.5rem' }}>
                                <h4>PRÉCIPITATIONS (mm)</h4>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={fullHistory}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                        <XAxis dataKey="time" tickFormatter={(t) => t.getHours() + 'h'} fontSize={10} minTickGap={40} />
                                        <YAxis fontSize={10} unit=" mm" />
                                        <Tooltip labelFormatter={(t) => t.toLocaleString()} />
                                        <Bar dataKey="rain" fill="#3b82f6" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
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
