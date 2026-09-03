import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Map as MapIcon, Zap, Table, Search, Link as LinkIcon, ShieldCheck, Waves, Radio, HardHat, Home, Activity, Clock, Image as ImageIcon, LayoutGrid, Satellite, Thermometer, FileText, Droplets, BarChart3, Wind, Flame, Trophy
} from 'lucide-react';
import clsx from 'clsx';
import { DEPARTMENTS } from '../data/departments';
import { weatherAPI } from '../services/api';
import { geoService } from '../services/geoService';
import './Sidebar.css';

export default function Sidebar({ isOpen, onClose }) {
  const [selectedDept, setSelectedDept] = useState('');
  const [activeZone, setActiveZone] = useState('FR'); // FR, OM
  const [stations, setStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [stationNames, setStationNames] = useState({});

  const navigate = useNavigate();
  const location = useLocation(); // Replaces window.location for React Router

  // Get current station ID from URL if we are on a station page
  const currentPath = location.pathname;
  const currentStationId = currentPath.includes('/observations/station/')
    ? currentPath.split('/').pop()
    : '';

  // When selectedDept changes, fetch stations
  useEffect(() => {
    if (!selectedDept) {
      setStations([]);
      return;
    }

    async function fetchStations() {
      setLoadingStations(true);
      try {
        const data = await weatherAPI.getDepartmentLatest(selectedDept);
        setStations(data);

        // Background name resolution for dropdown
        const names = { ...stationNames };
        for (const s of data) {
          if (!names[s.station_id]) {
            const name = await geoService.getCommuneName(s.station_id.substring(0, 5), s.station_id);
            names[s.station_id] = name;
          }
        }
        setStationNames(names);
      } catch (e) {
        console.error("Error loading stations:", e);
      } finally {
        setLoadingStations(false);
      }
    }
    fetchStations();
  }, [selectedDept]);

  const handleStationChange = (e) => {
    const stationId = e.target.value;
    if (stationId) {
      navigate(`/observations/station/${stationId}`);
      if (window.innerWidth < 768) onClose();
    }
  };

  const filteredDepts = DEPARTMENTS.filter(d => {
    if (activeZone === 'FR') return d.code.length === 2 && d.code < '96';
    return d.code.length === 3 && d.code.startsWith('9'); // Outre-Mer only
  });

  // Helper to check if a section should be active
  const isPathActive = (paths) => paths.some(p => currentPath === p || currentPath.startsWith(p));

  return (
    <aside className={clsx("sidebar", { "open": isOpen })}>
      <div className="sidebar-header">
        <div className="brand-container" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img src="/logo.jpg" alt="Logo" className="brand-logo" />
        </div>
        <button className="close-btn mobile-only" onClick={onClose}>&times;</button>
      </div>

      <nav className="sidebar-nav" onClick={(e) => { if (e.target.closest('a') && onClose) onClose(); }}>
        {/* QUICK SELECTOR - ESSENTIAL CORE */}
        <div className="quick-access-box">
          <div className="quick-title">
            <Zap size={14} className="text-warning" />
            <span>ACCÈS RAPIDE</span>
          </div>

          <div className="select-group">
            <select
              className="styled-select"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            >
              <option value="">Choisir un territoire...</option>
              {filteredDepts.map(d => (
                <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
              ))}
            </select>

            <select
              className="styled-select"
              disabled={!selectedDept || loadingStations}
              onChange={handleStationChange}
              value={currentStationId}
            >
              <option value="">{loadingStations ? 'Chargement...' : 'Choisir une station...'}</option>
              {stations.map(s => (
                <option key={s.station_id} value={s.station_id}>
                  {stationNames[s.station_id] || s.name || s.station_id} ({s.station_id})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="nav-divider-label">MA MÉTÉO</div>
        <NavLink to="/mon-secteur" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Home size={18} style={{ color: '#2563eb' }} />
          <span>Ma Station Direct</span>
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Search size={18} />
          <span>Ma Ville</span>
        </NavLink>



        <div className="nav-divider-label">CARTES</div>
        <NavLink to="/supervision" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Activity size={18} style={{ color: '#ef4444' }} />
          <span>Supervision Live</span>
        </NavLink>
        <NavLink to="/radar" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Radio size={18} style={{ color: '#0ea5e9' }} />
          <span>Radar Pluie</span>
        </NavLink>
        <NavLink to="/windy" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Wind size={18} style={{ color: '#10b981' }} />
          <span>Module Windy</span>
        </NavLink>
        <NavLink to="/carte-rafales" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <MapIcon size={18} style={{ color: '#8b5cf6' }} />
          <span>Carte des Rafales</span>
        </NavLink>
        <NavLink to="/carte-pluie" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Droplets size={18} style={{ color: '#0ea5e9' }} />
          <span>Carte des Pluies</span>
        </NavLink>
        <NavLink to="/carte-humidite" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Droplets size={18} style={{ color: '#0288D1' }} />
          <span>Carte Humidité</span>
        </NavLink>
        <NavLink to="/carte-temperatures" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Thermometer size={18} style={{ color: '#ef4444' }} />
          <span>Carte Températures</span>
        </NavLink>
        <NavLink to="/carte-temperature-mer" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Waves size={18} style={{ color: '#0ea5e9' }} />
          <span>Température de la Mer</span>
        </NavLink>
        <NavLink to="/carte-humidex" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Thermometer size={18} style={{ color: '#ec4899' }} />
          <span>Carte Humidex</span>
        </NavLink>
        <NavLink to="/carte-feux" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Flame size={18} style={{ color: '#f97316' }} />
          <span>🔥 Risque Incendie</span>
        </NavLink>
        <NavLink to="/previsions-feux" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Flame size={18} style={{ color: '#ef4444' }} />
          <span>🔮 Prévision Risque Feux</span>
        </NavLink>
        <NavLink to="/cartes-mensuelles" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <BarChart3 size={18} style={{ color: '#f59e0b' }} />
          <span>Cartes Mensuelles</span>
        </NavLink>
        <NavLink to="/satellite" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Satellite size={18} style={{ color: '#60a5fa' }} />
          <span>Satellite Europe</span>
        </NavLink>
        <NavLink to="/foudre" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Zap size={18} style={{ color: '#fbbf24' }} />
          <span>Impacts de foudre</span>
        </NavLink>
        <NavLink to="/foudre-archives" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <ImageIcon size={18} style={{ color: '#fbbf24' }} />
          <span>Archives Agate</span>
        </NavLink>
        <NavLink to="/foudre-designs" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <LayoutGrid size={18} style={{ color: '#ef4444' }} />
          <span>Galerie Designs</span>
        </NavLink>
        <NavLink to="/crues" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Waves size={18} style={{ color: '#3b82f6' }} />
          <span>Crues & Rivières</span>
        </NavLink>
        <NavLink to="/vigilance" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <ShieldCheck size={18} style={{ color: '#fbbf24' }} />
          <span>Vigilance France</span>
        </NavLink>

        <div className="nav-divider-label">DONNÉES</div>
        <NavLink to="/tableaux" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Trophy size={18} style={{ color: '#f59e0b' }} />
          <span>Tableaux & Classements</span>
        </NavLink>
        <NavLink to="/" end className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Table size={18} />
          <span>Extrêmes du jour</span>
        </NavLink>
        <NavLink to="/live-observations" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Zap size={18} className="text-warning" />
          <span>Observations Live</span>
        </NavLink>
        <NavLink to="/temperatures-30-villes" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Thermometer size={18} style={{ color: '#ef4444' }} />
          <span>Températures 30 Villes</span>
        </NavLink>
        <NavLink to="/climatologie" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Clock size={18} style={{ color: '#0ea5e9' }} />
          <span>Normales & Records Postes</span>
        </NavLink>
        <NavLink to="/supervision-records" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Zap size={18} style={{ color: '#ef4444' }} />
          <span>Supervision Records</span>
        </NavLink>
        <NavLink to="/hdf-radar" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Radio size={18} style={{ color: '#ef4444' }} />
          <span>Radar Records HDF</span>
        </NavLink>
        <NavLink to="/btp" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <HardHat size={18} style={{ color: '#f59e0b' }} />
          <span>BTP & Chantiers</span>
        </NavLink>
        <NavLink to="/certificat" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <ShieldCheck size={18} style={{ color: '#059669' }} />
          <span>Certificat Météo</span>
        </NavLink>
        <NavLink to="/attestation-intemperie" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <FileText size={18} style={{ color: '#0ea5e9' }} />
          <span>Attestation Intempérie</span>
        </NavLink>

        <div className="nav-divider-label">ARCHIVES</div>
        <NavLink to="/archives-station" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <Clock size={18} style={{ color: '#60a5fa' }} />
          <span>Historique Station</span>
        </NavLink>

        <div className="nav-divider-label">OUTILS</div>
        <NavLink to="/cartes-export" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <MapIcon size={18} />
          <span>Générateur Cartes</span>
        </NavLink>
        <NavLink to="/admin/quality" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <ShieldCheck size={18} style={{ color: '#f59e0b' }} />
          <span>Qualité Données</span>
        </NavLink>
        <NavLink to="/mes-liens" className={({ isActive }) => clsx("nav-item", { active: isActive })}>
          <LinkIcon size={18} />
          <span>Mes Liens Web</span>
        </NavLink>

      </nav>
    </aside>
  );
}
