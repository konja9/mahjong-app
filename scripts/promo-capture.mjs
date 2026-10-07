/**
 * 宣伝動画の素材を撮る（場面ごとの録画と、出来事の時刻）。つなぐのは scripts/promo.mjs。
 * スマホの大きさ（CSS 432×768、2.5倍）で、Chrome の画面配信（CDP の screencast）のコマを 1080×1920 のまま受け取り、
 * ffmpeg で 30fps の動画にする。音は入らない（つなぐときに BGM と効果音を重ねる）。
 *
 * 使い方：開発サーバーを立ててから
 *   npx -p playwright node scripts/promo-capture.mjs http://localhost:5179/
 *   ONLY=a,c のように場面を選んで撮り直せる（a 大当り / b 遊び方 / c BONUS / d 稽古 / e 試験）
 *   PLAYWRIGHT_FROM（playwright のある node_modules）・CHROME（ブラウザの実行ファイル）で場所を指定できる。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, 'store', 'promo', 'work');
const BASE = (process.argv[2] ?? 'http://localhost:5179/').replace(/\/?$/, '/');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);

const req = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = req('playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
mkdirSync(WORK, { recursive: true });
const META = join(WORK, 'clips.json');
const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {};

const W = 432;
const H = 768;
const DONE = { done: ['prologue', 'pachinko', 'keiko', 'tools'] };
const TIPS = ['enter', 'reach', 'jackpot', 'rush', 'miss', 'fast', 'low', 'firstHit', 'denchuSoon', 'denchu', 'bonusFu', 'ladder', 'bonusMiss', 'roundUp', 'uwanose', 'rushMiss', 'shop', 'machine', 'levelUp', 'mission'];
const TITLE = { owned: ['title-fu-reader'], equip: { title: 'title-fu-reader' } };

/** 押した場所に出す光る丸（何を押したか、動画で分かるように） */
const TAP_CSS = `.promo-tap{position:fixed;z-index:99999;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;pointer-events:none;
  border:4px solid #fff3b0;box-shadow:0 0 18px #ffd84a,inset 0 0 12px #ffd84a;animation:promo-tap .6s ease-out forwards}
  @keyframes promo-tap{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}`;

/** 1つの場面を撮る。play の中で mark(name) を呼ぶと、録画の始まりからの秒を残す */
async function scene(key, { settings, level = { exp: 2400, read: [1, 2, 3] }, extra = {} }, play) {
  if (!want(key)) return;
  const dir = join(WORK, `frames-${key}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
  const t0 = Date.now();
  const marks = {};
  const mark = (name) => {
    marks[name] = (Date.now() - t0) / 1000;
  };
  /** ページの中で覚えた時刻（Date.now の値）で残す */
  mark.at = (name, ms) => {
    marks[name] = (ms - t0) / 1000;
  };
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${key}] PAGEERR`, e.message));
  // 画面配信のコマ（画面が変わったときだけ届く）と、届いた時刻（エポック秒）
  const frames = [];
  const cdp = await ctx.newCDPSession(p);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const f = join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
    writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp ?? Date.now() / 1000 });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  await p.addInitScript(
    ([s, l, d, tips, title, x]) => {
      if (sessionStorage.getItem('promo')) return;
      sessionStorage.setItem('promo', '1');
      localStorage.clear();
      localStorage.setItem('tensu.settings.v1', JSON.stringify(s));
      localStorage.setItem('tensu.level.v1', JSON.stringify(l));
      localStorage.setItem('tensu.tutorial.v1', JSON.stringify(d));
      localStorage.setItem('tensu.tips.v1', JSON.stringify(tips));
      localStorage.setItem('tensu.shop.v1', JSON.stringify(title));
      for (const [k, v] of Object.entries(x)) localStorage.setItem(k, JSON.stringify(v));
    },
    [{ sfxVolume: 0, bgmVolume: 0, effects: 'max', answerStyle: 'choice', ...settings }, level, DONE, TIPS, TITLE, extra],
  );
  await p.goto(`${BASE}?debug`);
  await p.addStyleTag({ content: TAP_CSS });
  await play(p, mark);
  await cdp.send('Page.stopScreencast').catch(() => {});
  await ctx.close();
  // コマを、届いた時刻どおりの長さで並べて 30fps の動画にする（動画の 0 秒＝最初のコマ）
  const start = frames[0].t;
  const list = frames.map((fr, i) => `file '${fr.f}'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? fr.t + 0.5) - fr.t).toFixed(4)}`);
  list.push(`file '${frames[frames.length - 1].f}'`);
  writeFileSync(join(dir, 'list.txt'), list.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', 'fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p', '-c:v', 'libx264', '-crf', '14', join(WORK, `${key}.mp4`)]);
  rmSync(dir, { recursive: true, force: true });
  // 出来事の時刻を、動画の始まり（最初のコマ）からの秒に直す
  const shift = start - t0 / 1000;
  for (const k of Object.keys(marks)) marks[k] = Math.round((marks[k] - shift) * 1000) / 1000;
  meta[key] = marks;
  writeFileSync(META, JSON.stringify(meta, null, 2));
  console.log(`[${key}]`, JSON.stringify(marks));
}

