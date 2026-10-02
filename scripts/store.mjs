/**
 * Google Play のストア掲載用の画像を作る。
 *   - store/screenshots/*.png：スマホのスクリーンショット（1080×1920）。store/raw/ の画面に見出しを付ける
 *   - store/feature-graphic.png：フィーチャー グラフィック（1024×500）
 *   - store/icon-512.png：アプリのアイコン（512×512）
 *
 * 使い方：npx -p playwright node scripts/store.mjs
 *   store/raw/ の画面は、Web 版をスマホの大きさ（360×640、3倍）で撮ったもの。差し替えるときは同じ大きさで撮る。
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'store');
const url = (p) => pathToFileURL(join(ROOT, p)).href;

/** 見出しと補足。並び順がストアでの表示順 */
const SHOTS = [
  { raw: '1-jissen', title: '手牌を見て、点数を答える', sub: '実戦・符計算・早見の3モード' },
  { raw: '2-explain', title: '面子ごとの符を図で解説', sub: '間違えても、どこで符が付くかがわかる' },
  { raw: '3-fu', title: '符計算だけを集中して練習', sub: '20符〜70符のボタンで答える' },
  { raw: '4-jackpot', title: '正解で台が回り、大当り！', sub: 'パチンコの演出で楽しく続けられる' },
  { raw: '5-bonus', title: 'BONUS で賞金アップ', sub: '連続正解・速答ほど yan が増える' },
  { raw: '6-help', title: '符の数え方を図解で確認', sub: '初めてでも順番どおりに覚えられる' },
];

const C = { bg: '#0c0d11', bg2: '#1a1b22', gold: '#d4af37', goldHot: '#ffd84a', text: '#f3f1ea', sub: '#a9acb6' };

const FONTS = ['@fontsource/noto-sans-jp/700.css', '@fontsource/noto-sans-jp/900.css']
  .map((f) => `<link rel="stylesheet" href="${url(`node_modules/${f}`)}">`)
  .join('');

const BASE = `*{margin:0;box-sizing:border-box}body{font-family:'Noto Sans JP',sans-serif;color:${C.text};overflow:hidden}`;

function shotHtml({ raw, title, sub }) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}
  body{width:1080px;height:1920px;background:radial-gradient(ellipse 90% 50% at 50% 0%,#2a2414,transparent 70%),linear-gradient(${C.bg2},${C.bg});}
  .cap{position:absolute;top:96px;left:0;right:0;text-align:center}
  h1{font-size:76px;font-weight:900;letter-spacing:.02em;line-height:1.25}
  h1 em{font-style:normal;color:${C.goldHot}}
  p{margin-top:22px;font-size:40px;font-weight:700;color:${C.sub}}
  .rule{width:120px;height:6px;border-radius:3px;margin:34px auto 0;background:${C.gold}}
  .phone{position:absolute;left:50%;top:430px;width:828px;height:1472px;transform:translateX(-50%);border-radius:56px;overflow:hidden;
    box-shadow:0 0 0 6px #2b2d36,0 0 0 8px rgba(212,175,55,.55),0 40px 80px rgba(0,0,0,.6)}
  .phone img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
  </style></head><body>
  <div class="cap"><h1>${title}</h1><p>${sub}</p><div class="rule"></div></div>
  <div class="phone"><img src="${url(`store/raw/${raw}.png`)}"></div>
  </body></html>`;
}

function featureHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}
  body{width:1024px;height:500px;background:radial-gradient(ellipse 70% 90% at 78% 50%,#3a2f12,transparent 70%),linear-gradient(120deg,${C.bg2},${C.bg});}
  .left{position:absolute;left:64px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:18px;width:500px}
  .brand{display:flex;align-items:center;gap:22px}
  .brand img{width:112px;height:112px;border-radius:26px;box-shadow:0 0 0 3px rgba(212,175,55,.6)}
  .name{font-size:76px;font-weight:900;letter-spacing:.04em;line-height:1}
  .name span{color:${C.goldHot}}
  .tag{font-size:36px;font-weight:900;line-height:1.35}
  .tag em{font-style:normal;color:${C.goldHot}}
  .sub{font-size:24px;font-weight:700;color:${C.sub}}
  .ph{position:absolute;width:250px;height:444px;border-radius:26px;overflow:hidden;
    box-shadow:0 0 0 4px #2b2d36,0 0 0 5px rgba(212,175,55,.5),0 24px 48px rgba(0,0,0,.6)}
  .ph img{width:100%;height:100%;object-fit:cover;object-position:top}
  .p1{right:196px;top:66px;transform:rotate(-6deg)}
  .p2{right:-34px;top:30px;transform:rotate(5deg)}
  </style></head><body>
  <div class="left">
    <div class="brand"><img src="${url('public/icon-512.png')}"><div class="name">パチ<span>ふと</span></div></div>
    <div class="tag">麻雀の点数計算を<br><em>パチンコ</em>で練習</div>
    <div class="sub">実戦・符計算・早見｜図解つきの解説</div>
  </div>
  <div class="ph p1"><img src="${url('store/raw/2-explain.png')}"></div>
  <div class="ph p2"><img src="${url('store/raw/4-jackpot.png')}"></div>
  </body></html>`;
}

const req = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = req('playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage();

// ローカルの画像・フォントを読めるよう、HTML をファイルに書いてから開く
const TMP = join(STORE, '.render.html');
const render = async (html, w, h, out) => {
  await page.setViewportSize({ width: w, height: h });
  writeFileSync(TMP, html);
  await page.goto(pathToFileURL(TMP).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: 'png' });
};

mkdirSync(join(STORE, 'screenshots'), { recursive: true });
for (const [i, s] of SHOTS.entries()) {
  await render(shotHtml(s), 1080, 1920, join(STORE, 'screenshots', `${i + 1}-${s.raw.replace(/^\d-/, '')}.png`));
}
await render(featureHtml(), 1024, 500, join(STORE, 'feature-graphic.png'));
copyFileSync(join(ROOT, 'public', 'icon-512.png'), join(STORE, 'icon-512.png'));
rmSync(TMP, { force: true });
await browser.close();
console.log('ストア用の画像を store/ に書き出しました');
