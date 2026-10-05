import { load, save } from '../storage';
import { charaSvg } from './chara';
import { type ChapterId, type Step, type TutorialAction, type TutorialEvent, chapter } from './script';

/**
 * チュートリアルの再生。台本（script.ts）のステップを順に再生する。
 * - スポットライト：画面を暗くして、対象の場所だけ穴をあけて光らせる（大きな box-shadow）
 * - 操作の強制：光らせた場所以外の押下とキー入力を止める（capture で先に受けて打ち消す）
 * - 吹き出し：パチふとくんがセリフを1文字ずつ話す。タップで全文 → もう一度で次へ
 * - スキップ：この章／全部をとばせる
 */

export interface TutorialHost {
  /** 画面の準備（固定の問題を出す など） */
  act(action: TutorialAction): void;
  /** 再生の開始・終了（アプリ側で一時停止などに使う） */
  onActive(active: boolean): void;
  /** BONUS 中でないか（idle を待つステップを、すぐに進めてよいか） */
  idle(): boolean;
}

const KEY = 'tensu.tutorial.v1';
const TYPE_MS = 28;

interface Saved {
  done: ChapterId[];
}

export const tutorialDone = (): ChapterId[] => load<Saved>(KEY, { done: [] }).done ?? [];
const markDone = (id: ChapterId) => save(KEY, { done: [...new Set([...tutorialDone(), id])] });

export class Tutorial {
  private queue: ChapterId[] = [];
  private chapterId: ChapterId | null = null;
  private steps: Step[] = [];
  private i = -1;
  private root: HTMLElement;
  private hole: HTMLElement;
  private finger: HTMLElement;
  private ui: HTMLElement;
  private bubble: HTMLElement;
  private face: HTMLElement;
  private menu: HTMLElement;
  private raf = 0;
  private typing = 0;
  private fullText = '';
  private shown = 0;

