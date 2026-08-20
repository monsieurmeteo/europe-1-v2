import React, { useState, useMemo } from 'react';
import { format, subDays, addDays, subMonths, addMonths, subYears, addYears } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Sparkles } from 'lucide-react';
import './MapDateNavigator.css';

const HISTORICAL_EVENTS = [
    { label: '🔥 25/07/2019 (Record 42.6°C)', date: '2019-07-25' },
    { label: '🔥 18/07/2022 (Canicule Ouest)', date: '2022-07-18' },
    { label: '🔥 12/08/2003 (Canicule 2003)', date: '2003-08-12' },
    { label: '🔥 23/08/2023 (Canicule Tardive)', date: '2023-08-23' },
    { label: '❄️ 16/01/1985 (Grand Froid -20°C)', date: '1985-01-16' },
    { label: '❄️ 07/02/2012 (Vague de Froid)', date: '2012-02-07' },
    { label: '💨 26/12/1999 (Tempête Lothar)', date: '1999-12-26' },
    { label: '💨 24/01/2009 (Tempête Klaus)', date: '2009-01-24' },
    { label: '💨 02/11/2023 (Tempête Ciaran)', date: '2023-11-02' }
];

export const MapDateNavigator = ({
    selectedDate,
    onChangeDate,
    accentColor = '#2563eb',
    minDate = '1950-01-01',
    maxDate = new Date().toISOString().split('T')[0]
}) => {
    const [showPresets, setShowPresets] = useState(false);

    const currentDateObj = useMemo(() => {
        const [y, m, d] = (selectedDate || maxDate).split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0);
    }, [selectedDate, maxDate]);

    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
    const yesterdayStr = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    }, []);

    const isToday = selectedDate === todayStr;
    const isYesterday = selectedDate === yesterdayStr;

    const currentYear = currentDateObj.getFullYear();
    const currentMonth = currentDateObj.getMonth() + 1;
    const currentDay = currentDateObj.getDate();

    // Nombre de jours dans le mois sélectionné
    const daysInMonth = useMemo(() => {
        return new Date(currentYear, currentMonth, 0).getDate();
    }, [currentYear, currentMonth]);

    // Liste des jours 1 à 31
    const daysList = useMemo(() => {
        const list = [];
        for (let d = 1; d <= daysInMonth; d++) {
            list.push(d);
        }
        return list;
    }, [daysInMonth]);

    // Liste des mois
    const monthsList = [
        { num: 1, name: '01 - Janvier' }, { num: 2, name: '02 - Février' }, { num: 3, name: '03 - Mars' },
        { num: 4, name: '04 - Avril' }, { num: 5, name: '05 - Mai' }, { num: 6, name: '06 - Juin' },
        { num: 7, name: '07 - Juillet' }, { num: 8, name: '08 - Août' }, { num: 9, name: '09 - Septembre' },
        { num: 10, name: '10 - Octobre' }, { num: 11, name: '11 - Novembre' }, { num: 12, name: '12 - Décembre' }
    ];

    // Liste des années de 1950 à aujourd'hui
    const yearsList = useMemo(() => {
        const maxYear = new Date().getFullYear();
        const list = [];
        for (let y = maxYear; y >= 1950; y--) {
            list.push(y);
        }
        return list;
    }, []);

    // Décaler d'une unité
    const handleShift = (amount, unit) => {
        let newDate;
        if (unit === 'day') newDate = amount > 0 ? addDays(currentDateObj, amount) : subDays(currentDateObj, Math.abs(amount));
        if (unit === 'month') newDate = amount > 0 ? addMonths(currentDateObj, amount) : subMonths(currentDateObj, Math.abs(amount));
        if (unit === 'year') newDate = amount > 0 ? addYears(currentDateObj, amount) : subYears(currentDateObj, Math.abs(amount));

        const y = newDate.getFullYear();
        const m = String(newDate.getMonth() + 1).padStart(2, '0');
        const d = String(newDate.getDate()).padStart(2, '0');
        const formatted = `${y}-${m}-${d}`;

        if (formatted >= minDate && formatted <= maxDate) {
            onChangeDate(formatted);
        }
    };

    // Modification directe par les chiffres
    const updateNumericDate = (newYear, newMonth, newDay) => {
        const maxD = new Date(newYear, newMonth, 0).getDate();
        const safeD = Math.min(newDay, maxD);
        const formatted = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(safeD).padStart(2, '0')}`;
        
        if (formatted < minDate) {
            onChangeDate(minDate);
        } else if (formatted > maxDate) {
            onChangeDate(maxDate);
        } else {
            onChangeDate(formatted);
        }
    };

    return (
        <div className="map-date-navigator-container">
            <div className="map-date-numeric-bar">
                {/* 1. Saisie / Sélection directe par Chiffres (Jour / Mois / Année) */}
                <div className="numeric-dropdowns-group">
                    <div className="numeric-field">
                        <label>Jour</label>
                        <select
                            value={currentDay}
                            onChange={(e) => updateNumericDate(currentYear, currentMonth, Number(e.target.value))}
                            className="numeric-select day-select"
                        >
                            {daysList.map(d => (
                                <option key={d} value={d}>{String(d).padStart(2, '0')}</option>
                            ))}
                        </select>
                    </div>

                    <div className="numeric-field">
                        <label>Mois</label>
                        <select
                            value={currentMonth}
                            onChange={(e) => updateNumericDate(currentYear, Number(e.target.value), currentDay)}
                            className="numeric-select month-select"
                        >
                            {monthsList.map(m => (
                                <option key={m.num} value={m.num}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="numeric-field">
                        <label>Année</label>
                        <select
                            value={currentYear}
                            onChange={(e) => updateNumericDate(Number(e.target.value), currentMonth, currentDay)}
                            className="numeric-select year-select"
                        >
                            {yearsList.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 2. Boutons de navigation pas à pas */}
                <div className="step-nav-group">
                    <button
                        className="step-btn"
                        onClick={() => handleShift(-1, 'year')}
                        title="Année -1"
                        disabled={selectedDate <= minDate}
                    >
                        <ChevronsLeft size={15} />
                        <span>-1 An</span>
                    </button>
                    <button
                        className="step-btn"
                        onClick={() => handleShift(-1, 'month')}
                        title="Mois -1"
                    >
                        <ChevronLeft size={15} />
                        <span>-1 Mois</span>
                    </button>
                    <button
                        className="step-btn day-step-btn"
                        onClick={() => handleShift(-1, 'day')}
                        title="Jour précédent"
                    >
                        <ChevronLeft size={17} />
                        <span>-1 Jour</span>
                    </button>
                    <button
                        className="step-btn day-step-btn"
                        onClick={() => handleShift(1, 'day')}
                        title="Jour suivant"
                        disabled={selectedDate >= maxDate}
                    >
                        <span>+1 Jour</span>
                        <ChevronRight size={17} />
                    </button>
                    <button
                        className="step-btn"
                        onClick={() => handleShift(1, 'month')}
                        title="Mois +1"
                        disabled={selectedDate >= maxDate}
                    >
                        <span>+1 Mois</span>
                        <ChevronRight size={15} />
                    </button>
                    <button
                        className="step-btn"
                        onClick={() => handleShift(1, 'year')}
                        title="Année +1"
                        disabled={selectedDate >= maxDate}
                    >
                        <span>+1 An</span>
                        <ChevronsRight size={15} />
                    </button>
                </div>

                {/* 3. Boutons Raccourcis Directs */}
                <div className="quick-buttons-group">
                    <button
                        className={`quick-nav-pill ${isToday ? 'active' : ''}`}
                        onClick={() => onChangeDate(todayStr)}
                        style={isToday ? { background: accentColor, color: 'white', borderColor: accentColor } : {}}
                    >
                        Aujourd'hui
                    </button>
                    <button
                        className={`quick-nav-pill ${isYesterday ? 'active' : ''}`}
                        onClick={() => onChangeDate(yesterdayStr)}
                        style={isYesterday ? { background: accentColor, color: 'white', borderColor: accentColor } : {}}
                    >
                        Hier
                    </button>
                    <button
                        className={`quick-nav-pill presets-pill ${showPresets ? 'active' : ''}`}
                        onClick={() => setShowPresets(!showPresets)}
                        title="Grands événements historiques"
                    >
                        <Sparkles size={13} />
                        <span>Dates Clés</span>
                    </button>
                </div>
            </div>

            {/* Menu Popover des Événements Historiques */}
            {showPresets && (
                <div className="historical-presets-popup">
                    <div className="presets-popup-header">
                        <span>🏛️ Événements Météo Remarquables (1950 - Aujourd'hui)</span>
                        <button onClick={() => setShowPresets(false)}>✕</button>
                    </div>
                    <div className="presets-buttons-grid">
                        {HISTORICAL_EVENTS.map(ev => (
                            <button
                                key={ev.date}
                                className={`preset-pill-item ${selectedDate === ev.date ? 'selected' : ''}`}
                                onClick={() => {
                                    onChangeDate(ev.date);
                                    setShowPresets(false);
                                }}
                            >
                                {ev.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
