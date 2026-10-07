/**
 * 宣伝動画（30秒）を、縦 9:16（1080×1920）と横 16:9（1920×1080）で書き出す。
 * 素材（場面ごとの録画と出来事の時刻）は scripts/promo-capture.mjs で先に撮っておく。
 * 字幕・枠・最後の案内は HTML を透過 PNG にして重ね、音はゲームの BGM と効果音を時刻に合わせて重ねる。
 *
 * 使い方：npx -p playwright -p tsx tsx scripts/promo.mjs
 *   PROMO_CTA="Google Play でテスト中" で最後の案内の文を変えられる（既定は「Google Play で配信中」）
 *   PLAYWRIGHT_FROM（playwright のある node_modules）・CHROME（ブラウザの実行ファイル）で場所を指定できる。
 * 出力：store/promo/promo-9x16.mp4・promo-16x9.mp4・sheet-9x16.png・sheet-16x9.png
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logoSvg } from '../src/ui/brand/logo.ts';
import { charaSvg } from '../src/ui/tutorial/chara.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store', 'promo');
const WORK = join(OUT, 'work');
const CTA = process.env.PROMO_CTA ?? 'Google Play で配信中';
const clips = JSON.parse(readFileSync(join(WORK, 'clips.json'), 'utf8'));
const url = (p) => pathToFileURL(join(ROOT, p)).href;
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

// ------------------------------------------------------------ 時間割（30秒）

/** 映像の切れ目：clip の from 秒から dur 秒を、完成の at 秒に置く */
const SEGS = [
  { key: 'a', from: clips.a.jackpot + 0.4, dur: 3, at: 0 },
  { key: 'b', from: clips.b.q1 - 0.2, dur: 7, at: 3 },
  { key: 'c', from: clips.c.bq - 0.2, dur: 3.5, at: 10 },
  { key: 'c', from: clips.c.payout - 0.05, dur: 2.5, at: 13.5 },
  { key: 'd', from: clips.d.start - 0.2, dur: 6, at: 16 },
  { key: 'e', from: clips.e.cert + 0.2, dur: 5, at: 22 },
  { key: 'end', dur: 3, at: 27 },
];
const TOTAL = 30;
/** 録画の秒を完成の秒に（その場面が使われている切れ目で） */
const at = (key, t, n = 0) => {
  const s = SEGS.filter((x) => x.key === key)[n];
  return s.at + (t - s.from);
};

/** 字幕：表示する時間と、文（em は金色で強調） */
const CAPTIONS = [
  { from: 0, to: 3, text: '麻雀の点数計算で、<br><em>大当り。</em>' },
  { from: 3, to: 6.5, text: '点数を答えると、<br><em>台が回る</em>' },
  { from: 6.5, to: 10, text: '正解するほど、<br><em>当り</em>に近づく' },
  { from: 10, to: 16, text: '符が高い手ほど、<br><em>賞金アップ</em>' },
  { from: 16, to: 22, text: 'つまずいた所は、<br><em>図解で一段ずつ</em>' },
  { from: 22, to: 27, text: '腕を上げて、<br><em>段位</em>を上げろ' },
];

/** 曲：start 秒から dur 秒、完成の at 秒に置く */
const BGM = [
  { file: 'standard-bonus', at: 0, dur: 3, start: 6 },
  { file: 'normal', at: 3, dur: 7, start: 0 },
  { file: 'standard-bonus', at: 10, dur: 6, start: 12 },
  { file: 'keiko', at: 16, dur: 6, start: 0 },
  { file: 'title', at: 22, dur: 8, start: 0 },
];

/** 効果音：完成の秒と大きさ */
const SFX = [
  ['hit', at('a', clips.a.jackpot), 1],
  ['fanfare', at('a', clips.a.jackpot) + 0.3, 0.8],
  ['tap', at('b', clips.b.tap1), 0.9],
  ['comboHit', at('b', clips.b.tap1) + 0.15, 0.9],
  ['reelTick', at('b', clips.b.tap1) + 0.5, 0.5],
  ['reelStop0', at('b', clips.b.tap1) + 1.1, 0.7],
  ['reelStop2', at('b', clips.b.tap1) + 1.5, 0.7],
  ['tap', at('b', clips.b.tap2), 0.9],
  ['comboHit', at('b', clips.b.tap2) + 0.15, 0.9],
  ['lampUp', at('b', clips.b.tap2) + 0.6, 0.7],
  ['tap', at('c', clips.c.btap), 0.9],
  ['comboHit', at('c', clips.c.btap) + 0.15, 0.9],
  ['coin1', at('c', clips.c.btap) + 0.5, 0.8],
  ['register', 13.6, 0.9],
  ['coin2', 13.9, 0.8],
  ['coin3', 14.4, 0.8],
  ...Object.entries(clips.d)
    .filter(([k]) => /^step\d+$/.test(k))
    .map(([, t]) => ['step', at('d', t), 0.8])
    .filter(([, t]) => t >= 16 && t < 22),
  ['levelUp', 22.3, 0.9],
  ['stamp', 22.9, 0.9],
  ['align', 24.1, 0.8],
  ['end', 27.2, 0.7],
];

