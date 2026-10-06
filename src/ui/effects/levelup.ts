import { sfx } from '../audio';
import { charaSvg } from '../tutorial/chara';
import type { EffectLevel } from './performance';

/**
 * Lv アップの演出（全画面）。パチふとくんが跳ね上がり、Lv の数字が回り、新しく読める物語の話を知らせる。
 * ［今すぐ読む］で物語を開く。Lv 20（物語の完結）は特別版
 */

export interface LevelUpView {
  from: number;
  to: number;
  /** 新しく読めるようになった話（Lv 20 を超えたら null） */
  chapter: { n: number; title: string } | null;
  /** 物語の完結（Lv 20 に届いた） */
  final: boolean;
}

export function levelUpHtml(v: LevelUpView): string {
  const say = v.final
    ? 'すべて思い出した…。ありがとよ、相棒'
    : v.chapter
      ? 'クケケ、記憶がまた一つ戻ったぜ'
      : 'まだまだ上を目指しな';
  const card = v.chapter
    ? `<div class="lu-card"><small>${v.final ? '最終話' : `第${v.chapter.n}話`}</small><b>「${v.chapter.title}」</b><span>が読めるようになった</span></div>`
    : '';
  const confetti = v.final
    ? `<div class="lu-confetti" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<i style="--x:${(i * 37) % 100};--d:${(i * 53) % 900}ms;--h:${(i * 47) % 360}"></i>`).join('')}</div>`
    : '';
  return `<div class="lu-rays" aria-hidden="true"></div>${confetti}
    <div class="lu-inner" role="dialog" aria-label="${v.final ? '物語 完結' : 'レベルアップ'}">
      <div class="lu-chara">${charaSvg(v.final ? 'grin' : 'proud')}</div>
      <div class="lu-title">${v.final ? '物語 完結' : 'LEVEL UP!!'}</div>
      <div class="lu-lv">Lv <b class="lu-from">${v.from}</b><span>→</span><b class="lu-to">${v.from}</b></div>
      <p class="lu-say">${say}</p>
      ${card}
      <div class="lu-buttons">
        ${v.chapter ? `<button class="lu-btn lu-read" type="button" data-lu="read">今すぐ読む</button>` : ''}
        <button class="lu-btn" type="button" data-lu="close">${v.chapter ? 'あとで' : '閉じる'}</button>
      </div>
    </div>`;
}

export class LevelUpFx {
  private el: HTMLElement | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (!this.el) return;
    // 裏のゲームにキーを渡さない
    e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      const b = document.activeElement as HTMLElement | null;
      if (b && this.el.contains(b)) return;
      e.preventDefault();
      this.close(false);
    }
  };
  private done: ((read: boolean) => void) | null = null;

  constructor(private level: () => EffectLevel) {}

  get shown(): boolean {
    return this.el !== null;
  }

  /** 演出を出す。閉じたら resolve（［今すぐ読む］なら true） */
  show(v: LevelUpView): Promise<boolean> {
    this.close(false);
    const el = document.createElement('div');
    el.id = 'levelup';
    el.className = `${this.level() === 'max' ? 'full' : 'lite'}${v.final ? ' final' : ''}`;
    el.innerHTML = levelUpHtml(v);
    document.body.appendChild(el);
    this.el = el;
    sfx.levelUp();
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lu]');
      if (b) this.close(b.dataset.lu === 'read');
    });
    window.addEventListener('keydown', this.onKey, true);
    // Lv の数字を回す
    const to = el.querySelector<HTMLElement>('.lu-to')!;
    const steps = v.to - v.from;
    let k = 0;
    const tick = () => {
      if (!this.el || this.el !== el) return;
      k++;
      to.textContent = String(v.from + Math.min(steps, k));
      to.classList.remove('bump');
      void to.offsetWidth;
      to.classList.add('bump');
      // 何 Lv 上がっても 1.2 秒ほどで数え終える
      if (k < steps) setTimeout(tick, Math.min(220, 1200 / steps));
    };
    setTimeout(tick, 650);
    setTimeout(() => el.querySelector<HTMLElement>('.lu-read, .lu-btn')?.focus({ preventScroll: true }), 700);
    return new Promise((res) => (this.done = res));
  }

  close(read: boolean): void {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    window.removeEventListener('keydown', this.onKey, true);
    const d = this.done;
    this.done = null;
    d?.(read);
  }
}
