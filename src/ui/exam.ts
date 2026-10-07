import type { Filters, HandConstraints, Mode } from '../core/generator';
import { SLOT_RANKS, nextSlotRank } from './machine/parts';
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

/** その段位（RANKS の並び）に受かると、台の改造の枠の鍵が開くか */
export const opensSlot = (rank: Rank): boolean => (SLOT_RANKS as readonly number[]).includes(RANKS.indexOf(rank) + 1);

const SLOT_MARK = '<em class="ex-slot-mark">受かると改造の枠が開く</em>';

/** 次に受ける試験（すべて受かっていれば null） */
export const nextRank = (rank: number): Rank | null => RANKS[rank] ?? null;

/** 今の Lv で次の試験を受けられるか */
export function canTakeExam(rank: number, level: number): boolean {
  const r = nextRank(rank);
  return !!r && level >= r.level;
}

/** 改造の枠を開ける昇段試験を、今受けられるか（次の試験が枠の開く段位で、Lv も足りている） */
export function slotExamReady(rank: number, level: number): boolean {
  return canTakeExam(rank, level) && nextSlotRank(rank) === rank + 1;
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
  /** 読んだ帳面の頁（1〜10） */
  notesRead?: number[];
}

const KEY = 'tensu.exam.v1';

export function loadExam(): ExamState {
  const s = load<Partial<ExamState>>(KEY, {});
  const rank = Math.min(RANKS.length, Math.max(0, Math.floor(Number(s.rank) || 0)));
  const notesRead = Array.isArray(s.notesRead) ? s.notesRead.filter((n) => Number.isInteger(n) && n >= 1 && n <= rank) : [];
  return { rank, passedAt: Array.isArray(s.passedAt) ? s.passedAt.slice(0, rank) : [], notesRead };
}

export const saveExam = (s: ExamState): void => save(KEY, s);

/** 合格を記録する */
export function recordPass(s: ExamState, today: string): void {
  if (s.rank >= RANKS.length) return;
  s.rank++;
  s.passedAt.push(today);
}

/** 合格したときの改造の枠：opened は新しく開いた枠の番号（1〜5。開かなければ null）、row は5つの枠の並び、next は次に枠が開く段位 */
export interface SlotNews {
  opened: number | null;
  row: string;
  next: string | null;
}

/** 試験の結果（合格なら認定証、不合格なら足りなかったところ） */
export function examResultHtml(rank: Rank, j: Judge, slot: SlotNews | null, missed: number[], read: number[] = []): string {
  const avg = `${j.avg.toFixed(1)}秒`;
  const stats = `<div class="ex-stats"><div><small>正解</small><b>${j.correct}<u>/${rank.modes.length}</u></b></div><div><small>平均の速さ</small><b>${avg}</b></div></div>`;
  if (j.pass) {
    return `<div class="lu-rays" aria-hidden="true"></div>
      <div class="lu-inner ex-cert" role="dialog" aria-label="昇段試験 合格">
        <div class="lu-chara">${charaSvg('proud')}</div>
        <div class="ex-paper">
          <small>認定証</small>
          <div class="ex-rank">${rank.name}</div>
          <p>${certText(rank.name, read)}</p>
          ${stats}
          <div class="ex-seal" aria-hidden="true">發</div>
        </div>
        ${notePageHtml(RANKS.indexOf(rank) + 1, read)}
        ${slotNewsHtml(slot)}
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

function slotNewsHtml(slot: SlotNews | null): string {
  if (!slot) return '';
  if (slot.opened)
    return `<div class="lu-reward ex-slot"><small>改造の枠</small><b>鍵が開いた！ ${slot.opened}つめの枠</b><div class="slot-row big">${slot.row}</div><span>メニューの「改造」でパーツを付けられる</span></div>`;
  return slot.next ? `<div class="lu-reward ex-slot quiet"><small>改造の枠</small><span>次は<b>${slot.next}</b>で、台の枠の鍵が開く</span></div>` : '';
}

/** 台のダイアログの「昇段試験」タブ：全段位の状態と、次の試験の条件・［受ける］ */
export function examTabHtml(s: ExamState, level: number, canStart: boolean): string {
  const next = nextRank(s.rank);
  const head = next
    ? `<div class="ex-next">
        <div><small>次の試験</small><b>${next.name}</b>${opensSlot(next) ? SLOT_MARK : ''}</div>
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
    return `<div class="shop-row${passed ? ' cur' : ''}${!passed && level < r.level ? ' locked' : ''}"><div class="mis"><div class="shop-name">${r.name}${opensSlot(r) ? '<em class="ex-slot-pip" title="受かると改造の枠が開く">枠</em>' : ''}</div><div class="shop-desc">${r.about}・${r.pass}問${r.avgSec ? `・平均${r.avgSec}秒` : ''}</div></div><div class="shop-acts">${state}</div></div>`;
  }).join('');
  return `${head}${rows}<p class="help-note">試験は10問。yan・台・経験値は動きません。「枠」の印の段位に受かると、台の改造の枠の鍵が開きます。何度でも受け直せます。</p>`;
}

