import { sfx } from '../audio';
import type { Fx } from '../effects/pachinko';
import { LAMP_NAMES } from '../effects/pachinko';
import { drawNotice } from '../effects/performance';
import type { EffectLevel } from '../effects/performance';
import { Reel } from '../effects/reel';
import { ECONOMY } from './economy';
import { MAX_HOLDS, Machine, PREMIUM_SYMBOL, ST_SPINS, type SpinResult } from './machine';

export interface PanelHooks {
  /** 発展リーチ・大当り中は回答を止める */
  onBusy(busy: boolean): void;
  /** 状態（通常/確変）が変わった・回転が終わった */
  onState(): void;
  /** 大当り：ラウンド問題（賞金タイム）が終わるまで待つ。戻り値は出玉合計 */
  onJackpot(o: { premium: boolean }): Promise<number>;
  /** ハイローラーボタン */
  onHighRoller(): void;
  /** 精算ボタン */
  onCashout(): void;
  /** 初めての人向けのガイドを出すきっかけ */
  onEvent?(e: 'enter' | 'reach' | 'jackpot' | 'rush'): void;
}

/** 常時表示のパチンコ台パネル。保留がある限り自動で回り続ける */
export class MachinePanel {
  readonly machine: Machine;
  private reel: Reel;
  private running = false;
  private isStopped = false;
  private gen = 0;
  private timers: number[] = [];

  constructor(
    private root: HTMLElement,
    private fx: Fx,
    private level: () => EffectLevel,
    private hooks: PanelHooks,
  ) {
    this.machine = new Machine(level);
    root.innerHTML = `
      <div class="m-head"><span class="m-state">通常</span><span class="m-st"></span></div>
      <div class="m-screen"></div>
      <button class="m-generous" type="button" aria-pressed="false"><span class="g-label">ハイローラー<small>BET×2・出玉×2.5</small></span><span class="g-state">OFF</span></button>
      <div class="m-msg" aria-live="polite"></div>
      <div class="m-bottom">
        <div class="m-holds">${Array.from({ length: MAX_HOLDS }, () => '<span class="hold"></span>').join('')}</div>
        <div class="m-chucker" title="始動口"><span></span></div>
      </div>
      <div class="m-data">
        <div><small>回転</small><b data-k="sinceHit">0</b></div>
        <div><small>大当り</small><b data-k="hits">0</b></div>
        <div><small>最大RUSH</small><b data-k="maxChain">0</b></div>
      </div>
      <div class="m-log" aria-label="大当り履歴"></div>
      <div class="m-slump" aria-label="スランプグラフ"></div>
      <button class="m-cashout" type="button">精算</button>`;
    root.querySelector('.m-generous')!.addEventListener('click', (e) => {
      e.stopPropagation();
      hooks.onHighRoller();
    });
    root.querySelector('.m-cashout')!.addEventListener('click', (e) => {
      e.stopPropagation();
      hooks.onCashout();
    });
    this.reel = new Reel(root.querySelector<HTMLElement>('.m-screen')!, 'mini');
    this.idleSymbols();
    this.render();
  }

  get chucker(): HTMLElement {
    return this.root.querySelector<HTMLElement>('.m-chucker')!;
  }

  get stopped(): boolean {
    return this.isStopped;
  }

  setHighRoller(on: boolean): void {
    this.root.classList.toggle('generous', on);
    const b = this.root.querySelector<HTMLElement>('.m-generous')!;
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('.g-state')!.textContent = on ? 'ON' : 'OFF';
  }

  /** 役満直撃：次の回転を確変大当り確定にする */
  direct(): void {
    this.machine.holds.unshift({ hit: true, kakuhen: true, color: 4 });
    this.machine.holds = this.machine.holds.slice(0, MAX_HOLDS);
    this.msg('役満直撃!!', 'win');
    this.render(true);
    this.kick();
  }

