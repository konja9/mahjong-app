import { type Choice, FU_BUTTONS, makeChoices } from '../core/choices';
import { type Diagnosis, ELEMENT_NAMES, type FuElement, diagnose, diagnosisText } from '../core/diagnose';
import { type CallFilter, type HandConstraints, type HandQuestion, type Mode, type Question, generateQuestion } from '../core/generator';
import { type ScoreResult, calcScore, checkPointsAnswer, formatAnswer } from '../core/score';
import { EAST } from '../core/tiles';
import { adPrivacyRequired, showAdPrivacyOptions } from './ads';
import { buyRemoveAds, onPurchaseChange, purchaseState, restoreRemoveAds } from './purchase';
import { type BgmTrack, bgm, configureAudio, sfx, suspendAudio, unlockAudio } from './audio';
import { Fx, type WinTier } from './effects/pachinko';
import type { EffectLevel } from './effects/performance';
import {
  ECONOMY,
  type Wallet,
  applyDelta,
  comboMult,
  costFor,
  ballsFor,
  drawUwanose,
  extraRoundsFor,
  freshWallet,
  fuRate,
  fuScale,
  fuScaleKey,
  isBankrupt,
  loadWallet,
  prizeUnits,
  roundPrize,
  saveWallet,
} from './machine/economy';
import { type JackpotResult, MachinePanel } from './machine/panel';
import { blocksHtml, doraLabel, handExplain, hayamiExplain, situationChips, situationLabel } from './explain';
import { type Settings, loadSettings, saveSettings } from './settings';
import { type ConfigView, configPanelHtml, configSummaryHtml, keikoTabsHtml } from './configPanel';
import { type HelpTab, helpHtml } from './help';
import { introSeen } from './intro';
import { Tutorial, skipAllTutorial, tutorialDone } from './tutorial/runner';
import { type StartChoice, StartScreen } from './start';
import { charaSvg } from './tutorial/chara';
import { logoSvg } from './brand/logo';
import type { ChapterId, TutorialAction } from './tutorial/script';
import { SPECS } from './machine/specs';
import {
  FINAL_LEVEL,
  KEIKO_EXP,
  PACHINKO_EXP,
  type DailyNet,
  addExp,
  ensureDay,
  keikoExp,
  levelOf,
  loadDaily,
  loadLevel,
  markRead,
  saveDaily,
  saveLevel,
  unreadChapters,
} from './level';
import { STORY, storyChapterHtml, storyIndexHtml } from './story';
import { renderOdometer } from './odometer';
import { type ItemsTab, RARITY_LABEL, type ShopView, buyItem, checkUnlocks, equipItem, equipped, loadShop, saveShop, shopHtml, unlockMachine } from './shop';
import { type TipId, Tips, tipLink, tipText } from './tips';
import { TILE_DEFS, handHtml, tilesInline } from './tileView';
import { PRIVACY_POLICY_URL } from './links';
import { ELEMENTS, WEAK_MIN, type KeikoSource, accuracy, addReview, loadKeiko, markReview, nextReview, pickWeak, recordElement, recordFuAnswer, reviewCount, saveKeiko, weakAllowed, weakWant } from './keiko';
import { type Study, studySteps } from '../core/steps';
import { StepRun } from './steps';

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
  /** この遊びの収支（BET と BONUS の賞金だけ。買い物は含めない） */
  net: number;
  byCat: Record<string, { c: number; n: number }>;
  misses: Miss[];
  /** このセッションで復習に入った手の数 */
  reviewAdded: number;
}

const MODE_NAMES: Record<Mode, string> = { hayami: '早見', fu: '符計算', jissen: '実戦' };

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

function newSession(): Session {
  return { answered: 0, correct: 0, streak: 0, maxStreak: 0, times: [], net: 0, byCat: {}, misses: [], reviewAdded: 0 };
}

function questionMeta(q: Question): { dealer: boolean; tsumo: boolean } {
  if (q.mode === 'hayami') return { dealer: q.dealer, tsumo: q.tsumo };
  return { dealer: q.sit.seatWind === EAST, tsumo: q.sit.tsumo };
}

/** BONUS の賞金に使う手の符と役満（早見の満貫以上は符 0） */
function handFu(q: Question): { fu: number; yakuman: boolean } {
  if (q.mode === 'hayami') return { fu: q.han >= 5 ? 0 : q.fu, yakuman: q.han >= 13 };
  return { fu: q.ev.yakuman ? 0 : q.ev.fu.fu, yakuman: q.ev.yakuman > 0 };
}

