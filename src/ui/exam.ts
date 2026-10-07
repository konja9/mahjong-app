import type { Filters, HandConstraints, Mode } from '../core/generator';
import { load, save } from './storage';
import { charaSvg } from './tutorial/chara';

/**
 * 昇段試験（段位）。Lv 2 ごとに次の段位の試験を受けられる（Lv 2 で5級 … Lv 20 で名人）。
 * Lv は稼いだ yan で上がるが、段位は試験に受からないと上がらない（腕前の証明）。
 * 受かるたびに台の改造パーツを付けられる枠が増える（parts.ts の slotsFor）
 */

export interface Rank {
  name: string;
  /** 受けられる Lv */
  level: number;
  /** 出題の種目（10問。この順に出す） */
  modes: Mode[];
  /** 合格に必要な正解数 */
  pass: number;
  /** 合格に必要な平均の速さ（秒。null は問わない） */
  avgSec: number | null;
  /** 数値入力で答える（名人） */
  input: boolean;
  /** 出題の条件（手牌の問題） */
  constraints?: Partial<HandConstraints>;
  filters?: Partial<Filters>;
  /** 出題の内訳の説明 */
  about: string;
}

const rep = (m: Mode, n: number): Mode[] => Array.from({ length: n }, () => m);

export const RANKS: Rank[] = [
  { name: '5級', level: 2, modes: rep('hayami', 10), pass: 8, avgSec: null, input: false, about: '早見 10問' },
  { name: '4級', level: 4, modes: [...rep('hayami', 5), ...rep('fu', 5)], pass: 8, avgSec: null, input: false, about: '早見 5問・符計算 5問' },
  { name: '3級', level: 6, modes: rep('fu', 10), pass: 8, avgSec: null, input: false, about: '符計算 10問' },
  { name: '2級', level: 8, modes: [...rep('fu', 5), ...rep('jissen', 5)], pass: 8, avgSec: null, input: false, about: '符計算 5問・実戦 5問' },
  { name: '1級', level: 10, modes: rep('jissen', 10), pass: 8, avgSec: null, input: false, about: '実戦 10問' },
  { name: '初段', level: 12, modes: rep('jissen', 10), pass: 9, avgSec: 20, input: false, about: '実戦 10問' },
  {
    name: '二段',
    level: 14,
    modes: rep('jissen', 10),
    pass: 9,
    avgSec: 17,
    input: false,
    filters: { win: 'tsumo' },
    about: '実戦 10問（すべてツモ）',
  },
  {
    name: '三段',
    level: 16,
    modes: rep('jissen', 10),
    pass: 9,
    avgSec: 15,
    input: false,
    constraints: { dist: 'even' },
    about: '実戦 10問（高い符が多め）',
  },
  { name: '四段', level: 18, modes: rep('jissen', 10), pass: 10, avgSec: 14, input: false, about: '実戦 10問' },
  { name: '名人', level: 20, modes: rep('jissen', 10), pass: 10, avgSec: 12, input: true, constraints: { dist: 'even' }, about: '実戦 10問（数値入力・高い符が多め）' },
];

/** 段位の名前（0 は「段位なし」） */
export const rankName = (rank: number): string => (rank <= 0 ? '' : RANKS[rank - 1].name);

/** 次に受ける試験（すべて受かっていれば null） */
export const nextRank = (rank: number): Rank | null => RANKS[rank] ?? null;

/** 今の Lv で次の試験を受けられるか */
export function canTakeExam(rank: number, level: number): boolean {
  const r = nextRank(rank);
  return !!r && level >= r.level;
}

export interface ExamResult {
  correct: number;
  /** 正解・不正解を問わず、1問ごとにかかった秒数 */
  times: number[];
}

export interface Judge {
  pass: boolean;
  correct: number;
  /** 平均の秒数 */
  avg: number;
  /** あと何問の正解が必要だったか */
  shortCorrect: number;
  /** 平均があと何秒速ければよかったか（0 は足りている） */
  shortSec: number;
}

export function judge(rank: Rank, r: ExamResult): Judge {
  const avg = r.times.length ? r.times.reduce((a, b) => a + b, 0) / r.times.length : 0;
  const shortCorrect = Math.max(0, rank.pass - r.correct);
  const shortSec = rank.avgSec === null ? 0 : Math.max(0, avg - rank.avgSec);
  return { pass: shortCorrect === 0 && shortSec === 0, correct: r.correct, avg, shortCorrect, shortSec };
}

export interface ExamState {
  /** 受かった段位の数（0〜10） */
  rank: number;
  /** 受かった日（段位の順） */
  passedAt: string[];
}

const KEY = 'tensu.exam.v1';

export function loadExam(): ExamState {
  const s = load<Partial<ExamState>>(KEY, {});
  const rank = Math.min(RANKS.length, Math.max(0, Math.floor(Number(s.rank) || 0)));
  return { rank, passedAt: Array.isArray(s.passedAt) ? s.passedAt.slice(0, rank) : [] };
}

