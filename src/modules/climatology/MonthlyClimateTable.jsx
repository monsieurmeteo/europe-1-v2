import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Calendar, Thermometer, CloudRain, Sun, Download, Activity, AlertTriangle, Wind, Info, Zap, Snowflake } from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, ComposedChart, Line
} from 'recharts';
import { meteoFranceClimService } from '../../services/meteoFranceClimService';
import './MonthlyClimateTable.css';

const MONTHS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

// Cache mémoire session pour les mois consultés
const monthlyClimCache = new Map();

export default function MonthlyClimateTable({ stationId, stationName }) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [monthlyData, setMonthlyData] = useState([]);
    const [normals, setNormals] = useState(null);
    const [error, setError] = useState(null);

    // Liste des années de 1950 à aujourd'hui (ordre décroissant)
    const years = useMemo(() => {
        const list = [];
        for (let y = currentYear; y >= 1950; y--) {
            list.push(y);
        }
        return list;
    }, [currentYear]);

    useEffect(() => {
        if (stationId) {
            fetchMonthlyData();
            fetchNormals();
        }
    }, [stationId, selectedMonth, selectedYear]);

    const fetchNormals = async () => {
        try {
            const { data } = await supabase.from('station_climatology').select('data').eq('station_id', stationId).single();
            if (data?.data?.normals) {
                setNormals(data.data.normals);
            }
        } catch (e) {
            console.warn("Normals not found in DB");
        }
    };

    const fetchMonthlyData = async () => {
        setLoading(true);
        setError(null);

        const mNum = String(selectedMonth + 1).padStart(2, '0');
        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const startISO = `${selectedYear}-${mNum}-01`;
        const endISO = `${selectedYear}-${mNum}-${String(daysInMonth).padStart(2, '0')}`;

        const cacheKey = `${stationId}_${selectedYear}_${mNum}`;
        if (monthlyClimCache.has(cacheKey)) {
            const cached = monthlyClimCache.get(cacheKey);
            setMonthlyData(cached);
            setLoading(false);
            return;
        }

        try {
            // 1. Récupération officielle Météo-France DPClim
            const rows = await meteoFranceClimService.fetchStationHistory(
                stationId,
                startISO,
                endISO,
                () => {}
            );

            // Créer une map indexée par jour (1 à daysInMonth)
            const dayMap = new Map();
            if (rows && rows.length > 0) {
                rows.forEach(r => {
                    const dayNum = parseInt(r.date.split('-')[2], 10);
                    dayMap.set(dayNum, r);
                });
            }

            // Générer les données pour tous les jours du mois
            const dailyData = [];
            for (let d = 1; d <= daysInMonth; d++) {
                const r = dayMap.get(d);
                if (r) {
                    dailyData.push({
                        day: d,
                        date: r.date,
                        tx: r.tx !== undefined ? r.tx : null,
                        htx: r.htx || '',
                        tn: r.tn !== undefined ? r.tn : null,
                        htn: r.htn || '',
                        tm: r.tm !== undefined ? r.tm : (r.tx !== undefined && r.tn !== undefined ? parseFloat(((r.tx + r.tn) / 2).toFixed(1)) : null),
                        rr: r.rr !== undefined ? r.rr : 0,
                        fxi: r.fxi !== undefined ? Math.round(r.fxi) : null,
                        hxi: r.hxi || '',
                        orag: r.orag || false,
                        neig: r.neig || false,
                        grele: r.grele || false,
                        brou: r.brou || false,
                        gelee: r.gelee || false,
                        hasData: true
                    });
                } else {
                    dailyData.push({
                        day: d,
                        date: `${selectedYear}-${mNum}-${String(d).padStart(2, '0')}`,
                        tx: null,
                        tn: null,
                        tm: null,
                        rr: null,
                        fxi: null,
                        orag: false,
                        neig: false,
                        grele: false,
                        brou: false,
                        gelee: false,
                        hasData: false
                    });
                }
            }

            monthlyClimCache.set(cacheKey, dailyData);
            setMonthlyData(dailyData);
        } catch (e) {
            console.error('Erreur Climatologie Mensuelle:', e);
            setError(`Erreur lors de la récupération : ${e.message || e}`);
        } finally {
            setLoading(false);
        }
    };

    // Statistiques du mois
    const stats = useMemo(() => {
        const valids = monthlyData.filter(d => d.hasData && (d.tx !== null || d.tn !== null));
        if (valids.length === 0) return null;

        const txs = valids.map(d => d.tx).filter(v => v !== null);
        const tns = valids.map(d => d.tn).filter(v => v !== null);
        const tms = valids.map(d => d.tm).filter(v => v !== null);
        const rrs = valids.map(d => d.rr).filter(v => v !== null);
        const fxis = valids.map(d => d.fxi).filter(v => v !== null);

        let maxWind = null;
        valids.forEach(d => {
            if (d.fxi !== null) {
                if (!maxWind || d.fxi > maxWind.val) {
                    maxWind = { val: d.fxi, day: d.day, hxi: d.hxi };
                }
            }
        });

        return {
            count: valids.length,
            isFull: valids.length >= 20,
            meanTx: txs.length ? (txs.reduce((a, b) => a + b, 0) / txs.length).toFixed(1) : null,
            meanTn: tns.length ? (tns.reduce((a, b) => a + b, 0) / tns.length).toFixed(1) : null,
            meanTm: tms.length ? (tms.reduce((a, b) => a + b, 0) / tms.length).toFixed(1) : null,
            maxTx: txs.length ? Math.max(...txs) : null,
            minTn: tns.length ? Math.min(...tns) : null,
            totalRr: rrs.reduce((a, b) => a + b, 0).toFixed(1),
            rainDays: valids.filter(d => d.rr >= 1.0).length,
            frostDays: valids.filter(d => d.tn !== null && d.tn <= 0.0).length,
            heatDays: valids.filter(d => d.tx !== null && d.tx >= 25.0).length,
            maxGust: maxWind
        };
    }, [monthlyData]);

    const exportCSV = () => {
        if (!monthlyData.length) return;
        const headers = ["Jour;Date;Tx (°C);Tn (°C);Tm (°C);Pluie (mm);Rafale (km/h);Orage;Neige;Grêle;Brouillard;Gelée"];
        const rows = monthlyData.map(d => 
            `${d.day};${d.date};${d.tx ?? '-'};${d.tn ?? '-'};${d.tm ?? '-'};${d.rr ?? '-'};${d.fxi ?? '-'};${d.orag ? 1 : 0};${d.neig ? 1 : 0};${d.grele ? 1 : 0};${d.brou ? 1 : 0};${d.gelee ? 1 : 0}`
        );
        const blob = new Blob(["﻿" + [headers, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `CLIM_MENSUELLE_${stationId}_${selectedYear}_${selectedMonth + 1}.csv`;
        link.click();
    };

    return (
        <div className="monthly-climate-table animate-fade-in">
            {/* Header & Controls */}
            <div className="monthly-header" style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '24px' }}>
                <div className="monthly-title">
                    <span className="station-label" style={{ color: '#2563eb', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.8rem' }}>
                        Relevés Climatologiques Officiels (1950 - Hier)
                    </span>
                    <h2 style={{ margin: '4px 0 2px', fontSize: '1.6rem', color: '#0f172a', fontWeight: 800 }}>
                        {MONTHS[selectedMonth]} {selectedYear}
                    </h2>
                    <p className="station-meta" style={{ margin: 0, color: '#64748b', fontSize: '0.92rem' }}>
                        {stationName} ({stationId})
                    </p>
                </div>

                <div className="monthly-controls" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Sélecteur de Mois */}
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(parseInt(e.target.value, 10))}
                        className="control-input-style"
                        style={{ padding: '8px 12px', fontWeight: 700, borderRadius: '8px' }}
                    >
                        {MONTHS.map((m, i) => (
                            <option key={i} value={i}>{m}</option>
                        ))}
                    </select>

                    {/* Sélecteur d'Année (1950 à aujourd'hui) */}
                    <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                        className="control-input-style"
                        style={{ padding: '8px 12px', fontWeight: 700, borderRadius: '8px' }}
                    >
                        {years.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    <button
                        className="export-btn"
                        onClick={exportCSV}
                        style={{
                            background: '#f8fafc',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        <Download size={16} /> CSV
                    </button>
                </div>
            </div>

            {loading && (
                <div className="notice-loading" style={{ background: '#eff6ff', padding: '16px', borderRadius: '12px', color: '#1e40af', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <Activity size={20} className="animate-spin" />
                    <span>Récupération des archives de {MONTHS[selectedMonth]} {selectedYear} auprès de Météo-France…</span>
                </div>
            )}

            {error && (
                <div className="notice-error" style={{ background: '#fef2f2', padding: '16px', borderRadius: '12px', color: '#991b1b', fontWeight: 600, marginBottom: '20px' }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Cartes KPI du mois */}
            {stats && (
                <div className="kpi-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                    <div className="summary-kpi-card kpi-border-red" style={{ background: 'white', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                        <div className="kpi-top-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                            <span>Tx Moyenne</span>
                            <Sun size={15} color="#ef4444" />
                        </div>
                        <div className="kpi-main-metric" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626' }}>
                            {stats.meanTx ? `${stats.meanTx}°C` : '-'}
                        </div>
                        <div className="kpi-detail-text" style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            Max : {stats.maxTx ? `${stats.maxTx}°C` : '-'}
                        </div>
                    </div>

                    <div className="summary-kpi-card kpi-border-blue" style={{ background: 'white', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                        <div className="kpi-top-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                            <span>Tn Moyenne</span>
                            <Thermometer size={15} color="#3b82f6" />
                        </div>
                        <div className="kpi-main-metric" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb' }}>
                            {stats.meanTn ? `${stats.meanTn}°C` : '-'}
                        </div>
                        <div className="kpi-detail-text" style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            Min : {stats.minTn ? `${stats.minTn}°C` : '-'} ({stats.frostDays} j. gel)
                        </div>
                    </div>

                    <div className="summary-kpi-card kpi-border-purple" style={{ background: 'white', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                        <div className="kpi-top-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                            <span>Tm Mensuelle</span>
                            <Info size={15} color="#8b5cf6" />
                        </div>
                        <div className="kpi-main-metric" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
                            {stats.meanTm ? `${stats.meanTm}°C` : '-'}
                        </div>
                        <div className="kpi-detail-text" style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            Moyenne (Tn+Tx)/2
                        </div>
                    </div>

                    <div className="summary-kpi-card kpi-border-cyan" style={{ background: 'white', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                        <div className="kpi-top-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                            <span>Cumul Pluie</span>
                            <CloudRain size={15} color="#0284c7" />
                        </div>
                        <div className="kpi-main-metric" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0284c7' }}>
                            {stats.totalRr} <span style={{ fontSize: '0.9rem', color: '#64748b' }}>mm</span>
                        </div>
                        <div className="kpi-detail-text" style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            {stats.rainDays} jours ≥ 1mm
                        </div>
                    </div>

                    <div className="summary-kpi-card kpi-border-amber" style={{ background: 'white', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                        <div className="kpi-top-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                            <span>Rafale Max</span>
                            <Wind size={15} color="#f59e0b" />
                        </div>
                        <div className="kpi-main-metric" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
                            {stats.maxGust ? `${stats.maxGust.val} km/h` : '-'}
                        </div>
                        <div className="kpi-detail-text" style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            {stats.maxGust ? `Le ${stats.maxGust.day} ${stats.maxGust.hxi ? `à ${stats.maxGust.hxi}` : ''}` : '-'}
                        </div>
                    </div>
                </div>
            )}

            {/* Graphique des températures du mois vs Normales */}
            {stats && (
                <div className="monthly-chart-section card animate-fade-in" style={{ marginBottom: '2rem', padding: '1.5rem', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ fontSize: '0.95rem', color: '#0f172a', margin: 0, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Thermometer size={18} color="#2563eb" />
                            Évolution des Températures — {MONTHS[selectedMonth]} {selectedYear}
                        </h3>
                        {normals && normals.tx && (
                            <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', fontWeight: 600 }}>
                                Normales 1991-2020 : Tx {normals.tx[selectedMonth]}°C / Tn {normals.tn[selectedMonth]}°C
                            </span>
                        )}
                    </div>

                    <div style={{ width: '100%', height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="day"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: '#94a3b8' }}
                                />
                                <YAxis
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    unit="°C"
                                    tick={{ fill: '#94a3b8' }}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                    formatter={(value, name) => {
                                        if (typeof value === 'number') return [`${value.toFixed(1)}°C`, name];
                                        return [value, name];
                                    }}
                                    labelFormatter={(label) => `Jour ${label} ${MONTHS[selectedMonth]} ${selectedYear}`}
                                />
                                {/* Zone Tx/Tn */}
                                <Area type="monotone" dataKey="tx" stroke="#ef4444" fill="#ef4444" fillOpacity={0.12} strokeWidth={2.5} name="Tx (Max)" connectNulls />
                                <Area type="monotone" dataKey="tn" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={2.5} name="Tn (Min)" connectNulls />

                                {/* Lignes des Normales 1991-2020 */}
                                {normals && normals.tx && normals.tx[selectedMonth] !== undefined && (
                                    <Line type="monotone" dataKey={() => normals.tx[selectedMonth]} stroke="#f87171" strokeDasharray="5 5" dot={false} strokeWidth={1.5} name="Normale Tx" />
                                )}
                                {normals && normals.tn && normals.tn[selectedMonth] !== undefined && (
                                    <Line type="monotone" dataKey={() => normals.tn[selectedMonth]} stroke="#60a5fa" strokeDasharray="5 5" dot={false} strokeWidth={1.5} name="Normale Tn" />
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Tableau des relevés quotidiens du mois */}
            <div className="table-presentation-card" style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div className="table-top-bar" style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="table-heading" style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={18} color="#2563eb" />
                        Relevés Quotidiens — {MONTHS[selectedMonth]} {selectedYear} ({monthlyData.filter(d => d.hasData).length} jours)
                    </div>
                </div>

                <div className="table-scroll-area" style={{ overflowX: 'auto', maxHeight: '600px' }}>
                    <table className="history-data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Jour</th>
                                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Tn (°C)</th>
                                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Tx (°C)</th>
                                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Tm (°C)</th>
                                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Pluie (mm)</th>
                                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Rafale (km/h)</th>
                                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Phénomènes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {monthlyData.map(d => (
                                <tr key={d.day} style={{ borderBottom: '1px solid #f1f5f9', opacity: d.hasData ? 1 : 0.4 }}>
                                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#0f172a' }}>
                                        {d.day} {MONTHS[selectedMonth].substring(0, 4)}.
                                    </td>
                                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#2563eb' }}>
                                        {d.tn !== null ? `${d.tn}°C` : '-'}
                                        {d.htn && <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '4px', fontWeight: 500 }}>({d.htn})</span>}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#dc2626' }}>
                                        {d.tx !== null ? `${d.tx}°C` : '-'}
                                        {d.htx && <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '4px', fontWeight: 500 }}>({d.htx})</span>}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>
                                        {d.tm !== null ? `${d.tm}°C` : '-'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#0284c7' }}>
                                        {d.rr !== null ? `${d.rr.toFixed(1)} mm` : '-'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#0f172a' }}>
                                        {d.fxi !== null ? (
                                            <>
                                                <span>{d.fxi} km/h</span>
                                                {d.hxi && <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '4px', fontWeight: 500 }}>({d.hxi})</span>}
                                            </>
                                        ) : '-'}
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {d.orag && <span className="tag-pheno tag-orag">⚡ Orage</span>}
                                            {d.neig && <span className="tag-pheno tag-neig">❄️ Neige</span>}
                                            {d.grele && <span className="tag-pheno tag-grele">⚪ Grêle</span>}
                                            {d.gelee && <span className="tag-pheno tag-gelee">🧊 Gelée</span>}
                                            {d.brou && <span className="tag-pheno tag-brou">🌫️ Brouillard</span>}
                                            {!d.orag && !d.neig && !d.grele && !d.gelee && !d.brou && (
                                                <span style={{ color: '#94a3b8' }}>-</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {stats && (
                            <tfoot>
                                <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                                    <td style={{ padding: '14px 16px', color: '#0f172a' }}>MOYENNES / TOTAL</td>
                                    <td style={{ padding: '14px 16px', color: '#2563eb' }}>{stats.meanTn ? `${stats.meanTn}°C` : '-'}</td>
                                    <td style={{ padding: '14px 16px', color: '#dc2626' }}>{stats.meanTx ? `${stats.meanTx}°C` : '-'}</td>
                                    <td style={{ padding: '14px 16px', color: '#475569' }}>{stats.meanTm ? `${stats.meanTm}°C` : '-'}</td>
                                    <td style={{ padding: '14px 16px', color: '#0284c7' }}>{stats.totalRr} mm</td>
                                    <td style={{ padding: '14px 16px', color: '#0f172a' }}>{stats.maxGust ? `${stats.maxGust.val} km/h` : '-'}</td>
                                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{stats.rainDays} j. pluie | {stats.frostDays} j. gel</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
