import { bgm, sfx } from '../audio';
import { tileSvg } from '../tileView';
import { Particles } from './particles';
import type { Cutin, EffectLevel, Notice, Suspense, WinTier } from './performance';
import { Reel } from './reel';

export type { WinTier } from './performance';

/** 保留ランプの色（0:青 1:緑 2:赤 3:金 4:虹）。色は演出の期待度を表すだけ */
export const LAMP_NAMES = ['blue', 'green', 'red', 'gold', 'rainbow'] as const;

const CUTIN_TEXT: Record<Cutin, string> = {
  none: 'リーチ',
  reach: 'リーチ!',
  gold: '激アツ',
  zebra: '超激アツ',
  rainbow: '確定!!',
};

export class Fx {
  private particles: Particles;
  private pending: (() => void)[] = [];
  private skipped = false;
  private pushResolve: (() => void) | null = null;
  private tickTimer = 0;
  private ambientTimer = 0;

  constructor(
    private overlay: HTMLElement,
    private noticeLayer: HTMLElement,
    private comboEl: HTMLElement,
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

  get awaitingPush(): boolean {
    return this.pushResolve !== null;
  }

  // ------------------------------------------------------------ 基本操作

  /** 実行中の演出をすべて飛ばす */
  skip(): void {
    this.skipped = true;
    this.pressPush(true);
    const p = this.pending;
    this.pending = [];
    p.forEach((f) => f());
    this.stopTick();
    this.clear();
  }

  /** オーバーレイのクリック・キー入力：PUSH 待ちなら押す、それ以外は飛ばす */
  tap(): void {
    if (this.awaitingPush) this.pressPush();
    else this.skip();
  }

  pressPush(silent = false): void {
    const r = this.pushResolve;
    if (!r) return;
    this.pushResolve = null;
    if (!silent) sfx.push();
    r();
  }

  private sleep(ms: number): Promise<void> {
    if (this.skipped) return Promise.resolve();
    return new Promise((res) => {
      const done = () => {
        clearTimeout(id);
        this.pending = this.pending.filter((f) => f !== done);
        res();
      };
      const id = setTimeout(done, ms);
      this.pending.push(done);
    });
  }

  private waitPush(ms: number): Promise<void> {
    if (this.skipped) return Promise.resolve();
    return new Promise((res) => {
      const id = setTimeout(() => this.pressPush(), ms);
      this.pushResolve = () => {
        clearTimeout(id);
        res();
      };
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

  private pulse(cls: string, ms: number, el: HTMLElement = this.root): void {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  /** 画面フラッシュ。光過敏対策で 2Hz 以下・最大3回 */
  private flash(times: number): void {
    for (let i = 0; i < Math.min(times, 3); i++) setTimeout(() => this.pulse('flash', 450), i * 500);
  }

  private center(el?: HTMLElement | null): [number, number] {
    if (!el) return [innerWidth / 2, innerHeight / 2];
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  private stopTick(): void {
    clearInterval(this.tickTimer);
    this.tickTimer = 0;
  }

  // ------------------------------------------------------------ 予告

  notice(kind: Notice, lamp: number): void {
    if (kind === 'none' || !this.enabled) return;
    const layer = this.noticeLayer;
    if (kind === 'text') {
      const [text, cls] = lamp >= 3 ? ['激アツ!!', 'gold'] : lamp >= 2 ? ['チャンス!', 'red'] : ['!?', 'plain'];
      const el = document.createElement('div');
      el.className = `stamp ${cls}`;
      el.textContent = text;
      el.style.left = `${55 + Math.random() * 25}%`;
      el.style.top = `${18 + Math.random() * 20}%`;
      layer.appendChild(el);
      sfx.stamp();
      setTimeout(() => el.remove(), 1000);
      return;
    }
    if (kind === 'swarm') {
      const wrap = document.createElement('div');
      wrap.className = `swarm${lamp >= 3 ? ' gold' : ''}`;
      wrap.innerHTML = Array.from({ length: 18 }, (_, i) => {
        const t = Math.floor(Math.random() * 34);
        return `<div class="swarm-tile" style="top:${5 + Math.random() * 85}%;animation-delay:${i * 30}ms;--s:${0.7 + Math.random() * 0.8}">${tileSvg(t)}</div>`;
      }).join('');
      layer.appendChild(wrap);
      sfx.swarm();
      setTimeout(() => wrap.remove(), 1500);
      return;
    }
    // ステップアップ
    const steps = Math.min(5, 1 + lamp + (Math.random() < 0.3 ? 1 : 0));
    const frame = document.createElement('div');
    frame.className = 'stepup';
    layer.appendChild(frame);
    for (let k = 1; k <= steps; k++) {
      setTimeout(() => {
        frame.className = `stepup step-${k}`;
        frame.innerHTML = `<span>STEP ${k}</span>`;
        sfx.step(k);
      }, (k - 1) * 170);
    }
    setTimeout(() => frame.remove(), steps * 170 + 450);
  }

  // ------------------------------------------------------------ 溜め

  async suspense(plan: Suspense): Promise<void> {
    this.skipped = false;
    if (!this.enabled || plan.kind === 'quick') return;

    if (plan.kind === 'cutin') {
      const cls = plan.cutin === 'none' ? 'reach' : plan.cutin;
      this.show(`<div class="cutin ${cls}"><span>${CUTIN_TEXT[plan.cutin]}</span></div>`);
      if (plan.cutin === 'gold' || plan.cutin === 'zebra' || plan.cutin === 'rainbow') sfx.gekiatsu();
      else sfx.reach();
      await this.sleep(plan.cutin === 'rainbow' ? 800 : 600);
      this.clear();
      return;
    }

    // 図柄リール
    this.show('', 'dim reel-mode');
    const reel = new Reel(this.overlay);
    reel.spinAll();
    this.tickTimer = window.setInterval(() => sfx.reelTick(), 70);
    await this.sleep(420);

    for (let p = 1; p <= plan.pseudo && !this.skipped; p++) {
      const syms = [0, 1, 2].map(() => Reel.randomSymbol());
      if (syms[0] === syms[2]) syms[2] = (syms[2] + 3) % 9;
      for (const i of [0, 2, 1]) {
        reel.stop(i, syms[i]);
        sfx.reelStop(i);
        await this.sleep(80);
      }
      await this.sleep(180);
      reel.title(`擬似${p + 1}`, 'pseudo');
      sfx.gyuin();
      this.pulse('shake', 350);
      reel.spinAll();
      await this.sleep(520);
    }
    if (this.skipped) return;

    const sym = Reel.randomSymbol();
    reel.stop(0, sym);
    sfx.reelStop(0);
    await this.sleep(260);
    reel.stop(2, sym);
    sfx.reelStop(2);
    reel.slow(1);

    // リーチ成立
    reel.setClass(`cut-${plan.cutin}`);
    reel.title(CUTIN_TEXT[plan.cutin], `t-${plan.cutin}`);
    const hot = plan.cutin === 'gold' || plan.cutin === 'zebra' || plan.cutin === 'rainbow';
    if (hot) {
      sfx.gekiatsu();
      this.pulse('shake', 400);
      if (plan.cutin !== 'gold') this.particles.burst(innerWidth / 2, innerHeight / 2, 50, 'spark', 1.4);
    } else sfx.reach();
    await this.sleep(hot ? 950 : 700);

    if (plan.push !== 'none' && !this.skipped) {
      reel.sub(`<button class="push-btn ${plan.push}" type="button">PUSH!!</button>`);
      sfx.pushAppear();
      await this.waitPush(2200);
      reel.sub('');
      this.pulse('punch', 200);
      await this.sleep(220);
    } else {
      await this.sleep(420);
    }
    if (this.skipped) return;

    const final = plan.hit ? sym : (sym + (Math.random() < 0.5 ? 1 : 8)) % 9;
    reel.stop(1, final);
    sfx.reelStop(1);
    this.stopTick();
    if (plan.hit) {
      reel.hit();
      reel.title('当り', 't-hit');
      sfx.align();
      await this.sleep(520);
    } else {
      reel.title('', '');
      await this.sleep(420);
    }
    this.clear();
  }

  // ------------------------------------------------------------ 当たり

  /** すべての正解で鳴るヒット（連チャン数で音程が上がる） */
  hit(streak: number, anchor: HTMLElement | null): void {
    if (!this.enabled) return;
    const [x, y] = this.center(anchor);
    sfx.comboHit(streak);
    this.particles.burst(x, y, this.full ? 18 : 8, 'spark', 0.9);
    if (anchor) this.pulse('pop', 300, anchor);
    if (this.full) this.pulse('punch', 180);
  }

  async win(tier: WinTier, label: string, anchor: HTMLElement | null): Promise<void> {
    this.skipped = false;
    if (!this.enabled || tier === 0) return;
    const [x, y] = this.center(anchor);
    const t: WinTier = this.full ? tier : 1;

    if (t === 1) {
      this.show(`<div class="bigtext chroma small"><span>${label || '当り'}</span></div>`, this.full ? 'rays' : '');
      this.particles.burst(x, y, this.full ? 50 : 15, 'coin');
      if (this.full) this.particles.burst(innerWidth / 2, innerHeight * 0.5, 40, 'confetti');
      this.flash(1);
      sfx.hit();
      sfx.coins(this.full ? 8 : 3, 0.6);
      await this.sleep(this.full ? 900 : 500);
      this.clear();
      return;
    }

    if (t === 2) {
      this.show('', 'freeze-dim');
      await this.sleep(280);
      sfx.shatter();
      this.particles.shatter(innerWidth / 2, innerHeight / 2);
      this.pulse('shake', 600);
      this.show(
        `${CRACK_SVG}<div class="bigtext chroma spin-in"><span>${label || '大当り'}</span></div>`,
        'rays gold-rays',
      );
      this.particles.burst(x, y, 110, 'coin', 1.3);
      this.particles.burst(innerWidth / 2, innerHeight * 0.55, 100, 'confetti', 1.4);
      this.flash(3);
      sfx.fanfare();
      sfx.coins(16, 1.4);
      await this.sleep(1900);
      this.clear();
      return;
    }

    // 役満・虹：暗転して無音 → 爆発
    this.show('<div class="blackout-text">・・・</div>', 'blackout');
    await this.sleep(750);
    sfx.shatter();
    this.particles.shatter(innerWidth / 2, innerHeight / 2, 110);
    this.pulse('shake', 900);
    this.show(`<div class="bigtext rainbow spin-in"><span>${label || '確定'}</span></div>`, 'rays rainbow-rays');
    this.particles.tileRain(90);
    this.particles.rain(140);
    this.flash(3);
    sfx.yakuman();
    await this.sleep(2600);
    this.clear();
  }

  // ------------------------------------------------------------ 外れ

  lose(anchor: HTMLElement | null, wasKakuhen: boolean): void {
    if (!this.enabled) return;
    if (wasKakuhen) this.kakuhenEnd();
    else sfx.glitch();
    this.pulse('glitch', 360);
    if (anchor) this.pulse('shake-x', 350, anchor);
  }

  // ------------------------------------------------------------ 連チャン

  combo(streak: number): void {
    const el = this.comboEl;
    if (streak < 2) {
      el.className = '';
      el.innerHTML = '';
      return;
    }
    const tier = streak >= 20 ? ' god' : streak >= 10 ? ' fire' : streak >= 5 ? ' hot' : '';
    el.innerHTML = `<span class="n">${streak}</span><span class="t">COMBO</span>`;
    el.className = `show${tier}`;
    if (this.enabled) this.pulse('bump', 300, el);
  }

  async kakuhenStart(): Promise<void> {
    this.root.classList.add('kakuhen');
    if (!this.enabled) return;
    this.skipped = false;
    sfx.kakuhen();
    if (this.full) bgm.start(150);
    this.show('<div class="banner kakuhen"><span>確変突入</span><small>KAKUHEN RUSH</small></div>', this.full ? 'rays' : '');
    if (this.full) this.particles.burst(innerWidth / 2, innerHeight / 2, 80, 'confetti', 1.3);
    await this.sleep(1200);
    this.clear();
  }

  /** 連チャンの節目（10連で超確変、20連ごとに神） */
  async milestone(streak: number): Promise<void> {
    if (!this.enabled) return;
    this.skipped = false;
    if (streak === 10) {
      this.root.classList.add('chou');
      if (this.full) {
        bgm.setTempo(178);
        this.startAmbient();
      }
      sfx.gekiatsu();
      this.show('<div class="banner chou"><span>超確変</span><small>10 COMBO</small></div>', this.full ? 'rays rainbow-rays' : '');
      this.particles.tileRain(this.full ? 40 : 10);
      await this.sleep(1300);
      this.clear();
    } else if (streak >= 20 && streak % 10 === 0) {
      this.root.classList.add('god');
      sfx.god();
      this.show(`<div class="bigtext rainbow spin-in"><span>神</span><small>${streak} COMBO</small></div>`, 'rays rainbow-rays');
      this.particles.tileRain(this.full ? 120 : 20);
      this.flash(2);
      await this.sleep(1800);
      this.clear();
    }
  }

  kakuhenEnd(): void {
    bgm.stop();
    this.stopAmbient();
    this.root.classList.remove('kakuhen', 'chou', 'god');
    if (!this.enabled) return;
    sfx.kakuhenEnd();
    this.show('<div class="banner end"><span>確変終了</span></div>');
    setTimeout(() => {
      if (this.overlay.querySelector('.banner.end')) this.clear();
    }, 1100);
  }

  private startAmbient(): void {
    if (this.ambientTimer) return;
    this.ambientTimer = window.setInterval(() => this.particles.ambient(), 420);
  }

  private stopAmbient(): void {
    clearInterval(this.ambientTimer);
    this.ambientTimer = 0;
  }

  /** セッション開始時に演出状態をリセット */
  reset(): void {
    this.skip();
    bgm.stop();
    this.stopAmbient();
    this.root.classList.remove('kakuhen', 'chou', 'god');
    this.combo(0);
    this.particles.clear();
  }

  lampUp(el: Element | null): void {
    if (!this.enabled || !el) return;
    sfx.lampUp();
    const [x, y] = this.center(el as HTMLElement);
    this.particles.burst(x, y, 16, 'spark', 0.6);
    this.pulse('lamp-pop', 520, el as HTMLElement);
  }

  sessionEnd(good: boolean): void {
    bgm.stop();
    this.stopAmbient();
    if (!this.enabled) return;
    sfx.end();
    if (good && this.full) this.particles.tileRain(60);
  }
}

/** ガラスのひび（中央から放射状） */
const CRACK_SVG = `<svg class="crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <g fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="0.35">
    <path d="M50 50 L20 5 M50 50 L3 30 M50 50 L0 62 M50 50 L18 97 M50 50 L46 100 M50 50 L78 96 M50 50 L100 70 M50 50 L97 34 M50 50 L82 2 M50 50 L55 0"/>
    <path d="M38 32 L30 44 L36 58 L47 66 L62 64 L70 52 L66 38 L56 30 Z"/>
    <path d="M28 18 L12 40 L16 70 L34 86 L64 88 L86 70 L90 40 L72 14 Z" stroke-width="0.25"/>
  </g>
</svg>`;
