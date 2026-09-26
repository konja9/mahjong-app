import { type Choice, makeChoices } from '../core/choices';
import { type HandQuestion, type Mode, type Question, generateQuestion } from '../core/generator';
import { type ScoreResult, checkPointsAnswer, formatAnswer } from '../core/score';
import { EAST } from '../core/tiles';
import { configureAudio, sfx, unlockAudio } from './audio';
import { Fx, type WinTier } from './effects/pachinko';
import type { EffectLevel } from './effects/performance';
import {
  ECONOMY,
  type Wallet,
  applyDelta,
  comboMult,
  costFor,
  freshWallet,
  isBankrupt,
  loadWallet,
  paytableKey,
  paytableRows,
  roundPrize,
  saveWallet,
} from './machine/economy';
import { MachinePanel } from './machine/panel';
import { practiceScore, speedMultiplier } from '../core/practiceScore';
import { doraLabel, handExplain, hayamiExplain, situationChips, situationLabel } from './explain';
import { type Settings, loadSettings, saveSettings } from './settings';
import { type HelpTab, helpHtml } from './help';
import { introHtml, introSeen, markIntroSeen } from './intro';
import { renderOdometer } from './odometer';
import { load, save } from './storage';
import { type TipId, Tips, tipText } from './tips';
import { TILE_DEFS, handHtml, tilesInline } from './tileView';

type Phase = 'answering' | 'suspense' | 'result' | 'summary';

interface Miss {
  q: Question;
  input: string;
}

interface Session {
  answered: number;
  correct: number;
  streak: number;
  maxStreak: number;
  times: number[];
  score: number;
  /** セッション開始時の所持金（ノーマルの収支表示用） */
  startBalance: number;
  byCat: Record<string, { c: number; n: number }>;
  misses: Miss[];
}

interface Best {
  acc: number;
  avg: number;
  streak: number;
  /** プラクティスのスコア */
  score?: number;
}

const MODE_NAMES: Record<Mode, string> = { hayami: '早見', fu: '符計算', jissen: '実戦' };
const BEST_KEY = 'tensu.best.v1';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

function newSession(): Session {
  return { answered: 0, correct: 0, streak: 0, maxStreak: 0, times: [], score: 0, startBalance: 0, byCat: {}, misses: [] };
}

function questionMeta(q: Question): { dealer: boolean; tsumo: boolean } {
  if (q.mode === 'hayami') return { dealer: q.dealer, tsumo: q.tsumo };
  return { dealer: q.sit.seatWind === EAST, tsumo: q.sit.tsumo };
}

function scoreOf(q: Question): ScoreResult {
  return q.mode === 'hayami' ? q.score : q.ev.score;
}

export class App {
  private s: Settings = loadSettings();
  private session = newSession();
  private phase: Phase = 'answering';
  private q!: Question;
  private input = '';
  private startedAt = 0;
  private best = load<Record<string, Best>>(BEST_KEY, {});
  private fx: Fx;
  private timerRaf = 0;
  private lastCorrect = false;
  private panel: MachinePanel;
  private busy = false;
  private pausedAt = 0;
  private wallet: Wallet = loadWallet();
  private betRaf = 0;
  /** 大当りのラウンド（賞金タイム）。null なら通常時 */
  private round: {
    n: number;
    total: number;
    combo: number;
    premium: boolean;
    highRoller: boolean;
    resolve: (total: number) => void;
  } | null = null;
  /** 今出ている問題がラウンド問題か */
  private isRoundQ = false;
  private awaitingBankrupt = false;
  private choices: Choice[] = [];
  private picked = -1;
  /** 回答を止めている理由（台の発展リーチ・大当り、ダイアログ） */
  private pauses = new Set<string>();
  private tips = new Tips();
  private tipQueue: string[] = [];
  private tipTimer = 0;
  private tipShownAt = 0;
  /** まだ大当りしたことがない人向けのチュートリアル当り */
  private tutorialCount = 0;
  private tutorialForced = false;
  private introStep = 0;
  private helpTab: HelpTab = 'howto';
  private tipsReset = false;

  constructor(private root: HTMLElement) {
    this.root.innerHTML = SHELL;
    this.fx = new Fx($('#overlay'), $('#notice'), $('#combo'), $<HTMLCanvasElement>('#fx'), document.body, () => this.fxLevel);
    this.panel = new MachinePanel($('#machine'), this.fx, () => this.fxLevel, {
      onBusy: (b) => this.setBusy(b),
      onState: () => {
        this.renderProgress();
        this.checkBankrupt();
      },
      onJackpot: ({ premium }) => this.startRound(premium),
      onEvent: (e) => this.tip(e),
    });
    this.applyTheme();
    this.configureSound();
    this.renderConfig();
    this.bind();
    this.startSession();
    if (!introSeen()) this.openIntro();
  }

  // ------------------------------------------------------------ 設定

  private get practice(): boolean {
    return this.s.playMode === 'practice';
  }

  /** プラクティスでは演出を一切出さない */
  private get fxLevel(): EffectLevel {
    return this.practice ? 'off' : this.s.effects;
  }

  private configureSound(): void {
    configureAudio(this.s.sound && !this.practice, this.s.volume);
  }

  private applyTheme(): void {
    document.documentElement.dataset.play = this.s.playMode;
    document.documentElement.dataset.effects = this.s.effects;
    document.documentElement.dataset.answer = this.s.answerStyle;
  }

  private update(patch: Partial<Settings>, restart = true): void {
    this.s = { ...this.s, ...patch };
    saveSettings(this.s);
    this.applyTheme();
    this.configureSound();
    this.renderConfig();
    // モードを切り替えたときは台をリセット（それ以外は台の状態を引き継ぐ）
    if (restart) this.startSession('playMode' in patch);
  }