// ------------------------------------------------------------ 世界観：パチふとくんの「数えの試験」と、ゲンさんの帳面

/**
 * 昇段試験は、パチふとくんが課す「数えの試験」。場所は液晶の中の「ゲンさんの机」。
 * 段位は、賭場で「この人には数え屋は要らない」と分かる証。
 * 受かるたびに、ゲンさんが机で使っていた帳面の1頁が戻ってくる（物語の外伝）。
 * ゲンさんの名前は、物語の第4話（ゲンさんが出てくる話）を読むまで伏せる
 */
export const GEN_CHAPTER = 4;

/** 物語の第4話を読んだか（ゲンさんの名前を出してよいか） */
export const knowsGen = (read: number[]): boolean => read.includes(GEN_CHAPTER);

export interface NotePage {
  /** 数え方のコツ（ゲンさんの手書き） */
  tip: string;
  /** その頁にまつわる場面 */
  scene: string;
}

/** ゲンさんの帳面（段位の順に1頁ずつ。5級 → 名人） */
export const NOTEBOOK: NotePage[] = [
  {
    tip: '一行目は「30符1翻、子ロン1000」。全部の基本はここだ。翻が1つ増えると基本点が倍になる。2翻2000、3翻3900、4翻7700。100点未満は切り上げるから、きっちり倍にはならねえ。',
    scene: '閉店後、学生に早見表を写させながら。「丸暗記でいい。体が覚えりゃ、卓で迷わねえ」',
  },
  {
    tip: '親は子の1.5倍。子ロン1000なら親ロン1500。ツモは、子なら「子の払い-親の払い」の2つ、親なら全員から同じ額。表を見る前に、まず親か子かを確かめろ。',
    scene: '仕事帰りの姉ちゃんに、紙ナプキンの裏で。',
  },
  {
    tip: '符は副底20から足していく。門前でロンしたら+10、ツモなら+2。最後に10の位へ切り上げる。例外は2つ。七対子はいつも25符、平和のツモは20符だ。',
    scene: '符で言い合う若いのの間に割って入って。「言い合う前に、副底から順に声に出せ」',
  },
  {
    tip: '中張牌の明刻は2符、么九牌なら倍。暗刻はさらに倍、槓子は刻子の4倍。役牌の雀頭は2符。嵌張・辺張・単騎も2符。一つずつ指で数えろ。急ぐのはそれからだ。',
    scene: '麻雀だこのある指で、牌を一枚ずつ指しながら。',
  },
  {
    tip: '満貫からは符は関係ねえ。子の満貫8000、跳満12000、倍満16000。卓でいちばん損するのは、満貫を知らずに安く払うことだ。',
    scene: '景品のチョコを一つかじりながら。',
  },
  {
    tip: '速く数えるコツは、よく出る形を形ごと覚えること。平和ツモは20符、喰いタンは30符。見た瞬間に分かれば、残りの時間で確かめられる。',
    scene: '閉店間際、壁の時計を見上げながら。',
  },
  {
    tip: '子のツモは「子の払い-親の払い」。30符3翻なら1000-2000。親のツモは全員から同じで2000オール。ツモの+2符を忘れるな。ただし平和のツモは+2符が付かず、20符のままだ。',
    scene: '夜の店で、眠そうな客の肩を叩いて。',
  },
  {
    tip: '高い符は、暗刻と槓子と待ちから来る。么九牌の暗槓は一つで32符。見落とせば点が一段変わる。手牌を見たら、まず重い面子から数えろ。',
    scene: '店のすみの机で、最後まで残った客と。',
  },
  {
    tip: '全部当てるやつは、間違えないんじゃねえ。間違えたときに気づくんだ。答えを出したら、もう一度だけ副底から数え直せ。一度でいい。',
    scene: '帳面に、太い字で書きつけてあった。',
  },
  {
    tip: '数え方は、誰にも取り上げられねえ。家も yan も取られても、これだけは残る。だから、次のやつに渡せ。オレが机でやったみたいにな。',
    scene: '帳面の最後の頁。字が少し震えている。',
  },
];

