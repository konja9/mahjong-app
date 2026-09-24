import { tileSvg } from '../tileView';

/** 図柄は萬子の1〜9 */
const SYMBOLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** 牌3枚の図柄リール（DOM + CSS アニメーション） */
export class Reel {
  readonly el: HTMLElement;
  private reels: HTMLElement[];

  constructor(host: HTMLElement, cls = '') {
    const strip = [...SYMBOLS, ...SYMBOLS].map((t) => `<div class="cell">${tileSvg(t)}</div>`).join('');
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
    return Math.floor(Math.random() * SYMBOLS.length);
  }
}