// ------------------------------------------------------------ 字幕・枠・最後の案内（透過 PNG）

const FONTS = ['@fontsource/noto-sans-jp/700.css', '@fontsource/noto-sans-jp/900.css', '@fontsource/reggae-one/400.css']
  .map((f) => `<link rel="stylesheet" href="${url(`node_modules/${f}`)}">`)
  .join('');
const C = { bg: '#0b0a0e', gold: '#f2c94c', goldDeep: '#c9962a', ivory: '#f6eedb', sub: '#d5c9ad' };
const FADE = `radial-gradient(ellipse 80% 42% at 50% 22%, rgba(242,201,76,.30), transparent 70%),
  radial-gradient(ellipse 110% 55% at 50% 108%, rgba(200,50,60,.45), transparent 72%), ${C.bg}`;
const BASE = `*{margin:0;box-sizing:border-box}body{font-family:'Noto Sans JP',sans-serif;color:${C.ivory};overflow:hidden;position:relative;background:transparent}
  .cap{font-weight:900;line-height:1.25;letter-spacing:.02em;text-shadow:0 5px 0 #000,0 0 24px rgba(0,0,0,.9)}
  .cap em{font-style:normal;color:${C.gold}}
  .flavor{font-family:'Reggae One',sans-serif;color:${C.ivory};text-shadow:0 4px 0 #6a0b12,0 0 26px rgba(200,50,60,.8)}`;
const page = (w, h, body, bg = 'transparent') =>
  `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}body{width:${w}px;height:${h}px;background:${bg}}</style></head><body>${body}</body></html>`;

/** 金の集中線 */
function rays(w, h, cx, cy, n = 40, op = 0.1) {
  const R = Math.hypot(w, h);
  const p = Array.from({ length: n }, (_, k) => {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI / n) * 0.9;
    return `<path d="M${cx} ${cy} L${cx + Math.cos(a0) * R} ${cy + Math.sin(a0) * R} L${cx + Math.cos(a1) * R} ${cy + Math.sin(a1) * R} Z" fill="${C.gold}" opacity="${k % 2 ? op / 2 : op}"/>`;
  }).join('');
  return `<svg style="position:absolute;inset:0" width="${w}" height="${h}">${p}</svg>`;
}

/** 縦の字幕：上の帯（ヘッダーの上にかぶせる。下の 4択は隠さない） */
const cap916 = (text) =>
  page(1080, 1920, `<div style="position:absolute;left:0;right:0;top:0;height:470px;background:linear-gradient(rgba(8,6,4,.92) 62%,rgba(8,6,4,0))"></div>
    <div class="cap" style="position:absolute;left:40px;right:40px;top:90px;text-align:center;font-size:92px">${text}</div>`);

/** 横の字幕：左に大きく。右にゲーム名 */
const cap169 = (text) =>
  page(1920, 1080, `<div class="cap" style="position:absolute;left:60px;width:640px;top:50%;transform:translateY(-50%);font-size:68px;white-space:nowrap">${text}</div>
    <div style="position:absolute;right:90px;top:50%;transform:translateY(-50%);width:440px;text-align:center">
      <div style="width:420px;margin:0 auto">${logoSvg({ layout: 'stack' })}</div>
      <div style="margin-top:22px;font-size:34px;font-weight:700;color:${C.sub}">麻雀の点数計算を<br>パチンコで覚える</div>
    </div>`);

