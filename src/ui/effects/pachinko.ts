import { sfx } from '../audio';
import type { EffectLevel } from '../settings';
import { Particles } from './particles';

/** 保留ランプの色（0:青 1:緑 2:赤 3:金 4:虹） */
export const LAMP_NAMES = ['blue', 'green', 'red', 'gold', 'rainbow'] as const;
export const LAMP_MULT = [1, 1.5, 2, 3, 5];

export type WinTier = 0 | 1 | 2 | 3;

export class Fx {
  private particles: Particles;
  private pending: (() => void)[] = [];
  private skipped = false;

  constructor(
    private overlay: HTMLElement,
    canvas: HTMLCanvasElement,
    private root: HTMLElement,
    private level: () => EffectLevel,
  ) {
    this.particles = new Particles(canvas);
  }

  get enabled(): boolean {
    return this.level() !== 'off';
  }

  get full(): boolean {
    return this.level() === 'max';
  }

  /** 実行中の演出をすべて飛ばす */
  skip(): void {
    this.skipped = true;
    const p = this.pending;
    this.pending = [];
    p.forEach((f) => f());
    this.overlay.innerHTML = '';
    this.overlay.className = '';
  }

  private sleep(ms: number): Promise<void> {
    if (this.skipped) return Promise.resolve();
    return new Promise((res) => {
      const id = setTimeout(() => {
        this.pending = this.pending.filter((f) => f !== done);
        res();
      }, ms);
      const done = () => {
        clearTimeout(id);
        res();
      };
      this.pending.push(done);
    });
  }

  private show(html: string, cls = ''): void {
    this.overlay.className = cls;
    this.overlay.innerHTML = html;
  }

  private clear(): void {
    this.overlay.className = '';
    this.overlay.innerHTML = '';
  }

  private pulse(cls: string, ms: number): void {
    this.root.classList.remove(cls);
    void this.root.offsetWidth;
    this.root.classList.add(cls);
    setTimeout(() => this.root.classList.remove(cls), ms);
  }

  private center(el?: HTMLElement | null): [number, number] {
    if (!el) return [innerWidth / 2, innerHeight / 2];
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  /** 回答確定から判定までの「溜め」演出 */
  async suspense(lamp: number, highValue: boolean): Promise<void> {
    this.skipped = false;
    if (!this.enabled) return;
    const k = this.full ? 1 : 0.5;
    if (lamp >= 4 && this.full) {
      this.show('<div class="premium"><span>P R E M I U M</span></div>', 'dim');
      sfx.gekiatsu();
      await this.sleep(1100);
    } else if (lamp >= 3) {
      this.show('<div class="cutin gold"><span>激アツ</span></div>');
      sfx.gekiatsu();
      await this.sleep(800 * k);
    } else if (lamp >= 2 || highValue) {
      this.show('<div class="cutin reach"><span>リーチ</span></div>');
      sfx.reach();
      await this.sleep(620 * k);
    }
    this.clear();
  }

  /** 正解演出 */
  async win(tier: WinTier, gain: number, anchor: HTMLElement | null, label = ''): Promise<void> {
    this.skipped = false;
    const [x, y] = this.center(anchor);
    if (!this.enabled) return;
    const full = this.full;
    const t: WinTier = full ? tier : (Math.min(tier, 1) as WinTier);
    const gainText = `+${gain.toLocaleString()}玉`;

    if (t === 0) {
      this.particles.burst(x, y, 10, 'spark', 0.7);
      sfx.coin();
      this.float(gainText, x, y);
      return;
    }
    if (t === 1) {
      this.particles.burst(x, y, full ? 36 : 14, 'coin');
      this.particles.burst(x, y, 16, 'spark');
      sfx.hit();
      sfx.coins(full ? 6 : 3, 0.5);
      this.float(gainText, x, y);
      if (label && tier >= 2) this.show(`<div class="bigtext small"><span>${label}</span></div>`);
      await this.sleep(label && tier >= 2 ? 700 : 0);
      this.clear();
      return;
    }
    if (t === 2) {
      this.pulse('flash', 450);
      this.pulse('shake', 450);
      this.show(`<div class="bigtext"><span>${label || '大当り'}</span><small>${gainText}</small></div>`, 'glow');
      this.particles.burst(x, y, 90, 'coin', 1.2);
      this.particles.burst(innerWidth / 2, innerHeight * 0.55, 70, 'confetti', 1.3);
      sfx.fanfare();
      sfx.coins(14, 1.2);
      await this.sleep(1300);
      this.clear();
      return;
    }
    // 役満・虹：フリーズ → 爆発
    this.show('', 'freeze');
    await this.sleep(550);
    this.pulse('flash', 450);
    this.pulse('shake', 700);
    this.show(`<div class="bigtext rainbow"><span>${label || '役満'}</span><small>${gainText}</small></div>`, 'rainbow-bg');
    this.particles.rain(220);
    this.particles.burst(x, y, 120, 'coin', 1.5);
    sfx.yakuman();
    await this.sleep(2300);
    this.clear();
  }

  lose(anchor: HTMLElement | null): void {
    if (!this.enabled) return;
    sfx.miss();
    if (anchor) {
      anchor.classList.remove('shake-x');
      void anchor.offsetWidth;
      anchor.classList.add('shake-x');
    }
  }

  async kakuhenStart(): Promise<void> {
    if (!this.enabled) return;
    this.skipped = false;
    sfx.kakuhen();
    this.show('<div class="banner kakuhen"><span>確変突入</span><small>玉 ×2</small></div>');
    if (this.full) this.particles.burst(innerWidth / 2, innerHeight / 2, 60, 'confetti', 1.2);
    await this.sleep(1100);
    this.clear();
  }

  kakuhenEnd(): void {
    if (!this.enabled) return;
    this.show('<div class="banner end"><span>確変終了</span></div>');
    setTimeout(() => this.clear(), 900);
  }

  lampUp(el: Element | null): void {
    if (!this.enabled || !el) return;
    sfx.lampUp();
    el.classList.remove('lamp-pop');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('lamp-pop');
  }

  float(text: string, x: number, y: number): void {
    const el = document.createElement('div');
    el.className = 'float-gain';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  sessionEnd(good: boolean): void {
    if (!this.enabled) return;
    sfx.end();
    if (good && this.full) this.particles.rain(90);
  }
}
