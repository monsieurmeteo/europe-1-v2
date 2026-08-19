import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Search, Download, Wind, Droplets, Thermometer, Info, MapPin, Zap, Snowflake, CloudRain, Sun, Activity, Trophy, ShieldCheck } from 'lucide-react';
import { meteoFranceClimService } from '../../services/meteoFranceClimService';
import { DEPARTMENTS } from '../../data/departments';
import stationNames from '../../data/stationNames.json';
import './StationArchives.css';

// Cache mémoire session pour navigation instantanée (ex: Valenciennes, Douai, etc.)
const stationHistoryCache = new Map();

const StationArchives = () => {
    // Dates par défaut : du 1er janvier de l'année en cours jusqu'à hier
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const currentYear = yesterday.split('-')[0];
    const defaultStart = `${currentYear}-01-01`;

    const [selectedDept, setSelectedDept] = useState('59'); // Nord par défaut
    const [stations, setStations] = useState([]);
    const [selectedStation, setSelectedStation] = useState('59178001'); // Douai par défaut
    const [startDate, setStartDate] = useState(defaultStart);
    const [endDate, setEndDate] = useState(yesterday);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [progressMsg, setProgressMsg] = useState('');
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // 1. Charger les stations du département sélectionné
    useEffect(() => {
        let isMounted = true;
        const loadStations = async () => {
            try {
                const list = await meteoFranceClimService.getStations(selectedDept);
                if (!isMounted) return;
                
                if (list && list.length > 0) {
                    setStations(list);
                    const openStation = list.find(s => s.posteOuvert) || list[0];
                    if (openStation && (!selectedStation || !list.some(s => s.id === selectedStation))) {
                        setSelectedStation(openStation.id);
                    }
                } else {
                    setStations([]);
                }
            } catch (err) {
                console.warn('[StationArchives] Fallback liste locale:', err);
                if (!isMounted) return;
                const fallbackStations = Object.keys(stationNames)
                    .filter(id => id.startsWith(selectedDept))
                    .map(id => ({ id, nom: stationNames[id], posteOuvert: true }));
                setStations(fallbackStations);
            }
        };

        loadStations();
        return () => { isMounted = false; };
    }, [selectedDept]);

    // 2. Interroger Météo-France DPClim (avec cache mémoire session)
    const handleFetch = async () => {
        if (!startDate || !endDate || !selectedStation) return;

        const cacheKey = `${selectedStation}_${startDate}_${endDate}`;
        if (stationHistoryCache.has(cacheKey)) {
            console.log(`[StationArchives] ⚡ Chargement instantané depuis le cache pour ${cacheKey}`);
            setData(stationHistoryCache.get(cacheKey));
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);
        setProgressMsg('Connexion à Météo-France…');

        try {
            const results = await meteoFranceClimService.fetchStationHistory(
                selectedStation,
                startDate,
                endDate,
                (msg) => setProgressMsg(msg)
            );

            if (!results || results.length === 0) {
                setError("Aucune donnée disponible pour cette station sur la période demandée.");
                setData([]);
            } else {
                stationHistoryCache.set(cacheKey, results);
                setData(results);
            }
        } catch (err) {
            console.error('[StationArchives] Erreur fetch:', err);
            setError(`Erreur lors de la récupération : ${err.message || err}`);
        } finally {
            setLoading(false);
            setProgressMsg('');
        }
    };

    // 3. Calcul des statistiques globales sur la période
    const stats = useMemo(() => {
        if (!data || data.length === 0) return null;

        let totalRain = 0;
        let rainDays = 0;
        let frostDays = 0;
        let maxWind = { val: -1, date: '', hxi: '', dxi: null };
        let minTn = { val: 999, date: '' };
        let maxTx = { val: -999, date: '' };
        let sumTm = 0;
        let countTm = 0;

        let maxDryRun = 0;
        let currentDryRun = 0;

        const chrono = [...data].sort((a, b) => a.date.localeCompare(b.date));

        chrono.forEach(item => {
            const r = item.rr ?? 0;
            totalRain += r;
            if (r >= 1.0) rainDays++;
            
            if (r < 0.1) {
                currentDryRun++;
                if (currentDryRun > maxDryRun) maxDryRun = currentDryRun;
            } else {
                currentDryRun = 0;
            }

            if (item.tn !== undefined && item.tn !== null) {
                if (item.tn < minTn.val) minTn = { val: item.tn, date: item.date };
                if (item.tn <= 0.0) frostDays++;
            }
            if (item.tx !== undefined && item.tx !== null) {
                if (item.tx > maxTx.val) maxTx = { val: item.tx, date: item.date };
            }
            if (item.tm !== undefined && item.tm !== null) {
                sumTm += item.tm;
                countTm++;
            }

            if (item.fxi !== undefined && item.fxi !== null) {
                if (item.fxi > maxWind.val) {
                    maxWind = { val: item.fxi, date: item.date, hxi: item.hxi, dxi: item.dxi };
                }
            }
        });

        return {
            totalRain: totalRain.toFixed(1),
            rainDays,
            frostDays,
            maxDryRun,
            avgTm: countTm > 0 ? (sumTm / countTm).toFixed(1) : null,
            minTn: minTn.val !== 999 ? minTn : null,
            maxTx: maxTx.val !== -999 ? maxTx : null,
            maxWind: maxWind.val !== -1 ? maxWind : null,
            totalDays: data.length
        };
    }, [data]);

    const currentStationName = useMemo(() => {
        const found = stations.find(s => s.id === selectedStation);
        return found?.nom || stationNames[selectedStation] || selectedStation;
    }, [stations, selectedStation]);

    // Filtrage recherche locale
    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const q = searchTerm.toLowerCase();
        return data.filter(d => d.date.includes(q));
    }, [data, searchTerm]);

    // 4. Exports
    const exportStandardCSV = () => {
        if (!data || data.length === 0) return;
        const headers = ['Date', 'TN (°C)', 'HTN', 'TX (°C)', 'HTX', 'TM (°C)', 'Pluie (mm)', 'Rafale (km/h)', 'DXI (°)', 'HXI', 'Orage', 'Neige', 'Grêle', 'Brouillard', 'Gelée'];
        const rows = data.map(d => [
            d.date,
            d.tn ?? '',
            d.htn ?? '',
            d.tx ?? '',
            d.htx ?? '',
            d.tm ?? '',
            d.rr ?? '',
            d.fxi ?? '',
            d.dxi ?? '',
            d.hxi ?? '',
            d.orag ? '1' : '0',
            d.neig ? '1' : '0',
            d.grele ? '1' : '0',
            d.brou ? '1' : '0',
            d.gelee ? '1' : '0'
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,﻿'
            + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `archives_MF_${currentStationName}_${startDate}_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportSoftwareCSV = () => {
        if (!data || data.length === 0) return;
        const headers = ['date', 'tn', 'tx', 'tm', 'rr', 'ff_rafale_ms'];
        const rows = data.map(d => [
            d.date,
            d.tn ?? '',
            d.tx ?? '',
            d.tm ?? '',
            d.rr ?? '',
            d.fxi !== undefined && d.fxi !== null ? (d.fxi / 3.6).toFixed(1) : ''
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,﻿'
            + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `software_import_${currentStationName}_${startDate}_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatDateFR = (dStr) => {
        if (!dStr || dStr.length !== 8) return dStr;
        return `${dStr.substring(6, 8)}/${dStr.substring(4, 6)}/${dStr.substring(0, 4)}`;
    };

    return (
        <div className="station-archives-page">
            {/* 1. Header Card */}
            <div className="station-archives-header">
                <div className="header-title-wrap">
                    <div className="header-icon-box">
                        <Trophy size={28} />
                    </div>
                    <div>
                        <h1>Archives Climatologiques Météo-France</h1>
                        <p>Historique officiel certifié (1950 à hier) : Pluie (RR), Températures (TN, TX, TM), Rafales (FXI) et Phénomènes.</p>
                    </div>
                </div>
                <div className="header-badges">
                    <span className="badge-official">
                        <ShieldCheck size={14} style={{ display: 'inline', marginRight: '4px' }} />
                        Données Officielles Météo-France
                    </span>
                </div>
            </div>

            {/* 2. Controls Bar */}
            <div className="controls-card">
                <div className="control-item">
                    <label className="control-label">
                        <MapPin size={15} color="#2563eb" /> Département
                    </label>
                    <select
                        className="control-input-style"
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                    >
                        {DEPARTMENTS.map(d => (
                            <option key={d.code} value={d.code}>
                                {d.code} — {d.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="control-item">
                    <label className="control-label">
                        <Activity size={15} color="#2563eb" /> Station Météo
                    </label>
                    <select
                        className="control-input-style"
                        value={selectedStation}
                        onChange={(e) => setSelectedStation(e.target.value)}
                        disabled={stations.length === 0}
                    >
                        {stations.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.nom} ({s.id}) {!s.posteOuvert ? '— [Fermé]' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="control-item control-item-dates">
                    <label className="control-label">
                        <Calendar size={15} color="#2563eb" /> Période d'archive
                    </label>
                    <div className="date-inputs-row">
                        <input
                            type="date"
                            className="control-input-style"
                            value={startDate}
                            min="1950-01-01"
                            max={yesterday}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span className="date-sep-text">au</span>
                        <input
                            type="date"
                            className="control-input-style"
                            value={endDate}
                            min="1950-01-01"
                            max={yesterday}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                </div>

                <div className="actions-row">
                    <button
                        className="btn-primary-action"
                        onClick={handleFetch}
                        disabled={loading}
                    >
                        <Search size={18} />
                        {loading ? 'Interrogation…' : 'Interroger'}
                    </button>

                    <button
                        className="btn-secondary-action"
                        onClick={exportStandardCSV}
                        disabled={!data || data.length === 0}
                        title="Exporter en CSV Standard Météo"
                    >
                        <Download size={16} /> CSV Standard
                    </button>

                    <button
                        className="btn-secondary-action"
                        onClick={exportSoftwareCSV}
                        disabled={!data || data.length === 0}
                        title="Exporter en format m/s pour PowerQuery / Logiciels"
                    >
                        <Download size={16} /> Format Logiciel (m/s)
                    </button>
                </div>
            </div>

            {/* 3. Messages d'état */}
            {loading && (
                <div className="notice-loading">
                    <Activity size={20} className="animate-spin" />
                    <span>{progressMsg || 'Récupération officielle en direct auprès de Météo-France…'}</span>
                </div>
            )}

            {error && (
                <div className="notice-error">
                    <span>⚠️ {error}</span>
                </div>
            )}

            {/* 4. Station Info & KPI Summary Cards */}
            {stats && (
                <>
                    <div className="notice-station-summary">
                        <div className="station-title-badge">
                            <Thermometer size={20} color="#2563eb" />
                            {currentStationName} ({selectedStation})
                        </div>
                        <div className="station-days-count">
                            {stats.totalDays} jours d'observations analysés
                        </div>
                    </div>

                    <div className="kpi-cards-grid">
                        <div className="summary-kpi-card kpi-border-blue">
                            <div className="kpi-top-row">
                                <span>Cumul Précipitations</span>
                                <Droplets size={16} color="#3b82f6" />
                            </div>
                            <div className="kpi-main-metric">
                                {stats.totalRain} <span className="kpi-unit-text">mm</span>
                            </div>
                            <div className="kpi-detail-text">
                                {stats.rainDays} jours de pluie (≥ 1mm)
                            </div>
                        </div>

                        <div className="summary-kpi-card kpi-border-cyan">
                            <div className="kpi-top-row">
                                <span>Rafale Max</span>
                                <Wind size={16} color="#06b6d4" />
                            </div>
                            <div className="kpi-main-metric">
                                {stats.maxWind ? stats.maxWind.val : '-'} <span className="kpi-unit-text">km/h</span>
                            </div>
                            <div className="kpi-detail-text">
                                {stats.maxWind ? `${formatDateFR(stats.maxWind.date)} ${stats.maxWind.hxi ? `à ${stats.maxWind.hxi}` : ''}` : 'Aucune rafale'}
                            </div>
                        </div>

                        <div className="summary-kpi-card kpi-border-indigo">
                            <div className="kpi-top-row">
                                <span>Tn Minimale</span>
                                <Thermometer size={16} color="#6366f1" />
                            </div>
                            <div className="kpi-main-metric" style={{ color: '#2563eb' }}>
                                {stats.minTn ? stats.minTn.val : '-'} <span className="kpi-unit-text">°C</span>
                            </div>
                            <div className="kpi-detail-text">
                                {stats.minTn ? formatDateFR(stats.minTn.date) : '-'} ({stats.frostDays} j. de gel)
                            </div>
                        </div>

                        <div className="summary-kpi-card kpi-border-red">
                            <div className="kpi-top-row">
                                <span>Tx Maximale</span>
                                <Sun size={16} color="#ef4444" />
                            </div>
                            <div className="kpi-main-metric" style={{ color: '#dc2626' }}>
                                {stats.maxTx ? stats.maxTx.val : '-'} <span className="kpi-unit-text">°C</span>
                            </div>
                            <div className="kpi-detail-text">
                                {stats.maxTx ? formatDateFR(stats.maxTx.date) : '-'}
                            </div>
                        </div>

                        <div className="summary-kpi-card kpi-border-purple">
                            <div className="kpi-top-row">
                                <span>Tm Moyenne</span>
                                <Info size={16} color="#8b5cf6" />
                            </div>
                            <div className="kpi-main-metric">
                                {stats.avgTm !== null ? stats.avgTm : '-'} <span className="kpi-unit-text">°C</span>
                            </div>
                            <div className="kpi-detail-text">
                                Moyenne (Tn+Tx)/2
                            </div>
                        </div>

                        <div className="summary-kpi-card kpi-border-amber">
                            <div className="kpi-top-row">
                                <span>Série Sèche Max</span>
                                <Calendar size={16} color="#f59e0b" />
                            </div>
                            <div className="kpi-main-metric">
                                {stats.maxDryRun} <span className="kpi-unit-text">jours</span>
                            </div>
                            <div className="kpi-detail-text">
                                Jours consécutifs &lt; 0.1mm
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* 5. Table Card */}
            {data && data.length > 0 && (
                <div className="table-presentation-card">
                    <div className="table-top-bar">
                        <div className="table-heading">
                            <Calendar size={18} color="#2563eb" />
                            Relevés Quotidiens ({filteredData.length} jours)
                        </div>
                        <input
                            type="text"
                            className="table-search-box"
                            placeholder="Filtrer une date (ex: 202401)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="table-scroll-area">
                        <table className="history-data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Tn (°C)</th>
                                    <th>Tx (°C)</th>
                                    <th>Tm (°C)</th>
                                    <th>Pluie (mm)</th>
                                    <th>Rafale (km/h)</th>
                                    <th>Phénomènes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="cell-date-bold">
                                            {formatDateFR(row.date)}
                                        </td>
                                        <td className="cell-tn-blue">
                                            {row.tn !== undefined && row.tn !== null ? `${row.tn} °C` : '-'}
                                        </td>
                                        <td className="cell-tx-red">
                                            {row.tx !== undefined && row.tx !== null ? `${row.tx} °C` : '-'}
                                        </td>
                                        <td className="cell-tm-slate">
                                            {row.tm !== undefined && row.tm !== null ? `${row.tm} °C` : '-'}
                                        </td>
                                        <td className="cell-rain-cyan">
                                            {row.rr !== undefined && row.rr !== null ? `${row.rr} mm` : '-'}
                                        </td>
                                        <td className="cell-wind-dark">
                                            {row.fxi !== undefined && row.fxi !== null ? (
                                                <>
                                                    <span>{row.fxi} km/h</span>
                                                    {row.hxi && <span className="wind-hour-detail">({row.hxi})</span>}
                                                </>
                                            ) : '-'}
                                        </td>
                                        <td>
                                            <div className="pheno-tags-container">
                                                {row.orag && <span className="tag-pheno tag-orag">⚡ Orage</span>}
                                                {row.neig && <span className="tag-pheno tag-neig">❄️ Neige</span>}
                                                {row.grele && <span className="tag-pheno tag-grele">⚪ Grêle</span>}
                                                {row.gelee && <span className="tag-pheno tag-gelee">🧊 Gelée</span>}
                                                {row.brou && <span className="tag-pheno tag-brou">🌫️ Brouillard</span>}
                                                {!row.orag && !row.neig && !row.grele && !row.gelee && !row.brou && (
                                                    <span style={{ color: '#94a3b8' }}>-</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StationArchives;
