import { charaSvg } from './tutorial/chara';

/**
 * スタート画面（起動するたびに最初に出す）と、ゲームに入る前のローディング画面。
 * ローディングは読み込みのためではなく、世界観の一文を見せる演出。
 * 文を読めるように自動では進まず、タップでゲーム画面へ移る
 */

export type StartChoice = 'pachinko' | 'keiko' | 'tutorial';

interface Line {
  text: string;
  /** その入り口で優先して出す（なければどこでも出す） */
  for?: 'pachinko' | 'keiko';
}

/** ローディングで見せる世界観の一文 */
export const START_LINES: Line[] = [
  { text: 'ギャンブル世紀末。人の値打ちは、勝ち取った点数で決まる。' },
  { text: '数えられない者から、身ぐるみをはがされていく。' },
  { text: '符を制する者が、卓を制す。' },
  { text: 'この街の通貨は yan。雀の字から来ているらしい。' },
  { text: 'パチふとを起動できるのは、選ばれた者だけだ。' },
  { text: '満貫の前で手が止まる者に、ギャンブル王の椅子はない。' },
  { text: '払い過ぎた点棒は、二度と戻ってこない。' },
  { text: '名誉も家も、点数で買える時代になった。' },
  { text: 'ネオン街の地下深く、今日も麻雀牌のリールが回る。', for: 'pachinko' },
  { text: '保留ランプが点くたび、賭場の空気が変わる。', for: 'pachinko' },
  { text: '大当りは、正しく数えた者にだけ微笑む。', for: 'pachinko' },
  { text: 'RUSH を引っぱれるかは、運ではなく腕で決まる。', for: 'pachinko' },
  { text: '賭場の入口で、パチふとくんがニヤリと笑った。', for: 'pachinko' },
  { text: '道場では yan は要らない。要るのは根気だ。', for: 'keiko' },
  { text: '稽古を怠った雀士は、三日で街から消える。', for: 'keiko' },
  { text: '副底20符。すべての計算は、ここから始まる。', for: 'keiko' },
  { text: '間違えた手は、何度でも目の前に現れる。', for: 'keiko' },
  { text: '一段ずつ数えた者だけが、速く数えられるようになる。', for: 'keiko' },
];

/** 入り口に合った一文を選ぶ（その入り口向けの文を優先し、ときどき共通の文も出す） */
export function pickLine(choice: StartChoice, rng: () => number = Math.random): string {
  const want = choice === 'keiko' ? 'keiko' : 'pachinko';
  const own = START_LINES.filter((l) => l.for === want);
  const common = START_LINES.filter((l) => !l.for);
  const pool = rng() < 0.6 ? own : common;
  return pool[Math.floor(rng() * pool.length) % pool.length].text;
}

export interface StartView {
  /** 初めての起動（チュートリアルを大きく出す） */
  first: boolean;
  balance: number;
}

export function startHtml(v: StartView): string {
  const say = v.first ? 'クケケケ、ようこそ新顔。まずはオレ様の案内を聞いていきな。' : 'クケケ、今日も勝ちに来たか？';
  const tutorial = v.first
    ? `<button class="st-btn st-tutorial big" type="button" data-start="tutorial"><b>チュートリアル</b><small>はじめての人はこちら</small></button>`
    : '';
  const sub = v.first
    ? `<button class="st-link" type="button" data-start="skip">チュートリアルをとばす</button>`
    : `<button class="st-link" type="button" data-start="tutorial">チュートリアルを見る</button>`;
  return `<div class="st-inner">
    <h1 class="st-logo"><span class="logo-pachi">パチ</span><span class="logo-futo">ふと</span></h1>
    <p class="st-sub">パチンコ符計算トレーニング</p>
    <div class="st-chara"><div class="st-face">${charaSvg('grin')}</div><p class="st-say">${say}</p></div>
    <div class="st-buttons">
      ${tutorial}
      <button class="st-btn st-pachinko" type="button" data-start="pachinko"><b>パチンコ</b><small>所持金 ${v.balance.toLocaleString()} yan</small></button>
      <button class="st-btn st-keiko" type="button" data-start="keiko"><b>稽古</b><small>yan を使わずに練習</small></button>
    </div>
    ${sub}
  </div>`;
}

