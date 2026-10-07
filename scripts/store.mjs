/**
 * Google Play のストア掲載用の画像を作る。
 *   - store/screenshots/*.png：スマホのスクリーンショット 6枚（1080×1920）。store/raw/ の画面に見出しと絵を付ける
 *   - store/feature-graphic.png：フィーチャー グラフィック（1024×500）
 *   - store/icon-512.png：アプリのアイコン（512×512）
 *
 * 主役は「退屈な麻雀の点数計算のトレーニングが、パチンコで楽しくできる」こと。世界観（ギャンブル世紀末）は味付け。
 * 並び：1 ゲームの肝 → 2 実戦で困らない → 3 パチンコ → 4 稽古（初心者から上級者まで）→ 5 上達が見える → 6 世界観と締め
 *
 * 使い方：npx -p playwright -p tsx tsx scripts/store.mjs
 *   store/raw/ の画面は scripts/store-raw.mjs で撮る（412×732、3倍）。
 *   PLAYWRIGHT_FROM（playwright のある node_modules）・CHROME（ブラウザの実行ファイル）で場所を指定できる。
 *   CANDIDATES=1 で、store/candidates/pick/ の元画面ごとに1枚目とフィーチャー グラフィックを合成し、
 *   store/candidates/ に書き出す（見比べる用の一覧 sheet.png も作る）。ストアの画像は書き換えない。
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logoSvg } from '../src/ui/brand/logo.ts';
import { charaSvg } from '../src/ui/tutorial/chara.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'store');
const url = (p) => pathToFileURL(join(ROOT, p)).href;

const C = { bg: '#0b0a0e', gold: '#f2c94c', goldDeep: '#c9962a', ivory: '#f6eedb', sub: '#d5c9ad', red: '#c8323c' };

const FONTS = ['@fontsource/noto-sans-jp/700.css', '@fontsource/noto-sans-jp/900.css', '@fontsource/reggae-one/400.css']
  .map((f) => `<link rel="stylesheet" href="${url(`node_modules/${f}`)}">`)
  .join('');

/** 背景：スタート画面と同じ金と赤のフェード */
const FADE = `radial-gradient(ellipse 80% 42% at 50% 22%, rgba(242,201,76,.30), transparent 70%),
  radial-gradient(ellipse 110% 55% at 50% 108%, rgba(200,50,60,.45), transparent 72%), ${C.bg}`;

const BASE = `*{margin:0;box-sizing:border-box}body{font-family:'Noto Sans JP',sans-serif;color:${C.ivory};overflow:hidden;position:relative}
  h1{font-weight:900;letter-spacing:.02em;line-height:1.22;text-shadow:0 4px 0 #000,0 0 30px rgba(0,0,0,.6)}
  h1 em{font-style:normal;color:${C.gold}}
  .sub{font-weight:700;color:${C.sub};line-height:1.5}
  .phone{position:absolute;border-radius:48px;overflow:hidden;background:#000;
    box-shadow:0 0 0 7px #1a140c,0 0 0 11px ${C.goldDeep},0 0 0 13px #000,0 40px 80px rgba(0,0,0,.7)}
  .phone img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
  .chara{position:absolute;z-index:3;filter:drop-shadow(0 18px 24px rgba(0,0,0,.6))}
  .chara svg{width:100%;height:100%}
  .bubble{position:absolute;z-index:4;white-space:nowrap;padding:22px 30px;border-radius:30px;background:#fbf6e6;color:#1b1206;font-weight:900;line-height:1.45;
    box-shadow:0 0 0 5px #1b1206,0 16px 30px rgba(0,0,0,.5)}
  .bubble::after{content:'';position:absolute;width:34px;height:34px;background:#fbf6e6;box-shadow:5px 5px 0 #1b1206;transform:rotate(45deg)}
  .flavor{font-family:'Reggae One',sans-serif;color:${C.ivory};text-shadow:0 4px 0 #6a0b12,0 0 26px rgba(200,50,60,.8)}
  .tag{display:inline-block;padding:10px 26px;border-radius:999px;background:rgba(0,0,0,.55);box-shadow:inset 0 0 0 3px ${C.goldDeep};color:${C.gold};font-weight:900}`;

/** 金の集中線（SVG） */
function rays(w, h, cx, cy, n = 40, op = 0.1) {
  const R = Math.hypot(w, h);
  const p = Array.from({ length: n }, (_, k) => {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI / n) * 0.9;
    return `<path d="M${cx} ${cy} L${cx + Math.cos(a0) * R} ${cy + Math.sin(a0) * R} L${cx + Math.cos(a1) * R} ${cy + Math.sin(a1) * R} Z" fill="${C.gold}" opacity="${k % 2 ? op / 2 : op}"/>`;
  }).join('');
  return `<svg style="position:absolute;inset:0" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><radialGradient id="rf" cx="${cx / w}" cy="${cy / h}" r=".75"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="rm"><rect width="${w}" height="${h}" fill="url(#rf)"/></mask></defs><g mask="url(#rm)">${p}</g></svg>`;
}

