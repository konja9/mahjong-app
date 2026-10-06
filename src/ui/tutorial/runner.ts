import { load, save } from '../storage';
import { sfx } from '../audio';
import { charaSvg } from './chara';
import { layoutBubble } from './layout';
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
/** スタート画面の「チュートリアルをとばす」：全部の章を見たことにする */
export const skipAllTutorial = (ids: ChapterId[]): void => ids.forEach(markDone);

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
  private skip: HTMLElement;
  private raf = 0;
  private typing = 0;
  private fullText = '';
  private shown = 0;

  constructor(private host: TutorialHost) {
    this.root = document.createElement('div');
    this.root.id = 'tut';
    this.root.hidden = true;
    this.root.innerHTML = `<i class="tut-probe"></i><div class="tut-hole"></div><div class="tut-finger" aria-hidden="true">👆</div>
      <div class="tut-ui" role="dialog" aria-live="polite" aria-label="パチふとくんの案内">
        <div class="tut-face"></div>
        <div class="tut-bubble"><div class="tut-head"><b class="tut-name">パチふとくん</b><button class="tut-skip" type="button" data-tut-skip>スキップ</button></div><p class="tut-text"></p><span class="tut-hint">光っているところを押してね</span><span class="tut-more" aria-hidden="true">▼</span></div>
      </div>
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
    this.skip = this.root.querySelector('.tut-skip')!;
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
    // 光らせて操作させる場面（押す・答える）は tut-op：暗さを弱め、枠を目立たせる
    const op = s.kind === 'spot' && s.next !== 'tap';
    this.root.className = `tut-${s.kind}${s.kind === 'spot' ? ` tut-next-${s.next}` : ''}${op ? ' tut-op' : ''}`;
    this.menu.hidden = true;
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
    if (s.kind === 'say' || (s.kind === 'spot' && s.next === 'tap')) {
      sfx.tap();
      this.advance();
    }
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
    const ui = this.ui.style;
    if (visible && r && s?.kind === 'spot') {
      const pad = s.pad ?? 4;
      const box = { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
      Object.assign(this.hole.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      // 「タップ！」の札：画面の上端に近い対象（ヘッダーのボタン）では枠の下に付ける
      this.hole.classList.toggle('badge-below', box.top < 40);
      // ノッチ・広告・ホームバーの分（CSS の env() を、画面の上下に張った見えない要素で測る）
      const safe = this.root.querySelector('.tut-probe')!.getBoundingClientRect();
      const mobile = innerWidth <= 640;
      // 吹き出しは対象の上下の空いている側に、収まる高さで置く
      const l = layoutBubble({
        vh: innerHeight,
        safeTop: safe.top,
        safeBottom: innerHeight - safe.bottom,
        target: { top: box.top, bottom: box.top + box.height },
        want: mobile ? 104 : 128,
        answer: s.next === 'answered' || s.next === 'stepAnswered',
      });
      this.ui.dataset.side = l.side;
      ui.top = l.top !== undefined ? `${l.top}px` : 'auto';
      ui.bottom = l.bottom !== undefined ? `${l.bottom}px` : 'auto';
      ui.maxHeight = `${l.maxH}px`;
      // 指：吹き出しの反対側（空きがなければ対象の中）から対象を指す
      const cx = r.left + r.width / 2;
      const fy = l.finger === 'below' ? box.top + box.height + 2 : l.finger === 'above' ? box.top - 44 : r.top + r.height / 2 - 8;
      Object.assign(this.finger.style, { left: `${cx}px`, top: `${fy}px` });
      this.finger.classList.toggle('up', l.finger === 'above');
    } else {
      // セリフだけ・自由に遊ぶ場面は CSS の決まった場所に出す
      delete this.ui.dataset.side;
      ui.top = ui.bottom = ui.maxHeight = '';
    }
    if (!this.menu.hidden) {
      // 中断メニューはスキップのボタンのそばに開く（下に入らなければ上）
      const b = this.skip.getBoundingClientRect();
      const h = this.menu.offsetHeight;
      const below = b.bottom + 4 + h <= innerHeight - 8;
      Object.assign(this.menu.style, {
        right: `${Math.max(8, innerWidth - b.right)}px`,
        top: `${below ? b.bottom + 4 : Math.max(8, b.top - 4 - h)}px`,
      });
    }
  }

  private inTutUi(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    return !!el?.closest?.('.tut-ui, .tut-menu');
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
