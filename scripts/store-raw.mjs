/**
 * ストアのスクリーンショットの元の画面（store/raw/*.png）を、今のアプリから撮る。
 * スマホの大きさ（412×732、3倍）で撮る。開発サーバーを立ててから実行する。
 *
 * 使い方：npx vite --port 5179 &   （別の端末で）
 *        npx -p playwright node scripts/store-raw.mjs http://localhost:5179/
 *   PLAYWRIGHT_FROM（playwright のある node_modules）・CHROME（ブラウザの実行ファイル）で場所を指定できる。
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'store', 'raw');
const BASE = (process.argv[2] ?? 'http://localhost:5179/').replace(/\/?$/, '/');

const req = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = req('playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
mkdirSync(RAW, { recursive: true });

const DONE = { done: ['prologue', 'pachinko', 'keiko', 'tools'] };

/** 新しいページ。settings と level は保存データとして先に入れておく */
async function open({ settings, level = { exp: 5200, read: [1, 2, 3, 4] }, shop }) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 732 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(
    ([s, l, sh, d]) => {
      localStorage.setItem('tensu.settings.v1', JSON.stringify(s));
      localStorage.setItem('tensu.level.v1', JSON.stringify(l));
      localStorage.setItem('tensu.tutorial.v1', JSON.stringify(d));
      if (sh) localStorage.setItem('tensu.shop.v1', JSON.stringify(sh));
      // 一言ガイドは見たことにして、画面の上に出ないようにする
      localStorage.setItem('tensu.tips.v1', JSON.stringify(['enter', 'reach', 'jackpot', 'rush', 'miss', 'fast', 'low', 'firstHit', 'denchuSoon', 'denchu', 'bonusFu', 'ladder', 'bonusMiss', 'roundUp', 'uwanose', 'rushMiss', 'shop', 'machine', 'levelUp']));
    },
    [{ sfxVolume: 0, bgmVolume: 0, ...settings }, level, shop ?? null, DONE],
  );
  await p.goto(`${BASE}?debug`);
  await p.waitForTimeout(800);
  return p;
}

/** スタート画面からモードに入る（ローディングはタップで進む） */
async function enter(p, mode) {
  await p.click(`[data-start="${mode}"]`);
  await p.waitForTimeout(1700);
  await p.click('#start');
  await p.waitForTimeout(600);
}

const phase = (p) => p.evaluate(() => document.body.dataset.phase);

/** 正解を答える（選択式） */
async function answerCorrect(p) {
  const a = await p.evaluate(() => window.tensu.debugAnswer());
  await p.click(`#choices [data-choice="${Number(a) - 1}"]`);
}

/** 次の問題へ */
async function next(p) {
  if ((await phase(p)) !== 'result') return;
  await p.evaluate(() => window.tensu.fx.skip?.());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
}

const shot = (p, name) => p.screenshot({ path: join(RAW, `${name}.png`) });
const title = { owned: ['title-fu-reader'], equip: { title: 'title-fu-reader' } };

// 1. 大当りの瞬間（演出あり。実戦の手牌）
{
  const p = await open({ settings: { effects: 'max', playMode: 'pachinko', mode: 'jissen', answerStyle: 'choice' }, shop: title });
  await enter(p, 'pachinko');
  await p.evaluate(() => window.tensu.panel.machine.forceNextHit());
  await answerCorrect(p);
  for (let k = 0; k < 80; k++) {
    await p.waitForTimeout(150);
    const t = await p.evaluate(() => document.querySelector('#overlay')?.textContent ?? '');
    if (/PUSH/.test(t)) await p.evaluate(() => window.tensu.fx.pressPush?.());
    else if (/大当/.test(t)) break;
  }
  // 白く光る瞬間を過ぎ、「大当り」の文字と集中線がはっきり見えるところで撮る
  await p.waitForTimeout(1400);
  await shot(p, '1-jackpot');
  await p.context().close();
}