// ------------------------------------------------------------ 操作の部品

/** スタート画面からモードに入る（ローディングはタップで進む） */
async function enter(p, mode) {
  await p.waitForTimeout(700);
  await p.click(`[data-start="${mode}"]`);
  await p.waitForTimeout(1500);
  if (await p.isVisible('#start').catch(() => false)) await p.click('#start');
  await p.waitForTimeout(700);
}

/** 押す場所に光る丸を出してから押す */
async function tap(p, sel) {
  const box = await p.locator(sel).first().boundingBox();
  if (box) {
    await p.evaluate(([x, y]) => {
      const d = document.createElement('div');
      d.className = 'promo-tap';
      d.style.left = `${x}px`;
      d.style.top = `${y}px`;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 700);
    }, [box.x + box.width / 2, box.y + box.height / 2]);
  }
  await p.locator(sel).first().click({ timeout: 3000 }).catch(() => {});
}

const phase = (p) => p.evaluate(() => document.body.dataset.phase);
const busy = (p) => p.evaluate(() => document.body.classList.contains('busy'));

/** 正解の4択を押す（光る丸つき） */
async function answer(p) {
  const a = await p.evaluate(() => window.tensu.debugAnswer());
  await tap(p, `#choices [data-choice="${Number(a) - 1}"]`);
}

/** 演出や結果を飛ばして、次に答えられる状態まで進める */
async function toAnswering(p, skip = true) {
  for (let k = 0; k < 120; k++) {
    if ((await phase(p)) === 'answering' && !(await busy(p))) return true;
    if (await p.isVisible('#levelup [data-lu="close"]').catch(() => false)) await p.click('#levelup [data-lu="close"]');
    else if ((await phase(p)) === 'result' && !(await busy(p))) await p.keyboard.press('Enter');
    else if (await p.evaluate(() => !!window.tensu.fx.awaitingPush)) await p.evaluate(() => window.tensu.fx.pressPush());
    else if (skip) await p.evaluate(() => window.tensu.fx.skip?.());
    await p.waitForTimeout(250);
  }
  return false;
}

const hideTip = (p) =>
  p.evaluate(() => {
    const t = document.querySelector('#tip');
    if (t) t.hidden = true;
  });

// ------------------------------------------------------------ 場面

// a. 大当り：早見に正解 → リーチ → 「大当り」（PUSH は押す）
await scene('a', { settings: { playMode: 'pachinko', mode: 'hayami' } }, async (p, mark) => {
  await enter(p, 'pachinko');
  await p.evaluate(() => window.tensu.panel.machine.forceNextHit());
  await p.waitForTimeout(600);
  mark('q');
  await answer(p);
  mark('answer');
  for (let k = 0; k < 150; k++) {
    await p.waitForTimeout(100);
    const t = await p.evaluate(() => document.querySelector('#overlay')?.textContent ?? '');
    if (/PUSH/.test(t)) await p.evaluate(() => window.tensu.fx.pressPush?.());
    if (/大当/.test(t)) {
      mark('jackpot');
      break;
    }
  }
  await p.waitForTimeout(3000);
});

// b. 遊び方：早見の問題 → 正解を押す → 台が回る、を2回
await scene('b', { settings: { playMode: 'pachinko', mode: 'hayami', effects: 'lite' } }, async (p, mark) => {
  await enter(p, 'pachinko');
  await hideTip(p);
  await p.waitForTimeout(500);
  mark('q1');
  await p.waitForTimeout(1600);
  mark('tap1');
  await answer(p);
  await p.waitForTimeout(1900);
  await p.keyboard.press('Enter');
  await toAnswering(p, false);
  await hideTip(p);
  mark('q2');
  await p.waitForTimeout(1200);
  mark('tap2');
  await answer(p);
  await p.waitForTimeout(2500);
});

