import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

// Charge les variables d'environnement (local ou GitHub Actions)
// Déclencheur manuel de capture : 30 avril 2026 - 16:31
dotenv.config({ path: '.env.local' });


// Accepte VITE_SUPABASE_URL ou SUPABASE_URL (compatibilité GitHub Actions)
const rawUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://ubdevaemtwbzxksjlhjg.supabase.co';
const supabaseUrl = rawUrl.trim();
const rawKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_1qhA0xAnNSd3VxpoLdxYrQ_yUemEhaP';
const supabaseKey = rawKey.trim();

// Debug: afficher quelles variables sont disponibles
console.log('🔑 VITE_SUPABASE_URL:', supabaseUrl ? '✅ défini' : '❌ manquant');
console.log('🔑 SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅ défini' : '❌ manquant');

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variables Supabase manquantes! Vérifiez les secrets GitHub.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const CONFIG = {
    baseUrl: process.env.VITE_APP_URL || 'https://minisite-douai.vercel.app',
    viewport: { width: 1200, height: 1500 },
    storageBucket: 'vigilance-captures',
    fileName: 'vigilance_france_latest.png'
};

const TEMP_DIR = './temp_captures';
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

const REGIONS = [
    { id: 'ARA', name: 'Auvergne-Rhône-Alpes' },
    { id: 'BFC', name: 'Bourgogne-Franche-Comté' },
    { id: 'BRE', name: 'Bretagne' },
    { id: 'CVL', name: 'Centre-Val de Loire' },
    { id: 'COR', name: 'Corse' },
    { id: 'GES', name: 'Grand Est' },
    { id: 'HDF', name: 'Hauts-de-France' },
    { id: 'IDF', name: 'Île-de-France' },
    { id: 'NOR', name: 'Normandie' },
    { id: 'NAQ', name: 'Nouvelle-Aquitaine' },
    { id: 'OCC', name: 'Occitanie' },
    { id: 'PDL', name: 'Pays de la Loire' },
    { id: 'PAC', name: 'Provence-Alpes-Côte d\'Azur' },
];

async function captureAndUpload() {
    console.log('\n📸 CAPTURE VIGILANCE (FRANCE & RÉGIONS)\n');

    // Exécuter le scraper de température de la mer (bouées Meteociel)
    try {
        console.log("🌊 Lancement du scraper de température de la mer...");
        execSync('python scripts/scrape_sea_temperatures.py', { stdio: 'inherit' });
    } catch (e) {
        console.error("⚠️ Impossible d'exécuter le scraper de mer:", e.message);
    }

    // Générer l'image SST satellite Copernicus
    try {
        console.log("🛰️ Génération de la carte SST Copernicus...");
        execSync('python scripts/scrape_sst_copernicus.py', { stdio: 'inherit' });
    } catch (e) {
        console.error("⚠️ Copernicus SST échoué:", e.message);
    }

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const launchOptions = {
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    };
    if (fs.existsSync(chromePath)) {
        launchOptions.executablePath = chromePath;
    }

    const browser = await puppeteer.launch(launchOptions);

    try {
        const periods = [
            { id: 0, suffix: 'today' },
            { id: 1, suffix: 'tomorrow' }
        ];

        for (const period of periods) {
            // 1. Capture France nationale (Standard)
            console.log(`\n⏳ [FRANCE] [${period.suffix}] capture...`);
            const page = await browser.newPage();
            await page.setViewport(CONFIG.viewport);
            try {
                await captureScope(page, null, period.id, period.suffix);
            } catch (e) {
                console.error(`❌ Erreur France [${period.suffix}]:`, e.message);
            } finally {
                await page.close();
            }

            // 1b. Capture France nationale (Météo des Forêts)
            console.log(`\n⏳ [FRANCE FORET] [${period.suffix}] capture...`);
            const pageForet = await browser.newPage();
            await pageForet.setViewport(CONFIG.viewport);
            try {
                await captureScope(pageForet, null, period.id, period.suffix, '100');
            } catch (e) {
                console.error(`❌ Erreur France Forêt [${period.suffix}]:`, e.message);
            } finally {
                await pageForet.close();
            }

            // 2. Capture chaque région (concurrence de 3 pages en parallèle pour aller vite)
            const CONCURRENCY = 3;
            for (let i = 0; i < REGIONS.length; i += CONCURRENCY) {
                const chunk = REGIONS.slice(i, i + CONCURRENCY);
                // Standard
                await Promise.all(chunk.map(async (region) => {
                    console.log(`📍 CAPTURE RÉGION (Standard): ${region.name} (${region.id}) [${period.suffix}]`);
                    const page = await browser.newPage();
                    await page.setViewport(CONFIG.viewport);
                    try {
                        await captureScope(page, region.id, period.id, period.suffix);
                    } catch (e) {
                        console.error(`❌ Erreur ${region.id} [${period.suffix}]:`, e.message);
                    } finally {
                        await page.close();
                    }
                }));

                // Météo des Forêts
                await Promise.all(chunk.map(async (region) => {
                    console.log(`📍 CAPTURE RÉGION (Forêt): ${region.name} (${region.id}) [${period.suffix}]`);
                    const page = await browser.newPage();
                    await page.setViewport(CONFIG.viewport);
                    try {
                        await captureScope(page, region.id, period.id, period.suffix, '100');
                    } catch (e) {
                        console.error(`❌ Erreur ${region.id} Forêt [${period.suffix}]:`, e.message);
                    } finally {
                        await page.close();
                    }
                }));
            }
        }
    } finally {
        await browser.close();
    }

    console.log(`\n✅ TOUTES LES CAPTURES TERMINÉES!\n`);
}


