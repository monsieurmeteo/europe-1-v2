import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './layout/Sidebar';
import StationDetail from './modules/observations/StationDetail';
import CitySearch from './modules/search/CitySearch';
import AlertsManager from './modules/alerts/AlertsManager';
import VectorRegionPreview from './modules/maps/VectorRegionPreview';
import DailyExtremes from './modules/extremes/DailyExtremes';
import QualityControl from './modules/admin/QualityControl';
import LiveObservations from './modules/observations/LiveObservations';
import LinksManager from './modules/links/LinksManager';
import VigilanceFrance from './modules/vigilance/VigilanceFrance';
import RadarFrance from './modules/radar/RadarFrance';
import SatelliteFrance from './modules/satellite/SatelliteFrance';
import FoudreFrance from './modules/foudre/FoudreFrance';
import FoudreExpert from './modules/foudre/FoudreExpert';
import OrageArchives from './modules/observations/OrageArchives';
import FoudreDesignGallery from './modules/foudre/FoudreDesignGallery';
import CruesDashboard from './modules/crues/CruesDashboard';
import BtpManager from './modules/btp/BtpManager';
import CertificatMeteoManager from './modules/certificat/CertificatMeteoManager';
import AttestationIntemperieManager from './modules/certificat/AttestationIntemperieManager';
import MyStation from './modules/local/MyStation';
import SupervisionMap from './modules/supervision/SupervisionMap';
import ClimatologyDashboard from './modules/climatology/ClimatologyDashboard';
import NationalRecordsMonitor from './modules/climatology/NationalRecordsMonitor';
import Temperatures30Villes from './modules/observations/Temperatures30Villes';
import WindGustMap from './modules/maps/WindGustMap';
import FireRiskMap from './modules/fire/FireRiskMap';
import FireRiskForecast from './modules/fire/FireRiskForecast';
import RainfallMap from './modules/maps/RainfallMap';
import HumidityMap from './modules/maps/HumidityMap';
import TemperatureMap from './modules/maps/TemperatureMap';
import SeaTemperatureMap from './modules/maps/SeaTemperatureMap';
import HumidexMap from './modules/maps/HumidexMap';
import MonthlyMapsHub from './modules/maps/MonthlyMapsHub';
import MeteocielArchives from './modules/rankings/MeteocielArchives';
import StationArchives from './modules/rankings/StationArchives';
import HDFRadar from './modules/climatology/HDFRadar';
import WindyModule from './modules/windy/WindyModule';
import TableauxClassements from './modules/rankings/TableauxClassements';

import { Menu } from 'lucide-react';

import './App.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isEmbed = new URLSearchParams(location.search).get('embed') === '1';

  return (
    <div className="app-layout">
      {/* Header uniquement visible sur mobile via CSS, masqué en mode embed */}
      {!isEmbed && (
        <header className="mobile-header">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <span className="mobile-title">Météo-Climat Pro</span>
        </header>
      )}

      {!isEmbed && sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      {!isEmbed && <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}

      <main className={`main-content ${isEmbed ? 'embed-mode' : ''}`}>
        <Routes>
          <Route path="/" element={<DailyExtremes />} />
          <Route path="/tableaux" element={<TableauxClassements />} />
          <Route path="/classements" element={<TableauxClassements />} />
          <Route path="/observations/station/:stationId" element={<StationDetail />} />
          <Route path="/search" element={<CitySearch />} />
          <Route path="/alerts" element={<AlertsManager />} />
          <Route path="/cartes-export" element={<VectorRegionPreview />} />
          <Route path="/admin/quality" element={<QualityControl />} />
          <Route path="/live-observations" element={<LiveObservations />} />
          <Route path="/mes-liens" element={<LinksManager />} />
          <Route path="/vigilance" element={<VigilanceFrance />} />
          <Route path="/radar" element={<RadarFrance />} />
          <Route path="/satellite" element={<SatelliteFrance />} />
          <Route path="/foudre" element={<FoudreExpert />} />
          <Route path="/foudre-france" element={<FoudreFrance />} />
          <Route path="/foudre-expert" element={<FoudreExpert />} />
          <Route path="/foudre-archives" element={<OrageArchives />} />
          <Route path="/foudre-designs" element={<FoudreDesignGallery />} />
          <Route path="/crues" element={<CruesDashboard />} />
          <Route path="/btp" element={<BtpManager />} />
          <Route path="/certificat" element={<CertificatMeteoManager />} />
          <Route path="/attestation-intemperie" element={<AttestationIntemperieManager />} />
          <Route path="/mon-secteur" element={<MyStation />} />
          <Route path="/supervision" element={<SupervisionMap />} />
          <Route path="/climatologie" element={<ClimatologyDashboard />} />
          <Route path="/supervision-records" element={<NationalRecordsMonitor />} />
          <Route path="/temperatures-30-villes" element={<Temperatures30Villes />} />
          <Route path="/carte-rafales" element={<WindGustMap />} />
          <Route path="/carte-pluie" element={<RainfallMap />} />
          <Route path="/carte-humidite" element={<HumidityMap />} />
          <Route path="/carte-temperatures" element={<TemperatureMap />} />
          <Route path="/carte-temperature-mer" element={<SeaTemperatureMap />} />
          <Route path="/carte-humidex" element={<HumidexMap />} />
          <Route path="/cartes-mensuelles" element={<MonthlyMapsHub />} />
          <Route path="/archives-classements" element={<MeteocielArchives />} />
          <Route path="/archives-station" element={<StationArchives />} />
          <Route path="/hdf-radar" element={<HDFRadar />} />
          <Route path="/windy" element={<WindyModule />} />
          <Route path="/carte-feux" element={<FireRiskMap />} />
          <Route path="/previsions-feux" element={<FireRiskForecast />} />

        </Routes>

      </main>

    </div>
  );
}

export default App;
