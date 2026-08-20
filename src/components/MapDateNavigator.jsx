import React, { useState, useMemo } from 'react';
import { format, subDays, addDays, subMonths, addMonths, subYears, addYears } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Sparkles } from 'lucide-react';
import './MapDateNavigator.css';

const HISTORICAL_EVENTS = [
    { label: '🔥 Canicule Record (25 Juil 2019 - 42.6°C)', date: '2019-07-25' },
    { label: '🔥 Canicule Ouest (18 Juil 2022 - 40°C+)', date: '2022-07-18' },
    { label: '🔥 Canicule Historique (12 Août 2003)', date: '2003-08-12' },
    { label: '🔥 Canicule Tardive (23 Août 2023)', date: '2023-08-23' },
    { label: '❄️ Grand Froid National (16 Janv 1985 - -20°C)', date: '1985-01-16' },
    { label: '❄️ Vague de Froid (07 Fév 2012)', date: '2012-02-07' },
    { label: '❄️ Hiver Glacial (12 Janv 1987)', date: '1987-01-12' },
    { label: '💨 Tempête du Siècle Lothar (26 Déc 1999)', date: '1999-12-26' },
    { label: '💨 Tempête Klaus (24 Janv 2009 - 190 km/h)', date: '2009-01-24' },
    { label: '💨 Tempête Ciaran (02 Nov 2023 - 207 km/h)', date: '2023-11-02' }
];