/** 帳面の呼び名（ゲンさんを知る前は伏せる） */
export const notebookName = (read: number[]): string => (knowsGen(read) ? 'ゲンさんの帳面' : '誰かの帳面');

/** 帳面の1頁（認定証の下・物語の本で読む） */
export function notePageHtml(n: number, read: number[]): string {
  const p = NOTEBOOK[n - 1];
  if (!p) return '';
  return `<div class="ex-note"><small>${notebookName(read)}　第${n}頁</small><p class="ex-note-tip">${p.tip}</p><p class="ex-note-scene">${p.scene}</p></div>`;
}

/** 試験の前の、パチふとくんの前口上（物語の進み具合で変わる） */
export function examIntro(rank: Rank, read: number[]): string {
  const lead = read.includes(18)
    ? '約束だからな。数え方を、最後まで叩き込んでやる。'
    : read.includes(11)
      ? 'ここは液晶の中の、あのジジイの机だ。数え屋に三割くれてやる気がねえなら、座りな。'
      : knowsGen(read)
        ? '誰かがこうやって、卓のそばで数え方を教えてた気がするんだ。……まあいい、座りな。'
        : 'オレ様の試験だ。なんで試験なんかするのかって？　……分からねえ。体が勝手にやりたがるんだ。';
  const cond = `${rank.about}、${rank.pass}問以上正解${rank.avgSec ? `・平均 ${rank.avgSec}秒以内` : ''}${rank.input ? '・数値入力' : ''}`;
  const slot = opensSlot(rank) ? '<br>受かれば、台の改造の枠の鍵が一つ開くぜ。' : '';
  return `${lead}<br><b>${rank.name}</b>の試験は ${cond}。全部、お前の力で数えな。${slot}`;
}

/** 認定証の文（ゲンさんを知る前は名前を出さない） */
export function certText(rankName: string, read: number[]): string {
  return knowsGen(read)
    ? `右の者、点数を自分の力で数える腕前を確かめ、<br>ゲンさんの早見表を受け継ぐ者として<br><b>${rankName}</b>を認める。`
    : `右の者、点数を自分の力で数える腕前を確かめ、<br><b>${rankName}</b>を認める。`;
}

/** 試験の前口上の画面 */
export function examIntroHtml(rank: Rank, read: number[]): string {
  return `<div class="lu-inner ex-intro" role="dialog" aria-label="昇段試験">
      <div class="lu-chara">${charaSvg('neutral')}</div>
      <div class="lu-title">昇段試験</div>
      <p class="lu-say">${examIntro(rank, read)}</p>
      <div class="lu-buttons"><button class="lu-btn lu-read" type="button" data-lu="exam">始める</button><button class="lu-btn" type="button" data-lu="close">やめる</button></div>
    </div>`;
}

/** 物語の本の「帳面」：集めた頁（まだの頁は段位を示して伏せる） */
export function notebookHtml(s: ExamState, read: number[]): string {
  const pages = NOTEBOOK.map((_, i) => {
    const n = i + 1;
    if (n > s.rank) return `<div class="ex-note locked"><small>第${n}頁</small><p>${RANKS[i].name}に受かると読める</p></div>`;
    return notePageHtml(n, read);
  }).join('');
  const lead = knowsGen(read)
    ? 'ゲンさんの手書きの帳面。昇段試験に受かるたびに、1頁ずつ戻ってくる。'
    : '誰かの手書きの帳面。昇段試験に受かるたびに、1頁ずつ戻ってくる。';
  return `<p class="story-lead">${lead}</p><div class="ex-notebook">${pages}</div>`;
}

/** まだ読んでいない帳面の頁があるか */
export const unreadNotes = (s: ExamState): number => Math.max(0, s.rank - (s.notesRead ?? []).filter((n) => n <= s.rank).length);