/** 地下の賭場の街並みのシルエット（黒いビルとネオンの看板） */
function skyline(w, h, top) {
  let x = -20;
  let seed = 11;
  const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const parts = [];
  while (x < w) {
    const bw = 70 + r() * 130;
    const bh = 120 + r() * 300;
    const y = h - bh;
    parts.push(`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="#050304"/>`);
    // 窓とネオンの看板
    if (r() < 0.6) parts.push(`<rect x="${x + bw * 0.2}" y="${y + 24}" width="${bw * 0.6}" height="${14 + r() * 18}" rx="4" fill="${r() < 0.5 ? C.red : C.gold}" opacity=".85"/>`);
    for (let k = 0; k < 6; k++) if (r() < 0.45) parts.push(`<rect x="${x + 10 + r() * (bw - 26)}" y="${y + 70 + r() * (bh - 90)}" width="10" height="14" fill="#f2c94c" opacity="${0.25 + r() * 0.4}"/>`);
    x += bw + 4;
  }
  return `<svg style="position:absolute;left:0;top:${top}px" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.red}" stop-opacity="0"/><stop offset=".5" stop-color="${C.red}" stop-opacity=".35"/><stop offset="1" stop-color="${C.red}" stop-opacity="0"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#sk)"/>${parts.join('')}</svg>`;
}

const chara = (face, x, y, h, rot = 0) => {
  const w = (h * 118) / 128;
  return `<div class="chara" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg)">${charaSvg(face)}</div>`;
};
const phone = (raw, x, y, w, rot = 0, z = 1) =>
  `<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;height:${(w * 16) / 9}px;transform:rotate(${rot}deg);z-index:${z}"><img src="${url(raw.includes('/') ? raw : `store/raw/${raw}.png`)}"></div>`;
/** 吹き出し。tail は尻尾の向き（left・right・down） */
const bubble = (text, x, y, size, tail = 'left') => {
  const pos = { left: 'left:-14px;top:40%', right: 'right:-14px;top:40%', down: 'left:30%;bottom:-14px' }[tail];
  return `<div class="bubble" style="left:${x}px;top:${y}px;font-size:${size}px"><style>.b${x}${y}::after{}</style>${text}<i style="position:absolute;${pos};width:30px;height:30px;background:#fbf6e6;transform:rotate(45deg);box-shadow:${tail === 'right' ? '5px -5px' : tail === 'down' ? '5px 5px' : '-5px 5px'} 0 #1b1206"></i></div>`;
};
/** 見出しと補足（上の帯） */
const caption = (title, sub, size = 84) =>
  `<div style="position:absolute;top:110px;left:60px;right:60px;text-align:center"><h1 style="font-size:${size}px">${title}</h1><p class="sub" style="margin-top:26px;font-size:38px">${sub}</p></div>`;