  private renderConfig(): void {
    const s = this.s;
    const LABELS: Record<string, string> = {
      mode: 'モード',
      answer: '回答',
      count: '問題数',
      time: '制限時間',
      seat: '親子',
      win: '和了',
    };
    const group = (name: string, items: [string, string, boolean][]) =>
      `<div class="cfg-group" data-group="${name}"><span class="cfg-label">${LABELS[name]}</span>${items
        .map(([v, label, on]) => `<button class="cfg${on ? ' on' : ''}" data-cfg="${name}" data-v="${v}">${label}</button>`)
        .join('')}</div>`;
    $('#config').innerHTML = [
      group(
        'mode',
        (['hayami', 'fu', 'jissen'] as Mode[]).map((m) => [m, MODE_NAMES[m], s.mode === m]),
      ),
      group('answer', [
        ['choice', '4択', s.answerStyle === 'choice'],
        ['input', '入力', s.answerStyle === 'input'],
      ]),
      this.practice &&
      group(
        'count',
        [10, 25, 50, 0].map((n) => [String(n), n ? String(n) : '∞', s.count === n]),
      ),
      group(
        'time',
        [0, 15, 30].map((n) => [String(n), n ? `${n}s` : '無制限', s.timeLimit === n]),
      ),
      group('seat', [
        ['any', '親子', s.filters.seat === 'any'],
        ['child', '子', s.filters.seat === 'child'],
        ['dealer', '親', s.filters.seat === 'dealer'],
      ]),
      group('win', [
        ['any', 'ロンツモ', s.filters.win === 'any'],
        ['ron', 'ロン', s.filters.win === 'ron'],
        ['tsumo', 'ツモ', s.filters.win === 'tsumo'],
      ]),
    ]
      .filter(Boolean)
      .join('<span class="cfg-sep"></span>') +
      (this.practice ? '' : '<button class="cfg-done cashout" type="button" data-cashout>精算</button>') +
      '<button class="cfg-done" type="button" data-close-cfg>閉じる</button>';
    document.querySelectorAll<HTMLElement>('[data-play]').forEach((b) => {
      const on = b.dataset.play === s.playMode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    $('#mode-tabs').innerHTML = (['hayami', 'fu', 'jissen'] as Mode[])
      .map(
        (m) =>
          `<button class="mode-tab${s.mode === m ? ' on' : ''}" role="tab" aria-selected="${s.mode === m}" data-mode="${m}">${MODE_NAMES[m]}</button>`,
      )
      .join('');
    const count = !this.practice ? '∞' : s.count ? `${s.count}問` : '∞';
    $('#cfg-toggle').innerHTML = `<span class="pill-mode">${MODE_NAMES[s.mode]}<span class="dot-sep">·</span></span><span class="pill-answer">${s.answerStyle === 'choice' ? '4択' : '入力'}<span class="dot-sep">·</span></span>${count}<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    document.body.dataset.phase = phase;
  }

  private get compact(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
  }

  private toggleConfigSheet(open = !document.body.classList.contains('cfg-open')): void {
    document.body.classList.toggle('cfg-open', open);
    $('#cfg-toggle').setAttribute('aria-expanded', String(open));
  }

  private onConfig(name: string, v: string): void {
    switch (name) {
      case 'mode':
        this.update({ mode: v as Mode });
        break;
      case 'answer':
        this.update({ answerStyle: v as Settings['answerStyle'] });
        break;
      case 'count':
        this.update({ count: Number(v) });
        break;
      case 'time':
        this.update({ timeLimit: Number(v) });
        break;
      case 'seat':
        this.update({ filters: { ...this.s.filters, seat: v as Settings['filters']['seat'] } });
        break;
      case 'win':
        this.update({ filters: { ...this.s.filters, win: v as Settings['filters']['win'] } });
        break;
    }
  }

  // ------------------------------------------------------------ 進行

  /** resetMachine=false ならノーマルの台（保留・確変）を引き継ぐ */
  private startSession(resetMachine = false): void {
    this.endRound();
    this.fx.reset();
    if (this.practice || resetMachine || this.panel.stopped) {
      this.tutorialCount = 0;
      this.tutorialForced = false;
    }
    if (this.practice) this.panel.stop();
    else if (resetMachine || this.panel.stopped) this.panel.reset();
    else {
      this.fx.syncRush(this.panel.rush);
      this.fx.rushChain(this.panel.machine.data.rushChain);
    }
    this.setBusy(false);
    this.session = newSession();
    this.session.startBalance = this.wallet.balance;
    this.awaitingBankrupt = false;
    this.renderWallet(false);
    this.renderHighRoller();
    $('#summary').hidden = true;
    $('#stage').hidden = false;
    this.next();
  }

  private next(): void {
    if (this.awaitingBankrupt) {
      this.hint('保留の抽選結果を待っています…');
      return;
    }
    const count = this.practice ? this.s.count : 0;
    if (count && this.session.answered >= count) {
      this.showSummary();
      return;
    }
    // ラウンドを消化しきったら大当り終了（台の V・確変分岐へ）
    if (this.round && this.round.n >= ECONOMY.rounds) this.endRound();
    this.isRoundQ = !!this.round;
    if (this.round) this.round.n++;
    document.body.classList.toggle('bonus', this.isRoundQ);
    this.renderBonus();
    // 確変中は役満（高打点）が出やすい。ラウンド問題は高打点中心
    const boost = !this.practice && this.panel.rush && !this.isRoundQ;
    this.q = generateQuestion(this.s.mode, this.s.rules, this.s.filters, Math.random, boost, this.isRoundQ);
    this.input = '';
    this.picked = -1;
    this.choices = this.isChoice ? makeChoices(this.q, this.s.rules) : [];
    this.setPhase('answering');
    this.startedAt = performance.now();
    this.renderQuestion();
    // 問題の切り替え：少し下から現れる
    const qel = $('#question');
    qel.classList.remove('q-in');
    void qel.offsetWidth;
    qel.classList.add('q-in');
    this.renderInput();
    this.renderProgress();
    $('#result').innerHTML = '';
    $('#stage').classList.remove('correct', 'wrong');
    document.querySelector('main')?.scrollTo({ top: 0 });
    this.startTimer();
    this.startBetRing();
    this.renderNet();
  }

  /** ハイローラーの切り替え（次の問題から反映。ラウンドの倍率は大当り時点で固定） */
  private toggleHighRoller(): void {
    this.update({ highRoller: !this.s.highRoller }, false);
    this.renderHighRoller();
    if (this.fxLevel !== 'off') sfx.lampUp();
    if (this.phase === 'answering') this.startBetRing();
  }

  private renderHighRoller(): void {
    const on = this.s.highRoller;
    this.panel.setHighRoller(on);
    const b = $('#hr-toggle');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    $('#meter').classList.toggle('hr', on);
  }

  /** BONUS の液晶表示（ラウンド・連続の倍率・賞金表）。result は直前の回答で光らせるマス */
  private renderBonus(result: { lit?: string; miss?: string } = {}): void {
    const r = this.round;
    if (!r || this.practice) {
      this.panel.bonus(null);
      return;
    }
    this.panel.bonus({
      n: r.n,
      rounds: ECONOMY.rounds,
      mult: comboMult(r.combo),
      rows: paytableRows(this.s.mode, r.premium, r.highRoller),
      lit: result.lit,
      miss: result.miss,
      premium: r.premium,
    });
  }

  /** 大当り：ラウンド問題を出題し、終わったら出玉合計を返す */
  private startRound(premium: boolean): Promise<number> {
    return new Promise((resolve) => {
      this.round = { n: 0, total: 0, combo: 0, premium, highRoller: this.s.highRoller, resolve };
      this.tips.first('firstHit');
      this.renderBonus();
      this.renderProgress();
      // 回答待ちの問題はそのまま。次の問題からラウンド問題になる
      if (this.phase === 'answering' && !this.isRoundQ) this.hint(this.compact ? '' : '次の問題から BONUS ラウンド');
    });
  }

  private endRound(): void {
    const r = this.round;
    if (!r) return;
    this.round = null;
    this.isRoundQ = false;
    document.body.classList.remove('bonus');
    this.panel.bonus(null);
    r.resolve(r.total);
  }

  /** 回答にかかった時間（発展リーチ・大当りで止まっていた時間は除く） */
  private activeElapsed(): number {
    const now = this.pausedAt || performance.now();
    return (now - this.startedAt) / 1000;
  }

  /**
   * 計器の BET（ノーマルのみ）。時間は意識させないよう秒数は出さず、
   * 締切までは定価に取り消し線＋半額と、下辺の細いバーが静かに減るだけ。締切後は定価に戻る
   */
  private startBetRing(): void {
    cancelAnimationFrame(this.betRaf);
    const el = $('#bet');
    el.classList.remove('expired', 'settled');
    if (this.practice) {
      el.innerHTML = '';
      return;
    }
    if (this.isRoundQ && this.round) {
      el.innerHTML = '<small>BET<em class="gold">BONUS</em></small><span class="bet-v"><b>0</b></span>';
      return;
    }
    const hr = this.s.highRoller;
    const fastSec = ECONOMY.fastSeconds[this.s.mode];
    const full = costFor(true, false, hr);
    const half = costFor(true, true, hr);
    el.style.setProperty('--half', `${fastSec}s`);
    const html = (exp: boolean) =>
      exp
        ? `<small>BET</small><span class="bet-v"><b>${full}</b></span>`
        : `<small>BET<em>速答で半額</em></small><span class="bet-v"><s>${full}</s><b>${half}</b></span><i class="bar"></i>`;
    el.innerHTML = html(false);
    const tick = () => {
      if (this.phase !== 'answering') return;
      if (this.activeElapsed() >= fastSec) {
        el.classList.add('expired');
        el.innerHTML = html(true);
        return;
      }
      this.betRaf = requestAnimationFrame(tick);
    };
    this.betRaf = requestAnimationFrame(tick);
  }

  /** 回答後、BET を実際にかかった額に切り替える（通常の問題のみ） */
  private settleBet(correct: boolean, fast: boolean): void {
    cancelAnimationFrame(this.betRaf);
    if (this.practice || this.isRoundQ) return;
    const cost = costFor(correct, correct && fast, this.s.highRoller);
    const tag = !correct ? '<em class="ng">不正解</em>' : fast ? '<em>速答で半額</em>' : '';
    const el = $('#bet');
    el.classList.remove('expired');
    el.classList.add('settled');
    el.innerHTML = `<small>BET${tag}</small><span class="bet-v"><b${correct ? '' : ' class="ng"'}>−${cost}</b></span>`;
  }

  /** 計器の右枠：通常は今回の収支、BONUS 中はそのラウンドの出玉 */
  private renderNet(): void {
    const el = $('#net');
    const r = this.isRoundQ ? this.round : null;
    const v = r ? r.total : this.wallet.balance - this.session.startBalance;
    el.classList.toggle('bonus', !!r);
    el.classList.toggle('minus', !r && v < 0);
    el.querySelector('small')!.textContent = r ? '出玉' : '収支';
    renderOdometer(el.querySelector('b')!, `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString()}`);
  }

  /** 所持金の増減（計器の数字が回り、差額が浮き上がる） */
  private changeBalance(delta: number, rollMs = 500): void {
    this.wallet = applyDelta(this.wallet, delta);
    saveWallet(this.wallet);
    this.renderWallet(true, delta, rollMs);
  }

  private renderWallet(animate: boolean, delta = 0, rollMs = 500): void {
    const w = $('#wallet');
    const val = w.querySelector<HTMLElement>('b')!;
    const target = this.wallet.balance;
    w.classList.toggle('low', target < ECONOMY.lowWarn);
    if (target < ECONOMY.lowWarn && !this.practice && delta < 0) this.tip('low');
    // 数字は桁ごとに回る（オドメーター）。動きの速さは CSS で決める
    val.style.setProperty('--odo-ms', `${animate ? rollMs : 0}ms`);
    renderOdometer(val, target.toLocaleString());
    if (delta) {
      const d = document.createElement('span');
      d.className = `yan-delta ${delta > 0 ? 'up' : 'down'}`;
      d.textContent = `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
      w.appendChild(d);
      setTimeout(() => d.remove(), 1200);
      if (delta > 0) {
        w.classList.remove('bump');
        void w.offsetWidth;
        w.classList.add('bump');
      }
    }
    this.renderNet();
  }