export const MapDateNavigator = ({
    selectedDate,
    onChangeDate,
    accentColor = '#ec4899',
    minDate = '1950-01-01',
    maxDate = new Date().toISOString().split('T')[0],
    showTimelineSlider = true
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

    // Calculs de navigation
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

    // Nombre de jours dans le mois sélectionné
    const daysInMonth = useMemo(() => {
        const year = currentDateObj.getFullYear();
        const month = currentDateObj.getMonth() + 1;
        return new Date(year, month, 0).getDate();
    }, [currentDateObj]);

    const currentDay = currentDateObj.getDate();
    const currentMonth = currentDateObj.getMonth() + 1;
    const currentYear = currentDateObj.getFullYear();

    // Liste des années de 1950 à l'année courante
    const yearsList = useMemo(() => {
        const currentY = new Date().getFullYear();
        const list = [];
        for (let y = currentY; y >= 1950; y--) {
            list.push(y);
        }
        return list;
    }, []);

    const monthsList = [
        { num: 1, name: 'Janvier' }, { num: 2, name: 'Février' }, { num: 3, name: 'Mars' },
        { num: 4, name: 'Avril' }, { num: 5, name: 'Mai' }, { num: 6, name: 'Juin' },
        { num: 7, name: 'Juillet' }, { num: 8, name: 'Août' }, { num: 9, name: 'Septembre' },
        { num: 10, name: 'Octobre' }, { num: 11, name: 'Novembre' }, { num: 12, name: 'Décembre' }
    ];

    const setSpecificDate = (y, m, d) => {
        const maxD = new Date(y, m, 0).getDate();
        const safeD = Math.min(d, maxD);
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(safeD).padStart(2, '0')}`;
        if (dateStr >= minDate && dateStr <= maxDate) {
            onChangeDate(dateStr);
        }
    };

    return (
        <div className="map-date-navigator-container">
            {/* Barre Principale de Navigation */}
            <div className="map-date-nav-bar">
                {/* Saut d'année et de mois */}
                <div className="date-nav-group year-month-nav">
                    <button
                        className="nav-arrow-btn"
                        onClick={() => handleShift(-1, 'year')}
                        title="Année précédente (An -1)"
                        disabled={selectedDate <= minDate}
                    >
                        <ChevronsLeft size={16} />
                        <span>An</span>
                    </button>
                    <button
                        className="nav-arrow-btn"
                        onClick={() => handleShift(-1, 'month')}
                        title="Mois précédent (Mois -1)"
                    >
                        <ChevronLeft size={16} />
                        <span>Mois</span>
                    </button>
                </div>

                {/* Date Active & Saut Jour par Jour */}
                <div className="date-nav-active-pill" style={{ borderColor: accentColor }}>
                    <button
                        className="nav-day-btn"
                        onClick={() => handleShift(-1, 'day')}
                        title="Jour précédent"
                    >
                        <ChevronLeft size={20} />
                    </button>

                    <div className="date-active-display">
                        <Calendar size={18} style={{ color: accentColor }} />
                        <span className="date-text-primary">
                            {format(currentDateObj, "EEEE d MMMM yyyy", { locale: fr })}
                        </span>
                        <input
                            type="date"
                            value={selectedDate}
                            min={minDate}
                            max={maxDate}
                            onChange={(e) => e.target.value && onChangeDate(e.target.value)}
                            className="hidden-date-input"
                        />
                    </div>

                    <button
                        className="nav-day-btn"
                        onClick={() => handleShift(1, 'day')}
                        title="Jour suivant"
                        disabled={selectedDate >= maxDate}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                {/* Saut d'année et de mois suivant */}
                <div className="date-nav-group year-month-nav">
                    <button
                        className="nav-arrow-btn"
                        onClick={() => handleShift(1, 'month')}
                        title="Mois suivant (Mois +1)"
                        disabled={selectedDate >= maxDate}
                    >
                        <span>Mois</span>
                        <ChevronRight size={16} />
                    </button>
                    <button
                        className="nav-arrow-btn"
                        onClick={() => handleShift(1, 'year')}
                        title="Année suivante (An +1)"
                        disabled={selectedDate >= maxDate}
                    >
                        <span>An</span>
                        <ChevronsRight size={16} />
                    </button>
                </div>

                {/* Raccourcis Aujourd'hui / Hier */}
                <div className="date-nav-quick-actions">
                    <button
                        className={`quick-pill-btn ${isToday ? 'active' : ''}`}
                        onClick={() => onChangeDate(todayStr)}
                        style={isToday ? { background: accentColor, color: 'white' } : {}}
                    >
                        Aujourd'hui
                    </button>
                    <button
                        className={`quick-pill-btn ${isYesterday ? 'active' : ''}`}
                        onClick={() => onChangeDate(yesterdayStr)}
                        style={isYesterday ? { background: accentColor, color: 'white' } : {}}
                    >
                        Hier
                    </button>
                    <button
                        className={`quick-pill-btn presets-btn ${showPresets ? 'active' : ''}`}
                        onClick={() => setShowPresets(!showPresets)}
                        title="Grands événements météo historiques"
                    >
                        <Sparkles size={14} />
                        <span>Historique</span>
                    </button>
                </div>
            </div>

            {/* Menu Popover des Événements Météo Historiques */}
            {showPresets && (
                <div className="historical-presets-panel">
                    <div className="presets-header">
                        <span>🏛️ Événements Météo Historiques Marquants</span>
                        <button onClick={() => setShowPresets(false)}>✕</button>
                    </div>
                    <div className="presets-grid">
                        {HISTORICAL_EVENTS.map(ev => (
                            <button
                                key={ev.date}
                                className={`preset-card ${selectedDate === ev.date ? 'selected' : ''}`}
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

            {/* Curseur / Slider Temporel du Mois */}
            {showTimelineSlider && (
                <div className="month-timeline-slider">
                    <div className="timeline-labels">
                        <span className="month-label">
                            📅 {format(currentDateObj, "MMMM yyyy", { locale: fr })}
                        </span>
                        <div className="quick-select-dropdowns">
                            {/* Sélecteur direct de Mois */}
                            <select
                                value={currentMonth}
                                onChange={(e) => setSpecificDate(currentYear, Number(e.target.value), currentDay)}
                                className="nav-dropdown"
                            >
                                {monthsList.map(m => (
                                    <option key={m.num} value={m.num}>{m.name}</option>
                                ))}
                            </select>

                            {/* Sélecteur direct d'Année (1950 - Aujourd'hui) */}
                            <select
                                value={currentYear}
                                onChange={(e) => setSpecificDate(Number(e.target.value), currentMonth, currentDay)}
                                className="nav-dropdown year-dropdown"
                            >
                                {yearsList.map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="slider-wrapper">
                        <span className="slider-edge">J-1</span>
                        <input
                            type="range"
                            min="1"
                            max={daysInMonth}
                            value={currentDay}
                            onChange={(e) => setSpecificDate(currentYear, currentMonth, Number(e.target.value))}
                            className="timeline-range-input"
                            style={{ accentColor: accentColor }}
                        />
                        <span className="slider-edge">J-{daysInMonth}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
