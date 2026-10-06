/**
 * アプリのアイコン（ホーム画面・タブ）とスプラッシュを作る。
 * 絵柄：パチふとくん（ニヤリの顔）だけを大きく。背景はスタート画面と同じ金と赤のフェードに金の集中線と金貨
 * パチふとくん・ロゴはアプリと同じもの（src/ui/tutorial/chara.ts・src/ui/brand/logo.ts）を使う
 *
 * 使い方：npx -p playwright -p tsx tsx scripts/icons.mjs
 *   public/ に SVG と PNG（180・192・512・maskable 512・32）を書き出す。
 *   assets/ には Android アプリ用の元画像（アイコン・アダプティブアイコンの前景と背景・スプラッシュ）を書き出す。
 *   そのあと npx @capacitor/assets generate --android --iconBackgroundColor '#0b0a0e' --splashBackgroundColor '#0b0a0e'
 *   で android/ のアイコンとスプラッシュを作る。
 *   PLAYWRIGHT_FROM（playwright のある node_modules）・CHROME（ブラウザの実行ファイル）で場所を指定できる。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { charaSvg } from '../src/ui/tutorial/chara.ts';
import { logoSvg } from '../src/ui/brand/logo.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');
const ASSETS = join(ROOT, 'assets');
export const BG = '#0b0a0e';

/** パチふとくんの viewBox（chara.ts と同じ） */
const CH = { x: -8, y: -6, w: 118, h: 128 };

/** パチふとくんを (cx, cy) を中心に高さ h で置く */
function chara(face, cx, cy, h, rot = 0, crop = CH) {
  const w = (h * crop.w) / crop.h;
  const svg = charaSvg(face)
    .replace(/viewBox="[^"]+"/, `viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}"`)
    .replace('<svg ', `<svg x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" `);
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})">${svg}</g>`;
}

/** 金と赤のフェード（スタート画面と同じ重ね方）。s は一辺 */
function fade(id, w, h) {
  return `<defs>
    <radialGradient id="${id}g" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#f2c94c" stop-opacity=".42"/><stop offset=".7" stop-color="#f2c94c" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}r" cx="50%" cy="110%" r="70%"><stop offset="0" stop-color="#c8323c" stop-opacity=".55"/><stop offset=".75" stop-color="#c8323c" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}m" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="${id}mask"><rect width="${w}" height="${h}" fill="url(#${id}m)"/></mask>
  </defs>
  <rect width="${w}" height="${h}" fill="${BG}"/><rect width="${w}" height="${h}" fill="url(#${id}g)"/><rect width="${w}" height="${h}" fill="url(#${id}r)"/>`;
}

/** 金の集中線 */
function rays(id, cx, cy, R, n = 36) {
  const p = Array.from({ length: n }, (_, k) => {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI / n) * 0.9;
    return `<path d="M${cx} ${cy} L${cx + Math.cos(a0) * R} ${cy + Math.sin(a0) * R} L${cx + Math.cos(a1) * R} ${cy + Math.sin(a1) * R} Z" fill="#f2c94c" opacity="${k % 2 ? 0.08 : 0.16}"/>`;
  }).join('');
  return `<g mask="url(#${id}mask)">${p}</g>`;
}

/** 金貨（yan） */
function coin(x, y, r, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(1 .82)">
    <circle r="${r + 3}" fill="#000" opacity=".5"/>
    <circle r="${r}" fill="#e8b93a" stroke="#7a4f0a" stroke-width="${r * 0.12}"/>
    <circle r="${r * 0.72}" fill="none" stroke="#fff3b0" stroke-opacity=".7" stroke-width="${r * 0.08}"/>
    <path d="M${-r * 0.5} ${-r * 0.45} A${r * 0.7} ${r * 0.7} 0 0 1 ${r * 0.3} ${-r * 0.62}" stroke="#fff" stroke-opacity=".8" stroke-width="${r * 0.12}" fill="none" stroke-linecap="round"/>
  </g>`;
}

/** アイコン（512 四方）。parts：bg 背景・fg キャラ。scale は安全域に収めるための縮小 */
function iconSvg({ bg = true, fg = true, scale = 1 } = {}) {
  const back = bg ? `${fade('i', 512, 512)}${rays('i', 256, 230, 380)}` : '';
  const front = fg
    ? `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
        ${coin(78, 392, 40, -18)}${coin(440, 118, 30, 14)}${coin(452, 410, 24, 22)}
        ${chara('grin', 258, 268, 470, -6)}
      </g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${back}${front}</svg>`;
}

/** タブ用（16〜32px）：顔（回転灯・保留ランプ・液晶の目）を大きく切り出す */
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="${BG}"/>
    ${chara('grin', 32, 34, 66, 0, { x: 8, y: 0, w: 84, h: 84 })}
  </svg>`;
}

/** スプラッシュ（2732 四方）：フェードの中央にパチふとくん、下にロゴ */
function splashSvg() {
  const logo = logoSvg({ layout: 'wide', sub: false }).replace('<svg ', '<svg x="-560" y="-172" width="1120" height="343" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732">${fade('s', 2732, 2732)}${rays('s', 1366, 1200, 1500, 48)}
    ${chara('grin', 1366, 1180, 860, -4)}
    <g transform="translate(1366 1800)">${logo}</g></svg>`;
}

writeFileSync(join(OUT, 'icon.svg'), iconSvg());
writeFileSync(join(OUT, 'favicon.svg'), faviconSvg());

const req = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = req('playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage();
// 目の「中」などの字は Noto Sans JP で描くので、フォントを読んだ HTML の中に SVG を置いて撮る
const FONT = pathToFileURL(join(ROOT, 'node_modules/@fontsource/noto-sans-jp/900.css')).href;
const TMP = join(ROOT, 'assets', '.render.html');
mkdirSync(ASSETS, { recursive: true });
const png = async (svg, size, name, dir = OUT) => {
  await page.setViewportSize({ width: size, height: size });
  writeFileSync(TMP, `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${FONT}"><style>*{margin:0}body>svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.goto(pathToFileURL(TMP).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(dir, name), clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
};
await png(iconSvg(), 180, 'apple-touch-icon.png');
await png(iconSvg(), 192, 'icon-192.png');
await png(iconSvg(), 512, 'icon-512.png');
await png(iconSvg({ scale: 0.8 }), 512, 'icon-maskable-512.png');
await png(faviconSvg(), 32, 'favicon-32.png');
// Android：アダプティブアイコンは外周が切られるので、前景のキャラを安全域（中央 66%）に収める
await png(iconSvg(), 1024, 'icon-only.png', ASSETS);
await png(iconSvg({ bg: false, scale: 0.66 }), 1024, 'icon-foreground.png', ASSETS);
await png(iconSvg({ fg: false }), 1024, 'icon-background.png', ASSETS);
await png(splashSvg(), 2732, 'splash.png', ASSETS);
rmSync(TMP, { force: true });
await browser.close();
console.log('アイコンを書き出しました');