  /** 所持金の推移を折れ線で描く */
  private renderSlump(el: HTMLElement, hist: number[], w: number, h: number): void {
    if (hist.length < 2) {
      el.innerHTML = '';
      return;
    }
    const min = Math.min(0, ...hist);
    const max = Math.max(ECONOMY.initial, ...hist);
    const x = (i: number) => (i / (hist.length - 1)) * w;
    const y = (v: number) => h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    const pts = hist.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const base = y(ECONOMY.initial).toFixed(1);
    const up = hist[hist.length - 1] >= ECONOMY.initial;
    // 所持金が増えた区間（＝BONUS の賞金）は金の線で重ねる
    const gains = hist
      .slice(1)
      .map((v, i) => (v > hist[i] ? `M${x(i).toFixed(1)} ${y(hist[i]).toFixed(1)} L${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}` : ''))
      .join(' ');
    const last = hist.length - 1;
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="${up ? 'up' : 'down'}">
      <defs><linearGradient id="slump-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity="0.28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/>
      </linearGradient></defs>
      <polygon points="0,${h} ${pts} ${w},${h}" class="area" fill="url(#slump-fill)"/>
      <line x1="0" x2="${w}" y1="${base}" y2="${base}" class="base"/>
      <polyline points="${pts}" class="line"/>
      ${gains ? `<path d="${gains}" class="gain"/>` : ''}
      <circle cx="${x(last).toFixed(1)}" cy="${y(hist[last]).toFixed(1)}" r="4" class="end"/></svg>`;
  }

  /** 所持金が尽きたら、保留の抽選をすべて待ってから破産判定 */
  private checkBankrupt(): void {
    if (this.practice || this.phase === 'summary') return;
    if (!isBankrupt(this.wallet)) {
      if (this.awaitingBankrupt) {
        this.awaitingBankrupt = false;
        this.hint(this.compact ? '' : 'Enter / Space で次へ');
      }
      return;
    }
    if (!this.panel.idle || this.busy) {
      this.awaitingBankrupt = true;
      return;
    }
    this.awaitingBankrupt = false;
    this.showSummary('bankrupt');
  }

  /** 発展リーチ・大当り中は回答と制限時間を止める */
  private setBusy(b: boolean): void {
    this.pause('machine', b);
  }

  /** 理由ごとに回答と制限時間を止める。どれか1つでも残っていれば止めたまま */
  private pause(reason: string, on: boolean): void {
    if (on) this.pauses.add(reason);
    else this.pauses.delete(reason);
    const b = this.pauses.size > 0;
    if (b === this.busy) return;
    this.busy = b;
    document.body.classList.toggle('busy', b);
    if (b) {
      this.pausedAt = performance.now();
      cancelAnimationFrame(this.timerRaf);
    } else {
      if (this.pausedAt && this.phase === 'answering') {
        this.startedAt += performance.now() - this.pausedAt;
        this.startTimer();
      }
      this.pausedAt = 0;
    }
  }

  private startTimer(): void {
    cancelAnimationFrame(this.timerRaf);
    const bar = $('#timer');
    if (!this.s.timeLimit) {
      bar.style.transform = 'scaleX(0)';
      return;
    }
    const limit = this.s.timeLimit * 1000;
    const tick = () => {
      if (this.phase !== 'answering') return;
      const left = 1 - (performance.now() - this.startedAt) / limit;
      bar.style.transform = `scaleX(${Math.max(0, left)})`;
      bar.classList.toggle('low', left < 0.25);
      if (left <= 0) {
        void this.submit(true);
        return;
      }
      this.timerRaf = requestAnimationFrame(tick);
    };
    this.timerRaf = requestAnimationFrame(tick);
  }

  private get isChoice(): boolean {
    return this.s.answerStyle === 'choice';
  }

  private needsPair(): boolean {
    if (this.isChoice || this.q.mode === 'fu') return false;
    const { dealer, tsumo } = questionMeta(this.q);
    return tsumo && !dealer;
  }

  private isCorrect(input: string): boolean {
    if (this.isChoice) return this.choices[this.picked]?.correct ?? false;
    if (this.q.mode === 'fu') return Number(input) === this.q.ev.fu.fu;
    return checkPointsAnswer(input, scoreOf(this.q));
  }

  /** 動作確認用：現在の問題の正解入力 */
  debugAnswer(): string {
    if (this.isChoice) return String(this.choices.findIndex((c) => c.correct) + 1);
    if (this.q.mode === 'fu') return String(this.q.ev.fu.fu);
    const s = scoreOf(this.q);
    if (!s.tsumo) return String(s.payment.ron);
    return s.dealer ? String(s.payment.fromDealer) : `${s.payment.fromChild}-${s.payment.fromDealer}`;
  }

  private correctText(): string {
    if (this.q.mode === 'fu') return `${this.q.ev.fu.fu}符`;
    return formatAnswer(scoreOf(this.q));
  }

  private async submit(timeout = false): Promise<void> {
    if (this.phase !== 'answering') return;
    if (!timeout && !this.isChoice) {
      if (!this.input) return;
      if (this.needsPair() && !/\d-\d/.test(this.input)) {
        this.hint('子ツモは「子の支払い-親の支払い」の2つを入力（例 1000-2000）');
        this.fx.lose($('#answer'), false);
        return;
      }
    }
    cancelAnimationFrame(this.timerRaf);
    this.setPhase('suspense');
    const elapsed = this.activeElapsed();
    cancelAnimationFrame(this.betRaf);
    const correct = !timeout && this.isCorrect(this.input);
    this.reveal(correct, elapsed, timeout);
  }

  private reveal(correct: boolean, elapsed: number, timeout: boolean): void {
    const ss = this.session;
    const { dealer, tsumo } = questionMeta(this.q);
    const cat = situationLabel(dealer, tsumo);
    ss.answered++;
    ss.byCat[cat] ??= { c: 0, n: 0 };
    ss.byCat[cat].n++;
    this.setPhase('result');
    this.lastCorrect = correct;
    const stage = $('#stage');
    stage.classList.add(correct ? 'correct' : 'wrong');

    const explain = this.q.mode === 'hayami' ? hayamiExplain(this.q) : handExplain(this.q);
    const answerEl = this.answerAnchor();
    const yours = timeout ? '時間切れ' : this.isChoice ? this.choices[this.picked].label : this.input;

    if (correct) {
      ss.correct++;
      ss.streak++;
      ss.maxStreak = Math.max(ss.maxStreak, ss.streak);
      ss.times.push(elapsed);
      ss.byCat[cat].c++;
      const { tier, label } = this.tier();
      let extra = '';
      if (this.practice && this.s.count) {
        const pts = practiceScore(this.s.mode, true, elapsed);
        ss.score += pts;
        extra = `<span class="pts">+${pts}</span><span class="muted">速さ ×${speedMultiplier(this.s.mode, elapsed).toFixed(1)}</span>`;
      } else if (this.isRoundQ && this.round) {
        const r = this.round;
        const mult = comboMult(r.combo);
        r.combo++;
        const s = scoreOf(this.q);
        const fast = elapsed <= ECONOMY.fastSeconds[this.s.mode];
        const prize = roundPrize({
          mode: this.s.mode,
          limit: s.limit,
          dealer: s.dealer,
          fast,
          combo: r.combo,
          premium: r.premium,
          highRoller: r.highRoller,
        });
        r.total += prize;
        // 賞金の内訳：賞金表のマス × 親 × 速答 × 連続
        const key = paytableKey(s.limit);
        const row = paytableRows(this.s.mode, r.premium, r.highRoller).find((x) => x.key === key)!;
        const factors = [
          `${row.label} ${row.prize.toLocaleString()}`,
          s.dealer ? `親×${ECONOMY.dealerMult}` : '',
          fast ? `速答×${ECONOMY.fastMult}` : '',
          mult > 1 ? `連続×${mult.toFixed(1)}` : '',
        ].filter(Boolean);
        extra = `<span class="prize">+${prize.toLocaleString()} yan</span><span class="muted breakdown">${factors.join(' ')}</span>`;
        this.renderBonus({ lit: key });
        this.fx.roundWin(prize, answerEl, $('#net'), () => this.changeBalance(prize, 900));
      } else if (!this.practice && elapsed <= ECONOMY.fastSeconds[this.s.mode]) {
        this.tip('fast');
        extra = '<span class="fast-tag">速答</span>';
      }
      $('#result').innerHTML = `<div class="verdict ok"><span class="mark">正解</span><span class="ans">${this.correctText()}</span><span class="muted">${elapsed.toFixed(1)}s</span>${extra}</div>${explain}`;
      const streak = ss.streak;
      if (!this.practice) {
        this.fx.hit(streak, answerEl);
        // 正解＝始動口入賞。通常時の役満は直撃で確変大当り確定。ラウンド中は台に玉を入れない
        if (!this.isRoundQ) {
          if (this.q.mode !== 'hayami' && this.q.ev.yakuman > 0 && !this.panel.rush) this.panel.direct();
          else {
            this.tutorialHit();
            void this.panel.enter(1, answerEl);
          }
        }
        // ラウンド中はほぼ毎問が高い手なので、役満以外の大演出は省いてテンポを保つ
        const t = this.isRoundQ && tier < 3 ? 0 : tier;
        // コインは実際にお金が入るとき（BONUS）だけ。通常時の満貫・跳満は役名と火花だけ
        void this.fx.win(t, label, answerEl, this.isRoundQ).then(async () => {
          if (this.phase === 'result') await this.fx.milestone(streak);
        });
      }
    } else {
      ss.streak = 0;
      if (this.isRoundQ && this.round) {
        this.round.combo = 0;
        this.renderBonus({ miss: paytableKey(scoreOf(this.q).limit) });
      }
      ss.misses.push({ q: this.q, input: yours });
      // 通常時のお金は計器だけで見せる。BONUS の外れはパンク
      const penalty = this.isRoundQ ? '<span class="punk">パンク（賞金なし）</span>' : '';
      $('#result').innerHTML = `<div class="verdict ng"><span class="mark">不正解</span><span class="yours">${yours}</span><span class="arrow">→</span><span class="ans">${this.correctText()}</span>${penalty}</div>${explain}`;
      this.fx.lose(this.isChoice ? $('#choices') : answerEl, false);
      if (!this.practice && !this.isRoundQ) this.tip('miss');
    }
    if (!this.practice && !this.isRoundQ) {
      const fast = elapsed <= ECONOMY.fastSeconds[this.s.mode];
      this.settleBet(correct, fast);
      this.changeBalance(-costFor(correct, correct && fast, this.s.highRoller));
    }
    this.renderProgress();
    this.renderInput();
    this.hint(this.compact ? '' : correct ? 'クリック / 任意のキーで次へ' : 'クリック / Enter / Space で次へ');
    if (!this.practice) this.checkBankrupt();
    if (this.compact) {
      // 解説の先頭（判定）が見える位置までスクロール
      const main = document.querySelector('main');
      const res = $('#result');
      if (main) main.scrollTo({ top: Math.max(0, res.offsetTop - main.offsetTop - 8), behavior: 'smooth' });
    }
  }

  /** 手の打点に応じた正解演出の段階 */
  private tier(): { tier: WinTier; label: string } {
    const q = this.q;
    const streak = this.session.streak;
    const limit = scoreOf(q).limit;
    if (q.mode !== 'hayami') {
      if (q.ev.yakuman) return { tier: 3, label: limit };
      if (limit && limit !== '満貫') return { tier: 2, label: limit };
      if (limit) return { tier: 1, label: limit };
    }
    if (streak > 0 && streak % 5 === 0 && streak % 10 !== 0) return { tier: 1, label: `${streak}連` };
    return { tier: 0, label: '' };
  }

  // ------------------------------------------------------------ 描画

  private renderQuestion(): void {
    const q = this.q;
    const el = $('#question');
    if (q.mode === 'hayami') {
      const main =
        q.han >= 5
          ? `<span class="big">${q.han}<small>翻</small></span>`
          : `<span class="big">${q.han}<small>翻</small></span><span class="big">${q.fu}<small>符</small></span>`;
      el.innerHTML = `<div class="q-hayami"><div class="q-main">${main}</div>
        <div class="q-sub"><span class="chip strong">${q.dealer ? '親' : '子'}</span><span class="chip strong">${q.tsumo ? 'ツモ' : 'ロン'}</span></div></div>`;
      return;
    }
    el.innerHTML = this.handQuestionHtml(q);
  }

  private handQuestionHtml(q: HandQuestion): string {
    const ura = q.sit.uraIndicators.length
      ? `<div class="dora"><span class="muted">裏ドラ表示</span>${tilesInline(q.sit.uraIndicators)}<span class="muted small">→ ${doraLabel(q.sit.uraIndicators)}</span></div>`
      : '';
    return `<div class="q-hand">
      <div class="q-info">
        <div class="chips">${situationChips(q)}</div>
        <div class="doras">
          <div class="dora"><span class="muted">ドラ表示</span>${tilesInline(q.sit.doraIndicators)}<span class="muted small">→ ${doraLabel(q.sit.doraIndicators)}</span></div>
          ${ura}
        </div>
      </div>
      ${handHtml(q.hand, q.sit.tsumo)}
    </div>`;
  }

  private promptUnit(): { unit: string; ghost: string } {
    if (this.q.mode === 'fu') return { unit: '符', ghost: '符を入力' };
    const { dealer, tsumo } = questionMeta(this.q);
    if (!tsumo) return { unit: '点', ghost: '点数を入力' };
    if (dealer) return { unit: '点オール', ghost: '1人あたりの支払い' };
    return { unit: '点', ghost: '子 - 親' };
  }

  /** 演出の起点になる要素（4択なら選んだボタン） */
  private answerAnchor(): HTMLElement {
    if (!this.isChoice) return $('#answer');
    return (
      document.querySelector<HTMLElement>(`#choices [data-choice="${this.picked}"]`) ?? $('#choices')
    );
  }

  private renderChoices(): void {
    const el = $('#choices');
    const done = this.phase === 'result';
    el.innerHTML = this.choices
      .map((c, i) => {
        const cls = done ? (c.correct ? ' is-correct' : i === this.picked ? ' is-wrong' : ' is-dim') : '';
        const unit = this.q.mode === 'fu' || c.label.endsWith('オール') ? '' : '<span class="unit">点</span>';
        return `<button class="choice${cls}" data-choice="${i}"${done ? ' disabled' : ''}><kbd>${i + 1}</kbd><span class="label">${c.label}</span>${unit}</button>`;
      })
      .join('');
  }

  private renderInput(): void {
    $('#answer').hidden = this.isChoice;
    $('#choices').hidden = !this.isChoice;
    if (this.isChoice) {
      this.renderChoices();
      if (this.phase === 'answering') this.hint(this.defaultHint());
      return;
    }
    const { unit, ghost } = this.promptUnit();
    const text = this.input
      ? this.input
          .split('-')
          .map((p) => `<span class="num">${p}</span>`)
          .join('<span class="sep">-</span>')
      : `<span class="ghost">${ghost}</span>`;
    const caret = this.phase === 'answering' ? '<span class="caret"></span>' : '';
    $('#answer').innerHTML = this.input
      ? `<span class="typed">${text}</span>${caret}<span class="unit">${unit}</span>`
      : `${caret}${text}`;
    if (this.phase === 'answering') this.hint(this.defaultHint());
  }

  private defaultHint(): string {
    if (this.compact) return this.isChoice ? '' : 'テンキーで入力して「回答」';
    if (this.isChoice) return '<kbd>1</kbd>-<kbd>4</kbd> 選択 · <kbd>Tab</kbd> パス · <kbd>Esc</kbd> やり直し';
    const pair = this.needsPair() ? '<kbd>-</kbd> 区切り · ' : '';
    return `${pair}<kbd>Enter</kbd> 回答 · <kbd>Tab</kbd> パス · <kbd>Esc</kbd> やり直し`;
  }

  private hint(html: string): void {
    $('#hint').innerHTML = html;
  }

  private renderProgress(): void {
    const ss = this.session;
    const total = this.practice && this.s.count ? `/${this.s.count}` : '';
    const acc = ss.answered ? Math.round((ss.correct / ss.answered) * 100) : 100;
    $('#progress').innerHTML = `<span>${ss.answered + (this.phase === 'answering' || this.phase === 'suspense' ? 1 : 0)}${total}</span>
      <span class="muted">正答率 ${acc}%</span>
      <span class="streak${ss.streak >= 5 ? ' hot' : ''}">${ss.streak ? `${ss.streak}連` : ''}</span>
      ${this.practice && this.s.count ? `<span class="score">SCORE <b>${ss.score.toLocaleString()}</b></span>` : ''}`;
  }

  /** end: 規定問題数の終了 / settle: ノーマルの精算 / bankrupt: 破産 */
  private showSummary(kind: 'end' | 'settle' | 'bankrupt' = 'end'): void {
    this.setPhase('summary');
    cancelAnimationFrame(this.timerRaf);
    cancelAnimationFrame(this.betRaf);
    this.toggleConfigSheet(false);
    const ss = this.session;
    const acc = ss.answered ? (ss.correct / ss.answered) * 100 : 0;
    const avg = ss.times.length ? ss.times.reduce((a, b) => a + b, 0) / ss.times.length : 0;
    const scored = this.practice && this.s.count > 0;

    // 自己ベスト（プラクティスはスコア、それ以外は正答率）
    const key = `${this.s.playMode}:${this.s.mode}:${this.s.count}`;
    const prev = this.best[key];
    let newBest = false;
    if (this.practice && ss.answered) {
      newBest = scored
        ? !prev || ss.score > (prev.score ?? 0)
        : !prev || acc > prev.acc || (acc === prev.acc && avg > 0 && avg < prev.avg);
      if (newBest) {
        this.best[key] = { acc, avg, streak: Math.max(ss.maxStreak, prev?.streak ?? 0), score: ss.score };
        save(BEST_KEY, this.best);
      }
    }

    const cats = Object.entries(ss.byCat)
      .map(([k, v]) => {
        const p = Math.round((v.c / v.n) * 100);
        return `<div class="cat"><span>${k}</span><span class="bar"><i style="width:${p}%"></i></span><span>${v.c}/${v.n}</span></div>`;
      })
      .join('');
    const weak = Object.entries(ss.byCat)
      .filter(([, v]) => v.n >= 2)
      .sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n)[0];
    const weakText = weak && weak[1].c < weak[1].n ? `苦手：<b>${weak[0]}</b>` : ss.answered ? '苦手なし' : '';
    const misses = ss.misses
      .slice(-8)
      .map((m) => `<li>${this.missLabel(m.q)} <span class="yours">${m.input}</span> → <b>${this.answerOf(m.q)}</b></li>`)
      .join('');

    const stat = (label: string, value: string, cls = '') =>
      `<div class="stat ${cls}"><div class="label">${label}</div><div class="value">${value}</div></div>`;
    let head = '';
    let stats: string;
    let again = 'もう一度';
    if (this.practice) {
      stats = [
        scored ? stat('スコア', ss.score.toLocaleString(), 'hero') : stat('正答率', `${Math.round(acc)}<small>%</small>`),
        scored ? stat('正答率', `${Math.round(acc)}<small>%</small>`) : stat('問題数', String(ss.answered)),
        stat('平均回答', `${avg.toFixed(1)}<small>s</small>`),
        stat('最大連続', String(ss.maxStreak)),
      ].join('');
      if (newBest) head = '<div class="new-best">自己ベスト更新</div>';
      else if (prev) {
        head = `<div class="muted small">自己ベスト ${scored ? `${(prev.score ?? 0).toLocaleString()}点` : `${Math.round(prev.acc)}% / ${prev.avg.toFixed(1)}s`}</div>`;
      }
    } else {
      const diff = this.wallet.balance - ss.startBalance;
      const d = this.panel.machine.data;
      stats = [
        stat('収支', `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toLocaleString()}<small>yan</small>`, `hero ${diff >= 0 ? 'plus' : 'minus'}`),
        stat('正答率', `${Math.round(acc)}<small>%</small>`),
        stat('大当り', `${d.hits}<small>回</small>`),
        stat('最大RUSH', `${d.maxChain}<small>連</small>`),
      ].join('');
      if (kind === 'bankrupt') {
        head = `<div class="bankrupt"><span>破産</span><small>所持金が尽きました</small></div>`;
        again = `${ECONOMY.initial.toLocaleString()}yan で再起`;
      } else {
        head = `<div class="muted small">所持金 ${this.wallet.balance.toLocaleString()} yan</div>`;
        again = '続ける';
      }
    }

    // 大当り履歴（新しい順。数字は何回転目で当ったか）
    const log = this.practice ? [] : this.panel.machine.data.log;
    const logHtml = log.length
      ? `<div class="sum-log"><span class="ex-h">大当り履歴</span>${log
          .map(
            (h) =>
              `<span class="hit${h.kakuhen ? ' k' : ''}${h.premium ? ' p' : ''}" title="${h.at}回転で${h.kakuhen ? '確変' : '通常'}大当り">${h.at}</span>`,
          )
          .join('')}</div>`
      : '';

    $('#stage').hidden = true;
    const sum = $('#summary');
    sum.hidden = false;
    sum.innerHTML = `
      ${head}
      <div class="stats">${stats}</div>
      ${!this.practice ? '<div class="sum-slump"></div>' : ''}
      ${logHtml}
      <div class="sum-cols">
        <div><div class="ex-h">状況別 <span class="muted">${weakText}</span></div>${cats}</div>
        ${misses ? `<div><div class="ex-h">間違えた問題</div><ul class="misses">${misses}</ul></div>` : ''}
      </div>
      <button class="again-btn" type="button" data-again>${again}</button>
      ${this.compact ? '' : `<div class="hint"><kbd>Tab</kbd> / <kbd>Enter</kbd> ${again}</div>`}`;
    const slump = sum.querySelector<HTMLElement>('.sum-slump');
    if (slump) this.renderSlump(slump, this.wallet.history, 600, 120);
    sum.querySelector('[data-again]')?.addEventListener('click', () => this.restartFromSummary(kind));
    this.summaryKind = kind;
    if (kind === 'bankrupt') this.panel.stop();
    this.fx.sessionEnd(kind !== 'bankrupt' && acc >= 80);
  }

  private summaryKind: 'end' | 'settle' | 'bankrupt' = 'end';

  private restartFromSummary(kind: 'end' | 'settle' | 'bankrupt' = this.summaryKind): void {
    if (kind === 'bankrupt') {
      this.wallet = freshWallet(this.wallet.bankrupts + 1);
      saveWallet(this.wallet);
    }
    this.startSession(kind === 'bankrupt');
  }

  private missLabel(q: Question): string {
    const { dealer, tsumo } = questionMeta(q);
    if (q.mode === 'hayami') return `${q.han}翻${q.han >= 5 ? '' : `${q.fu}符`} ${situationLabel(dealer, tsumo)}`;
    return `${situationLabel(dealer, tsumo)}の手`;
  }

  private answerOf(q: Question): string {
    if (q.mode === 'fu') return `${q.ev.fu.fu}符`;
    return formatAnswer(scoreOf(q));
  }

  // ------------------------------------------------------------ 入力

  private bind(): void {
    addEventListener('keydown', (e) => this.onKey(e));
    addEventListener('mousemove', () => document.body.classList.remove('typing'));
    document.querySelectorAll<HTMLElement>('[data-play]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.play !== this.s.playMode) this.update({ playMode: b.dataset.play as Settings['playMode'] });
        b.blur();
      }),
    );
    $('#mode-tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
      if (b && b.dataset.mode !== this.s.mode) this.update({ mode: b.dataset.mode as Mode });
    });
    $('#cfg-toggle').addEventListener('click', () => this.toggleConfigSheet());
    $('#cfg-backdrop').addEventListener('click', () => this.toggleConfigSheet(false));
    $('#next-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.phase === 'result') {
        this.fx.skip();
        this.next();
      } else if (this.phase === 'summary') this.restartFromSummary();
    });
    $('#config').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-cashout]')) {
        this.showSummary('settle');
        return;
      }
      if ((e.target as HTMLElement).closest('[data-close-cfg]')) {
        this.toggleConfigSheet(false);
        return;
      }
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cfg]');
      if (b) {
        this.onConfig(b.dataset.cfg!, b.dataset.v!);
        b.blur();
      }
    });
    $('#open-settings').addEventListener('click', () => this.openSettings());
    $('#open-help').addEventListener('click', () => this.openHelp());
    $('#hr-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHighRoller();
      (e.currentTarget as HTMLElement).blur();
    });
    this.bindGuide();
    this.bindSettings();
    $('#numpad').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
      if (!b) return;
      unlockAudio();
      this.handleKey(b.dataset.key!);
    });
    $('#choices').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-choice]');
      if (!b || this.phase !== 'answering') return;
      // ステージのクリック（次へ）に伝わらないようにする
      e.stopPropagation();
      unlockAudio();
      this.pick(Number(b.dataset.choice));
    });
    $('#overlay').addEventListener('click', () => this.fx.tap());
    $('#stage').addEventListener('click', () => {
      if (this.phase === 'result') this.next();
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (document.querySelector('dialog[open]')) return;
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'Backspace' && this.phase === 'answering') {
        this.input = '';
        this.renderInput();
        e.preventDefault();
      }
      return;
    }
    unlockAudio();
    if (e.key === 'Tab' || e.key === ' ') e.preventDefault();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.startSession();
      return;
    }
    if (e.key === 'Backspace' && e.altKey) {
      this.input = '';
      this.renderInput();
      return;
    }
    this.handleKey(e.key);
  }

  private handleKey(key: string): void {
    if (this.busy) {
      this.fx.tap();
      return;
    }
    switch (this.phase) {
      case 'suspense':
        this.fx.tap();
        return;
      case 'summary':
        if (key === 'Tab' || key === 'Enter' || key === ' ') this.restartFromSummary();
        return;
      case 'result':
        if (this.lastCorrect || key === 'Enter' || key === ' ' || key === 'Tab') {
          this.fx.skip();
          this.next();
          // 数値入力では打ち始めた数字を次の問題に引き継ぐ（4択では誤選択を防ぐため引き継がない）
          if (!this.isChoice && /^\d$/.test(key)) this.handleKey(key);
        }
        return;
      case 'answering':
        break;
    }
    document.body.classList.add('typing');
    if (this.isChoice) {
      if (/^[1-4]$/.test(key)) this.pick(Number(key) - 1);
      else if (key === 'Tab') void this.submit(true);
      return;
    }
    if (/^\d$/.test(key)) {
      if (this.input.replace('-', '').length >= 10) return;
      if (this.input === '' && key === '0') return;
      if (this.input.endsWith('-') && key === '0') return;
      this.input += key;
      sfx.key();
    } else if ((key === '-' || key === ' ' || key === '/') && this.needsPair()) {
      if (!this.input || this.input.includes('-')) return;
      this.input += '-';
      sfx.key();
    } else if (key === 'Backspace') {
      this.input = this.input.slice(0, -1);
      sfx.back();
    } else if (key === 'Enter') {
      void this.submit();
      return;
    } else if (key === 'Tab') {
      void this.submit(true);
      return;
    } else return;
    this.renderInput();
  }

  private pick(i: number): void {
    if (this.phase !== 'answering' || !this.choices[i]) return;
    this.picked = i;
    sfx.key();
    document.querySelector(`#choices [data-choice="${i}"]`)?.classList.add('is-picked');
    void this.submit();
  }

  // ------------------------------------------------------------ 初回導入・遊び方・一言ガイド

  private bindGuide(): void {
    const intro = $<HTMLDialogElement>('#intro-dialog');
    intro.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-intro]');
      if (!b) return;
      switch (b.dataset.intro) {
        case 'next':
          this.introStep++;
          intro.innerHTML = introHtml(this.introStep);
          intro.querySelector<HTMLElement>('[data-intro="next"],[data-intro="start"]')?.focus();
          return;
        case 'practice':
          intro.close();
          if (!this.practice) this.update({ playMode: 'practice' });
          return;
        default:
          intro.close();
      }
    });
    intro.addEventListener('close', () => {
      markIntroSeen();
      this.pause('intro', false);
    });
    const help = $<HTMLDialogElement>('#help-dialog');
    help.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === help || t.closest('[data-help-close]')) {
        help.close();
        return;
      }
      const b = t.closest<HTMLElement>('[data-help-tab]');
      if (b) {
        this.helpTab = b.dataset.helpTab as HelpTab;
        help.innerHTML = helpHtml(this.helpTab, this.s.mode);
      }
    });
    help.addEventListener('close', () => this.pause('help', false));
    $('#tip').addEventListener('click', (e) => {
      e.stopPropagation();
      this.nextTip();
    });
  }

  private openIntro(): void {
    const dlg = $<HTMLDialogElement>('#intro-dialog');
    this.introStep = 0;
    dlg.innerHTML = introHtml(0);
    this.pause('intro', true);
    if (!dlg.open) dlg.showModal();
    dlg.querySelector<HTMLElement>('[data-intro="next"]')?.focus();
  }

  private openHelp(): void {
    const dlg = $<HTMLDialogElement>('#help-dialog');
    dlg.innerHTML = helpHtml(this.helpTab, this.s.mode);
    this.pause('help', true);
    if (!dlg.open) dlg.showModal();
  }

  /** 初めての出来事なら一言ガイドを出す（ノーマルのみ・各1回） */
  private tip(id: Exclude<TipId, 'firstHit'>): void {
    if (this.practice || !this.tips.first(id)) return;
    this.toast(tipText(id, ECONOMY.fastSeconds[this.s.mode]));
  }

  private toast(text: string): void {
    this.tipQueue.push(text);
    if ($('#tip').hidden) this.nextTip();
    else {
      // 続けて起きたときは、今のガイドを最低限読める時間だけ出して次へ
      clearTimeout(this.tipTimer);
      this.tipTimer = window.setTimeout(() => this.nextTip(), Math.max(0, this.tipShownAt + 3500 - performance.now()));
    }
  }

  private nextTip(): void {
    clearTimeout(this.tipTimer);
    const el = $('#tip');
    const text = this.tipQueue.shift();
    if (!text) {
      el.hidden = true;
      return;
    }
    el.innerHTML = `<span class="tip-label">TIPS</span><span class="tip-text">${text}</span>`;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.tipShownAt = performance.now();
    this.tipTimer = window.setTimeout(() => this.nextTip(), this.tipQueue.length ? 3500 : 7000);
  }

  /** まだ大当りしたことがない人は、3回目の入賞を確変大当りにして BONUS を早めに体験させる */
  private tutorialHit(): void {
    if (this.tips.has('firstHit') || this.tutorialForced || this.panel.rush) return;
    if (++this.tutorialCount < 3) return;
    this.tutorialForced = true;
    this.panel.machine.forceNextHit();
  }

  // ------------------------------------------------------------ 設定ダイアログ

  private rulesDirty = false;

  private bindSettings(): void {
    const dlg = $<HTMLDialogElement>('#settings-dialog');
    dlg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-set]');
      if (!b || b instanceof HTMLInputElement) return;
      e.preventDefault();
      this.onSetting(b.dataset.set!, b.dataset.v!);
      this.renderSettings();
    });
    dlg.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.set === 'volume') this.update({ volume: Number(el.value) }, false);
    });
    dlg.addEventListener('close', () => {
      if (this.rulesDirty) this.startSession();
      this.rulesDirty = false;
    });
  }

  private onSetting(name: string, v: string): void {
    const bool = v === 'on';
    const rules = { ...this.s.rules };
    switch (name) {
      case 'close':
        $<HTMLDialogElement>('#settings-dialog').close();
        return;
      case 'effects':
        this.update({ effects: v as Settings['effects'] }, false);
        return;
      case 'sound':
        this.update({ sound: bool }, false);
        if (bool) {
          unlockAudio();
          sfx.hit();
        }
        return;
      case 'doubleWindPairFu':
        rules.doubleWindPairFu = Number(v) as 2 | 4;
        break;
      case 'reset':
        if (confirm('自己ベストを消去しますか？')) {
          this.best = {};
          save(BEST_KEY, {});
        }
        return;
      case 'tips':
        this.tips.reset();
        this.tipsReset = true;
        return;
      case 'wallet':
        if (confirm(`所持金を ${ECONOMY.initial}yan に戻しますか？`)) {
          this.wallet = freshWallet();
          saveWallet(this.wallet);
          this.startSession(true);
        }
        return;
      case 'kuitan':
      case 'aka':
      case 'kiriage':
      case 'kazoe':
      case 'doubleYakuman':
        rules[name] = bool;
        break;
      default:
        return;
    }
    this.rulesDirty = true;
    this.update({ rules }, false);
  }

  private openSettings(): void {
    this.renderSettings();
    const dlg = $<HTMLDialogElement>('#settings-dialog');
    if (!dlg.open) dlg.showModal();
  }

  private renderSettings(): void {
    const dlg = $<HTMLDialogElement>('#settings-dialog');
    const scroll = dlg.querySelector('.settings')?.scrollTop ?? 0;
    const s = this.s;
    const r = s.rules;
    const row = (label: string, desc: string, name: string, opts: [string, string][], cur: string) =>
      `<div class="set-row"><div><div class="set-label">${label}</div>${desc ? `<div class="set-desc">${desc}</div>` : ''}</div>
       <div class="cfg-group">${opts
         .map(([v, l]) => `<button class="cfg${cur === v ? ' on' : ''}" data-set="${name}" data-v="${v}">${l}</button>`)
         .join('')}</div></div>`;
    const onOff = (b: boolean) => (b ? 'on' : 'off');
    const yn: [string, string][] = [
      ['on', 'あり'],
      ['off', 'なし'],
    ];
    dlg.innerHTML = `<div class="settings">
      <div class="set-head"><span>設定</span><button class="icon-btn" data-set="close" data-v="" aria-label="閉じる">×</button></div>
      <div class="set-sec">表示・演出</div>
      ${row('演出', '点滅や揺れが苦手な場合は「控えめ」か「オフ」に', 'effects', [['max', '全開'], ['lite', '控えめ'], ['off', 'オフ']], s.effects)}
      ${row('サウンド', '', 'sound', yn, onOff(s.sound))}
      <div class="set-row"><div><div class="set-label">音量</div></div><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-set="volume" aria-label="音量"></div>
      <div class="set-sec">ルール <span class="muted small">変更すると新しいセッションを開始</span></div>
      ${row('喰いタン', '鳴いた断么九を認める', 'kuitan', yn, onOff(r.kuitan))}
      ${row('赤ドラ', '赤五萬・赤五筒・赤五索 各1枚', 'aka', yn, onOff(r.aka))}
      ${row('切り上げ満貫', '30符4翻・60符3翻を満貫にする', 'kiriage', yn, onOff(r.kiriage))}
      ${row('数え役満', '13翻以上を役満にする', 'kazoe', yn, onOff(r.kazoe))}
      ${row('ダブル役満', '役満の複合・ダブル役満を認める', 'doubleYakuman', yn, onOff(r.doubleYakuman))}
      ${row('連風牌の雀頭', '場風かつ自風の雀頭', 'doubleWindPairFu', [['2', '2符'], ['4', '4符']], String(r.doubleWindPairFu))}
      <div class="set-sec">記録</div>
      <div class="set-row"><div><div class="set-label">所持金 ${this.wallet.balance.toLocaleString()} yan</div><div class="set-desc">ノーマルの所持金を ${ECONOMY.initial}yan に戻す（破産 ${this.wallet.bankrupts}回）</div></div><div class="cfg-group"><button class="cfg danger" data-set="wallet" data-v="1">リセット</button></div></div>
      <div class="set-row"><div><div class="set-label">一言ガイド</div><div class="set-desc">初めての人向けのヒントをもう一度表示する</div></div><div class="cfg-group"><button class="cfg${this.tipsReset ? ' on' : ''}" data-set="tips" data-v="1">${this.tipsReset ? '表示します' : 'もう一度'}</button></div></div>
      <div class="set-row"><div><div class="set-label">自己ベスト</div><div class="set-desc">モード・問題数ごとの記録を消去</div></div><div class="cfg-group"><button class="cfg danger" data-set="reset" data-v="1">リセット</button></div></div>
    </div>`;
    const el = dlg.querySelector('.settings');
    if (el) el.scrollTop = scroll;
  }
}

