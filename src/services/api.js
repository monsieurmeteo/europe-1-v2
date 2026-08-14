import { format } from 'date-fns';
import { createClient } from '@supabase/supabase-js';

// URL RELATIVE pour passer par le Proxy Vite (contourne CORS)
const MF_BASE_URL = '/api-meteo';

// Client Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

export const weatherAPI = {
    /**
     * Get 6-minute observations for a specific station from Supabase (History)
     */
    getStation6mnHistory: async (stationId, dateObj = null) => {
        if (!supabase) return [];
        try {
            const targetDate = dateObj ? new Date(dateObj) : null;
            let start, end;
            let query = supabase
                .from('observations_6mn')
                .select('*')
                .eq('station_id', stationId);

            if (targetDate) {
                start = new Date(targetDate);
                start.setHours(0, 0, 0, 0);
                end = new Date(targetDate);
                end.setHours(23, 59, 59, 999);

                query = query
                    .gte('timestamp', start.toISOString())
                    .lte('timestamp', end.toISOString());
            }

            const { data, error } = await query
                .order('timestamp', { ascending: false })
                .limit(400); // Réduit de 1000 à 400 pour éviter les Timeouts Supabase
            
            if (error) {
                console.error(`[API] Error fetching history for ${stationId}:`, error);
                throw error;
            }

            let finalData = data ? [...data] : [];
            console.log(`[API] Fetched ${finalData.length} records for ${stationId}`);

            // FUSION DE LA FIN DE NUIT DU JOUR PRÉCÉDENT (tranche 18-00 de J-1)
            // Indispensable car l'archive quotidien J-1 a déjà supprimé la fin de nuit locale de la table active
            if (targetDate) {
                try {
                    const prevDate = new Date(start.getTime() - 24 * 60 * 60 * 1000);
                    const prevY = prevDate.getFullYear();
                    const prevM = String(prevDate.getMonth() + 1).padStart(2, '0');
                    const prevD = String(prevDate.getDate()).padStart(2, '0');
                    
                    let prevStationData = [];
                    
                    // On tente d'abord de charger le fichier journalier unifié
                    const prevFilePathSingle = `6mn/${prevY}/${prevM}/${prevD}.json`;
                    const { data: prevStorageData, error: prevStorageError } = await supabase.storage
                        .from('observations-archives')
                        .download(prevFilePathSingle);
                        
                    if (!prevStorageError && prevStorageData) {
                        const text = await prevStorageData.text();
                        const prevDataParsed = JSON.parse(text);
                        // Conserver uniquement la station ciblée et les heures UTC >= 18h
                        prevStationData = prevDataParsed.filter(obs => 
                            obs.station_id === stationId && 
                            new Date(obs.timestamp).getUTCHours() >= 18
                        );
                    } else {
                        // Fallback : chargement de la tranche slice historique
                        const prevFilePathSlice = `6mn/${prevY}/${prevM}/${prevD}/18-00.json`;
                        const { data: prevSliceData, error: prevSliceError } = await supabase.storage
                            .from('observations-archives')
                            .download(prevFilePathSlice);
                            
                        if (!prevSliceError && prevSliceData) {
                            const text = await prevSliceData.text();
                            const prevDataParsed = JSON.parse(text);
                            prevStationData = prevDataParsed.filter(obs => obs.station_id === stationId);
                        }
                    }
                    
                    if (prevStationData.length > 0) {
                        // Fusionner en évitant les doublons
                        const existingTimestamps = new Set(finalData.map(d => d.timestamp));
                        prevStationData.forEach(obs => {
                            if (!existingTimestamps.has(obs.timestamp)) {
                                finalData.push(obs);
                            }
                        });
                        
                        finalData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    }
                } catch (err) {
                    console.warn("[API] Previous day archive fallback failed:", err);
                }
            }

            // FALLBACK ARCHIVES COMPLETES (si pas ou peu de données dans la table active, ex: jour passé)
            if (targetDate && ((!data || data.length === 0) || data.filter(d => new Date(d.timestamp) >= start).length === 0)) {
                try {
                    const y = targetDate.getFullYear();
                    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
                    const d = String(targetDate.getDate()).padStart(2, '0');

                    // Chargement optimisé des 4 tranches (00-06, 06-12, 12-18, 18-00)
                    const SLICES = ['00-06', '06-12', '12-18', '18-00'];
                    const slicePromises = SLICES.map(async (sliceId) => {
                        const filePath = `6mn/${y}/${m}/${d}/${sliceId}.json`;
                        const { data: sliceData, error: sliceError } = await supabase.storage
                            .from('observations-archives').download(filePath);
                        if (!sliceError && sliceData) {
                            const text = await sliceData.text();
                            const parsed = JSON.parse(text);
                            return parsed.filter(obs => obs.station_id === stationId);
                        }
                        return [];
                    });

                    const results = await Promise.all(slicePromises);
                    let targetDayStationData = results.flat();

                    // Si pas de tranches trouvées, fallback sur le fichier unifié
                    if (targetDayStationData.length === 0) {
                        const singlePath = `6mn/${y}/${m}/${d}.json`;
                        const { data: sData, error: sErr } = await supabase.storage
                            .from('observations-archives').download(singlePath);
                        if (!sErr && sData) {
                            const text = await sData.text();
                            const parsed = JSON.parse(text);
                            targetDayStationData = parsed.filter(obs => obs.station_id === stationId);
                        }
                    }

                    if (targetDayStationData.length > 0) {
                        const existingTimestamps = new Set(finalData.map(d => d.timestamp));
                        targetDayStationData.forEach(obs => {
                            if (!existingTimestamps.has(obs.timestamp)) {
                                finalData.push(obs);
                            }
                        });
                        finalData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    }
                } catch (err) {
                    console.warn("[API] Archive fallback failed:", err);
                }
            }

            // Filtrage final strict selon la journée civile locale (convertie en UTC pour comparaison)
            if (targetDate) {
                const startTime = start.getTime();
                const endTime = end.getTime();
                finalData = finalData.filter(obs => {
                    const t = new Date(obs.timestamp).getTime();
                    return t >= startTime && t <= endTime;
                });
            }

            return finalData.map(obs => ({
                time: new Date(obs.timestamp),
                temp: obs.t,
                hum: obs.u,
                rain: obs.rr_per,
                rain_1h: obs.rr1,
                rain_3h: obs.rr3,
                rain_6h: obs.rr6,
                rain_12h: obs.rr12,
                rain_24h: obs.rr24,
                sun: obs.insolh,
                wind: obs.ff,
                gust: obs.fxi,
                dir: obs.dd,
                dewpoint: obs.td,
                pressure: obs.pres,
                vv: obs.vv,
                sun: obs.insolh,
                snow_depth: obs.ht_neige
            })).reverse();
        } catch (e) {
            console.error("[API] getStation6mnHistory error:", e);
            return [];
        }
    },

    /**
     * Get hourly observations for a specific station from Supabase (History)
     */
    getStationHourlyHistory: async (stationId, dateObj = null) => {
        if (!supabase) return [];
        try {
            let query = supabase
                .from('observations_horaire')
                .select('*')
                .eq('station_id', stationId);

            if (dateObj) {
                const start = new Date(dateObj);
                start.setHours(0, 0, 0, 0);
                const end = new Date(dateObj);
                end.setHours(23, 59, 59, 999);

                query = query
                    .gte('timestamp', start.toISOString())
                    .lte('timestamp', end.toISOString());
            } else {
                // Default: last 7 days for historical context
                query = query.gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
            }

            const { data, error } = await query.order('timestamp', { ascending: false });

            if (error) throw error;
            return data.map(obs => ({
                time: new Date(obs.timestamp),
                temp: obs.t,
                hum: obs.u,
                rain: obs.rr1,
                wind: obs.ff,
                gust: obs.fxi,
                timestamp_raw: obs.timestamp,
                vv: obs.vv
            })).reverse();
        } catch (e) {
            console.error("[API] getStationHourlyHistory error:", e);
            return [];
        }
    },

    /**
     * Get hourly observations for a range of dates
     */
    getStationHourlyHistoryRange: async (stationId, startDate, endDate) => {
        if (!supabase) return [];
        try {
            // Broaden search window to account for Timezones (UTC vs Local)
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0); // Local start
            // Go back 2h to catch UTC late night previous day if needed (though data is usually UTC)
            // Actually, Supabase stores UTC. If input is '2023-01-01', new Date('2023-01-01') is local 00:00.
            // If local is GMT+1, that is '2022-12-31T23:00:00Z'.
            // To be safe, just take the full days.

            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            const { data, error } = await supabase
                .from('observations_horaire')
                .select('*')
                .eq('station_id', stationId)
                .gte('timestamp', start.toISOString())
                .lte('timestamp', end.toISOString())
                .order('timestamp', { ascending: true }); // Chronological order directly

            if (error) throw error;
            return data.map(obs => ({
                time: new Date(obs.timestamp),
                temp: obs.t,
                hum: obs.u,
                rain: obs.rr1,
                wind: obs.ff,
                gust: obs.fxi,
                timestamp_raw: obs.timestamp,
                vv: obs.vv
            }));
        } catch (e) {
            console.error("[API] getStationHourlyHistoryRange error:", e);
            return [];
        }
    },

    /**
     * Get latest HOURLY observations for a whole department
     * Faster for mapping huge areas
     */
    getDepartmentLatestHoraire: async (deptCode) => {
        if (!supabase) return [];
        try {
            // Special handling for Corsica (2A/2B -> 20)
            let searchCode = deptCode;
            if (deptCode === '2A' || deptCode === '2B') {
                searchCode = '20';
            }


            const { data, error } = await supabase
                .from('observations_horaire')
                .select('*')
                .like('station_id', `${searchCode}%`)
                // Pour récupérer les dernières données, on peut filtrer par date récente
                // PLUTÔT que order/limit qui peut rater des stations si une est très bavarde
                .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                .order('timestamp', { ascending: false });

            if (error) throw error;

            // Group by station keeping only the very latest record
            const uniqueStations = {};
            data.forEach(obs => {
                // If we already have this station, check if this record is newer
                if (!uniqueStations[obs.station_id]) {
                    uniqueStations[obs.station_id] = obs;
                }
            });

            return Object.values(uniqueStations).map(obs => ({
                station_id: obs.station_id,
                latest: obs,
                history: [obs] // Map expects history array
            }));
        } catch (e) {
            console.error("[API] getDepartmentLatestHoraire error:", e);
            return [];
        }
    },

    /**
     * Get latest 6mn observations (Legacy / Detail view)
     */
    getDepartmentLatest: async (deptCode) => {
        if (!supabase) return [];
        try {
            let searchCode = deptCode;
            if (deptCode === '2A' || deptCode === '2B') {
                searchCode = '20';
            }

            // World mapping
            const worldMap = { 'M1': '0006', 'M2': '0001', 'M3': '0004', 'M5': '0002', 'M6': '0005', 'M7': '0007' };
            if (worldMap[deptCode]) searchCode = worldMap[deptCode];

            const { data, error } = await supabase
                .from('stations')
                .select('id, name')
                .like('id', `${searchCode}%`)
                .order('name', { ascending: true });

            if (error) throw error;

            return data.map(station => ({
                station_id: station.id,
                name: station.name,
                latest: null, // latest observation not strictly needed for the dropdown
                history: []
            }));
        } catch (e) {
            console.error("[API] getDepartmentLatest error:", e);
            return [];
        }
    },


    /**
     * Get historical daily extremes for a range of dates (BTP / Statistics)
     * Queries daily_summaries table which is kept long-term
     */
    getHistoricalData: async (startDate, endDate, lat = null, lon = null, stationId = null) => {
        if (!supabase) return [];
        try {
            let targetStationId = stationId;

            // 1. If lat/lon provided, find nearest station
            if (!targetStationId && lat && lon) {
                const { data: nearStations } = await supabase
                    .from('stations')
                    .select('id, lat, lon')
                    .not('lat', 'is', null);

                if (nearStations && nearStations.length > 0) {
                    // Sort by distance (Haversine approx)
                    nearStations.sort((a, b) => {
                        const distA = Math.sqrt(Math.pow(a.lat - lat, 2) + Math.pow(a.lon - lon, 2));
                        const distB = Math.sqrt(Math.pow(b.lat - lat, 2) + Math.pow(b.lon - lon, 2));
                        return distA - distB;
                    });
                    targetStationId = nearStations[0].id;
                }
            }

            // Fallback to Douai if still nothing
            if (!targetStationId) targetStationId = '59343001';

            // 2. Query daily_summaries
            const { data, error } = await supabase
                .from('daily_summaries')
                .select('*')
                .eq('station_id', targetStationId)
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: true });

            if (error) throw error;

            return data.map(d => ({
                date: d.date,
                min: d.temp_min,
                max: d.temp_max,
                rain: d.rain_total,
                gust: d.wind_gust_max,
                gust_time: d.wind_gust_time
            }));
        } catch (e) {
            console.error("[API] getHistoricalData error:", e);
            return [];
        }
    },

    /**
     * Search communes (official Gouv API)
     */
    searchCity: async (query) => {
        try {
            const response = await fetch(
                `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&limit=8&fields=nom,code,codesPostaux,centre,codeDepartement&boost=population`
            );
            if (!response.ok) return [];
            const data = await response.json();
            return data.map(c => ({
                id: c.code,
                name: c.nom,
                lat: c.centre.coordinates[1],
                lon: c.centre.coordinates[0],
                dept: c.codeDepartement,
                postcodes: c.codesPostaux
            }));
        } catch (error) {
            console.error("[API] searchCity error:", error);
            return [];
        }
    }
};