export const saveExam = (s: ExamState): void => save(KEY, s);

/** 合格を記録する */
export function recordPass(s: ExamState, today: string): void {
  if (s.rank >= RANKS.length) return;
  s.rank++;
  s.passedAt.push(today);
}

/** 試験の結果（合格なら認定証、不合格なら足りなかったところ）。slots は増えた枠の数（0 は増えていない） */
export function examResultHtml(rank: Rank, j: Judge, slots: number, missed: number[]): string {
  const avg = `${j.avg.toFixed(1)}秒`;
  const stats = `<div class="ex-stats"><div><small>正解</small><b>${j.correct}<u>/${rank.modes.length}</u></b></div><div><small>平均の速さ</small><b>${avg}</b></div></div>`;
  if (j.pass) {
    return `<div class="lu-rays" aria-hidden="true"></div>
      <div class="lu-inner ex-cert" role="dialog" aria-label="昇段試験 合格">
        <div class="lu-chara">${charaSvg('proud')}</div>
        <div class="ex-paper">
          <small>認定証</small>
          <div class="ex-rank">${rank.name}</div>
          <p>右の者、点数計算の腕前を確かめ、<br>ゲンさんの早見表を受け継ぐ者として<br><b>${rank.name}</b>を認める。</p>
          ${stats}
          <div class="ex-seal" aria-hidden="true">發</div>
        </div>
        ${slots ? `<div class="lu-reward"><small>改造の枠</small><b>${slots}つに増えた</b><span>台選びの「改造」でパーツを付けられる</span></div>` : ''}
        <div class="lu-buttons"><button class="lu-btn lu-read" type="button" data-lu="close">閉じる</button></div>
      </div>`;
  }
  const lacks = [
    j.shortCorrect ? `正解があと ${j.shortCorrect}問` : '',
    j.shortSec ? `平均があと ${j.shortSec.toFixed(1)}秒 速ければ` : '',
  ].filter(Boolean);
  return `<div class="lu-inner ex-fail" role="dialog" aria-label="昇段試験 不合格">
      <div class="lu-chara">${charaSvg('sweat')}</div>
      <div class="lu-title">不合格</div>
      <p class="lu-say">${rank.name}まで、${lacks.join('・')}。クケ、次は受かるぜ</p>
      ${stats}
      ${missed.length ? `<div class="lu-reward"><small>落とした問題</small><b>${missed.map((n) => `${n}問目`).join('・')}</b></div>` : ''}
      <div class="lu-buttons"><button class="lu-btn lu-read" type="button" data-lu="exam">もう一度</button><button class="lu-btn" type="button" data-lu="close">やめる</button></div>
    </div>`;
}

/** 台のダイアログの「昇段試験」タブ：全段位の状態と、次の試験の条件・［受ける］ */
export function examTabHtml(s: ExamState, level: number, canStart: boolean): string {
  const next = nextRank(s.rank);
  const head = next
    ? `<div class="ex-next">
        <div><small>次の試験</small><b>${next.name}</b></div>
        <div class="shop-desc">${next.about}・${next.pass}問以上正解${next.avgSec ? `・平均 ${next.avgSec}秒以内` : ''}${next.input ? '・数値入力' : ''}</div>
        ${
          level >= next.level
            ? `<button class="shop-btn buy" type="button" data-exam-start${canStart ? '' : ' disabled'}>受ける</button>${canStart ? '' : '<div class="shop-desc">BONUS 中と台が回っている間は受けられません</div>'}`
            : `<div class="shop-desc">Lv ${next.level} で受けられます（今は Lv ${level}）</div>`
        }
      </div>`
    : '<div class="ex-next"><div><small>段位</small><b>名人</b></div><div class="shop-desc">すべての昇段試験に受かりました</div></div>';
  const rows = RANKS.map((r, i) => {
    const passed = i < s.rank;
    const state = passed
      ? `<span class="shop-state">合格 ${s.passedAt[i] ?? ''}</span>`
      : i === s.rank && level >= r.level
        ? '<span class="shop-state ex-open">受けられる</span>'
        : `<span class="shop-lock">Lv ${r.level}</span>`;
    return `<div class="shop-row${passed ? ' cur' : ''}${!passed && level < r.level ? ' locked' : ''}"><div class="mis"><div class="shop-name">${r.name}</div><div class="shop-desc">${r.about}・${r.pass}問${r.avgSec ? `・平均${r.avgSec}秒` : ''}</div></div><div class="shop-acts">${state}</div></div>`;
  }).join('');
  return `${head}${rows}<p class="help-note">試験は10問。yan・台・経験値は動きません。受かると改造の枠が増えることがあります。何度でも受け直せます。</p>`;
}