// c. BONUS：実戦の BONUS 中の問題（符のマスと賞金）に正解 → 最後に「BONUS 獲得」
await scene('c', { settings: { playMode: 'pachinko', mode: 'jissen' } }, async (p, mark) => {
  // 「BONUS 獲得」の数字が出た時刻を、ページの中で覚えておく（BONUS の途中からは演出を飛ばさない）
  await p.evaluate(() => {
    new MutationObserver(() => {
      if (!window.__payoutAt && document.querySelector('#overlay .payout-n')) window.__payoutAt = Date.now();
    }).observe(document.body, { childList: true, subtree: true });
  });
  await enter(p, 'pachinko');
  await p.evaluate(() => window.tensu.panel.machine.forceNextHit());
  let shot = false;
  for (let k = 0; k < 40; k++) {
    if (await p.evaluate(() => !!window.__payoutAt)) break;
    if (!(await toAnswering(p, !shot))) break;
    await hideTip(p);
    const n = await p.evaluate(() => window.tensu.round?.n ?? 0);
    if (n >= 2 && !shot) {
      mark('bq');
      await p.waitForTimeout(1500);
      mark('btap');
      await answer(p);
      shot = true;
      await p.waitForTimeout(1500);
      continue;
    }
    await answer(p);
    await p.waitForTimeout(300);
  }
  for (let t = 0; t < 100 && !(await p.evaluate(() => !!window.__payoutAt)); t++) await p.waitForTimeout(100);
  const at = await p.evaluate(() => window.__payoutAt ?? 0);
  if (at) mark.at('payout', at);
  else console.log('[c] BONUS 獲得の画面を撮れませんでした');
  await p.waitForTimeout(3000);
});

// d. 稽古：重点学習の段階を一つずつ答える → 解説
await scene('d', { settings: { playMode: 'keiko', keikoStudy: 'focus', keikoSource: 'normal' } }, async (p, mark) => {
  await enter(p, 'keiko');
  await hideTip(p);
  await p.waitForTimeout(400);
  mark('start');
  for (let k = 0; k < 9; k++) {
    if ((await phase(p)) !== 'answering') break;
    await p.waitForTimeout(650);
    mark(`step${k + 1}`);
    await answer(p);
  }
  mark('result');
  await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('main')?.scrollTo({ top: 260, behavior: 'smooth' }));
  await p.waitForTimeout(2200);
});

// e. 試験：1級に受かる → 認定証、改造の枠の鍵が外れる
await scene(
  'e',
  {
    settings: { playMode: 'pachinko', mode: 'jissen', effects: 'max' },
    level: { exp: 30000, read: [1, 2, 3] },
    extra: {
      'tensu.exam.v1': { rank: 4, passedAt: [], notesRead: [1, 2, 3, 4] },
      'tensu.parts.v1': { owned: ['fast', 'tank', 'cushion', 'lens', 'denchu', 'st', 'combo', 'kakuhen'], equip: ['tank', 'st'] },
    },
  },
  async (p, mark) => {
    await enter(p, 'pachinko');
    await p.click('#open-menu');
    await p.waitForTimeout(300);
    await p.click('[data-menu="exam"]');
    await p.waitForTimeout(400);
    await p.click('[data-exam-start]');
    await p.waitForTimeout(900);
    await p.click('[data-lu="exam"]');
    await p.waitForTimeout(600);
    for (let k = 0; k < 10; k++) {
      await toAnswering(p, false);
      // 自動で答えると速すぎるので、それまでの秒をそれらしい値にしておく
      if (k === 9) await p.evaluate(() => (window.tensu.examRun.times = [14.2, 11.8, 16.1, 12.7, 13.5, 10.9, 15.8, 12.2, 13.3]));
      await answer(p);
      await p.waitForTimeout(250);
      await p.keyboard.press('Enter');
    }
    for (let t = 0; t < 40 && !(await p.isVisible('.ex-cert').catch(() => false)); t++) await p.waitForTimeout(100);
    mark('cert');
    await p.evaluate(() => {
      document.querySelectorAll('#levelup .lu-buttons').forEach((b) => (b.style.visibility = 'hidden'));
    });
    await p.waitForTimeout(5500);
  },
);

await browser.close();
console.log(`素材を ${WORK} に書き出しました`);