  constructor(private host: TutorialHost) {
    this.root = document.createElement('div');
    this.root.id = 'tut';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="tut-hole"></div><div class="tut-finger" aria-hidden="true">👆</div>
      <div class="tut-ui" role="dialog" aria-live="polite" aria-label="パチふとくんの案内">
        <div class="tut-face"></div>
        <div class="tut-bubble"><b class="tut-name">パチふとくん</b><p class="tut-text"></p><span class="tut-more" aria-hidden="true">▼</span></div>
      </div>
      <button class="tut-skip" type="button" data-tut-skip>スキップ</button>
      <div class="tut-menu" hidden>
        <button type="button" data-tut-menu="chapter">この章をとばす</button>
        <button type="button" data-tut-menu="all">全部とばす</button>
        <button type="button" data-tut-menu="back">続ける</button>
      </div>`;
    document.body.appendChild(this.root);
    this.hole = this.root.querySelector('.tut-hole')!;
    this.finger = this.root.querySelector('.tut-finger')!;
    this.ui = this.root.querySelector('.tut-ui')!;
    this.bubble = this.root.querySelector('.tut-text')!;
    this.face = this.root.querySelector('.tut-face')!;
    this.menu = this.root.querySelector('.tut-menu')!;
    // 光らせた場所以外の操作を止める。capture で、アプリより先に受ける
    document.addEventListener('pointerdown', (e) => this.guardPointer(e), true);
    document.addEventListener('click', (e) => this.guardClick(e), true);
    window.addEventListener('keydown', (e) => this.guardKey(e), true);
  }

  get active(): boolean {
    return this.chapterId !== null;
  }

  /** いま光らせている対象の要素（アプリ側で正解のボタンに印を付けるときなどに使う） */
  get current(): Step | undefined {
    return this.steps[this.i];
  }

  /** 章を順に再生する */
  play(ids: ChapterId[]): void {
    this.queue = [...ids];
    this.root.hidden = false;
    this.host.onActive(true);
    this.nextChapter();
  }

  /** アプリ側の出来事。待っているステップならそこで次へ */
  notify(event: TutorialEvent): void {
    const s = this.current;
    if (!s) return;
    if ((s.kind === 'spot' && s.next === event) || (s.kind === 'free' && s.until === event)) this.advance();
  }

  private nextChapter(): void {
    if (this.chapterId) markDone(this.chapterId);
    const id = this.queue.shift();
    if (!id) {
      this.finish();
      return;
    }
    this.chapterId = id;
    this.steps = chapter(id).steps;
    this.i = -1;
    this.advance();
  }

  private finish(): void {
    this.chapterId = null;
    this.steps = [];
    this.i = -1;
    cancelAnimationFrame(this.raf);
    clearInterval(this.typing);
    this.root.hidden = true;
    this.root.className = '';
    this.host.onActive(false);
  }

  private advance(): void {
    this.i++;
    const s = this.current;
    if (!s) {
      this.nextChapter();
      return;
    }
    if (s.kind === 'do') {
      this.host.act(s.action);
      this.advance();
      return;
    }
    if (s.kind === 'free' && s.until === 'idle' && this.host.idle()) {
      this.advance();
      return;
    }
    this.root.className = `tut-${s.kind}${s.kind === 'spot' ? ` tut-next-${s.next}` : ''}`;
    this.face.innerHTML = charaSvg(s.face);
    this.say(s.text);
    // 対象が描かれるのを待ってから位置を追う
    cancelAnimationFrame(this.raf);
    const follow = () => {
      this.place();
      this.raf = requestAnimationFrame(follow);
    };
    if (s.kind === 'spot') {
      requestAnimationFrame(() => document.querySelector(s.target)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
    this.raf = requestAnimationFrame(follow);
  }

  private say(text: string): void {
    clearInterval(this.typing);
    this.fullText = text;
    this.shown = 0;
    this.bubble.textContent = '';
    this.root.classList.remove('tut-typed');
    this.typing = window.setInterval(() => {
      this.shown++;
      this.bubble.textContent = this.fullText.slice(0, this.shown);
      if (this.shown >= this.fullText.length) this.endTyping();
    }, TYPE_MS);
  }

  private endTyping(): void {
    clearInterval(this.typing);
    this.bubble.textContent = this.fullText;
    this.shown = this.fullText.length;
    this.root.classList.add('tut-typed');
  }

  /** タップ：文字送りの途中なら全文を出し、出し終えていれば次へ（タップで進むステップだけ） */
  private tap(): void {
    const s = this.current;
    if (!s) return;
    if (this.shown < this.fullText.length) {
      this.endTyping();
      return;
    }
    if (s.kind === 'say' || (s.kind === 'spot' && s.next === 'tap')) this.advance();
  }

  private target(): HTMLElement | null {
    const s = this.current;
    return s?.kind === 'spot' ? document.querySelector<HTMLElement>(s.target) : null;
  }

  /** 穴・指・吹き出しの位置を対象に合わせる */
  private place(): void {
    const s = this.current;
    const el = this.target();
    const r = el?.getBoundingClientRect();
    const visible = !!r && r.width > 0 && r.height > 0;
    this.hole.hidden = !visible;
    this.finger.hidden = !visible || (s?.kind === 'spot' && s.next === 'tap');
    let top = false;
    if (visible && r && s?.kind === 'spot') {
      const pad = s.pad ?? 4;
      Object.assign(this.hole.style, {
        left: `${r.left - pad}px`,
        top: `${r.top - pad}px`,
        width: `${r.width + pad * 2}px`,
        height: `${r.height + pad * 2}px`,
      });
      Object.assign(this.finger.style, { left: `${r.left + r.width / 2}px`, top: `${r.bottom + 2}px` });
      // 対象が画面の下半分にあれば、キャラと吹き出しを上に出して重ならないようにする
      top = r.top + r.height / 2 > innerHeight * 0.5;
      // 指が画面の下からはみ出すなら、対象の上に出して下向きにする
      const up = r.bottom + 60 > innerHeight;
      this.finger.classList.toggle('up', up);
      if (up) this.finger.style.top = `${r.top - 46}px`;
    }
    this.ui.classList.toggle('top', top);
  }

  private inTutUi(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    return !!el?.closest?.('.tut-ui, .tut-skip, .tut-menu');
  }

  /** 光らせた場所の中か（押してよい場所） */
  private inTarget(t: EventTarget | null): boolean {
    const s = this.current;
    if (!s || s.kind !== 'spot' || s.next === 'tap') return false;
    const el = this.target();
    return !!el && el.contains(t as Node);
  }

  /** 操作を待つステップなのに対象が見えていない（画面の切り替え中など）。このときは操作を止めず、迷子にさせない */
  private targetMissing(): boolean {
    const s = this.current;
    if (!s || s.kind !== 'spot' || s.next === 'tap') return false;
    const r = this.target()?.getBoundingClientRect();
    return !r || r.width === 0 || r.height === 0;
  }

  private guardPointer(e: Event): void {
    if (!this.active || this.current?.kind === 'free' || this.inTutUi(e.target) || this.inTarget(e.target) || this.targetMissing()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  private guardClick(e: MouseEvent): void {
    if (!this.active) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-tut-skip]')) {
      this.menu.hidden = !this.menu.hidden;
      return;
    }
    const m = t.closest<HTMLElement>('[data-tut-menu]');
    if (m) {
      this.menu.hidden = true;
      if (m.dataset.tutMenu === 'chapter') this.nextChapter();
      else if (m.dataset.tutMenu === 'all') {
        // とばした章も見たことにする（初回の自動再生をくり返さない）
        for (const id of this.queue) markDone(id);
        this.queue = [];
        this.nextChapter();
      }
      return;
    }
    if ((this.current?.kind === 'free' || this.targetMissing()) && !this.inTutUi(t)) return;
    if (this.inTarget(t)) {
      const s = this.current;
      // 押したら次へ：アプリの処理（タブの切り替えなど）が済んでから進める
      if (s?.kind === 'spot' && s.next === 'click') setTimeout(() => this.advance(), 0);
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    this.tap();
  }

  private guardKey(e: KeyboardEvent): void {
    if (!this.active) return;
    const s = this.current;
    if (!s || s.kind === 'free' || this.targetMissing()) return;
    // 光らせた場所で答えるステップでは、その中のボタンの番号キーと入力のキーだけ通す
    if (s.kind === 'spot' && s.next !== 'tap' && s.next !== 'click') {
      const el = this.target();
      const keys = [...(el?.querySelectorAll<HTMLElement>('[data-choice]') ?? [])].map((b) => String(Number(b.dataset.choice) + 1));
      if (el?.matches('[data-choice]')) keys.push(String(Number(el.dataset.choice) + 1));
      const typing = /^[0-9]$|^(Enter|Backspace|-)$/.test(e.key) && !!document.querySelector('[data-answer="input"]');
      if (keys.includes(e.key) || typing) return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Enter' || e.key === ' ') this.tap();
  }
}