/** BONUS の出題時の予告の熱さ（0 なし・2 赤・3 金・4 虹）。符が高いほど熱いが、ガセもある */
function fuNotice(fu: number, yakuman: boolean, rng: () => number = Math.random): number {
  const r = rng();
  if (yakuman) return 4;
  if (fu >= 60) return r < 0.6 ? 4 : 3;
  if (fu >= 50) return r < 0.5 ? 3 : 2;
  if (fu >= 40) return r < 0.3 ? 2 : 0;
  return r < 0.12 ? 2 : 0;
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
  private fx: Fx;
  private lastCorrect = false;
  private panel: MachinePanel;
  private busy = false;
  private pausedAt = 0;
  private wallet: Wallet = loadWallet();
  /** 稽古の記録（復習と要素別の正答率） */
  private kd = loadKeiko();
  /** 出題中の問題が復習の手なら、その key */
  private reviewKey: string | null = null;
  /** 苦手ドリルで狙っている要素 */
  private weakEl: FuElement | null = null;
  /** 苦手ドリルの記録不足を知らせたか（セッションに1回） */
  private weakNoted = false;
  private betRaf = 0;
  /** 大当りのラウンド（賞金タイム）。null なら通常時 */
  private round: {
    n: number;
    total: number;
    combo: number;
    /** 満貫以上の正解で増えたラウンド数 */
    extra: number;
    /** ここまで全問正解か（上乗せ抽選の条件） */
    perfect: boolean;
    premium: boolean;
    /** チュートリアルの BONUS（短く2問で終える） */
    short: boolean;
    resolve: (r: JackpotResult) => void;
  } | null = null;
  /** 今出ている問題がラウンド問題か */
  private isRoundQ = false;
  private awaitingBankrupt = false;
  private choices: Choice[] = [];
  private picked = -1;
  /** 稽古の段階練習の進行（パチンコでは null） */
  private steps: StepRun | null = null;
  /** 回答を止めている理由（台の発展リーチ・大当り、ダイアログ） */
  private pauses = new Set<string>();
  private tips = new Tips();
  private tipQueue: { text: string; link?: { tab: HelpTab; card: string } | null; chara?: boolean; story?: number }[] = [];
  /** 経験値と Lv（物語の解放） */
  private lv = loadLevel();
  /** 本日の収支（朝5時で0に戻る） */
  private daily: DailyNet = loadDaily();
  private tipTimer = 0;
  private tipShownAt = 0;
  /** まだ大当りしたことがない人向けのチュートリアル当り */
  private tutorialCount = 0;
  private tutorialForced = false;
  /** パチふとくんのチュートリアル */
  private tut!: Tutorial;
  /** スタート画面（起動するたびに出す） */
  private start!: StartScreen;
  /** チュートリアル中は BET をとらず、累計の記録にも数えない */
  private tutFree = false;
  /** チュートリアル：あと何問正解したら大当りにするか（0 はなし） */
  private tutJackpotIn = 0;
  private helpTab: HelpTab = 'basic';
  private tipsReset = false;
  /** 交換所（台・景品） */
  private shop = loadShop();
  private shopView: ShopView = 'items';
  /** 交換所で最後に開いたタブ */
  private shopItemsTab: ItemsTab = 'title';

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
      onTap: () => {
        // 演出中・BONUS 中は誤タップで開かないようにする
        if (!this.keiko && !this.busy && !this.round) this.openShop('machine');
      },
      onEvent: (e) => this.tip(e),
    });
    this.panel.machine.spec = this.spec;
    if (this.spec.jissenOnly && this.s.mode !== 'jissen') this.s = { ...this.s, mode: 'jissen' };
    this.applyLooks();
    this.applyTheme();
    this.configureSound();
    this.renderConfig();
    this.bind();
    this.startSession();
    this.tut = new Tutorial({ act: (a) => this.tutAct(a), onActive: (on) => this.tutActive(on), idle: () => !this.round });
    this.start = new StartScreen({
      view: () => {
        const { level } = levelOf(this.lv.exp);
        return { first: this.firstRun, balance: this.wallet.balance, level, cleared: level >= FINAL_LEVEL };
      },
      onShown: (on) => {
        this.pause('start', on);
        this.panel.hold(on);
      },
      enter: (c) => this.enterFromStart(c),
      skipTutorial: () => skipAllTutorial(ALL_CHAPTERS),
      still: () => this.s.effects === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
    this.start.show();
  }

  // ------------------------------------------------------------ 設定

  private get keiko(): boolean {
    return this.s.playMode === 'keiko';
  }

  /** 今の台 */
  private get spec() {
    return SPECS[this.shop.machine];
  }

  /** 稽古では演出を一切出さない */
  private get fxLevel(): EffectLevel {
    return this.keiko ? 'off' : this.s.effects;
  }

  private configureSound(): void {
    configureAudio(this.s.sound && !this.keiko, this.s.volume);
  }

  private applyTheme(): void {
    document.documentElement.dataset.play = this.s.playMode;
    document.documentElement.dataset.effects = this.s.effects;
    this.syncAnswerAttr();
  }

  /** 実際の回答方式（段階練習では段階ごとに選択と入力が切り替わる） */
  private syncAnswerAttr(): void {
    document.documentElement.dataset.answer = this.isChoice ? 'choice' : 'input';
  }

  /** 段階練習の今の段階を、数値で打つか（入力モードで、選択だけの段階でない） */
  private get stepTyped(): boolean {
    return !!this.steps && this.s.answerStyle === 'input' && this.steps.shown.input !== 'choice';
  }

  /** 段階練習の今の段階の選択肢 */
  private stepChoices(): Choice[] {
    const st = this.steps!.shown;
    return this.stepTyped ? [] : st.options.map((o) => ({ label: o.label, correct: o.value === st.answer }));
  }

  private renderSteps(): void {
    const el = $('#steps');
    el.hidden = !this.steps;
    el.innerHTML = this.steps ? this.steps.html() : '';
    // スマホでは下の入力欄に隠れないよう、今の段階を画面の中ほどに出す
    if (this.compact && this.steps && !this.steps.done && this.steps.results.length) {
      el.querySelector('li.now')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  private update(patch: Partial<Settings>, restart = true): void {
    if (restart && this.blockedInBonus()) {
      this.renderConfig();
      return;
    }
    this.s = { ...this.s, ...patch };
    saveSettings(this.s);
    this.applyTheme();
    this.configureSound();
    this.renderConfig();
    // モードを切り替えたときは台をリセット（それ以外は台の状態を引き継ぐ）
    if (restart) this.startSession('playMode' in patch);
  }

  /** BONUS 中は、問題や台が入れ替わる操作（出題設定・ルール・成績を見るなど）をさせない */
  private blockedInBonus(): boolean {
    if (!this.round) return false;
    this.toast('BONUS 中は変更できません。BONUS が終わってから切り替えてください');
    return true;
  }

  private renderConfig(): void {
    const s = this.s;
    const view: ConfigView = { s, keiko: this.keiko, reviewCount: reviewCount(this.kd) };
    $('#config').innerHTML = configPanelHtml(view);
    document.querySelectorAll<HTMLElement>('[data-play]').forEach((b) => {
      const on = b.dataset.play === s.playMode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    // パチンコは種目タブ（ミドル以上の台は実戦のみ）。稽古は学習モードと出題の2段
    const tabs = $('#mode-tabs');
    tabs.classList.toggle('keiko-tabs', this.keiko);
    tabs.innerHTML = this.keiko
      ? keikoTabsHtml(view)
      : (['hayami', 'fu', 'jissen'] as Mode[])
          .map(
            (m) =>
              `<button class="mode-tab${s.mode === m ? ' on' : ''}${this.spec.jissenOnly && m !== 'jissen' ? ' locked' : ''}" role="tab" aria-selected="${s.mode === m}" data-mode="${m}">${MODE_NAMES[m]}</button>`,
          )
          .join('');
    $('#cfg-toggle').innerHTML = configSummaryHtml(view);
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    document.body.dataset.phase = phase;
  }

  private get compact(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
  }

  /** Android の戻るボタン：開いているダイアログ（いちばん手前）か出題設定シートを閉じる。閉じるものがなければ false */
  back(): boolean {
    const open = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
    const top = open[open.length - 1];
    if (top) {
      top.close();
      return true;
    }
    if (document.body.classList.contains('cfg-open')) {
      this.toggleConfigSheet(false);
      return true;
    }
    // 閉じるものがなければスタート画面へ（スタート画面で押したらアプリを背面へ）
    return this.showStart();
  }

  private toggleConfigSheet(open = !document.body.classList.contains('cfg-open')): void {
    document.body.classList.toggle('cfg-open', open);
    $('#cfg-toggle').setAttribute('aria-expanded', String(open));
    // 開いたら選ばれている最初の選択肢へ、閉じたら開いたボタンへフォーカスを戻す
    if (open) document.querySelector<HTMLElement>('#config .cfg.on:not([disabled])')?.focus({ preventScroll: true });
    else if (document.activeElement && $('#config').contains(document.activeElement)) $('#cfg-toggle').focus({ preventScroll: true });
  }

  /** 出題モードの切り替え。ミドル以上の台は実戦のみ */
  private setMode(m: Mode): void {
    if (!this.keiko && this.spec.jissenOnly && m !== 'jissen') {
      this.toast(`${this.spec.name}の台は実戦のみです。液晶帯の台選びで甘デジに戻すと切り替えられます`);
      return;
    }
    this.update({ mode: m });
  }

  private onConfig(name: string, v: string): void {
    switch (name) {
      case 'mode':
        this.setMode(v as Mode);
        break;
      case 'answer':
        this.update({ answerStyle: v as Settings['answerStyle'] });
        break;
      case 'count':
        this.update({ count: Number(v) });
        break;
      case 'seat':
        this.update({ filters: { ...this.s.filters, seat: v as Settings['filters']['seat'] } });
        break;
      case 'win':
        this.update({ filters: { ...this.s.filters, win: v as Settings['filters']['win'] } });
        break;
      case 'call':
        this.update({ keikoFilters: { call: v as CallFilter } });
        break;
      case 'source':
        this.weakNoted = false;
        this.update({ keikoSource: v as KeikoSource });
        break;
      case 'study':
        this.update({ keikoStudy: v as Study });
        break;
    }
  }

  // ------------------------------------------------------------ 進行

  /** resetMachine=false ならパチンコの台（保留・確変）を引き継ぐ */
  private startSession(resetMachine = false): void {
    this.endRound();
    this.fx.reset();
    if (this.keiko || resetMachine || this.panel.stopped) {
      this.tutorialCount = 0;
      this.tutorialForced = false;
    }
    if (this.keiko) this.panel.stop();
    else if (resetMachine || this.panel.stopped) this.panel.reset();
    else {
      this.fx.syncRush(this.panel.rush);
      this.fx.rushChain(this.panel.machine.data.rushChain);
    }
    this.setBusy(false);
    this.session = newSession();
    this.awaitingBankrupt = false;
    this.renderWallet(false);
    $('#summary').hidden = true;
    $('#stage').hidden = false;
    this.next();
  }

  private next(): void {
    if (this.awaitingBankrupt) {
      this.hint('保留の抽選結果を待っています…');
      return;
    }
    const count = this.keiko ? this.s.count : 0;
    if (count && this.session.answered >= count) {
      this.showSummary();
      return;
    }
    // ラウンドを消化しきったら大当り終了（台の V・確変分岐へ）
    if (this.round && this.round.n >= this.roundCount) this.endRound();
    this.isRoundQ = !!this.round;
    if (this.round) this.round.n++;
    document.body.classList.toggle('bonus', this.isRoundQ);
    this.renderBonus();
    // BONUS・RUSH の出題は通常時と同じ分布。超大当りの BONUS だけ役満が出やすい
    const premium = this.isRoundQ && !!this.round?.premium;
    this.q = this.pickQuestion(premium);
    this.input = '';
    this.picked = -1;
    // BONUS・RUSH の4択は、誤答を同じ翻で符だけ違う点数にして符を試す
    const fuFocus = !this.keiko && (this.isRoundQ || this.panel.rush);
    // 稽古は手牌の段階練習（重点学習・簡易学習）
    this.steps = this.keiko && this.q.mode !== 'hayami' ? new StepRun(studySteps(this.q, this.s.rules, this.s.keikoStudy)) : null;
    this.choices = this.steps ? this.stepChoices() : this.isChoice ? makeChoices(this.q, this.s.rules, Math.random, fuFocus) : [];
    this.syncAnswerAttr();
    this.renderSteps();
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
    this.startBetRing();
    this.renderNet();
    if (this.isRoundQ && this.fxLevel !== 'off') {
      const h = handFu(this.q);
      this.panel.fuNotice(fuNotice(h.fu, h.yakuman));
    }
    // 大当りの時点で音が使えなかった（未操作・音オフから復帰）場合も、問題ごとに曲を合わせ直す
    this.syncBgm();
    if (this.isRoundQ && this.round?.n === 1) this.tip('bonusFu');
  }

  /** 次の問題。稽古では出題（通常・復習・苦手）に従う */
  private pickQuestion(premium: boolean): Question {
    this.reviewKey = null;
    this.weakEl = null;
    const src = this.keiko ? this.s.keikoSource : 'normal';
    // 稽古は種目なし：実戦と同じ作り方の手牌を段階練習で解く
    const mode: Mode = this.keiko ? 'jissen' : this.s.mode;
    if (src === 'review') {
      const r = nextReview(this.kd, this.s.rules);
      if (r) {
        this.reviewKey = r.key;
        return r.q;
      }
      this.toast('復習する問題がなくなりました。通常の出題に戻します');
      this.update({ keikoSource: 'normal' }, false);
    }
    const c = this.constraints();
    if (src === 'weak' && c) {
      const allowed = weakAllowed(c.call, this.s.filters);
      const el = pickWeak(this.kd, Math.random, allowed);
      if (el) {
        try {
          const want = weakWant(el);
          const q = generateQuestion(mode, this.s.rules, this.s.filters, Math.random, premium, { ...c, want: (h) => c.want!(h) && want(h) });
          this.weakEl = el;
          return q;
        } catch {
          // 絞り込みと両立しない要素なら、通常の出題にする
        }
      } else if (!this.weakNoted) {
        this.weakNoted = true;
        this.toast(`苦手を選ぶには、要素ごとに${WEAK_MIN}問以上の記録が必要です。それまでは通常の出題です`);
      }
    }
    return generateQuestion(mode, this.s.rules, this.s.filters, Math.random, premium, c);
  }

  /** 回答を稽古の記録に入れる（パチンコでも記録し、間違えた手は稽古の復習で出す） */
  private recordKeiko(correct: boolean, diag: Diagnosis[]): void {
    const q = this.q;
    if (this.reviewKey) markReview(this.kd, this.reviewKey, correct);
    else if (!correct && q.mode !== 'hayami') {
      addReview(this.kd, q);
      this.session.reviewAdded++;
    }
    if (this.steps) for (const r of this.steps.answered) recordElement(this.kd, r.step.element, r.ok);
    else if (q.mode !== 'hayami') recordFuAnswer(this.kd, q, correct, diag);
    saveKeiko(this.kd);
  }

  /** 稽古の絞り込み（鳴き）。役満は段階練習に向かないので出さない。パチンコでは使わない */
  private constraints(): HandConstraints | undefined {
    if (!this.keiko) return undefined;
    return { call: this.s.keikoFilters.call, shape: 'any', dist: 'real', want: (q) => !q.ev.yakuman };
  }

  /** 今の状態に合った曲を流す（BONUS 中は BONUS の曲、RUSH 中は RUSH の曲） */
  private syncBgm(): void {
    if (this.keiko) return;
    if (this.round) this.fx.bonusBgm(true);
    else if (this.panel.rush && !this.busy) this.fx.syncRush(true);
  }

  /** BONUS の液晶表示（ラウンド・連続の倍率・符の目盛り）。result は直前の回答で光らせるマス */
  private renderBonus(result: { lit?: number | string; miss?: number | string; up?: boolean } = {}): void {
    const r = this.round;
    if (!r || this.keiko) {
      this.panel.bonus(null);
      return;
    }
    this.panel.bonus({
      n: r.n,
      rounds: this.roundCount,
      combo: r.combo,
      ladder: ECONOMY.comboLadder,
      cells: fuScale(this.s.mode, r.premium, this.spec),
      rate: fuRate(this.s.mode, r.premium, this.spec),
      lit: result.lit,
      miss: result.miss,
      up: result.up,
      premium: r.premium,
    });
  }

  /** この BONUS の問題数（台のラウンド数＋満貫以上での上乗せ） */
  private get roundCount(): number {
    if (this.round?.short) return TUTORIAL_ROUNDS;
    return this.spec.rounds + (this.round?.extra ?? 0);
  }

  /** 大当り：ラウンド問題を出題し、終わったら出玉合計（と上乗せ）を返す */
  private startRound(premium: boolean): Promise<JackpotResult> {
    return new Promise((resolve) => {
      this.round = { n: 0, total: 0, combo: 0, extra: 0, perfect: true, premium, short: this.tutFree, resolve };
      queueMicrotask(() => this.tut.notify('bonusStart'));
      this.tips.first('firstHit');
      // 回答待ちの問題があれば、その問題を ROUND 1 にする（BET なし・賞金あり）。
      // 回答済みなら次の問題から ROUND 1
      if (this.phase === 'answering' && !this.isRoundQ) {
        this.round.n = 1;
        this.isRoundQ = true;
        document.body.classList.add('bonus');
        // 4択はまだ選んでいないので、BONUS 用（符違いの誤答）に作り直す
        if (this.isChoice && this.picked < 0) {
          this.choices = makeChoices(this.q, this.s.rules, Math.random, true);
          this.renderInput();
        }
        this.startBetRing();
        this.renderNet();
        this.tip('bonusFu');
      }
      this.renderBonus();
      this.renderProgress();
    });
  }

  private endRound(): void {
    const r = this.round;
    if (!r) return;
    // 最後の問題まで答え終えたときだけ全問正解（上乗せ・称号）の対象にする。途中で打ち切られた BONUS は対象外
    const completed = r.n >= this.roundCount && this.phase !== 'answering' && this.phase !== 'suspense';
    if (!completed) r.perfect = false;
    this.round = null;
    this.isRoundQ = false;
    document.body.classList.remove('bonus');
    this.panel.bonus(null);
    this.tut.notify('bonusEnd');
    this.tut.notify('idle');
    if (r.perfect) {
      this.shop.stats.perfectBonus++;
      this.tip('uwanose');
      this.grantUnlocks();
      saveShop(this.shop);
    }
    // チュートリアルの BONUS は、終わった瞬間に演出を打ち切る（PAYOUT・V入賞・確変突入が説明に重ならないように）。
    // 台もリセットして、残った保留や RUSH で説明の途中に次の大当りが起きないようにする
    if (r.short) {
      r.resolve({ total: r.total });
      this.fx.reset();
      this.panel.reset();
      return;
    }
    // 全問正解なら上乗せ抽選。上乗せ分は演出のあとで所持金に入る
    if (r.perfect && r.total > 0) {
      const mult = drawUwanose(Math.random, r.premium);
      const add = Math.round(r.total * (mult - 1));
      r.resolve({ total: r.total + add, uwanose: { mult, base: r.total, pay: () => this.earn(add, 1200) } });
    } else r.resolve({ total: r.total });
  }

  /** 回答にかかった時間（発展リーチ・大当りで止まっていた時間は除く） */
  private activeElapsed(): number {
    const now = this.pausedAt || performance.now();
    return (now - this.startedAt) / 1000;
  }

  /**
   * 計器の BET（パチンコのみ）。時間は意識させないよう秒数は出さず、
   * 締切までは定価に取り消し線＋割引額と、下辺の細いバーが静かに減るだけ。締切後は定価に戻る
   */
  private startBetRing(): void {
    cancelAnimationFrame(this.betRaf);
    const el = $('#bet');
    el.classList.remove('expired', 'settled');
    if (this.keiko) {
      el.innerHTML = '';
      return;
    }
    if (this.isRoundQ && this.round) {
      el.innerHTML = '<small>BET<em class="gold">BONUS</em></small><span class="bet-v"><b>0</b></span>';
      return;
    }
    const fastSec = ECONOMY.fastSeconds[this.s.mode];
    const full = costFor(true, false, this.spec);
    const half = costFor(true, true, this.spec);
    el.style.setProperty('--half', `${fastSec}s`);
    const html = (exp: boolean) =>
      exp
        ? `<small>BET</small><span class="bet-v"><b>${full}</b></span>`
        : `<small>BET<em>速答で割引</em></small><span class="bet-v"><s>${full}</s><b>${half}</b></span><i class="bar"></i>`;
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
    if (this.keiko || this.isRoundQ) return;
    const cost = costFor(correct, correct && fast, this.spec);
    const tag = !correct ? '<em class="ng">不正解</em>' : fast ? '<em>速答で割引</em>' : '';
    const el = $('#bet');
    el.classList.remove('expired');
    el.classList.add('settled');
    el.innerHTML = `<small>BET${tag}</small><span class="bet-v"><b${correct ? '' : ' class="ng"'}>−${cost}</b></span>`;
  }

  /** 計器の右枠：通常は本日の収支（朝5時で0に戻る）、BONUS 中はそのラウンドの出玉 */
  private renderNet(): void {
    const el = $('#net');
    const r = this.isRoundQ ? this.round : null;
    this.daily = ensureDay(this.daily);
    const v = r ? r.total : this.daily.net;
    el.classList.toggle('bonus', !!r);
    el.classList.toggle('minus', !r && v < 0);
    el.querySelector('small')!.textContent = r ? '出玉' : '本日の収支';
    renderOdometer(el.querySelector('b')!, `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString()}`);
  }

  /** 稼いだ yan（BONUS の賞金・上乗せ）：所持金・本日の収支・経験値に入れる */
  private earn(amount: number, rollMs = 500): void {
    this.addDaily(amount);
    this.changeBalance(amount, rollMs);
    this.gainExp(amount);
  }

  /** 本日の収支に足す（BET と BONUS の賞金だけ。買い物・破産・リセットは含めない） */
  private addDaily(delta: number): void {
    this.daily = ensureDay(this.daily);
    this.daily.net += delta;
    this.session.net += delta;
    saveDaily(this.daily);
  }

  /** 経験値を足し、Lv が上がったら知らせる（物語が1話ずつ読めるようになる） */
  private gainExp(n: number): void {
    const ups = addExp(this.lv, n);
    if (!n) return;
    saveLevel(this.lv);
    this.renderExpStrip(ups.length > 0);
    if (!ups.length) return;
    const lv = ups[ups.length - 1];
    if (ups.includes(FINAL_LEVEL)) {
      this.toast(`Lv ${FINAL_LEVEL}！ パチふとくんの記憶がすべて戻った。最終話「${STORY[FINAL_LEVEL - 1].title}」で物語は完結だ`, null, true, FINAL_LEVEL);
    } else if (lv < FINAL_LEVEL) {
      this.toast(`Lv ${lv}！ パチふとくんの記憶が戻ってきた。第${lv}話「${STORY[lv - 1].title}」が読める`, null, true, lv);
    } else this.toast(`Lv ${lv}！`, null, true);
    this.tip('levelUp');
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
    if (target < ECONOMY.lowWarn && !this.keiko && delta < 0) this.tip('low');
    // yan の使い道を知らせる（初めて届いたとき）
    if (!this.keiko && delta > 0) {
      if (target >= 1500) this.tip('shop');
      if (target >= SPECS.middle.price && !this.shop.machines.includes('middle')) this.tip('machine');
    }
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
    if (this.keiko || this.phase === 'summary') return;
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

  /** 発展リーチ・大当り中は回答（と速答の時間）を止める */
  private setBusy(b: boolean): void {
    this.pause('machine', b);
  }

  /** 理由ごとに回答（と速答の時間）を止める。どれか1つでも残っていれば止めたまま */
  private pause(reason: string, on: boolean): void {
    if (on) this.pauses.add(reason);
    else this.pauses.delete(reason);
    const b = this.pauses.size > 0;
    if (b === this.busy) return;
    this.busy = b;
    document.body.classList.toggle('busy', b);
    if (b) {
      this.pausedAt = performance.now();
    } else {
      if (this.pausedAt && this.phase === 'answering') this.startedAt += performance.now() - this.pausedAt;
      this.pausedAt = 0;
    }
  }

  private get isChoice(): boolean {
    if (this.steps) return !this.stepTyped;
    return this.s.answerStyle !== 'input';
  }

  private needsPair(): boolean {
    if (this.isChoice || this.q.mode === 'fu') return false;
    // 段階練習で「子-親」の2つを打つのは点数の段階だけ
    if (this.steps && this.steps.shown.input !== 'points') return false;
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
    if (this.steps && this.isChoice) return String(this.steps.shown.options.findIndex((o) => o.value === this.steps!.shown.answer) + 1);
    if (this.steps && this.steps.shown.input === 'number') return String(this.steps.shown.answerNum);
    if (this.isChoice) return String(this.choices.findIndex((c) => c.correct) + 1);
    if (this.q.mode === 'fu') return String(this.q.ev.fu.fu);
    const s = scoreOf(this.q);
    if (!s.tsumo) return String(s.payment.ron);
    return s.dealer ? String(s.payment.fromDealer) : `${s.payment.fromChild}-${s.payment.fromDealer}`;
  }

  /** 不正解の答えが、どの典型ミスの値と一致するか（早見は対象外） */
  private diagnose(): Diagnosis[] {
    const q = this.q;
    if (q.mode === 'hayami') return [];
    const label = this.isChoice ? this.choices[this.picked]?.label ?? '' : '';
    if (q.mode === 'fu') {
      const n = this.isChoice ? parseInt(label, 10) : Number(this.input);
      return diagnose(q, this.s.rules, (fu) => fu === n);
    }
    return diagnose(q, this.s.rules, (_, score) =>
      this.isChoice ? formatAnswer(score) === label : checkPointsAnswer(this.input, score),
    );
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
    if (this.steps && !timeout && this.answerStep()) return;
    this.setPhase('suspense');
    const elapsed = this.activeElapsed();
    cancelAnimationFrame(this.betRaf);
    const correct = !timeout && (this.steps ? this.steps.allCorrect : this.isCorrect(this.input));
    this.reveal(correct, elapsed, timeout);
  }

  /** 段階練習の1段階に答える。まだ段階が残っていれば true（判定に進まない） */
  private answerStep(): boolean {
    const run = this.steps!;
    const st = run.current!;
    const typed = this.stepTyped;
    run.answer(typed ? this.input : st.options[this.picked].value, typed);
    this.renderSteps();
    queueMicrotask(() => this.tut.notify('stepAnswered'));
    if (run.done) return false;
    this.input = '';
    this.picked = -1;
    this.choices = this.stepChoices();
    this.syncAnswerAttr();
    // 面子の段階では、聞いている面子を光らせ直す
    this.renderQuestion();
    this.renderInput();
    this.renderProgress();
    return true;
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

    const explain = this.q.mode === 'hayami' ? hayamiExplain(this.q) : handExplain(this.q, this.s.rules);
    const answerEl = this.answerAnchor();
    const yours = this.steps
      ? `段階 ${this.steps.okCount}/${this.steps.total}`
      : timeout
        ? '時間切れ'
        : this.isChoice
          ? this.choices[this.picked].label
          : this.input;
    const diag = correct || timeout || this.steps ? [] : this.diagnose();
    if (!this.tutFree) this.recordKeiko(correct, diag);

    if (correct) {
      ss.correct++;
      ss.streak++;
      ss.maxStreak = Math.max(ss.maxStreak, ss.streak);
      ss.times.push(elapsed);
      ss.byCat[cat].c++;
      const { tier, label } = this.tier();
      let extra = '';
      if (this.isRoundQ && this.round) {
        const r = this.round;
        const mult = comboMult(r.combo);
        r.combo++;
        const h = handFu(this.q);
        const fast = elapsed <= ECONOMY.fastSeconds[this.s.mode];
        const prize = roundPrize({
          mode: this.s.mode,
          fu: h.fu,
          yakuman: h.yakuman,
          fast,
          combo: r.combo,
          premium: r.premium,
          spec: this.spec,
        });
        r.total += prize;
        // 賞金の内訳：マスの額（30符のマス × マスの倍率）× 速答 × 連続
        const cell = Math.round(prizeUnits(h.fu, h.yakuman) * fuRate(this.s.mode, r.premium, this.spec));
        const factors = [
          `${h.yakuman ? '役満' : h.fu ? `${h.fu}符` : '満貫以上(30符)'}のマス ${cell}`,
          fast && ECONOMY.fastMult > 1 ? `速答×${ECONOMY.fastMult}` : '',
          mult > 1 ? `連続×${mult}` : '',
        ].filter(Boolean);
        // 満貫以上はラウンド上乗せ（1回の BONUS で上限あり）
        const limit = scoreOf(this.q).limit;
        const add = Math.min(extraRoundsFor(limit), ECONOMY.extraRounds.max - r.extra);
        if (add > 0) r.extra += add;
        const ext = add > 0 ? `<span class="round-up">${limit} → +${add}R</span>` : '';
        extra = `<span class="prize">+${prize.toLocaleString()} yan</span>${ext}<span class="muted breakdown">${factors.join(' ')}</span>`;
        const up = comboMult(r.combo) > mult;
        this.renderBonus({ lit: fuScaleKey(h.fu, h.yakuman), up });
        if (add > 0) {
          this.panel.roundUp(add);
          this.tip('roundUp');
        } else if (up) this.tip('ladder');
        this.fx.roundWin(prize, answerEl, $('#net'), () => this.earn(prize, 900));
      } else if (!this.keiko && elapsed <= ECONOMY.fastSeconds[this.s.mode]) {
        this.tip('fast');
        extra = '<span class="fast-tag">速答</span>';
      }
      $('#result').innerHTML = `<div class="verdict ok"><span class="mark">正解</span><span class="ans">${this.correctText()}</span><span class="muted">${elapsed.toFixed(1)}s</span>${extra}</div>${explain}`;
      const streak = ss.streak;
      // パチンコの通常の問題の正解でも、経験値を少しだけ入れる（BONUS は賞金の分が入る）
      if (!this.keiko && !this.isRoundQ) this.gainExp(PACHINKO_EXP);
      if (!this.keiko) {
        this.fx.hit(streak, answerEl);
        // 正解＝始動口入賞。ラウンド中は台に玉を入れない
        if (!this.isRoundQ) {
          this.tutorialHit();
          // チュートリアル：決めた数だけ正解したら大当り（設定から見直すときも BONUS まで見せる）
          if (this.tutJackpotIn > 0 && --this.tutJackpotIn === 0 && !this.tutorialForced) {
            this.tutorialForced = true;
            this.panel.machine.forceNextHit();
          }
          // 連続正解で電チュー開放（玉が2個入る）。開いた瞬間だけ告知する
          const balls = ballsFor(this.s.mode, ss.streak);
          const opened = balls > ballsFor(this.s.mode, ss.streak - 1);
          void this.panel.enter(balls, answerEl, opened);
          if (opened) this.tip('denchu');
          else if (ss.streak === ECONOMY.denchu[this.s.mode] - 2) this.tip('denchuSoon');
        }
        // BONUS の出玉演出は符の高さで決める（難しい手ほど派手）。通常時は打点の役名と火花だけ
        const w = this.isRoundQ ? this.fuTier() : { tier, label };
        void this.fx.win(w.tier, w.label, answerEl, this.isRoundQ).then(async () => {
          if (this.phase === 'result') await this.fx.milestone(streak);
        });
      }
    } else {
      ss.streak = 0;
      if (this.isRoundQ && this.round) {
        this.round.combo = 0;
        this.round.perfect = false;
        this.tip('bonusMiss');
        const h = handFu(this.q);
        this.renderBonus({ miss: fuScaleKey(h.fu, h.yakuman) });
      }
      ss.misses.push({ q: this.q, input: yours });
      const diagHtml = diag.length ? `<div class="diagnosis">${diagnosisText(diag)}</div>` : '';
      // 通常時のお金は計器だけで見せる。BONUS の外れはパンク
      const penalty = this.isRoundQ ? '<span class="punk">パンク（賞金なし）</span>' : '';
      // 稽古：途中の段階を間違えても、最後の点数が合っていれば「おしい！」（記録は不正解のまま）
      const close = this.steps && !timeout && this.steps.answered.at(-1)?.step.element === 'score' && this.steps.answered.at(-1)?.ok;
      $('#result').innerHTML = `<div class="verdict ${close ? 'close' : 'ng'}"><span class="mark">${close ? 'おしい！' : '不正解'}</span><span class="${this.steps ? 'muted' : 'yours'}">${yours}</span><span class="arrow">→</span><span class="ans">${this.correctText()}</span>${penalty}</div>${diagHtml}${explain}`;
      this.fx.lose(this.isChoice ? $('#choices') : answerEl, false);
      if (!this.keiko && !this.isRoundQ) {
        this.tip('miss');
        // RUSH 中の不正解は ST を1回転消費する（継続が実力で決まる）
        if (this.panel.rush) this.tip('rushMiss');
        this.panel.missSpin();
      }
    }
    // チュートリアルの問題は BET をとらず、累計の記録にも数えない
    if (!this.keiko && !this.isRoundQ && !this.tutFree) {
      const fast = elapsed <= ECONOMY.fastSeconds[this.s.mode];
      this.settleBet(correct, fast);
      const cost = costFor(correct, correct && fast, this.spec);
      this.addDaily(-cost);
      this.changeBalance(-cost);
    }
    if (!this.keiko && !this.tutFree) this.recordStats(correct, elapsed <= ECONOMY.fastSeconds[this.s.mode], dealer, tsumo);
    // 稽古は yan が動かないので、正解した分だけ少し経験値を入れる
    if (this.keiko && !this.tutFree) this.gainExp(this.steps ? keikoExp(this.steps.okCount, this.steps.total) : correct ? KEIKO_EXP : 0);
    this.renderProgress();
    this.renderInput();
    this.hint(this.compact ? '' : correct ? 'クリック / 任意のキーで次へ' : 'クリック / Enter / Space で次へ');
    if (!this.keiko) this.checkBankrupt();
    this.tut.notify('answered');
    if (this.compact) {
      // 解説の先頭（判定）が見える位置までスクロール
      const main = document.querySelector('main');
      const res = $('#result');
      if (main) main.scrollTo({ top: Math.max(0, res.offsetTop - main.offsetTop - 8), behavior: 'smooth' });
    }
  }

  /** BONUS の正解演出の段階（符が高いほど派手） */
  private fuTier(): { tier: WinTier; label: string } {
    const h = handFu(this.q);
    if (h.yakuman) return { tier: 3, label: '役満' };
    if (h.fu >= 60) return { tier: 2, label: `${h.fu}符` };
    if (h.fu >= 50) return { tier: 1, label: `${h.fu}符` };
    // 40符以下は出玉のコインだけ（テンポを保つ）
    return { tier: 0, label: '' };
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
      ${this.handView(q)}
    </div>`;
  }

  /**
   * 手牌の見せ方。稽古の重点学習では面子ごとに区切って見せ（符・面子の種類・待ちは隠す）、
   * いま聞いている刻子・槓子（または雀頭）を光らせる
   */
  private handView(q: HandQuestion): string {
    if (this.keiko && this.s.keikoStudy === 'focus' && this.steps && !q.ev.yakuman) {
      const st = this.steps.current;
      const blocks = blocksHtml(q.hand, q.ev, { highlight: st?.block ?? null, tsumo: q.sit.tsumo });
      if (blocks) return blocks;
    }
    return handHtml(q.hand, q.sit.tsumo);
  }

  private promptUnit(): { unit: string; ghost: string } {
    const st = this.steps?.shown;
    if (st && st.input !== 'points') return { unit: st.element === 'han' ? '翻' : '符', ghost: `${ELEMENT_NAMES[st.element]}を入力` };
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
    // 符計算は固定の7つのボタン（昇順）
    const fuPad = (this.q.mode === 'fu' || this.steps?.shown.element === 'fu') && this.choices.length === FU_BUTTONS.length;
    el.classList.toggle('fu-pad', fuPad);
    // 段階練習（符・点数の段階以外）は短い選択肢が並ぶので、小さめのボタンにする
    el.classList.toggle('step-pad', !!this.steps && !fuPad && this.steps.shown.input !== 'points');
    el.innerHTML = this.choices
      .map((c, i) => {
        const cls = done ? (c.correct ? ' is-correct' : i === this.picked ? ' is-wrong' : ' is-dim') : '';
        const pts = this.steps ? this.steps.shown.input === 'points' : this.q.mode !== 'fu';
        const unit = !pts || c.label.endsWith('オール') ? '' : '<span class="unit">点</span>';
        const tut = this.tut?.active && c.correct ? ' data-tut="correct"' : '';
        return `<button class="choice${cls}" data-choice="${i}"${tut}${done ? ' disabled' : ''}><kbd>${i + 1}</kbd><span class="label">${c.label}</span>${unit}</button>`;
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
    if (this.compact) return '';
    if (this.isChoice) return `<kbd>1</kbd>-<kbd>${this.choices.length}</kbd> 選択 · <kbd>Tab</kbd> パス`;
    const pair = this.needsPair() ? '<kbd>-</kbd> 区切り · ' : '';
    return `${pair}<kbd>Enter</kbd> 回答 · <kbd>Tab</kbd> パス · <kbd>Esc</kbd> 消す`;
  }

  private hint(html: string): void {
    $('#hint').innerHTML = html;
  }

  private renderProgress(): void {
    const ss = this.session;
    const total = this.keiko && this.s.count ? `/${this.s.count}` : '';
    const acc = ss.answered ? Math.round((ss.correct / ss.answered) * 100) : 100;
    $('#progress').innerHTML = `<span>${ss.answered + (this.phase === 'answering' || this.phase === 'suspense' ? 1 : 0)}${total}</span>
      <span class="muted">正答率 ${acc}%</span>
      <span class="streak${ss.streak >= 20 ? ' holo' : ss.streak >= 10 ? ' ten' : ss.streak >= 5 ? ' mid' : ''}">${ss.streak ? `${ss.streak}連` : ''}</span>${this.ballsTag()}${this.sourceTag()}${this.adFreeTag()}`;
  }

  /** Android 版：広告が出ている間だけ、問題数の行の右端に「広告を消す」（押すと購入画面） */
  private adFreeTag(): string {
    const p = purchaseState();
    if (!p.available || p.owned || p.busy || !document.body.classList.contains('has-ad')) return '';
    return `<button class="adfree-btn" type="button" data-adfree>広告を消す${p.price ? `<small>${p.price}</small>` : ''}</button>`;
  }

  /** 稽古の出題の種類（復習・苦手ドリル）を問題数の横に出す */
  private sourceTag(): string {
    if (!this.keiko) return '';
    if (this.reviewKey) return '<span class="src-tag">復習</span>';
    if (this.weakEl) return `<span class="src-tag">苦手：${ELEMENT_NAMES[this.weakEl]}</span>`;
    return '';
  }

  /** 問題数の横に出す「次の正解で入る玉の数」（パチンコで2個以上のときだけ） */
  private ballsTag(): string {
    if (this.keiko) return '';
    const n = ballsFor(this.s.mode, this.session.streak + 1);
    if (n < 2) return '';
    return `<span class="balls b${n}" title="次の正解で玉が${n}個入る（電チュー）">${'<i></i>'.repeat(n)}</span>`;
  }

  /** 稽古の結果：要素別の正答率（これまでの累計）と、復習に入った手の数 */
  private elementsHtml(): string {
    const rows = ELEMENTS.map((el) => {
      const st = this.kd.elements[el];
      const a = accuracy(st);
      const p = a === null ? 0 : Math.round(a * 100);
      return `<div class="cat"><span>${ELEMENT_NAMES[el]}</span><span class="bar"><i style="width:${p}%"></i></span><span>${st && st.n ? `${st.c}/${st.n}` : '—'}</span></div>`;
    }).join('');
    const added = this.session.reviewAdded
      ? `<div class="muted small">間違えた ${this.session.reviewAdded}問を復習に入れました（出題の「復習」で解き直せます）</div>`
      : '';
    return `<div><div class="ex-h">要素別 <span class="muted">これまでの累計</span></div>${rows}${added}</div>`;
  }

  /** end: 規定問題数の終了 / summary: パチンコで「成績を見る」 / bankrupt: 破産 */
  private showSummary(kind: 'end' | 'summary' | 'bankrupt' = 'end'): void {
    this.setPhase('summary');
    cancelAnimationFrame(this.betRaf);
    this.toggleConfigSheet(false);
    const ss = this.session;
    const acc = ss.answered ? (ss.correct / ss.answered) * 100 : 0;
    const avg = ss.times.length ? ss.times.reduce((a, b) => a + b, 0) / ss.times.length : 0;

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
    if (this.keiko) {
      stats = [
        stat('正答率', `${Math.round(acc)}<small>%</small>`, 'hero'),
        stat('問題数', String(ss.answered)),
        stat('平均回答', `${avg.toFixed(1)}<small>s</small>`),
        stat('最大連続', String(ss.maxStreak)),
      ].join('');
    } else {
      const diff = ss.net;
      const d = this.panel.machine.data;
      stats = [
        stat('今回の収支', `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toLocaleString()}<small>yan</small>`, `hero ${diff >= 0 ? 'plus' : 'minus'}`),
        stat('正答率', `${Math.round(acc)}<small>%</small>`),
        stat('大当り', `${d.hits}<small>回</small>`),
        stat('最大RUSH', `${d.maxChain}<small>連</small>`),
      ].join('');
      if (kind === 'bankrupt') {
        head = `<div class="bankrupt"><span>破産</span><small>所持金が尽きました</small></div>`;
        again = `${ECONOMY.initial.toLocaleString()}yan で再起`;
      } else {
        head = `<div class="sum-title">ここまでの成績</div><div class="muted small">所持金 ${this.wallet.balance.toLocaleString()} yan（台と所持金はそのまま続きから）</div>`;
        again = '続ける（成績は新しく数え直し）';
      }
    }

    // 大当り履歴（新しい順。数字は何回転目で当ったか）
    const log = this.keiko ? [] : this.panel.machine.data.log;
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
      ${!this.keiko ? '<div class="sum-slump"></div>' : ''}
      ${logHtml}
      <div class="sum-cols">
        <div><div class="ex-h">状況別 <span class="muted">${weakText}</span></div>${cats}</div>
        ${misses ? `<div><div class="ex-h">間違えた問題</div><ul class="misses">${misses}</ul></div>` : ''}
        ${this.keiko ? this.elementsHtml() : ''}
      </div>
      <button class="again-btn" type="button" data-again>${again}</button>
      ${this.compact ? '' : `<div class="hint"><kbd>Tab</kbd> / <kbd>Enter</kbd> ${again.replace(/（.*）$/, '')}</div>`}`;
    const slump = sum.querySelector<HTMLElement>('.sum-slump');
    if (slump) this.renderSlump(slump, this.wallet.history, 600, 120);
    sum.querySelector('[data-again]')?.addEventListener('click', () => this.restartFromSummary(kind));
    this.summaryKind = kind;
    if (kind === 'bankrupt') this.panel.stop();
    this.fx.sessionEnd(kind !== 'bankrupt' && acc >= 80);
  }

  private summaryKind: 'end' | 'summary' | 'bankrupt' = 'end';

  private restartFromSummary(kind: 'end' | 'summary' | 'bankrupt' = this.summaryKind): void {
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
    // UI のタッチ音：ボタン・タブなどを押したら鳴らす（4択とテンキーは自分の音があるので除く）。
    // 押した操作はユーザー操作なので、ここで音も起こす
    document.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button, [role="button"], a[href]');
      if (!b || b.closest('#choices, #numpad, [data-silent]')) return;
      unlockAudio();
      const close = b.matches('[data-shop-close], [data-story-close], [data-help-close], [data-close-cfg], [aria-label="閉じる"], [data-tut-menu="back"]');
      (close ? sfx.tapClose : sfx.tap)();
    });
    // ロゴでスタート画面へ（BONUS 中などは戻れないことを一言で知らせる）
    const logo = $('#top .logo');
    const toStart = () => {
      if (!this.showStart() && !this.tut.active) this.toast('BONUS や演出の間は、スタート画面に戻れません');
    };
    logo.addEventListener('click', toStart);
    logo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        toStart();
      }
    });
    document.querySelectorAll<HTMLElement>('[data-play]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.play !== this.s.playMode) this.update({ playMode: b.dataset.play as Settings['playMode'] });
        b.blur();
      }),
    );
    $('#mode-tabs').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>('[data-mode]');
      if (b && b.dataset.mode !== this.s.mode) this.setMode(b.dataset.mode as Mode);
      // 稽古：学習モード（重点・簡易）と出題（通常・苦手・復習）
      const st = t.closest<HTMLButtonElement>('[data-study]');
      if (st && !st.disabled && st.dataset.study !== this.s.keikoStudy) this.onConfig('study', st.dataset.study!);
      const so = t.closest<HTMLButtonElement>('[data-source]');
      if (so && !so.disabled && so.dataset.source !== this.s.keikoSource) this.onConfig('source', so.dataset.source!);
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
      if ((e.target as HTMLElement).closest('[data-summary]')) {
        if (this.blockedInBonus()) return;
        this.showSummary('summary');
        return;
      }
      if ((e.target as HTMLElement).closest('[data-restart]')) {
        // 稽古のやり直し（途中まで答えていたら確認する）
        if (!this.session.answered || confirm('最初からやり直しますか？ ここまでの成績は消えます')) {
          this.toggleConfigSheet(false);
          this.startSession();
        }
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
    $('#open-shop').addEventListener('click', () => this.openShop('items'));
    $('#exp-strip').addEventListener('click', () => this.openStory());
    $('#open-story').addEventListener('click', () => this.openStory());
    this.bindStory();
    this.renderExpStrip();
    this.bindShop();
    this.bindGuide();
    this.bindSettings();
    let lastMessage = '';
    onPurchaseChange((p) => {
      this.renderProgress();
      if ($<HTMLDialogElement>('#settings-dialog').open) this.renderSettings();
      // 問題数の行のボタンから買ったときは、結果を一言ガイドで知らせる（設定からのときは設定の中に出る）
      else if (p.message && p.message !== lastMessage) this.toast(p.message);
      lastMessage = p.message;
    });
    // 広告が出た・消えたら「広告を消す」を出し直す
    document.addEventListener('ads:change', () => this.renderProgress());
    // 隠れたら音を止め、画面ロックや別アプリから戻ったら起こし直す（iOS は止まったままになる）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        suspendAudio();
        return;
      }
      unlockAudio();
      this.syncBgm();
    });
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
    $('#stage').addEventListener('click', (e) => {
      // 「広告を消す」は購入画面を開く（次の問題へは進まない）
      if ((e.target as HTMLElement).closest('[data-adfree]')) {
        void buyRemoveAds();
        return;
      }
      // 解説の「符の数え方」はヘルプを開く（次の問題へは進まない）
      const link = (e.target as HTMLElement).closest<HTMLElement>('[data-help-link]');
      if (link) {
        this.openHelp(link.dataset.helpLink as HelpTab, 'fu-flow');
        return;
      }
      if (this.phase === 'result') this.next();
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (document.querySelector('dialog[open]')) return;
    // 出題設定を開いている間は回答しない（Esc で閉じる。Tab などのフォーカス移動はそのまま）
    if (document.body.classList.contains('cfg-open')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.toggleConfigSheet(false);
      }
      return;
    }
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
      // Esc は入力を消すだけ（問題の入れ替え・セッションのやり直しはしない）
      e.preventDefault();
      if (this.phase === 'answering' && !this.isChoice && this.input) {
        this.input = '';
        this.renderInput();
        sfx.back();
      }
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
      if (/^[1-9]$/.test(key)) this.pick(Number(key) - 1);
      else if (key === 'Tab') void this.submit(true);
      return;
    }
    if (/^\d$/.test(key)) {
      if (this.input.replace('-', '').length >= 10) return;
      // 段階回答は0符も答えになる（先頭の0は次の数字で置き換える）
      if (this.input === '' && key === '0' && !this.steps) return;
      if (this.steps && this.input === '0') this.input = '';
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
      // 「詳しく」はヘルプの該当カードへ
      const more = (e.target as HTMLElement).closest<HTMLElement>('[data-tip-more]');
      if (more) {
        const [tab, card] = more.dataset.tipMore!.split(':');
        this.openHelp(tab as HelpTab, card);
      }
      // 「読む」は物語の該当の話へ
      const story = (e.target as HTMLElement).closest<HTMLElement>('[data-tip-story]');
      if (story) this.openStory(Number(story.dataset.tipStory));
      this.nextTip();
    });
  }

  // ------------------------------------------------------------ スタート画面

  /** 初めての起動か（以前の導入もチュートリアルも見ていない） */
  private get firstRun(): boolean {
    return !introSeen() && !tutorialDone().length;
  }

  /** スタート画面に戻れるか（BONUS・大当りの演出中・チュートリアル中は戻らない） */
  private get canReturnToStart(): boolean {
    return !this.round && !this.pauses.has('machine') && !this.tut.active && !this.start.shown;
  }

  showStart(): boolean {
    if (!this.canReturnToStart) return false;
    for (const d of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) d.close();
    this.toggleConfigSheet(false);
    this.start.show();
    return true;
  }

  private enterFromStart(c: StartChoice): void {
    // スタート画面のタップはユーザー操作なので、ここで音を起こす（効果音のファイルも最初の問題までに読み込んでおく）
    unlockAudio();
    if (c === 'tutorial') {
      this.playTutorial(ALL_CHAPTERS);
      return;
    }
    if (this.s.playMode !== c) this.update({ playMode: c });
  }

  // ------------------------------------------------------------ チュートリアル（パチふとくん）

  playTutorial(ids: ChapterId[]): void {
    for (const d of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) d.close();
    this.toggleConfigSheet(false);
    this.tut.play(ids);
  }

  private tutActive(on: boolean): void {
    document.body.classList.toggle('tutorial', on);
    if (!on) {
      this.tutFree = false;
      this.tutJackpotIn = 0;
      this.renderInput();
    }
  }

  /** 台本の「画面の準備」 */
  private tutAct(a: TutorialAction): void {
    switch (a) {
      case 'pachinko':
        if (this.round) return;
        if (this.keiko || this.s.answerStyle !== 'choice' || (this.s.mode !== 'hayami' && !this.spec.jissenOnly)) {
          this.update({ playMode: 'pachinko', answerStyle: 'choice', ...(this.spec.jissenOnly ? {} : { mode: 'hayami' as Mode }) });
        }
        return;
      case 'freeBet':
        this.tutFree = true;
        return;
      case 'paidBet':
        this.tutFree = false;
        return;
      case 'fixedQuestion': {
        // 1翻30符・子のロン（1000点）：最初に覚える基本の1問
        this.q = { mode: 'hayami', han: 1, fu: 30, dealer: false, tsumo: false, score: calcScore(1, 30, false, false, this.s.rules) };
        this.steps = null;
        this.input = '';
        this.picked = -1;
        this.choices = makeChoices(this.q, this.s.rules);
        this.setPhase('answering');
        this.startedAt = performance.now();
        $('#result').innerHTML = '';
        $('#stage').classList.remove('correct', 'wrong');
        this.syncAnswerAttr();
        this.renderSteps();
        this.renderQuestion();
        this.renderInput();
        this.renderProgress();
        return;
      }
      case 'armJackpot':
        this.tutJackpotIn = 2;
        return;
      case 'nextQuestion':
        if (this.phase === 'result') {
          this.fx.skip();
          this.next();
        }
        return;
      case 'haltMachine':
        if (!this.round && !this.keiko) this.panel.stop();
        return;
      case 'keikoFocus':
        if (this.s.keikoStudy !== 'focus' || this.s.keikoSource !== 'normal' || this.s.answerStyle !== 'choice') {
          this.update({ keikoStudy: 'focus', keikoSource: 'normal', answerStyle: 'choice' });
        }
        return;
    }
  }

  /** ヘルプを開く。card を渡すとそのカードまでスクロールして光らせる */
  private openHelp(tab?: HelpTab, card?: string): void {
    const dlg = $<HTMLDialogElement>('#help-dialog');
    if (tab) this.helpTab = tab;
    dlg.innerHTML = helpHtml(this.helpTab, this.s.mode);
    this.pause('help', true);
    if (!dlg.open) dlg.showModal();
    if (card) {
      const el = dlg.querySelector<HTMLElement>(`#h-${card}`);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        el.classList.add('flash');
      }
    }
  }

  /** 初めての出来事なら一言ガイドを出す（パチンコのみ・各1回） */
  private tip(id: Exclude<TipId, 'firstHit'>): void {
    if (this.keiko || !this.tips.first(id)) return;
    // チュートリアル中はパチふとくんが直接案内しているので、一言ガイドは出さない（見たことにする）
    if (this.tut?.active) return;
    this.toast(tipText(id, ECONOMY.fastSeconds[this.s.mode], this.spec, this.s.mode), tipLink(id), true);
  }

  /** 画面上端の一言。chara なら一言ガイド（パチふとくんの顔つき） */
  private toast(text: string, link: { tab: HelpTab; card: string } | null = null, chara = false, story?: number): void {
    this.tipQueue.push({ text, link, chara, story });
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
    const item = this.tipQueue.shift();
    if (!item) {
      el.hidden = true;
      return;
    }
    const more = item.story
      ? `<button class="tip-more" type="button" data-tip-story="${item.story}">読む</button>`
      : item.link
        ? `<button class="tip-more" type="button" data-tip-more="${item.link.tab}:${item.link.card}">詳しく</button>`
        : '';
    const label = item.chara ? `<span class="tip-face">${charaSvg('neutral')}</span>` : '<span class="tip-label">TIPS</span>';
    el.innerHTML = `${label}<span class="tip-text">${item.text}</span>${more}`;
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

  // ------------------------------------------------------------ 台選び・交換所

  private bindShop(): void {
    const dlg = $<HTMLDialogElement>('#shop-dialog');
    dlg.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === dlg || t.closest('[data-shop-close]')) {
        dlg.close();
        return;
      }
      const b = t.closest<HTMLElement>('button');
      if (!b || b.hasAttribute('disabled')) return;
      const d = b.dataset;
      if (d.itemsTab) {
        this.shopItemsTab = d.itemsTab as ItemsTab;
        this.renderShop();
        return;
      }
      if (d.preview) {
        // 試聴：本番の BGM（BONUS・RUSH）が鳴っている間はしない
        unlockAudio();
        if (bgm.preview(d.preview as BgmTrack)) {
          b.classList.add('playing');
          window.setTimeout(() => b.classList.remove('playing'), 4500);
        }
        return;
      }
      if (d.buy) {
        this.pay(buyItem(this.shop, d.buy, this.wallet.balance));
        if (d.buy.startsWith('title-')) window.setTimeout(() => this.renderTitlePlate(true), 50);
      }
      else if (d.equip) {
        equipItem(this.shop, d.equip);
        if (d.equip.startsWith('title-')) window.setTimeout(() => this.renderTitlePlate(true), 50);
      }
      else if (d.unlock) this.pay(unlockMachine(this.shop, d.unlock as keyof typeof SPECS, this.wallet.balance));
      else if (d.machine) this.switchMachine(d.machine as keyof typeof SPECS);
      saveShop(this.shop);
      this.applyLooks();
      this.renderShop();
    });
    dlg.addEventListener('close', () => this.pause('shop', false));
  }

  private openShop(view: ShopView): void {
    const dlg = $<HTMLDialogElement>('#shop-dialog');
    this.shopView = view;
    dlg.dataset.view = view;
    this.renderShop();
    this.pause('shop', true);
    if (!dlg.open) dlg.showModal();
  }

  private renderShop(): void {
    // 台選びは BONUS 中と台が回っている間はできない。試聴は BONUS・RUSH の曲が鳴っている間はできない
    const ok = this.shopView === 'items' ? !this.round && !this.panel.rush : !this.round && this.panel.idle;
    $('#shop-dialog').innerHTML = shopHtml(this.shop, this.shopView, this.wallet.balance, ok, this.shopItemsTab);
  }

  /** 台の解放・景品の支払い（0 なら何もしない） */
  private pay(price: number): void {
    if (price > 0) this.changeBalance(-price);
  }

  /** 台の切り替え：台（保留・RUSH）はリセット。ミドル以上は実戦に固定 */
  private switchMachine(id: keyof typeof SPECS): void {
    if (!this.shop.machines.includes(id) || this.round || !this.panel.idle) return;
    this.shop.machine = id;
    saveShop(this.shop);
    this.panel.machine.spec = SPECS[id];
    if (SPECS[id].jissenOnly && this.s.mode !== 'jissen') {
      this.s = { ...this.s, mode: 'jissen' };
      saveSettings(this.s);
    }
    this.renderConfig();
    this.startSession(true);
  }

  /** 牌の背・液晶のスキン・称号を画面に反映 */
  private applyLooks(): void {
    document.documentElement.style.setProperty('--tile-back', equipped(this.shop, 'back').value);
    const m = $('#machine');
    m.dataset.look = equipped(this.shop, 'skin').value;
    this.renderTitlePlate();
    bgm.setTrack(equipped(this.shop, 'bgm').value as BgmTrack);
  }

  /** 実力の称号のための累計の記録 */
  private recordStats(correct: boolean, fast: boolean, dealer: boolean, tsumo: boolean): void {
    const st = this.shop.stats;
    const ss = this.session;
    if (correct) {
      st.correct[this.s.mode]++;
      if (fast) st.fast++;
      if (this.q.mode !== 'fu' && tsumo && !dealer) st.splitTsumo++;
    }
    st.maxStreak = Math.max(st.maxStreak, ss.streak);
    if (ss.answered >= 100 && ss.correct / ss.answered >= 0.95) st.precise = 1;
    this.grantUnlocks();
    saveShop(this.shop);
  }

  /** 実力の称号の条件を満たしていたら取得して知らせる */
  private grantUnlocks(): void {
    for (const it of checkUnlocks(this.shop)) {
      this.toast(`称号を獲得：${it.name}（${RARITY_LABEL[it.rarity ?? 'common']}）。交換所で装備すると、経験値のバーに表示されます`, { tab: 'money', card: 'shop' });
    }
  }

  /** 経験値のバーの称号のプレート（色はレア度）。flash で一瞬光らせる */
  private renderTitlePlate(flash = false): void {
    this.renderExpStrip();
    const el = $('#exp-strip .mt-title');
    if (flash && el && !el.hidden) {
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  /** 計器の上の帯：Lv・称号・経験値のバー・次の Lv まで。Lv が上がった瞬間は光らせる */
  private renderExpStrip(flash = false): void {
    const el = $('#exp-strip');
    const { level, into, need } = levelOf(this.lv.exp);
    const t = equipped(this.shop, 'title');
    const unread = unreadChapters(this.lv).length;
    const done = level >= FINAL_LEVEL;
    const title = t.value ? `<span class="mt-title r-${t.rarity ?? 'common'}">${t.value}</span>` : '';
    el.innerHTML = `<b class="xp-lv">Lv ${level}</b>${title}<span class="xp-bar"><i style="width:${Math.round((into / need) * 100)}%"></i></span><small class="xp-next">${done ? '<em>完結</em> ' : ''}次まで ${(need - into).toLocaleString()}</small>${unread ? '<em class="xp-new">NEW</em>' : ''}`;
    el.setAttribute('aria-label', `Lv ${level}。次の Lv まで ${need - into}。タップで物語を読む`);
    if (flash) {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  // ------------------------------------------------------------ 物語（パチふとくんの記憶）

  private bindStory(): void {
    const dlg = $<HTMLDialogElement>('#story-dialog');
    dlg.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === dlg || t.closest('[data-story-close]')) {
        dlg.close();
        return;
      }
      const b = t.closest<HTMLElement>('[data-story]');
      if (!b) return;
      const v = b.dataset.story!;
      this.renderStory(v === 'index' ? 0 : Number(v));
    });
    dlg.addEventListener('close', () => {
      this.pause('story', false);
      this.renderExpStrip();
    });
  }

  /** 物語の本を開く。chapter を渡すとその話を開く（0 で目次。読んでいない話があれば最初のその話） */
  openStory(chapter = 0): void {
    const dlg = $<HTMLDialogElement>('#story-dialog');
    this.pause('story', true);
    if (!dlg.open) dlg.showModal();
    this.renderStory(chapter);
  }

  private renderStory(chapter: number): void {
    const dlg = $<HTMLDialogElement>('#story-dialog');
    const open = Math.min(levelOf(this.lv.exp).level, FINAL_LEVEL);
    if (chapter >= 1 && chapter <= open) {
      markRead(this.lv, chapter);
      saveLevel(this.lv);
      dlg.innerHTML = `<div class="story">${storyChapterHtml(chapter, this.lv)}</div>`;
    } else dlg.innerHTML = `<div class="story">${storyIndexHtml(this.lv)}</div>`;
    dlg.querySelector('.story-body')?.scrollTo(0, 0);
    dlg.scrollTo(0, 0);
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
        if (this.blockedInBonus()) return;
        rules.doubleWindPairFu = Number(v) as 2 | 4;
        break;
      case 'adPrivacy':
        showAdPrivacyOptions();
        return;
      case 'buyAdFree':
        void buyRemoveAds();
        return;
      case 'restoreAdFree':
        void restoreRemoveAds();
        return;
      case 'tips':
        this.tips.reset();
        this.tipsReset = true;
        return;
      case 'start':
        if (this.blockedInBonus()) return;
        $<HTMLDialogElement>('#settings-dialog').close();
        this.showStart();
        return;
      case 'tutorial':
        if (this.blockedInBonus()) return;
        this.playTutorial(v === 'all' ? ALL_CHAPTERS : [v as ChapterId]);
        return;
      case 'keiko':
        if (confirm('稽古の記録（復習の手と、要素別の正答率）を消去しますか？')) {
          this.kd = { reviews: [], elements: {} };
          saveKeiko(this.kd);
          this.renderConfig();
        }
        return;
      case 'wallet':
        if (this.blockedInBonus()) return;
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
        if (this.blockedInBonus()) return;
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

  /** 設定の「広告」欄（Android 版だけ）：広告削除の購入・復元と、広告のプライバシー設定 */
  private adSettingsHtml(): string {
    const p = purchaseState();
    const rows: string[] = [];
    const btn = (set: string, label: string) =>
      `<div class="cfg-group"><button class="cfg" data-set="${set}" data-v="1"${p.busy ? ' disabled' : ''}>${label}</button></div>`;
    if (p.available) {
      if (p.owned) {
        rows.push(`<div class="set-row"><div><div class="set-label">広告なし</div><div class="set-desc">${p.message || '広告削除は購入済みです。ありがとうございます'}</div></div></div>`);
      } else {
        rows.push(
          `<div class="set-row"><div><div class="set-label">広告を消す${p.price ? `（${p.price}）` : ''}</div><div class="set-desc">${p.message || '一度買うと、画面上部の広告がずっと消えます。ゲームの内容は変わりません'}</div></div>${btn('buyAdFree', p.busy ? '処理中…' : '購入')}</div>`,
          `<div class="set-row"><div><div class="set-label">購入を復元</div><div class="set-desc">機種変更・再インストールのあと、同じ Google アカウントで買った広告削除を取り戻す</div></div>${btn('restoreAdFree', '復元')}</div>`,
        );
      }
    }
    if (adPrivacyRequired() && !p.owned) {
      rows.push(
        `<div class="set-row"><div><div class="set-label">プライバシー設定</div><div class="set-desc">広告のためのデータ利用への同意を見直す</div></div>${btn('adPrivacy', '変更')}</div>`,
      );
    }
    return rows.length ? `<div class="set-sec">広告</div>${rows.join('')}` : '';
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
      <div class="set-row"><div><div class="set-label">所持金 ${this.wallet.balance.toLocaleString()} yan</div><div class="set-desc">パチンコの所持金を ${ECONOMY.initial}yan に戻す（破産 ${this.wallet.bankrupts}回）</div></div><div class="cfg-group"><button class="cfg danger" data-set="wallet" data-v="1">リセット</button></div></div>
      <div class="set-row"><div><div class="set-label">稽古の記録</div><div class="set-desc">復習の手 ${this.kd.reviews.length}問と、要素別の正答率を消去</div></div><div class="cfg-group"><button class="cfg danger" data-set="keiko" data-v="1">リセット</button></div></div>
      <div class="set-row"><div><div class="set-label">スタート画面</div><div class="set-desc">タイトルに戻る（台と所持金はそのまま）</div></div><div class="cfg-group"><button class="cfg" data-set="start" data-v="1">戻る</button></div></div>
      <div class="set-row"><div><div class="set-label">チュートリアル</div><div class="set-desc">パチふとくんの案内をもう一度見る</div></div><div class="cfg-group"><button class="cfg" data-set="tutorial" data-v="all">全部</button><button class="cfg" data-set="tutorial" data-v="pachinko">パチンコ</button><button class="cfg" data-set="tutorial" data-v="keiko">稽古</button><button class="cfg" data-set="tutorial" data-v="tools">道具</button></div></div>
      <div class="set-row"><div><div class="set-label">一言ガイド</div><div class="set-desc">初めての人向けのヒントをもう一度表示する</div></div><div class="cfg-group"><button class="cfg${this.tipsReset ? ' on' : ''}" data-set="tips" data-v="1">${this.tipsReset ? '表示します' : 'もう一度'}</button></div></div>
      ${this.adSettingsHtml()}
      <div class="set-sec">このアプリについて</div>
      <div class="set-row"><div><div class="set-label">プライバシーポリシー</div><div class="set-desc">広告・購入・端末に保存する記録の扱い</div></div><div class="cfg-group"><a class="cfg" href="${PRIVACY_POLICY_URL}" target="_blank" rel="noopener noreferrer">開く</a></div></div>
    </div>`;
    const el = dlg.querySelector('.settings');
    if (el) el.scrollTop = scroll;
  }
}

/** チュートリアルの BONUS の問題数（長く待たせないよう短くする） */
const TUTORIAL_ROUNDS = 2;

const ALL_CHAPTERS: ChapterId[] = ['prologue', 'pachinko', 'keiko', 'tools'];

const SHELL = `
<header id="top">
  <div class="logo" role="button" tabindex="0" aria-label="パチふと（スタート画面へ）">${logoSvg({ sub: false, glow: false })}<span class="sub">パチンコ符計算トレーニング</span></div>
  <div class="play-tabs" role="tablist" aria-label="モード">
    <button class="play-tab" role="tab" data-play="pachinko">パチンコ</button>
    <button class="play-tab" role="tab" data-play="keiko">稽古</button>
  </div>
  <div class="top-right">
    <button id="cfg-toggle" class="cfg-pill" type="button" aria-expanded="false" aria-controls="config"></button>
    <button id="open-shop" class="icon-btn" aria-label="交換所"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg></button>
    <button id="open-story" class="icon-btn" aria-label="物語（パチふとくんの記憶）"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg></button>
    <button id="open-help" class="icon-btn" aria-label="遊び方"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></button>
    <button id="open-settings" class="icon-btn" aria-label="設定">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
  </div>
</header>
<nav id="mode-tabs" class="mode-tabs" role="tablist" aria-label="出題モード"></nav>
<div id="config" role="dialog" aria-label="出題設定"></div>
<div id="cfg-backdrop"></div>
<main>
  <aside id="machine" data-skin="gold" aria-label="パチンコ台"></aside>
  <section id="stage">
    <div id="progress"></div>
    <div id="question"></div>
    <div id="steps" hidden></div>
    <div id="dock">
      <button id="exp-strip" type="button" aria-label="経験値"></button>
      <div id="meter">
        <div class="mt-cell mt-credit" id="wallet" aria-live="polite"><div class="mt-top"><small>所持yan</small></div><b>0</b></div>
        <div class="mt-cell mt-bet"><div id="bet" class="bet-box"></div></div>
        <div class="mt-cell mt-net" id="net"><small>本日の収支</small><b>±0</b></div>
      </div>
      <div id="answer" aria-live="polite"></div>
      <div id="choices" role="group" aria-label="選択肢"></div>
      <div id="hint" class="hint"></div>
      <button id="next-btn" type="button">次へ</button>
    </div>
    <div id="result"></div>
  </section>
  <section id="summary" hidden></section>
</main>
<div id="tip" role="status" aria-live="polite" hidden></div>
<div id="combo" aria-live="polite"></div>
<div id="numpad">
  ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', 'Backspace']
    .map((k) => `<button data-key="${k}">${k === 'Backspace' ? '⌫' : k}</button>`)
    .join('')}
  <button data-key="Enter" class="enter">回答</button>
</div>
<footer>
  <span class="esc-key"><kbd>Esc</kbd> 入力を消す</span>
  <span><kbd>Tab</kbd> パス / 次へ</span>
  <span class="muted">遊び方は右上の ? から</span>
</footer>
<dialog id="settings-dialog"></dialog>
<dialog id="help-dialog"></dialog>
<dialog id="shop-dialog"></dialog>
<dialog id="story-dialog" aria-label="物語"></dialog>
${TILE_DEFS}
`;