/** 横の背景（スマホの画面の穴をあけて、録画の上に重ねる） */
const PHONE = { x: (1920 - 563) / 2, y: 40, w: 563, h: 1000 };
const front169 = page(
  1920,
  1080,
  `<svg style="position:absolute;inset:0" width="1920" height="1080"><defs><mask id="m"><rect width="1920" height="1080" fill="#fff"/>
     <rect x="${PHONE.x}" y="${PHONE.y}" width="${PHONE.w}" height="${PHONE.h}" rx="44" fill="#000"/></mask></defs>
     <foreignObject width="1920" height="1080" mask="url(#m)"><div xmlns="http://www.w3.org/1999/xhtml" style="width:1920px;height:1080px;background:${FADE}"></div></foreignObject></svg>
   <div style="position:absolute;left:0;top:0">${rays(1920, 1080, 960, 540, 48, 0.07)}</div>
   <div style="position:absolute;left:${PHONE.x - 12}px;top:${PHONE.y - 12}px;width:${PHONE.w + 24}px;height:${PHONE.h + 24}px;border-radius:54px;
     box-shadow:inset 0 0 0 12px #1a140c,0 0 0 4px ${C.goldDeep},0 30px 70px rgba(0,0,0,.7)"></div>`,
);

/** 最後の案内（不透明） */
const end916 = page(
  1080,
  1920,
  `${rays(1080, 1920, 540, 800, 48, 0.12)}
   <div style="position:absolute;left:150px;top:260px;width:780px">${logoSvg({ layout: 'stack' })}</div>
   <div class="cap" style="position:absolute;left:40px;right:40px;top:1060px;text-align:center;font-size:76px">麻雀の点数計算を、<br><em>パチンコ</em>で覚える</div>
   <div style="position:absolute;left:0;right:0;top:1340px;text-align:center"><span style="display:inline-block;padding:22px 54px;border-radius:999px;background:rgba(0,0,0,.6);box-shadow:inset 0 0 0 4px ${C.goldDeep};color:${C.gold};font-size:54px;font-weight:900">${CTA}</span></div>
   <div style="position:absolute;left:380px;top:1480px;width:330px;height:358px">${charaSvg('proud')}</div>`,
  FADE,
);
const end169 = page(
  1920,
  1080,
  `${rays(1920, 1080, 960, 460, 48, 0.12)}
   <div style="position:absolute;left:120px;top:150px;width:760px">${logoSvg({ layout: 'stack' })}</div>
   <div class="cap" style="position:absolute;left:960px;top:250px;font-size:84px">麻雀の点数計算を、<br><em>パチンコ</em>で覚える</div>
   <div style="position:absolute;left:960px;top:560px"><span style="display:inline-block;padding:20px 50px;border-radius:999px;background:rgba(0,0,0,.6);box-shadow:inset 0 0 0 4px ${C.goldDeep};color:${C.gold};font-size:52px;font-weight:900">${CTA}</span></div>
   <div style="position:absolute;left:1500px;top:680px;width:300px;height:326px">${charaSvg('proud')}</div>`,
  FADE,
);