const SHELL = `
<header id="top">
  <div class="logo" aria-label="パチふと"><span class="logo-pachi">パチ</span><span class="logo-futo">ふと</span><span class="sub">パチンコ符計算トレーニング</span></div>
  <div class="play-tabs" role="tablist" aria-label="モード">
    <button class="play-tab" role="tab" data-play="normal">ノーマル</button>
    <button class="play-tab" role="tab" data-play="practice">プラクティス</button>
  </div>
  <div class="top-right">
    <button id="cfg-toggle" class="cfg-pill" type="button" aria-expanded="false" aria-controls="config"></button>
    <button id="open-help" class="icon-btn" aria-label="遊び方"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></button>
    <button id="open-settings" class="icon-btn" aria-label="設定">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
  </div>
</header>
<nav id="mode-tabs" class="mode-tabs" role="tablist" aria-label="出題モード"></nav>
<nav id="config" aria-label="出題設定"></nav>
<div id="cfg-backdrop"></div>
<main>
  <aside id="machine" data-skin="gold" aria-label="パチンコ台"></aside>
  <section id="stage">
    <div id="progress"></div>
    <div id="question"></div>
    <div id="dock">
      <div id="tip" role="status" aria-live="polite" hidden></div>
      <div id="meter">
        <div class="mt-cell mt-credit" id="wallet" aria-live="polite"><small>所持</small><b>0</b></div>
        <div class="mt-cell mt-bet"><div id="bet" class="bet-box"></div><button id="hr-toggle" class="mt-hr" type="button" aria-pressed="false" aria-label="ハイローラー（BET×2・賞金×2.5）">×2</button></div>
        <div class="mt-cell mt-net" id="net"><small>収支</small><b>±0</b></div>
      </div>
      <div id="answer" aria-live="polite"></div>
      <div id="choices" role="group" aria-label="選択肢"></div>
      <div class="timer-track"><div id="timer"></div></div>
      <div id="hint" class="hint"></div>
      <button id="next-btn" type="button">次へ</button>
    </div>
    <div id="result"></div>
  </section>
  <section id="summary" hidden></section>
</main>
<div id="combo" aria-live="polite"></div>
<div id="numpad">
  ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', 'Backspace']
    .map((k) => `<button data-key="${k}">${k === 'Backspace' ? '⌫' : k}</button>`)
    .join('')}
  <button data-key="Enter" class="enter">回答</button>
</div>
<footer>
  <span><kbd>Esc</kbd> やり直し</span>
  <span><kbd>Tab</kbd> パス / 次へ</span>
  <span class="muted">遊び方は右上の ? から</span>
</footer>
<dialog id="settings-dialog"></dialog>
<dialog id="help-dialog"></dialog>
<dialog id="intro-dialog" class="intro-dialog"></dialog>
${TILE_DEFS}
`;