// 2. 実戦の手牌に答えたあとの解説（面子ごとの符の図解と点数）
{
  const p = await open({ settings: { effects: 'off', playMode: 'pachinko', mode: 'jissen', answerStyle: 'choice' }, shop: title });
  await enter(p, 'pachinko');
  // 符の内訳が多い手（刻子や待ちの符がある）を選ぶ
  for (let k = 0; k < 30; k++) {
    const rich = await p.evaluate(() => {
      const q = window.tensu.q;
      return q?.mode === 'jissen' && q.ev.fu.rows.filter((r) => r.fu > 0).length >= 3 && !q.ev.yakuman;
    });
    if (rich) break;
    await p.evaluate(() => window.tensu.next());
    await p.waitForTimeout(150);
  }
  await answerCorrect(p);
  await p.waitForTimeout(900);
  await shot(p, '2-explain');
  await p.context().close();
}

// 3. BONUS 中（符のマスと賞金）
{
  const p = await open({ settings: { effects: 'off', playMode: 'pachinko', mode: 'jissen', answerStyle: 'choice' }, shop: title });
  await enter(p, 'pachinko');
  await p.evaluate(() => window.tensu.panel.machine.forceNextHit());
  for (let k = 0; k < 12; k++) {
    if (await p.evaluate(() => document.body.classList.contains('bonus'))) break;
    if ((await phase(p)) === 'answering') await answerCorrect(p);
    await p.waitForTimeout(1500);
    await next(p);
  }
  // ROUND 3 の出題まで進めて、光ったマスと賞金・連続の倍率が見える状態にする
  for (let k = 0; k < 8; k++) {
    if ((await phase(p)) === 'answering') {
      if (await p.evaluate(() => (window.tensu.round?.n ?? 0) >= 3)) break;
      await answerCorrect(p);
      await p.waitForTimeout(900);
    }
    await next(p);
  }
  await p.waitForTimeout(500);
  await shot(p, '3-bonus');
  await p.context().close();
}

// 4. 稽古（重点学習の途中）
{
  const p = await open({ settings: { effects: 'off', playMode: 'keiko', keikoStudy: 'focus', keikoSource: 'normal', answerStyle: 'choice' } });
  await enter(p, 'keiko');
  for (let k = 0; k < 3; k++) {
    await answerCorrect(p);
    await p.waitForTimeout(350);
  }
  await shot(p, '4-keiko');
  await p.context().close();
}

// 5. 成績（正答率・速さ・場面ごと・所持金の推移・間違えた手）
{
  const p = await open({ settings: { effects: 'off', playMode: 'pachinko', mode: 'hayami', answerStyle: 'choice' }, shop: title });
  await enter(p, 'pachinko');
  // 途中で大当りを引いて、収支がプラスになるようにする
  await p.evaluate(() => window.tensu.panel.machine.forceNextHit());
  for (let k = 0; k < 30; k++) {
    if ((await phase(p)) !== 'answering') {
      await next(p);
      await p.waitForTimeout(300);
      continue;
    }
    // たまに間違える（成績に苦手が出るように）
    if (k % 9 === 7) {
      const a = await p.evaluate(() => window.tensu.debugAnswer());
      await p.click(`#choices [data-choice="${Number(a) % 4}"]`);
    } else await answerCorrect(p);
    await p.waitForTimeout(250);
    await next(p);
  }
  await p.evaluate(() => window.tensu.showSummary('summary'));
  await p.waitForTimeout(700);
  await shot(p, '5-summary');
  await p.context().close();
}

// 6. スタート画面
{
  const p = await open({ settings: { effects: 'off' }, level: { exp: 52000, read: [1, 2, 3, 4, 5, 6, 7, 8, 9] } });
  await p.waitForTimeout(500);
  await shot(p, '6-start');
  await p.context().close();
}

await browser.close();
console.log('store/raw/ に元の画面を書き出しました');