const req = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = req('playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const pg = await browser.newPage();
const TMP = join(WORK, '.render.html');
async function png(html, w, h, out, transparent = true) {
  await pg.setViewportSize({ width: w, height: h });
  writeFileSync(TMP, html);
  await pg.goto(pathToFileURL(TMP).href, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(150);
  await pg.screenshot({ path: out, omitBackground: transparent });
}
mkdirSync(WORK, { recursive: true });
for (const [i, c] of CAPTIONS.entries()) {
  await png(cap916(c.text), 1080, 1920, join(WORK, `cap916-${i}.png`));
  await png(cap169(c.text), 1920, 1080, join(WORK, `cap169-${i}.png`));
}
await png(front169, 1920, 1080, join(WORK, 'front169.png'));
await png(end916, 1080, 1920, join(WORK, 'end916.png'), false);
await png(end169, 1920, 1080, join(WORK, 'end169.png'), false);
await browser.close();

// ------------------------------------------------------------ 映像：切れ目ごとに切り出してつなぐ（縦の素の映像）

const parts = [];
for (const [i, s] of SEGS.entries()) {
  const out = join(WORK, `seg-${i}.mp4`);
  const fade = `fade=t=in:st=0:d=0.15`;
  if (s.key === 'end') {
    ff(['-loop', '1', '-t', String(s.dur), '-i', join(WORK, 'end916.png'), '-vf', `fps=30,scale=1080:1920,setsar=1,format=yuv420p,${fade}`, '-c:v', 'libx264', '-crf', '16', out]);
  } else {
    ff(['-ss', String(Math.max(0, s.from)), '-t', String(s.dur), '-i', join(WORK, `${s.key}.mp4`), '-vf', `fps=30,scale=1080:1920,setsar=1,format=yuv420p,${fade}`, '-an', '-c:v', 'libx264', '-crf', '16', out]);
  }
  parts.push(out);
}
writeFileSync(join(WORK, 'concat.txt'), parts.map((p) => `file '${p}'`).join('\n'));
const RAW = join(WORK, 'raw916.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', join(WORK, 'concat.txt'), '-c', 'copy', RAW]);

// ------------------------------------------------------------ 音：BGM と効果音を重ねる

const audioIn = [];
const audioF = [];
for (const b of BGM) {
  audioIn.push('-i', join(ROOT, 'public', 'assets', 'bgm', `${b.file}.mp3`));
  const i = audioIn.length / 2 - 1;
  audioF.push(`[${i}]atrim=${b.start}:${b.start + b.dur},asetpts=PTS-STARTPTS,afade=t=in:d=0.15,afade=t=out:st=${b.dur - 0.25}:d=0.25,volume=0.38,adelay=${Math.round(b.at * 1000)}:all=1[m${i}]`);
}
for (const [name, t, vol] of SFX) {
  audioIn.push('-i', join(ROOT, 'public', 'assets', 'sfx', `${name}.mp3`));
  const i = audioIn.length / 2 - 1;
  audioF.push(`[${i}]volume=${vol},adelay=${Math.max(0, Math.round(t * 1000))}:all=1[m${i}]`);
}
const n = audioIn.length / 2;
audioF.push(`${Array.from({ length: n }, (_, i) => `[m${i}]`).join('')}amix=inputs=${n}:normalize=0:dropout_transition=0,alimiter=limit=0.9,atrim=0:${TOTAL},afade=t=out:st=${TOTAL - 0.6}:d=0.6[aout]`);
const AUDIO = join(WORK, 'audio.m4a');
ff([...audioIn, '-filter_complex', audioF.join(';'), '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', AUDIO]);

// ------------------------------------------------------------ 縦 9:16：字幕を重ねる

const between = (c) => `enable='between(t,${c.from},${c.to - 0.001})'`;
{
  const ins = ['-i', RAW, '-i', AUDIO];
  let chain = '[0:v]';
  const f = [];
  CAPTIONS.forEach((c, i) => {
    ins.push('-i', join(WORK, `cap916-${i}.png`));
    const next = i === CAPTIONS.length - 1 ? '[v]' : `[v${i}]`;
    f.push(`${chain}[${i + 2}:v]overlay=0:0:${between(c)}${next}`);
    chain = next;
  });
  ff([...ins, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '1:a', '-t', String(TOTAL), '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'copy', '-movflags', '+faststart', join(OUT, 'promo-9x16.mp4')]);
}

// ------------------------------------------------------------ 横 16:9：背景・スマホの枠・字幕・最後の案内

{
  const ins = ['-f', 'lavfi', '-i', `color=c=0x0b0a0e:s=1920x1080:r=30:d=${TOTAL}`, '-i', RAW, '-i', join(WORK, 'front169.png'), '-i', AUDIO, '-i', join(WORK, 'end169.png')];
  const f = [
    `[1:v]scale=${PHONE.w}:${PHONE.h}[ph]`,
    `[0:v][ph]overlay=${PHONE.x}:${PHONE.y}[b0]`,
    `[b0][2:v]overlay=0:0[b1]`,
  ];
  let chain = '[b1]';
  CAPTIONS.forEach((c, i) => {
    ins.push('-i', join(WORK, `cap169-${i}.png`));
    f.push(`${chain}[${i + 5}:v]overlay=0:0:${between(c)}[c${i}]`);
    chain = `[c${i}]`;
  });
  f.push(`${chain}[4:v]overlay=0:0:enable='gte(t,27)'[v]`);
  ff([...ins, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '3:a', '-t', String(TOTAL), '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'copy', '-movflags', '+faststart', join(OUT, 'promo-16x9.mp4')]);
}

// ------------------------------------------------------------ 確かめる用：1秒ごとのコマの一覧

ff(['-i', join(OUT, 'promo-9x16.mp4'), '-vf', 'fps=1,scale=216:384,tile=10x3:padding=6:color=white', '-frames:v', '1', join(OUT, 'sheet-9x16.png')]);
ff(['-i', join(OUT, 'promo-16x9.mp4'), '-vf', 'fps=1,scale=384:216,tile=6x5:padding=6:color=white', '-frames:v', '1', join(OUT, 'sheet-16x9.png')]);
console.log('宣伝動画を store/promo/ に書き出しました');
