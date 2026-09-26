/**
 * アプリのアイコン（ホーム画面・タブ）を作る。
 * 絵柄：黒金の液晶の枠の中で、赤五筒が3枚そろった「大当りの瞬間」
 *
 * 使い方：npx -p playwright node scripts/icons.mjs
 *   public/ に SVG と PNG（180・192・512・maskable 512・32）を書き出す。
 *   Playwright が無い環境では SVG だけを書き出す。
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const C = {
  bg: '#0c0d11',
  gold: '#d4af37',
  goldHot: '#ffd84a',
  face: '#f3efe2',
  edge: '#b9b29c',
  bone: '#e6dcc2',
  back: '#1f5c45',
  red: '#c8323c',
};

const DEFS = `<defs>
  <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.35" stop-color="#fff" stop-opacity="0"/>
    <stop offset="0.8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/>
  </linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="goldline" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fbf0c4"/><stop offset="0.55" stop-color="${C.gold}"/><stop offset="1" stop-color="#8a6a1c"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${C.goldHot}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.goldHot}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0.9"/><stop offset="0.25" stop-color="#15161c"/>
    <stop offset="0.75" stop-color="#15161c"/><stop offset="1" stop-color="#000" stop-opacity="0.9"/>
  </linearGradient>
</defs>`;

/** 赤五筒 1枚（アプリの tileSvg と同じ形：面 60×80＋厚み 7） */
function redFive(x, y, s) {
  const coin = (cx, cy) => {
    const r = 8.5;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.red}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.7}" fill="${C.face}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.44}" fill="${C.red}"/>`;
  };
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="1" y="7" width="58" height="79" rx="8" fill="${C.back}"/>
    <rect x="1" y="3.5" width="58" height="79" rx="8" fill="${C.bone}"/>
    <rect x="1" y="1" width="58" height="78" rx="7" fill="${C.face}" stroke="${C.edge}" stroke-width="1"/>
    ${coin(18, 20)}${coin(42, 20)}${coin(30, 40)}${coin(18, 60)}${coin(42, 60)}
    <circle cx="51" cy="9" r="3" fill="${C.red}"/>
    <rect x="1" y="1" width="58" height="78" rx="7" fill="url(#shade)"/>
    <path d="M4 8 Q4 4 8 4 H37 Q18 9 4 26 Z" fill="url(#gloss)" opacity="0.35"/>
    <rect x="2.6" y="2.6" width="54.8" height="74.8" rx="5.8" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="0.9"/>
  </g>`;
}

/** 液晶の枠と、そろった3枚（512 基準の座標） */
function artwork() {
  const s = 1.85;
  const w = 60 * s;
  const gap = 12;
  const total = w * 3 + gap * 2;
  const x0 = 256 - total / 2;
  const y0 = 256 - (87 * s) / 2 + 4;
  const tiles = [0, 1, 2].map((i) => redFive(x0 + i * (w + gap), y0, s)).join('');
  return `
    <ellipse cx="256" cy="256" rx="230" ry="160" fill="url(#glow)"/>
    <rect x="52" y="128" width="408" height="256" rx="26" fill="#07070a" stroke="url(#goldline)" stroke-width="8"/>
    <rect x="70" y="146" width="372" height="220" rx="14" fill="url(#screen)" stroke="${C.gold}" stroke-opacity="0.45" stroke-width="3"/>
    ${tiles}
    <rect x="70" y="${256 + 2}" width="372" height="4" fill="${C.goldHot}" opacity="0.85"/>
    <path d="M70 258 l-14 -12 v28 z M442 258 l14 -12 v28 z" fill="${C.goldHot}"/>
    <path d="M78 150 L200 150 L120 362 L78 362 Z" fill="#fff" opacity="0.05"/>`;
}

/** ホーム画面用：角丸なしの正方形（角丸・丸の切り抜きは OS が付ける）。scale で余白を足す */
function iconSvg(scale = 1) {
  const t = scale === 1 ? '' : ` transform="translate(256 256) scale(${scale}) translate(-256 -256)"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}<rect width="512" height="512" fill="${C.bg}"/><g${t}>${artwork()}</g></svg>`;
}

/** タブ用：16〜32px でも潰れないよう、金の枠に牌1枚 */
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${DEFS}
  <rect x="1" y="1" width="62" height="62" rx="13" fill="${C.bg}" stroke="url(#goldline)" stroke-width="3"/>
  ${redFive(17.5, 5.5, 0.48)}
  </svg>`;
}

const files = {
  'icon.svg': iconSvg(),
  'favicon.svg': faviconSvg(),
};
for (const [name, svg] of Object.entries(files)) writeFileSync(join(OUT, name), svg);

let chromium;
try {
  const req = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
  ({ chromium } = req('playwright'));
} catch {
  console.log('Playwright が無いので SVG だけ書き出しました');
  process.exit(0);
}
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage();
const png = async (svg, size, name) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}img{display:block;width:${size}px;height:${size}px}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
  await page.waitForLoadState('load');
  await page.screenshot({ path: join(OUT, name), clip: { x: 0, y: 0, width: size, height: size } });
};
await png(iconSvg(), 180, 'apple-touch-icon.png');
await png(iconSvg(), 192, 'icon-192.png');
await png(iconSvg(), 512, 'icon-512.png');
await png(iconSvg(0.78), 512, 'icon-maskable-512.png');
await png(faviconSvg(), 32, 'favicon-32.png');
await browser.close();
console.log('アイコンを書き出しました');
