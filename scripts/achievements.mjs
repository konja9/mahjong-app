/**
 * Google Play Games の実績アイコン（512×512 PNG、15個）を store/play-games/ に書き出す。
 * 金のメダルの枠に、パチふとくん・改造パーツの絵・段位の判子などを入れる。Play Console の実績に上げる。
 *
 * 使い方：npx -p playwright -p tsx tsx scripts/achievements.mjs
 *   PLAYWRIGHT_FROM（playwright のある node_modules）・CHROME（ブラウザの実行ファイル）で場所を指定できる。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACHIEVEMENTS } from '../src/ui/achievements.ts';
import { lockSvg, partSvg } from '../src/ui/machine/partArt.ts';
import { charaSvg } from '../src/ui/tutorial/chara.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store', 'play-games');
const url = (p) => pathToFileURL(join(ROOT, p)).href;
const FONTS = ['@fontsource/noto-sans-jp/900.css'].map((f) => `<link rel="stylesheet" href="${url(`node_modules/${f}`)}">`).join('');

/** 判子のような文字（赤い枠の中に縦書き風の大きな字） */
const seal = (text, size = 150) =>
  `<div class="seal" style="font-size:${size}px">${text}</div>`;
const art = (svg, scale = 1) => `<div class="art" style="transform:scale(${scale})">${svg}</div>`;

const INNER = {
  firstBonus: art(charaSvg('grin'), 0.95),
  firstRush: art(partSvg('st'), 1.1),
  premium: art(partSvg('premium'), 1.1),
  rank5kyu: seal('5級'),
  rankShodan: seal('初段'),
  rankMeijin: seal('名人'),
  allSlots: art(lockSvg(), 1.05),
  allParts: art(partSvg('kakuhen'), 1.1),
  storyEnd: art(charaSvg('proud'), 0.95),
  allNotes: seal('帳', 210),
  streak20: seal('20<small>連</small>', 170),
  correct100: seal('100', 150),
  correct1000: seal('1000', 118),
  correct5000: seal('5000', 118),
  yakuman: seal('役満'),
};

const page = (inner, hard) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
  *{margin:0;box-sizing:border-box}
  body{width:512px;height:512px;display:grid;place-items:center;background:#0b0a0e;overflow:hidden}
  .medal{position:relative;width:480px;height:480px;border-radius:50%;display:grid;place-items:center;
    background:radial-gradient(circle at 35% 30%,#fff3b0,#f2c94c 35%,#c9962a 70%,#7c520c);
    box-shadow:0 0 0 10px #1a140c,inset 0 -10px 24px rgba(0,0,0,.35)}
  .medal::before{content:'';position:absolute;inset:34px;border-radius:50%;
    background:radial-gradient(circle at 50% 35%,${hard ? '#3a1018' : '#2a2016'},#0d0a07);box-shadow:inset 0 6px 18px rgba(0,0,0,.8),0 0 0 6px #1a140c}
  .art,.seal{position:relative;z-index:1}
  .art{width:300px;height:300px;display:grid;place-items:center}
  .art svg{width:100%;height:100%;filter:drop-shadow(0 10px 12px rgba(0,0,0,.6))}
  .seal{font-family:'Noto Sans JP',sans-serif;font-weight:900;color:#ffe9a0;line-height:1;letter-spacing:-.02em;
    text-shadow:0 6px 0 #6a0b12,0 0 30px rgba(255,216,74,.5)}
  .seal small{font-size:.55em}
</style></head><body><div class="medal">${inner}</div></body></html>`;

const req = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = req('playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const pg = await browser.newPage({ viewport: { width: 512, height: 512 } });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const TMP = join(OUT, '.render.html');
for (const [i, a] of ACHIEVEMENTS.entries()) {
  writeFileSync(TMP, page(INNER[a.id], a.hard));
  await pg.goto(pathToFileURL(TMP).href, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(100);
  await pg.screenshot({ path: join(OUT, `${String(i + 1).padStart(2, '0')}-${a.id}.png`), type: 'png' });
}
rmSync(TMP, { force: true });
await browser.close();
console.log(`実績のアイコン ${ACHIEVEMENTS.length}個を store/play-games/ に書き出しました`);
