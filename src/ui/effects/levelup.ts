import { sfx } from '../audio';
import { charaSvg } from '../tutorial/chara';
import { partSvg } from '../machine/partArt';
import type { PartId } from '../machine/parts';
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
  /** 手に入れた改造パーツ */
  parts?: { id: string; name: string; desc: string }[];
  /** 祝い金（パーツがもらえない Lv） */
  cash?: number;
  /** 改造の枠が空いていて、その場で付けられる */
  canEquip?: boolean;
  /** 台の枠がまだ1つも開いていないときの一言（次に枠が開く段位を知らせる） */
  lockedNote?: string;
  /** 受けられるようになった昇段試験の段位 */
  exam?: string | null;
}

/** 閉じ方：物語を読む・昇段試験へ・閉じる */
export type LevelUpAction = 'read' | 'exam' | 'close';

export function levelUpHtml(v: LevelUpView): string {
  const say = v.final
    ? 'すべて思い出した…。ありがとよ、相棒'
    : v.chapter
      ? 'クケケ、記憶がまた一つ戻ったぜ'
      : 'まだまだ上を目指しな';
  const card = v.chapter
    ? `<div class="lu-card"><small>${v.final ? '最終話' : `第${v.chapter.n}話`}</small><b>「${v.chapter.title}」</b><span>が読めるようになった</span></div>`
    : '';
  const parts = (v.parts ?? [])
    .map(
      (p) =>
        `<div class="lu-reward lu-part"><div class="lu-part-art">${partSvg(p.id as PartId)}</div><small>改造パーツ</small><b>${p.name}</b><span>${p.desc}</span>${v.canEquip ? `<button class="lu-mini" type="button" data-lu-equip="${p.id}">台に付ける</button>` : `<span class="lu-note">${v.lockedNote ?? '枠がいっぱい（メニューの「改造」で付け替え）'}</span>`}</div>`,
    )
    .join('');
  const cash = v.cash ? `<div class="lu-reward"><small>祝い金</small><b>+${v.cash.toLocaleString()} yan</b></div>` : '';
  const exam = v.exam ? `<div class="lu-reward lu-exam-note"><small>昇段試験</small><b>${v.exam}</b><span>の試験が受けられるようになった</span></div>` : '';
  const confetti = v.final
    ? `<div class="lu-confetti" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<i style="--x:${(i * 37) % 100};--d:${(i * 53) % 900}ms;--h:${(i * 47) % 360}"></i>`).join('')}</div>`
    : '';
  return `<div class="lu-rays" aria-hidden="true"></div>${confetti}
    <div class="lu-inner" role="dialog" aria-label="${v.final ? '物語 完結' : 'レベルアップ'}">
      <div class="lu-chara">${charaSvg(v.final ? 'grin' : 'proud')}</div>
      <div class="lu-title">${v.final ? '物語 完結' : 'LEVEL UP!!'}</div>
      <div class="lu-lv">Lv <b class="lu-from">${v.from}</b><span>→</span><b class="lu-to">${v.from}</b></div>
      <p class="lu-say">${say}</p>
      ${card}${parts}${cash}${exam}
      <div class="lu-buttons">
        ${v.chapter ? `<button class="lu-btn lu-read" type="button" data-lu="read">今すぐ読む</button>` : ''}
        ${v.exam ? `<button class="lu-btn lu-read" type="button" data-lu="exam">試験を受ける</button>` : ''}
        <button class="lu-btn" type="button" data-lu="close">${v.chapter || v.exam ? 'あとで' : '閉じる'}</button>
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
      this.close('close');
    } else if (e.key === 'Enter' || e.key === ' ') {
      const b = document.activeElement as HTMLElement | null;
      if (b && this.el.contains(b)) return;
      e.preventDefault();
      this.close('close');
    }
  };
  private done: ((a: LevelUpAction) => void) | null = null;

  constructor(private level: () => EffectLevel) {}

  get shown(): boolean {
    return this.el !== null;
  }

  /** 演出を出す。閉じたら閉じ方で resolve。onEquip はパーツを台に付ける（付けられたら true） */
  show(v: LevelUpView, onEquip?: (id: string) => boolean): Promise<LevelUpAction> {
    this.close('close');
    const el = document.createElement('div');
    el.id = 'levelup';
    el.className = `${this.level() === 'max' ? 'full' : 'lite'}${v.final ? ' final' : ''}`;
    el.innerHTML = levelUpHtml(v);
    document.body.appendChild(el);
    this.el = el;
    sfx.levelUp();
    el.addEventListener('click', (e) => {
      const eq = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-lu-equip]');
      if (eq) {
        if (onEquip?.(eq.dataset.luEquip!)) {
          eq.textContent = '装着した';
          eq.disabled = true;
          // 枠は1つずつ埋まるので、ほかの「台に付ける」は閉じてから台選びで
          el.querySelectorAll<HTMLButtonElement>('[data-lu-equip]').forEach((b) => b !== eq && (b.disabled = true));
        }
        return;
      }
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lu]');
      if (b) this.close(b.dataset.lu as LevelUpAction);
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

  /** 演出と同じ枠で、任意の中身を出す（昇段試験の認定証など）。data-lu のボタンで閉じる */
  showHtml(cls: string, html: string): Promise<LevelUpAction> {
    this.close('close');
    const el = document.createElement('div');
    el.id = 'levelup';
    el.className = `${this.level() === 'max' ? 'full' : 'lite'} ${cls}`;
    el.innerHTML = html;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lu]');
      if (b) this.close(b.dataset.lu as LevelUpAction);
    });
    window.addEventListener('keydown', this.onKey, true);
    setTimeout(() => el.querySelector<HTMLElement>('.lu-btn')?.focus({ preventScroll: true }), 500);
    return new Promise((res) => (this.done = res));
  }

  close(a: LevelUpAction): void {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    window.removeEventListener('keydown', this.onKey, true);
    const d = this.done;
    this.done = null;
    d?.(a);
  }
}