async function captureScope(page, regionId, periodId, suffix, phenomId = null) {
    let scopeName = regionId ? `vigilance_region_${regionId}` : 'vigilance_france';
    if (phenomId === '100') {
        scopeName = regionId ? `vigilance_foret_region_${regionId}` : 'vigilance_foret';
    } else if (phenomId) {
        scopeName = regionId ? `vigilance_region_${regionId}_phenom_${phenomId}` : `vigilance_france_phenom_${phenomId}`;
    }
    const targetUrl = `${CONFIG.baseUrl}/vigilance?period=${periodId}${regionId ? `&region=${regionId}` : ''}${phenomId ? `&phenom=${phenomId}` : ''}`;
    
    console.log(`⏳ [${scopeName}] [${suffix}] Chargement: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Attendre que le composant signale qu'il est prêt (GeoData chargés et filtrés)
    try {
        console.log(`⏳ [${scopeName}] Attente du rendu final...`);
        await page.waitForSelector('.social-fb-container[data-ready="true"]', { timeout: 30000 });
        const title = await page.$eval('#vigilance-social-card h1', el => el.innerText);
        console.log(`✅ [${scopeName}] Prêt ! Titre détecté : "${title}"`);
    } catch (e) {
        console.log(`⚠️ Timeout data-ready, tentative de capture quand même...`);
    }


    // Injection CSS (Masquer tout sauf le conteneur de capture)
    const baseStyle = `
        .sidebar, .sidebar-card, .no-capture, .navbar, .top-nav, aside, .status-pill, .status-pill-new, .social-badges-overlay-bottom, .social-phenoms-footer-alt, .tabs-official, .dept-selector-inline, .mobile-header { display: none !important; }
        .social-capture-container { display: block !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 1200px !important; height: 1500px !important; z-index: 999999 !important; background: white !important; margin: 0 !important; padding: 0 !important; }
        body, html { background: white !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; width: 1200px !important; height: 1500px !important; }
    `;
    await page.addStyleTag({ content: baseStyle });

    // Attendre encore 1s après l'injection CSS
    await new Promise(r => setTimeout(r, 1000));

    // --- VERSION 1: CARTE SEULE (SANS TITRE) ---
    await page.addStyleTag({ content: '.social-fb-header { display: none !important; } .social-fb-body { padding-top: 0 !important; } .social-fb-map-area { margin-top: -100px !important; }' });
    await new Promise(r => setTimeout(r, 1500));
    
    const fileName1 = `${scopeName}_${suffix}.png`;
    const filePath1 = path.join(TEMP_DIR, fileName1);
    await page.screenshot({ path: filePath1, fullPage: true });

    const fileBuffer1 = fs.readFileSync(filePath1);
    await uploadToSupabase(fileName1, fileBuffer1);

    // --- VERSION 2: SOCIAL TITLE (AVEC TITRE) ---
    await page.addStyleTag({ content: '.social-fb-header { display: flex !important; }' });
    await new Promise(r => setTimeout(r, 1000));

    const fileName2 = `${scopeName}_${suffix}_social.png`;
    const filePath2 = path.join(TEMP_DIR, fileName2);
    await page.screenshot({ path: filePath2, fullPage: true });

    const fileBuffer2 = fs.readFileSync(filePath2);
    await uploadToSupabase(fileName2, fileBuffer2);

    // Historique Latest (uniquement pour France Demain)
    if (!regionId && periodId === 1) {
        const latestPrefix = phenomId === '100' ? 'vigilance_foret_latest' : 'vigilance_france_latest';
        await uploadToSupabase(`${latestPrefix}.png`, fileBuffer1);
        await uploadToSupabase(`${latestPrefix}_social.png`, fileBuffer2);
    }
}

async function uploadToSupabase(fileName, buffer) {
    const { error } = await supabase.storage
        .from(CONFIG.storageBucket)
        .upload(fileName, buffer, {
            contentType: 'image/png',
            upsert: true,
            cacheControl: '60'
        });
    if (error) {
        // ponytail: throw pour que GitHub Actions affiche ❌ au lieu de ✅ silencieux
        throw new Error(`Upload ${fileName} échoué: ${error.message}`);
    }
    console.log(`✅ Upload réussi: ${fileName}`);
}

captureAndUpload();
