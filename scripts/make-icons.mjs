// Renders the PNG app icons (web install + Android) from public/icon.svg. Run: node scripts/make-icons.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const svg = fs.readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
for (const [size, maskable] of [[192, false], [512, false], [512, true]]) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons need the art inside the middle 80% safe zone on a full-bleed background.
  const inner = maskable ? svg.replace('rx="112"', 'rx="0"').replace('<path d="M256', '<g transform="translate(51 51) scale(.8)"><path d="M256').replace('</svg>', '</g></svg>') : svg;
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icon-${size}${maskable ? '-maskable' : ''}.png`, omitBackground: true });
}
await browser.close();
