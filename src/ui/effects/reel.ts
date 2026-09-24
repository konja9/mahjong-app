import { tileSvg } from '../tileView';

/**
 * 図柄は 1〜9 と白發中の12種類。数字ごとに種類を固定して、見た目で区別しやすくする。
 * index 4（赤5筒）が PREMIUM。
 */
export const SYMBOLS = [0, 10, 20, 3, 13, 23, 6, 16, 26, 31, 32, 33];
export const SYMBOL_COUNT = SYMBOLS.length;
export const PREMIUM_INDEX = 4;

const cell = (t: number, i: number) =>
  i === PREMIUM_INDEX
    ? `<div class="cell premium">${tileSvg(t, { red: true })}</div>`
    : `<div class="cell">${tileSvg(t)}</div>`;

/** 牌3枚の図柄リール（DOM + CSS アニメーション） */
export class Reel {
  readonly el: HTMLElement;
  private reels: HTMLElement[];

  constructor(host: HTMLElement, cls = '') {
    const strip = [...SYMBOLS, ...SYMBOLS].map((t, i) => cell(t, i % SYMBOL_COUNT)).join('');
    host.insertAdjacentHTML(
      'beforeend',
      `<div class="reel-machine ${cls}">
        <div class="reel-title"></div>
        <div class="reels">${[0, 1, 2]
          .map((i) => `<div class="reel" data-i="${i}"><div class="strip">${strip}</div></div>`)
          .join('')}</div>
        <div class="reel-sub"></div>
      </div>`,
    );
    this.el = host.lastElementChild as HTMLElement;
    this.reels = [...this.el.querySelectorAll<HTMLElement>('.reel')];
  }

  spinAll(): void {
    this.reels.forEach((r, i) => this.spin(i, r));
  }

  spin(i: number, r = this.reels[i]): void {
    const strip = r.querySelector<HTMLElement>('.strip')!;
    r.classList.remove('stopped', 'slow', 'hit');
    strip.style.transform = '';
    // 位相をずらして回転させる
    strip.style.animationDelay = `${-Math.random() * 0.3}s`;
    r.classList.add('spinning');
  }

  slow(i: number): void {
    this.reels[i].classList.add('slow');
  }

  stop(i: number, sym: number): void {
    const r = this.reels[i];
    const strip = r.querySelector<HTMLElement>('.strip')!;
    r.classList.remove('spinning', 'slow');
    r.classList.add('stopped');
    strip.style.transform = `translateY(calc(var(--reel-h) * ${-sym}))`;
  }

  hit(): void {
    this.reels.forEach((r) => r.classList.add('hit'));
  }

  title(html: string, cls = ''): void {
    const t = this.el.querySelector<HTMLElement>('.reel-title')!;
    t.className = `reel-title ${cls}`;
    t.innerHTML = html;
    t.classList.remove('pop');
    void t.offsetWidth;
    t.classList.add('pop');
  }

  sub(html: string): void {
    this.el.querySelector<HTMLElement>('.reel-sub')!.innerHTML = html;
  }

  setClass(cls: string): void {
    this.el.className = `reel-machine ${cls}`;
  }

  static randomSymbol(): number {
    return Math.floor(Math.random() * SYMBOL_COUNT);
  }
}