  /** ラウンド中の表示 */
  roundStatus(text: string): void {
    this.msg(text, 'win');
  }

  /** 保留も回転もない */
  get idle(): boolean {
    return !this.running && this.machine.holds.length === 0;
  }

  /** スランプグラフの描画先 */
  get slumpEl(): HTMLElement {
    return this.root.querySelector<HTMLElement>('.m-slump')!;
  }

  get rush(): boolean {
    return this.machine.rush;
  }

  private idleSymbols(): void {
    [0, 1, 2].forEach((i) => this.reel.stop(i, Reel.randomSymbol()));
  }

  /** 正解：玉が始動口に入る。n=2 なら電チュー開放 */
  async enter(n: number, from: HTMLElement | null): Promise<void> {
    const g = this.gen;
    await this.fx.ball(from, this.chucker);
    if (g !== this.gen) return;
    const added = this.machine.enter(n);
    // チューリップが開く
    this.chucker.classList.add('open');
    this.timers.push(window.setTimeout(() => this.chucker.classList.remove('open'), n > 1 ? 900 : 350));
    if (n > 1) this.msg('電チュー開放!', 'denchu');
    else if (!added) this.msg('保留MAX', '');
    if (added) this.hooks.onEvent?.('enter');
    this.render(true);
    this.kick();
  }

  private kick(): void {
    if (this.running || this.isStopped) return;
    this.running = true;
    void this.loop(this.gen);
  }

