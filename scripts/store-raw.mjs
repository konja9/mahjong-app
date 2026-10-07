/**
 * ストアのスクリーンショットの元の画面（store/raw/*.png）を、今のアプリから撮る。
 * スマホの大きさ（412×732、3倍）で撮る。開発サーバーを立ててから実行する。
 *
 * 使い方：npx vite --port 5179 &   （別の端末で）
 *        npx -p playwright node scripts/store-raw.mjs http://localhost:5179/
 *   PLAYWRIGHT_FROM（playwright のある node_modules）・CHROME（ブラウザの実行ファイル）で場所を指定できる。
 *   ONLY=1,5 で、その番号の画面だけを撮る（ほかの元画面はそのまま）。
 *   CANDIDATES=1 で、1枚目（大当り）の候補をリーチから BONUS の始まりまで連続で store/candidates/raw/ に撮る。
 *   CANDIDATES=game で、答えている最中のゲーム画面（通常時・BONUS 中・RUSH 中、3つの出題）の候補を撮る。
 *   CANDIDATES=game:hayami のように種目を付けると、その種目だけで通常時・BONUS 中・RUSH 中を撮る。
 *   選んだ候補を store/raw/1-jackpot.png にコピーしてから scripts/store.mjs を走らせる。
 */
import { mkdirSync, rmSync } from 'node:fs';
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
async function open({ settings, level = { exp: 5200, read: [1, 2, 3, 4] }, shop, extra = {} }) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 732 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(
    ([s, l, sh, d, x]) => {
      for (const [k, v] of Object.entries(x)) localStorage.setItem(k, JSON.stringify(v));
      localStorage.setItem('tensu.settings.v1', JSON.stringify(s));
      localStorage.setItem('tensu.level.v1', JSON.stringify(l));
      localStorage.setItem('tensu.tutorial.v1', JSON.stringify(d));
      if (sh) localStorage.setItem('tensu.shop.v1', JSON.stringify(sh));
      // 一言ガイドは見たことにして、画面の上に出ないようにする
      localStorage.setItem('tensu.tips.v1', JSON.stringify(['enter', 'reach', 'jackpot', 'rush', 'miss', 'fast', 'low', 'firstHit', 'denchuSoon', 'denchu', 'bonusFu', 'ladder', 'bonusMiss', 'roundUp', 'uwanose', 'rushMiss', 'shop', 'machine', 'levelUp']));
    },
    [{ sfxVolume: 0, bgmVolume: 0, ...settings }, level, shop ?? null, DONE, extra],
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

const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
const want = (n) => !process.env.CANDIDATES && (!ONLY || ONLY.includes(n));

// 1枚目の候補：大当りまでの流れを何回か回し、リーチ演出から BONUS の始まりまでを連続で撮る
/** 演出・結果を飛ばして、次に答えられる状態（答えている最中で、演出で止まっていない）まで進める */
async function toAnswering(p) {
  for (let k = 0; k < 80; k++) {
    const ph = await phase(p);
    const busy = await p.evaluate(() => document.body.classList.contains('busy'));
    if (ph === 'answering' && !busy) return true;
    if (ph === 'result' && !busy) await next(p);
    else await p.evaluate(() => (window.tensu.fx.awaitingPush ? window.tensu.fx.pressPush() : window.tensu.fx.skip?.()));
    await p.waitForTimeout(300);
  }
  return false;
}

// 1枚目の候補（答えている最中のゲーム画面）：下に「次へ」が出ない、台と手牌と4択がそろった画面
if (process.env.CANDIDATES?.startsWith('game')) {
  const only = process.env.CANDIDATES.split(':')[1];
  const dir = join(ROOT, 'store', 'candidates', 'raw');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const snap = async (p, name) => {
    // 正解の吹き出しや一言ガイドが消えるのを少し待つ
    await p.waitForTimeout(900);
    // 一言ガイドの帯が上にかぶらないよう閉じる
    await p.evaluate(() => {
      const tip = document.querySelector('#tip');
      if (tip) tip.hidden = true;
    });
    await p.screenshot({ path: join(dir, `${name}.png`) });
  };
  // 通常時（実戦・符計算・早見）。何問か正解して、保留を貯めた状態でも撮る
  for (const [mode, n] of only ? [[only, 8]] : [['jissen', 6], ['fu', 3], ['hayami', 2]]) {
    const p = await open({ settings: { effects: 'max', playMode: 'pachinko', mode, answerStyle: 'choice' }, shop: title });
    await enter(p, 'pachinko');
    for (let k = 0; k < n; k++) {
      if (!(await toAnswering(p))) break;
      await snap(p, `${mode}-${k + 1}`);
      await answerCorrect(p);
      await p.waitForTimeout(500);
    }
    await p.context().close();
  }
  // BONUS 中と RUSH 中（種目の指定がなければ実戦）
  {
    const p = await open({ settings: { effects: 'max', playMode: 'pachinko', mode: only ?? 'jissen', answerStyle: 'choice' }, shop: title });
    await enter(p, 'pachinko');
    await p.evaluate(() => window.tensu.panel.machine.forceNextHit());
    let bonus = 0;
    let rush = 0;
    for (let k = 0; k < 40 && rush < 3; k++) {
      if (!(await toAnswering(p))) break;
      const st = await p.evaluate(() => ({ round: window.tensu.round?.n ?? 0, rush: !!window.tensu.panel.rush }));
      if (st.round >= 2 && bonus < 3) await snap(p, `bonus-${++bonus}`);
      else if (!st.round && st.rush) await snap(p, `rush-${++rush}`);
      await answerCorrect(p);
      await p.waitForTimeout(500);
    }
    await p.context().close();
  }
  console.log(`候補を ${dir} に書き出しました`);
} else if (process.env.CANDIDATES) {
  const dir = join(ROOT, 'store', 'candidates', 'raw');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const runs = Number(process.env.CANDIDATES) > 1 ? Number(process.env.CANDIDATES) : 3;
  for (let run = 1; run <= runs; run++) {
    const p = await open({ settings: { effects: 'max', playMode: 'pachinko', mode: 'jissen', answerStyle: 'choice' }, shop: title });
    await enter(p, 'pachinko');
    await p.evaluate(() => window.tensu.panel.machine.forceNextHit());
    await answerCorrect(p);
    let after = -1;
    for (let k = 0; k < 70; k++) {
      await p.waitForTimeout(350);
      await p.screenshot({ path: join(dir, `r${run}-${String(k).padStart(2, '0')}.png`) });
      const t = await p.evaluate(() => document.querySelector('#overlay')?.textContent ?? '');
      // PUSH ボタンは撮ってから押す
      if (/PUSH/.test(t)) await p.evaluate(() => window.tensu.fx.pressPush?.());
      // BONUS の出題が始まったら、少し撮って次へ
      if (after < 0 && (await p.evaluate(() => !!window.tensu.round || document.body.classList.contains('bonus')))) after = k;
      if (after >= 0 && k - after >= 3) break;
    }
    await p.context().close();
  }
  console.log(`候補を ${dir} に書き出しました`);
}

// 1. 1枚目の元画面は、CANDIDATES=game:hayami で撮った候補から選んで store/raw/1-jackpot.png に置いている。
//    大当りの瞬間を撮り直したいときだけ ONLY=1 で走らせる
if (ONLY?.includes(1)) {
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
  await p.waitForTimeout(600);
  await shot(p, '1-jackpot');
  await p.context().close();
}

// 2. BONUS が終わったときの獲得
if (want(2)) {
  // BONUS を最後まで正解し、「BONUS 獲得 +○○ yan」の数字が数え上がって止まった瞬間を撮る
  const p = await open({ settings: { effects: 'max', playMode: 'pachinko', mode: 'jissen', answerStyle: 'choice' }, shop: title });
  await enter(p, 'pachinko');
  await p.evaluate(() => window.tensu.panel.machine.forceNextHit());
  let done = false;
  for (let k = 0; k < 30 && !done; k++) {
    if (!(await toAnswering(p))) break;
    const inBonus = await p.evaluate(() => !!window.tensu.round);
    await answerCorrect(p);
    if (!inBonus) continue;
    // BONUS の最後の問題に答えて次へ進むと、獲得の画面が出る（演出は飛ばさない）
    for (let t = 0; t < 40 && (await phase(p)) !== 'result'; t++) await p.waitForTimeout(100);
    await p.waitForTimeout(600);
    await p.keyboard.press('Enter');
    let last = '';
    for (let t = 0; t < 120; t++) {
      await p.waitForTimeout(100);
      const v = await p.evaluate(() => document.querySelector('#overlay .payout-n')?.textContent ?? '');
      if (!v) {
        if (last) break;
        if (await p.evaluate(() => document.body.dataset.phase === 'result' && !document.body.classList.contains('busy'))) break;
        await p.evaluate(() => window.tensu.fx.awaitingPush && window.tensu.fx.pressPush());
        continue;
      }
      if (v === last && v !== '+0') {
        await shot(p, '2-payout');
        done = true;
        break;
      }
      last = v;
    }
  }
  if (!done) console.log('BONUS 獲得の画面を撮れませんでした');
  await p.context().close();
}

// 3. 稽古（重点学習の途中）
if (want(3)) {
  const p = await open({ settings: { effects: 'off', playMode: 'keiko', keikoStudy: 'focus', keikoSource: 'normal', answerStyle: 'choice' } });
  await enter(p, 'keiko');
  for (let k = 0; k < 3; k++) {
    await answerCorrect(p);
    await p.waitForTimeout(350);
  }
  await shot(p, '3-keiko');
  await p.context().close();
}

// 4. 成績（腕前：種目ごとの直近の正答率・速さ・伸び、次の昇段試験の目安）
if (want(4)) {
  // 2週間、毎日少しずつ上手くなった記録を入れておく（同じ絵になるよう乱数は固定）
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const answers = [];
  const days = {};
  const total = {};
  const start = Date.UTC(2026, 8, 24);
  for (let k = 0; k < 14; k++) {
    if (k === 3 || k === 8) continue;
    const d = new Date(start + k * 86400000).toISOString().slice(0, 10);
    for (const [m, n, base, sec] of [['hayami', 15, 0.72, 9], ['fu', 20, 0.58, 18], ['jissen', 12, 0.52, 30]]) {
      for (let i = 0; i < n; i++) {
        const ok = rnd() < base + k * 0.025;
        const t = Math.round((sec - k * (sec / 30) + rnd() * 4) * 10) / 10;
        const a = { m, ok, t, s: Math.floor(rnd() * 4), d };
        if (m === 'hayami') Object.assign(a, { h: 1 + Math.floor(rnd() * 6), f: [30, 40, 50, 60][Math.floor(rnd() * 4)] });
        answers.push(a);
        const ds = ((days[d] ??= {})[m] ??= { n: 0, c: 0, tSum: 0, tN: 0 });
        ds.n++;
        if (ok) ds.c++;
        ds.tSum += t;
        ds.tN++;
        const tt = (total[m] ??= { n: 0, c: 0 });
        tt.n++;
        if (ok) tt.c++;
      }
    }
  }
  const record = {
    since: '2026-09-24',
    answers: answers.slice(-600),
    days,
    total,
    streak: 3,
    bestStreak: 21,
    exams: [
      { d: '2026-09-26', rank: 1, correct: 7, avg: 9, pass: false },
      { d: '2026-09-28', rank: 1, correct: 9, avg: 8, pass: true },
      { d: '2026-10-03', rank: 2, correct: 8, avg: 12, pass: true },
    ],
  };
  const p = await open({
    settings: { effects: 'off', playMode: 'pachinko', mode: 'fu', answerStyle: 'choice' },
    shop: title,
    extra: { 'tensu.record.v1': record, 'tensu.exam.v1': { rank: 2, passedAt: ['2026-09-28', '2026-10-03'], notesRead: [1, 2] } },
  });
  await enter(p, 'pachinko');
  await p.evaluate(() => window.tensu.openRecord('skill'));
  await p.waitForTimeout(700);
  await shot(p, '4-summary');
  await p.context().close();
}

// 5. 昇段試験の認定証（段位・帳面の頁）と、改造パーツの画面
if (want(5)) {
  // ゲンさんの名前は物語の第4話で明かすので、ストアの画像では伏せる（第1〜3話だけ読んだことにする）
  const read = [1, 2, 3];
  const p = await open({
    settings: { effects: 'max', playMode: 'pachinko', mode: 'jissen', answerStyle: 'choice' },
    level: { exp: 52000, read },
    shop: title,
    extra: { 'tensu.exam.v1': { rank: 5, passedAt: ['2026-09-20', '2026-09-23', '2026-09-26', '2026-09-30', '2026-10-03'], notesRead: [1, 2, 3, 4, 5] } },
  });
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
    await toAnswering(p);
    // 自動で答えると速すぎるので、それまでの答えの秒をそれらしい値にしておく
    if (k === 9) await p.evaluate(() => (window.tensu.examRun.times = [11.2, 8.4, 13.1, 9.7, 12.5, 7.9, 10.8, 14.2, 9.3]));
    await answerCorrect(p);
    await p.waitForTimeout(300);
    await p.keyboard.press('Enter');
  }
  await p.waitForTimeout(2200);
  // 閉じるボタンは写さない
  await p.evaluate(() => {
    document.querySelectorAll('#levelup .lu-buttons').forEach((b) => (b.style.visibility = 'hidden'));
    const next = document.querySelector('#next-btn');
    if (next) next.style.visibility = 'hidden';
  });
  await shot(p, '5-rank');
  await p.context().close();
}
if (want(5)) {
  // 改造：Lv 12・初段（認定証と同じ段位）で、枠（4つ）をパーツで埋めた状態
  const p = await open({
    settings: { effects: 'off', playMode: 'pachinko', mode: 'jissen', answerStyle: 'choice' },
    level: { exp: 52000, read: [1, 2, 3] },
    shop: title,
    extra: {
      'tensu.exam.v1': { rank: 6, passedAt: [], notesRead: [1, 2, 3, 4, 5, 6] },
      'tensu.parts.v1': {
        owned: ['fast', 'tank', 'cushion', 'lens', 'denchu', 'st', 'combo', 'kakuhen', 'uwanose', 'premium', 'round'],
        equip: ['tank', 'st', 'combo', 'kakuhen'],
      },
    },
  });
  await enter(p, 'pachinko');
  await p.click('#open-menu');
  await p.waitForTimeout(300);
  await p.click('[data-menu="parts"]');
  await p.waitForTimeout(600);
  await shot(p, '5-parts');
  await p.context().close();
}

// 6. スタート画面
if (want(6)) {
  const p = await open({ settings: { effects: 'off' }, level: { exp: 52000, read: [1, 2, 3, 4, 5, 6, 7, 8, 9] } });
  await p.waitForTimeout(500);
  await shot(p, '6-start');
  await p.context().close();
}

await browser.close();
console.log('store/raw/ に元の画面を書き出しました');
