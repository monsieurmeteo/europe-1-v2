import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Search, Download, Wind, Droplets, Thermometer, Info, MapPin, Zap, Snowflake, CloudRain, Sun, Activity } from 'lucide-react';
import { meteoFranceClimService } from '../../services/meteoFranceClimService';
import { DEPARTMENTS } from '../../data/departments';
import stationNames from '../../data/stationNames.json';
import './MeteocielArchives.css';

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
                console.warn('[StationArchives] Erreur chargement stations DPClim, fallback liste locale:', err);
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

    // 2. Interroger Météo-France DPClim
    const handleFetch = async () => {
        if (!startDate || !endDate || !selectedStation) return;

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

    const exportToCSV = () => {
        if (!data.length) return;

        const headers = ["Poste", "Station", "Date", "TN (°C)", "Heure TN", "TX (°C)", "Heure TX", "TM (°C)", "RR (mm)", "Rafale (km/h)", "Heure Rafale", "Direction (°)"].join(";");
        const rows = data.map(item => [
            selectedStation,
            currentStationName,
            item.date,
            item.tn ?? '',
            item.htn ?? '',
            item.tx ?? '',
            item.htx ?? '',
            item.tm ?? '',
            item.rr ?? 0,
            item.fxi ? Math.round(item.fxi) : '',
            item.hxi ?? '',
            item.dxi ?? ''
        ].join(";")).join("\n");

        const csvContent = "\uFEFF" + headers + "\n" + rows;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `meteofrance_${selectedStation}_${startDate}_${endDate}.csv`);
        link.click();
    };

    const exportFormatLogiciel = () => {
        if (!data.length) return;

        const headers = ["POSTE", "DATE", "RR", "TN", "TX", "FXI", "HXI"].join(";");
        const rows = data.map(item => {
            const dateFormatted = item.date.replace(/-/g, '');
            const fxiMS = item.fxi_ms !== undefined ? item.fxi_ms.toString().replace('.', ',') : (item.fxi ? (item.fxi / 3.6).toFixed(1).replace('.', ',') : '');
            const tx = item.tx !== undefined ? item.tx.toString().replace('.', ',') : '';
            const tn = item.tn !== undefined ? item.tn.toString().replace('.', ',') : '';
            const rr = item.rr !== undefined ? item.rr.toString().replace('.', ',') : '0,0';
            const hxi = item.hxi ? item.hxi.replace('h', '') : '1200';

            return `${selectedStation};${dateFormatted};${rr};${tn};${tx};${fxiMS};${hxi}`;
        }).join("\n");

        const csvContent = "\uFEFF" + headers + "\n" + rows;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `import_mf_${selectedStation}_${startDate}_${endDate}.csv`);
        link.click();
    };

    return (
        <div className="archives-page">
            <header className="archives-hero">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
                    <Activity color="#38bdf8" size={32} />
                    <h1>Archives Officielles Météo-France</h1>
                </div>
                <p>Historique certifié (1950 à hier) : Pluie (RR), Températures (TN, TX, TM), Rafales max (FXI) et phéno.</p>
            </header>

            <div className="archives-controls">
                <div className="control-group">
                    <label><MapPin size={18} /> Département :</label>
                    <select
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        className="station-select"
                    >
                        {DEPARTMENTS.map(d => (
                            <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
                        ))}
                    </select>
                </div>

                <div className="control-group" style={{ flex: 1.5 }}>
                    <label><MapPin size={18} /> Station Météo :</label>
                    <select
                        value={selectedStation}
                        onChange={(e) => setSelectedStation(e.target.value)}
                        className="station-select"
                        disabled={stations.length === 0}
                    >
                        {stations.length > 0 ? (
                            stations.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.nom} ({s.id}) {s.posteOuvert === false ? ' [Fermé]' : ''}
                                </option>
                            ))
                        ) : (
                            <option value="">Chargement des stations…</option>
                        )}
                    </select>
                </div>

                <div className="control-group" style={{ flex: 1.5 }}>
                    <label><Calendar size={18} /> Période :</label>
                    <div className="date-input-wrapper">
                        <input
                            type="date"
                            min="1950-01-01"
                            max={yesterday}
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="archive-date-input"
                        />
                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 5px' }}>au</span>
                        <input
                            type="date"
                            min="1950-01-01"
                            max={yesterday}
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="archive-date-input"
                        />
                    </div>
                </div>

                <div className="control-actions">
                    <button onClick={handleFetch} className="fetch-btn" disabled={loading || !selectedStation}>
                        {loading ? "Interrogation…" : <><Search size={18} /> Interroger</>}
                    </button>
                    <button onClick={exportToCSV} className="export-btn" disabled={!data.length}>
                        <Download size={18} /> CSV Standard
                    </button>
                    <button onClick={exportFormatLogiciel} className="export-btn" disabled={!data.length} style={{ background: '#8b5cf6' }}>
                        <Download size={18} /> Format Logiciel (m/s)
                    </button>
                </div>
            </div>

            {loading && progressMsg && (
                <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid #38bdf8', padding: '12px 18px', borderRadius: '8px', color: '#38bdf8', margin: '15px 0', textAlign: 'center' }}>
                    ⏳ {progressMsg}
                </div>
            )}

            {error && <div className="archive-error">{error}</div>}

            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', margin: '20px 0' }}>
                    <div className="stat-card" style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '14px', borderRadius: '10px', borderLeft: '4px solid #60a5fa' }}>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Droplets size={16} color="#60a5fa" /> Cumul Pluie
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f8fafc', margin: '4px 0' }}>
                            {stats.totalRain} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>mm</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{stats.rainDays} jours de pluie (≥1 mm)</div>
                    </div>

                    <div className="stat-card" style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '14px', borderRadius: '10px', borderLeft: '4px solid #f59e0b' }}>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Wind size={16} color="#f59e0b" /> Rafale Max
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f8fafc', margin: '4px 0' }}>
                            {stats.maxWind ? Math.round(stats.maxWind.val) : '-'} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>km/h</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {stats.maxWind ? `Le ${stats.maxWind.date.slice(5)} à ${stats.maxWind.hxi || '—'}` : 'Aucun vent'}
                        </div>
                    </div>

                    <div className="stat-card" style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '14px', borderRadius: '10px', borderLeft: '4px solid #38bdf8' }}>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Thermometer size={16} color="#38bdf8" /> Tn Absolue
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#38bdf8', margin: '4px 0' }}>
                            {stats.minTn ? `${stats.minTn.val.toFixed(1)} °C` : '-'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {stats.minTn ? `Le ${stats.minTn.date}` : ''} ({stats.frostDays} j. de gel)
                        </div>
                    </div>

                    <div className="stat-card" style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '14px', borderRadius: '10px', borderLeft: '4px solid #f87171' }}>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Thermometer size={16} color="#f87171" /> Tx Absolue
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f87171', margin: '4px 0' }}>
                            {stats.maxTx ? `${stats.maxTx.val.toFixed(1)} °C` : '-'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {stats.maxTx ? `Le ${stats.maxTx.date}` : ''} {stats.avgTm ? `(Moy: ${stats.avgTm}°C)` : ''}
                        </div>
                    </div>
                </div>
            )}

            <section className="archive-results-section">
                <div className="ranking-table-container">
                    <div className="ranking-table-header" style={{ borderLeftColor: '#38bdf8' }}>
                        <Thermometer size={20} />
                        <h3>{currentStationName} ({selectedStation})</h3>
                        <span className="results-count">{data.length} jours récupérés</span>
                    </div>

                    <div className="ranking-table-wrapper">
                        <table className="ranking-table">
                            <thead>
                                <tr>
                                    <th className="rank-col">Date</th>
                                    <th className="value-col">TN (°C)</th>
                                    <th className="value-col">TX (°C)</th>
                                    <th className="value-col">TM (°C)</th>
                                    <th className="value-col">Pluie (mm)</th>
                                    <th className="value-col">Rafale (km/h)</th>
                                    <th className="value-col">Phénomènes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" className="loading-row">⏳ Récupération officielle en direct auprès de Météo-France…</td></tr>
                                ) : data.length > 0 ? (
                                    data.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="rank-col" style={{ width: '130px', fontWeight: '500' }}>
                                                {new Date(item.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td className="value-col" style={{ color: item.tn <= 0 ? '#38bdf8' : '#93c5fd' }}>
                                                {item.tn !== undefined ? (
                                                    <span><strong>{item.tn.toFixed(1)}</strong> {item.htn && <small style={{ color: '#64748b' }}>({item.htn})</small>}</span>
                                                ) : '-'}
                                            </td>
                                            <td className="value-col" style={{ color: item.tx >= 30 ? '#ef4444' : item.tx >= 25 ? '#f97316' : '#f87171' }}>
                                                {item.tx !== undefined ? (
                                                    <span><strong>{item.tx.toFixed(1)}</strong> {item.htx && <small style={{ color: '#64748b' }}>({item.htx})</small>}</span>
                                                ) : '-'}
                                            </td>
                                            <td className="value-col" style={{ color: '#cbd5e1' }}>
                                                {item.tm !== undefined ? item.tm.toFixed(1) : '-'}
                                            </td>
                                            <td className="value-col" style={{ color: item.rr >= 10 ? '#38bdf8' : '#93c5fd', fontWeight: item.rr > 0 ? '600' : 'normal' }}>
                                                {item.rr !== undefined ? `${item.rr.toFixed(1)} mm` : '0.0 mm'}
                                            </td>
                                            <td className="value-col" style={{ color: item.fxi >= 80 ? '#ef4444' : item.fxi >= 60 ? '#f59e0b' : '#fbbf24' }}>
                                                {item.fxi !== undefined ? (
                                                    <span><strong>{Math.round(item.fxi)}</strong> {item.hxi && <small style={{ color: '#64748b' }}>({item.hxi})</small>}</span>
                                                ) : '-'}
                                            </td>
                                            <td className="value-col" style={{ fontSize: '0.85rem' }}>
                                                {item.orag && <span title="Orage" style={{ marginRight: '4px' }}>⚡</span>}
                                                {item.grele && <span title="Grêle" style={{ marginRight: '4px' }}>⚪</span>}
                                                {item.neig && <span title="Neige" style={{ marginRight: '4px' }}>❄️</span>}
                                                {item.gelee && <span title="Gelée" style={{ marginRight: '4px' }}>🧊</span>}
                                                {item.brou && <span title="Brouillard" style={{ marginRight: '4px' }}>🌫️</span>}
                                                {!item.orag && !item.grele && !item.neig && !item.gelee && !item.brou && (
                                                    item.rr === 0 ? <span style={{ color: '#64748b' }}>—</span> : null
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="7" className="no-data">Sélectionnez un département, un poste et une période, puis cliquez sur <strong>Interroger</strong></td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default StationArchives;