  private async loop(g: number): Promise<void> {
    while (g === this.gen && this.machine.holds.length) {
      const r = this.machine.spin();
      if (!r) break;
      this.render();
      await this.run(r, g);
      if (g !== this.gen) return;
      const t = this.machine.settle(r);
      if (t.rushStart) this.hooks.onEvent?.('rush');
      if (t.rushEnd) {
        this.fx.kakuhenEnd();
        this.msg('確変終了', 'end');
      }
      this.fx.syncRush(this.machine.rush);
      this.fx.rushChain(this.machine.data.rushChain);
      this.hooks.onState();
      this.render();
      await this.wait(500);
    }
    if (g === this.gen) {
      this.running = false;
      this.hooks.onState();
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((res) => this.timers.push(window.setTimeout(res, ms)));
  }

  private async run(r: SpinResult, g: number): Promise<void> {
    const full = this.level() === 'max';
    const fast = this.machine.rush ? 0.7 : 1;
    this.root.classList.remove('reach', 'hot', 'win');
    this.msg('', '');
    // 回転開始時の予告（先読み）
    if (r.reach || r.color >= 2) this.fx.notice(drawNotice(r.color, 0, r.rush, this.level()), r.color);

    this.reel.spinAll();
    const tick = window.setInterval(() => sfx.reelTick(), 90);
    this.timers.push(tick);
    await this.wait(1300 * fast);
    if (g !== this.gen) return;
    this.reel.stop(0, r.symbols[0]);
    sfx.reelStop(0);
    await this.wait(520 * fast);
    if (g !== this.gen) return;
    this.reel.stop(2, r.symbols[2]);
    sfx.reelStop(2);

    if (!r.reach) {
      await this.wait(480 * fast);
      this.reel.stop(1, r.symbols[1]);
      sfx.reelStop(1);
      clearInterval(tick);
      return;
    }

    // リーチ
    this.root.classList.add('reach');
    const hot = r.plan.cutin === 'gold' || r.plan.cutin === 'zebra' || r.plan.cutin === 'rainbow';
    if (hot) this.root.classList.add('hot');
    this.msg(hot ? '激アツ!!' : 'リーチ!', hot ? 'hot' : 'reach');
    this.hooks.onEvent?.('reach');
    this.reel.slow(1);
    const developed = full && (hot || r.plan.push !== 'none' || r.plan.pseudo > 0 || r.hit);
    if (developed) {
      clearInterval(tick);
      this.msg('発展!!', 'hot');
      await this.wait(800);
      if (g !== this.gen) return;
      this.hooks.onBusy(true);
      await this.fx.suspense(r.plan, r.symbols);
      if (g !== this.gen) return;
    } else {
      if (this.level() !== 'off') (hot ? sfx.gekiatsu : sfx.reach)();
      await this.wait(3000 * fast);
      if (g !== this.gen) return;
      clearInterval(tick);
    }
    this.reel.stop(1, r.symbols[1]);
    sfx.reelStop(1);

    if (r.hit) {
      this.root.classList.add('win');
      this.reel.hit();
      this.msg(r.kakuhen ? '確変大当り' : '大当り', 'win');
      if (!developed) this.hooks.onBusy(true);
      const premium = r.symbols[0] === PREMIUM_SYMBOL;
      const rush = this.machine.rush;
      const chain = this.machine.data.rushChain;
      await this.fx.jackpotIntro({ premium, rush, chain, rounds: ECONOMY.rounds });
      if (g !== this.gen) return;
      // ラウンド問題の間は回答できるようにし、台は止めておく
      this.hooks.onBusy(false);
      this.msg(`BONUS ${ECONOMY.rounds}R`, 'win');
      this.hooks.onEvent?.('jackpot');
      const total = await this.hooks.onJackpot({ premium });
      if (g !== this.gen) return;
      this.hooks.onBusy(true);
      await this.fx.jackpotOutro({
        kakuhen: r.kakuhen,
        premium,
        rush,
        chain: r.kakuhen ? (rush ? chain + 1 : 1) : 0,
        total,
      });
      if (g !== this.gen) return;
      this.msg(total ? `出玉 +${total.toLocaleString()}` : '', 'win');
      this.hooks.onBusy(false);
    } else {
      if (developed) this.hooks.onBusy(false);
      this.msg('', '');
    }
    this.root.classList.remove('reach', 'hot');
  }

  private msg(text: string, cls: string): void {
    const el = this.root.querySelector<HTMLElement>('.m-msg')!;
    el.className = `m-msg ${cls}`;
    el.textContent = text;
  }

  render(pop = false): void {
    const m = this.machine;
    this.root.classList.toggle('rush', m.rush);
    this.root.querySelector('.m-state')!.textContent = m.rush ? `RUSH${m.data.rushChain > 1 ? ` ${m.data.rushChain}連` : ''}` : '通常';
    this.root.querySelector('.m-st')!.textContent = m.rush ? `残り ${m.stLeft}/${ST_SPINS}` : '';
    const holds = this.root.querySelectorAll<HTMLElement>('.hold');
    holds.forEach((h, i) => {
      const hold = m.holds[i];
      h.className = `hold${hold ? ` on ${LAMP_NAMES[hold.color]}` : ''}`;
    });
    if (pop && m.holds.length) holds[m.holds.length - 1]?.classList.add('lamp-pop');
    for (const k of ['sinceHit', 'hits', 'maxChain'] as const) {
      const el = this.root.querySelector(`[data-k="${k}"]`);
      if (el) el.textContent = String(m.data[k]);
    }
    this.root.querySelector('.m-log')!.innerHTML = m.data.log
      .map(
        (h) =>
          `<span class="hit${h.kakuhen ? ' k' : ''}${h.premium ? ' p' : ''}" title="${h.at}回転で${h.kakuhen ? '確変' : '通常'}大当り">${h.at}</span>`,
      )
      .join('');
  }

  /** セッション開始時にリセット */
  reset(): void {
    this.gen++;
    this.timers.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    });
    this.timers = [];
    this.running = false;
    this.isStopped = false;
    this.machine.reset();
    this.root.classList.remove('reach', 'hot', 'win', 'rush');
    this.msg('', '');
    this.idleSymbols();
    this.render();
    this.hooks.onBusy(false);
  }

  /** プラクティスへ切り替えたときなどに停止 */
  stop(): void {
    this.reset();
    this.isStopped = true;
  }
}