function page(body, w = 1080, h = 1920) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}body{width:${w}px;height:${h}px;background:${FADE}}</style></head><body>${body}</body></html>`;
}

/** 大きなスマホの画面（中央）。画面の情報が読めるよう、キャンバスの幅の 3/4 ほどで見せる */
const bigPhone = (raw, top = 440, w = 800) => phone(raw, (1080 - w) / 2, top, w, 0, 1);

/** 1枚目（raw は元画面の名前か、ROOT からのパス） */
function coreHtml(raw = '1-jackpot') {
  return page(`${rays(1080, 1920, 540, 1100, 44, 0.08)}
      ${caption('麻雀の点数計算を、<br><em>パチンコ</em>で覚える', '正解で台が回り、大当りで BONUS。暗記がゲームに。', 82)}
      ${bigPhone(raw)}`);
}

const SHOTS = [
  // 1. ゲームの肝
  { name: '1-core', html: coreHtml() },
  // 2. 実戦で困らない
  {
    name: '2-real',
    html: page(`${rays(1080, 1920, 540, 1100, 44, 0.06)}
      ${caption('「何点？」と聞かれても<br><em>もう困らない</em>', '符と翻の内訳を、図解ですぐ確認できる。', 70)}
      ${bigPhone('2-explain')}`),
  },
  // 3. パチンコモード
  {
    name: '3-pachinko',
    html: page(`${rays(1080, 1920, 540, 1100, 44, 0.08)}
      ${caption('飽きずに、<br>何問でも解ける', 'リーチ・大当り・BONUS・RUSH で飽きさせない。', 82)}
      ${bigPhone('3-bonus')}
      ${chara('surprise', 800, 1560, 300, 8)}
      ${bubble('符が高いほど<br>賞金がデカいぜ', 610, 1400, 36, 'down')}`),
  },
  // 4. 稽古モード（初心者から上級者まで）
  {
    name: '4-keiko',
    html: page(`${rays(1080, 1920, 540, 1100, 44, 0.06)}
      ${caption('点数計算を、<br><em>一から</em>習得', '初心者は点数表から、上級者は符計算の速さを。', 82)}
      ${bigPhone('4-keiko')}
      ${chara('neutral', 0, 1580, 280, -8)}
      ${bubble('道場で<br>叩き込んでやる', 40, 1420, 36, 'down')}`),
  },
  // 5. 上達が見える
  {
    name: '5-progress',
    html: page(`${rays(1080, 1920, 540, 1100, 44, 0.08)}
      ${caption('苦手が分かる。<br><em>伸び</em>が見える。', '正答率と速さの伸びを記録。昇段試験の目安も。', 82)}
      ${bigPhone('5-summary')}`),
  },
  // 6. 世界観と締め
  {
    name: '6-survive',
    html: page(`${rays(1080, 1920, 540, 760, 48, 0.12)}
      <div style="position:absolute;left:270px;top:90px;width:540px">${logoSvg({ layout: 'stack' })}</div>
      <div style="position:absolute;top:530px;left:50px;right:50px;text-align:center">
        <h1 class="flavor" style="font-size:66px;font-weight:400;white-space:nowrap">お前は、ギャンブル世紀末を<br>生き残れるか</h1>
        <p class="sub" style="margin-top:28px;font-size:40px">数えて、成り上がれ。</p>
      </div>
      ${skyline(1080, 520, 1400)}
      ${phone('6-start', 620, 1000, 400, 5, 1)}
      ${chara('proud', 60, 1040, 600, -5)}`),
  },
];

function featureHtml(raw = '1-jackpot') {
  return page(
    `${rays(1024, 500, 800, 250, 40, 0.12)}
    <div style="position:absolute;left:44px;top:34px;width:430px">${logoSvg({ layout: 'wide', sub: true })}</div>
    <div style="position:absolute;left:52px;top:236px;width:520px">
      <h1 style="font-size:44px">麻雀の点数計算を、<br><em>パチンコ</em>で楽しく。</h1>
      <p class="flavor" style="margin-top:16px;font-size:24px">ギャンブル世紀末を、数えて成り上がれ。</p>
    </div>
    ${phone(raw, 610, 40, 220, -6, 1).replace('border-radius:48px', 'border-radius:22px').replace('0 0 0 7px #1a140c,0 0 0 11px', '0 0 0 3px #1a140c,0 0 0 5px')}
    ${chara('proud', 760, 150, 330, 6)}`,
    1024,
    500,
  );
}

const req = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = req('playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const pg = await browser.newPage();

// ローカルの画像・フォントを読めるよう、HTML をファイルに書いてから開く
const TMP = join(STORE, '.render.html');
const render = async (html, w, h, out) => {
  await pg.setViewportSize({ width: w, height: h });
  writeFileSync(TMP, html);
  await pg.goto(pathToFileURL(TMP).href, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(200);
  await pg.screenshot({ path: out, type: 'png' });
};

if (process.env.CANDIDATES) {
  // 1枚目とフィーチャー グラフィックの候補を、選んだ元画面ごとに作って並べる
  const dir = join(STORE, 'candidates');
  const picks = readdirSync(join(dir, 'pick')).filter((f) => f.endsWith('.png')).sort();
  const cells = [];
  for (const [i, f] of picks.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const raw = `store/candidates/pick/${f}`;
    await render(coreHtml(raw), 1080, 1920, join(dir, `${n}-core.png`));
    await render(featureHtml(raw), 1024, 500, join(dir, `${n}-feature.png`));
    cells.push(`<figure><b>${n}</b><img class="c" src="${url(`store/candidates/${n}-core.png`)}"><img class="f" src="${url(`store/candidates/${n}-feature.png`)}"></figure>`);
  }
  const cols = Math.min(4, picks.length);
  await render(
    `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},420px);gap:16px;padding:16px;width:${cols * 436 + 16}px}figure{margin:0;display:flex;flex-direction:column;gap:8px;color:#fff;font:900 40px 'Noto Sans JP'}.c{width:420px}.f{width:420px}</style></head><body>${cells.join('')}</body></html>`,
    cols * 436 + 16,
    Math.ceil(picks.length / cols) * (747 + 205 + 72) + 32,
    join(dir, 'sheet.png'),
  );
  rmSync(TMP, { force: true });
  await browser.close();
  console.log(`候補を ${dir} に書き出しました（一覧は sheet.png）`);
  process.exit(0);
}

rmSync(join(STORE, 'screenshots'), { recursive: true, force: true });
mkdirSync(join(STORE, 'screenshots'), { recursive: true });
for (const s of SHOTS) await render(s.html, 1080, 1920, join(STORE, 'screenshots', `${s.name}.png`));
await render(featureHtml(), 1024, 500, join(STORE, 'feature-graphic.png'));
copyFileSync(join(ROOT, 'public', 'icon-512.png'), join(STORE, 'icon-512.png'));
rmSync(TMP, { force: true });
await browser.close();
console.log('ストア用の画像を store/ に書き出しました');