export function loadingHtml(line: string): string {
  return `<div class="ld-inner">
    <div class="ld-reels" aria-hidden="true"><i><b>發</b><b>7</b><b>★</b><b>中</b><b>發</b></i><i><b>7</b><b>★</b><b>中</b><b>發</b><b>7</b></i><i><b>★</b><b>中</b><b>發</b><b>7</b><b>★</b></i></div>
    <div class="ld-bar"><i></i></div>
    <p class="ld-line">${line}</p>
    <p class="ld-tap">タップして進む</p>
  </div>`;
}

/** バーが満ちるまでの時間 */
const LOAD_MS = 1500;

export interface StartHost {
  view(): StartView;
  /** スタート画面を出す・消す（台や速答の時間を止める） */
  onShown(shown: boolean): void;
  /** ローディングのあと、選んだ入り口でゲームを始める */
  enter(choice: StartChoice): void;
  /** 初回の「チュートリアルをとばす」 */
  skipTutorial(): void;
  /** 動きを止めるか（演出オフ・動きを減らす設定） */
  still(): boolean;
}

export class StartScreen {
  private root: HTMLElement;
  private phase: 'off' | 'start' | 'loading' | 'ready' = 'off';
  private choice: StartChoice = 'pachinko';
  private timer = 0;

  constructor(private host: StartHost) {
    this.root = document.createElement('div');
    this.root.id = 'start';
    this.root.hidden = true;
    document.body.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get shown(): boolean {
    return this.phase !== 'off';
  }

  show(): void {
    clearTimeout(this.timer);
    this.phase = 'start';
    this.root.className = 'st-start';
    this.root.innerHTML = startHtml(this.host.view());
    this.root.hidden = false;
    document.body.classList.add('start-open');
    this.host.onShown(true);
    this.root.querySelector<HTMLElement>('.st-btn')?.focus({ preventScroll: true });
  }

  private hide(): void {
    clearTimeout(this.timer);
    this.phase = 'off';
    this.root.hidden = true;
    this.root.innerHTML = '';
    document.body.classList.remove('start-open');
    this.host.onShown(false);
  }

  private load(choice: StartChoice): void {
    this.choice = choice;
    this.phase = 'loading';
    this.root.className = 'st-loading';
    this.root.innerHTML = loadingHtml(pickLine(choice));
    if (this.host.still()) this.ready();
    else this.timer = window.setTimeout(() => this.ready(), LOAD_MS);
  }

  private ready(): void {
    clearTimeout(this.timer);
    this.phase = 'ready';
    this.root.classList.add('ready');
  }

  /** ローディング中のタップ：バーが満ちる前は満たすだけ、満ちていればゲームへ */
  private proceed(): void {
    if (this.phase === 'loading') this.ready();
    else if (this.phase === 'ready') {
      const choice = this.choice;
      this.hide();
      this.host.enter(choice);
    }
  }

  private onClick(e: MouseEvent): void {
    if (this.phase === 'start') {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-start]');
      if (!b) return;
      const v = b.dataset.start!;
      if (v === 'skip') {
        this.host.skipTutorial();
        this.show();
        return;
      }
      this.load(v as StartChoice);
      return;
    }
    this.proceed();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.phase === 'off') return;
    // スタート画面ではボタンの操作（Tab・Enter）だけ通し、裏のゲームのキーは止める
    if (this.phase === 'start') {
      if (e.key === 'Tab') return;
      e.stopImmediatePropagation();
      const el = document.activeElement as HTMLElement | null;
      if ((e.key === 'Enter' || e.key === ' ') && el && this.root.contains(el)) {
        e.preventDefault();
        el.click();
      }
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Enter' || e.key === ' ') this.proceed();
  }
}
