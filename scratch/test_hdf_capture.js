import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import fs from 'fs';

const supabaseUrl = 'https://ubdevaemtwbzxksjlhjg.supabase.co';
const supabaseKey = 'sb_publishable_1qhA0xAnNSd3VxpoLdxYrQ_yUemEhaP';
const supabase = createClient(supabaseUrl, supabaseKey);

async function captureHDF() {
  console.log('Launching browser for HDF...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1500 });
  const url = 'https://minisite-douai.vercel.app/vigilance?period=0&region=HDF&phenom=100';
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'networkidle2' });

  const baseStyle = `
      .sidebar, .sidebar-card, .no-capture, .navbar, .top-nav, aside, .status-pill, .status-pill-new, .social-badges-overlay-bottom, .social-phenoms-footer-alt, .tabs-official, .dept-selector-inline, .mobile-header { display: none !important; }
      .social-capture-container { display: block !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 1200px !important; height: 1500px !important; z-index: 999999 !important; background: white !important; margin: 0 !important; padding: 0 !important; }
      body, html { background: white !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; width: 1200px !important; height: 1500px !important; }
  `;
  await page.addStyleTag({ content: baseStyle });
  await page.addStyleTag({ content: '.social-fb-header { display: none !important; } .social-fb-body { padding-top: 0 !important; } .social-fb-map-area { margin-top: -100px !important; }' });
  await new Promise(r => setTimeout(r, 2000));

  const buf = await page.screenshot({ fullPage: true });
  await browser.close();

  console.log('Uploading vigilance_foret_region_HDF_today.png to Supabase...');
  const { data, error } = await supabase.storage.from('vigilance-captures').upload('vigilance_foret_region_HDF_today.png', buf, { upsert: true, contentType: 'image/png' });
  if (error) console.error('Upload error:', error);
  else console.log('✅ SUCCESS upload:', data);

  console.log('Uploading vigilance_foret_region_HDF_tomorrow.png to Supabase...');
  const { data: d2, error: e2 } = await supabase.storage.from('vigilance-captures').upload('vigilance_foret_region_HDF_tomorrow.png', buf, { upsert: true, contentType: 'image/png' });
  if (e2) console.error('Upload error 2:', e2);
  else console.log('✅ SUCCESS upload 2:', d2);
}

captureHDF();
