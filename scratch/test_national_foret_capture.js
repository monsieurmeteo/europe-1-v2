import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import fs from 'fs';

const supabaseUrl = 'https://ubdevaemtwbzxksjlhjg.supabase.co';
const supabaseKey = 'sb_publishable_1qhA0xAnNSd3VxpoLdxYrQ_yUemEhaP';
const supabase = createClient(supabaseUrl, supabaseKey);

async function captureNationalForet() {
  console.log('Launching browser for National Foret (Today + Tomorrow)...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const periods = [
    { period: 0, suffix: 'today' },
    { period: 1, suffix: 'tomorrow' }
  ];

  for (const p of periods) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1500 });
    const url = `https://minisite-douai.vercel.app/vigilance?period=${p.period}&phenom=100`;
    console.log(`Navigating to National Foret [${p.suffix}]:`, url);
    await page.goto(url, { waitUntil: 'networkidle2' });

    const baseStyle = `
        .sidebar, .sidebar-card, .no-capture, .navbar, .top-nav, aside, .status-pill, .status-pill-new, .social-badges-overlay-bottom, .social-phenoms-footer-alt, .tabs-official, .dept-selector-inline, .mobile-header { display: none !important; }
        .social-capture-container { display: block !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 1200px !important; height: 1500px !important; z-index: 999999 !important; background: white !important; margin: 0 !important; padding: 0 !important; }
        body, html { background: white !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; width: 1200px !important; height: 1500px !important; }
    `;
    await page.addStyleTag({ content: baseStyle });

    // Carte seule
    await page.addStyleTag({ content: '.social-fb-header { display: none !important; } .social-fb-body { padding-top: 0 !important; } .social-fb-map-area { margin-top: -100px !important; }' });
    await new Promise(r => setTimeout(r, 2000));
    const buf = await page.screenshot({ fullPage: true });

    const fileName = `vigilance_foret_${p.suffix}.png`;
    console.log(`Uploading ${fileName} to Supabase...`);
    const { data, error } = await supabase.storage.from('vigilance-captures').upload(fileName, buf, { upsert: true, contentType: 'image/png' });
    if (error) console.error(`Upload error ${fileName}:`, error);
    else console.log(`✅ SUCCESS upload ${fileName}:`, data);

    // Carte avec titre social
    await page.addStyleTag({ content: '.social-fb-header { display: flex !important; }' });
    await new Promise(r => setTimeout(r, 1000));
    const bufSocial = await page.screenshot({ fullPage: true });

    const fileNameSocial = `vigilance_foret_${p.suffix}_social.png`;
    console.log(`Uploading ${fileNameSocial} to Supabase...`);
    const { data: dSoc, error: eSoc } = await supabase.storage.from('vigilance-captures').upload(fileNameSocial, bufSocial, { upsert: true, contentType: 'image/png' });
    if (eSoc) console.error(`Upload error ${fileNameSocial}:`, eSoc);
    else console.log(`✅ SUCCESS upload ${fileNameSocial}:`, dSoc);

    await page.close();
  }

  await browser.close();
  console.log('✅ Done capturing both National Forest maps!');
}

captureNationalForet();
