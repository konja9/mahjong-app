import { sfx } from '../audio';
import type { Fx } from '../effects/pachinko';
import { LAMP_NAMES } from '../effects/pachinko';
import { drawNotice } from '../effects/performance';
import type { EffectLevel } from '../effects/performance';
import { Reel } from '../effects/reel';
import { ECONOMY } from './economy';
import { MAX_HOLDS, Machine, PREMIUM_SYMBOL, type SpinResult } from './machine';

export interface PanelHooks {
  /** 発展リーチ・大当り中は回答を止める */
  onBusy(busy: boolean): void;
  /** 状態（通常/確変）が変わった・回転が終わった */
  onState(): void;
  /** 大当り：ラウンド問題（賞金タイム）が終わるまで待つ。戻り値は出玉合計と上乗せ */
  onJackpot(o: { premium: boolean }): Promise<JackpotResult>;
  /** 液晶帯のタップ（台選び） */
  onTap?(): void;
  /** 初めての人向けのガイドを出すきっかけ */
  onEvent?(e: 'enter' | 'reach' | 'jackpot' | 'rush'): void;
}

export interface JackpotResult {
  /** 出玉合計（上乗せ込み） */
  total: number;
  /** 全問正解の上乗せ。pay() で上乗せ分を所持金に入れる */
  uwanose?: { mult: number; base: number; pay: () => void };
}

/** BONUS 中に液晶帯の下段に出す表示 */
export interface BonusView {
  /** 今のラウンド（1〜rounds）。0 は大当り直後で、まだラウンド問題の前 */
  n: number;
  rounds: number;
  /** ここまでの連続正解数 */
  combo: number;
  /** 連続正解の倍率の階段 */
  ladder: number[];
  /** 符の目盛り（PREMIUM・ハイローラー込み。速答・連続は含まない） */
  cells: { key: number | string; label: string; prize: number }[];
  /** 1符あたりの yan */
  rate: number;
  /** 直前の回答で光らせるマス（正解） */
  lit?: number | string;
  /** 直前の回答で外したマス */
  miss?: number | string;
  /** 直前の正解で連続の段が上がった */
  up?: boolean;
  premium: boolean;
}

/** 画面上部の液晶帯（パチンコ台）。保留がある限り自動で回り続ける */
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
      <div class="lcd">
        <div class="m-screen"></div>
        <div class="lcd-info">
          <div class="m-head"><button class="m-spec" type="button" aria-label="台選び"></button><span class="m-state">通常</span><span class="m-st"></span><span class="m-hr">×2</span><span class="m-spins">回転 <b data-k="sinceHit">0</b></span></div>
          <div class="m-msg" aria-live="polite"></div>
          <div class="m-bottom">
            <div class="m-holds" aria-label="保留">${Array.from({ length: MAX_HOLDS }, () => '<span class="hold"></span>').join('')}</div>
            <span class="m-title"></span>
            <div class="m-chucker" title="始動口"><span></span></div>
          </div>
        </div>
      </div>
      <div class="m-bonus" hidden></div>`;
    this.reel = new Reel(root.querySelector<HTMLElement>('.m-screen')!, 'mini');
    root.querySelector('.lcd')!.addEventListener('click', () => this.hooks.onTap?.());
    this.idleSymbols();
    this.render();
  }

  get chucker(): HTMLElement {
    return this.root.querySelector<HTMLElement>('.m-chucker')!;
  }

  get stopped(): boolean {
    return this.isStopped;
  }

  /** 称号（交換所の景品） */
  setTitle(t: string): void {
    this.root.querySelector('.m-title')!.textContent = t;
  }

  /** ハイローラー中は液晶帯に ×2 を出す */
  setHighRoller(on: boolean): void {
    this.root.classList.toggle('generous', on);
  }

  /** BONUS の表示（ラウンド・連続の倍率・賞金表）。null で消す */
  bonus(v: BonusView | null): void {
    const el = this.root.querySelector<HTMLElement>('.m-bonus')!;
    this.root.classList.toggle('bonus', !!v);
    if (!v) {
      el.hidden = true;
      el.innerHTML = '';
      this.render();
      return;
    }
    const pips = Array.from({ length: v.rounds }, (_, i) => `<i class="${i < v.n ? 'on' : ''}"></i>`).join('');
    // 連続正解の階段：今の段（次に正解したときの倍率）を光らせる
    const step = Math.min(v.combo, v.ladder.length - 1);
    const ladder = v.ladder
      .map((m, i) => `<i class="${i < step ? 'past' : i === step ? `now${v.up ? ' up' : ''}` : ''}">×${m}</i>`)
      .join('<span>›</span>');
    const cells = v.cells
      .map((c) => {
        const cls = c.key === v.lit ? ' lit' : c.key === v.miss ? ' miss' : '';
        const value = c.key === v.miss ? 'パンク' : c.prize.toLocaleString();
        return `<div class="b-cell${cls}${c.key === 'yakuman' ? ' ym' : ''}"><small>${c.label}${typeof c.key === 'number' ? '<u>符</u>' : ''}</small><b>${value}</b></div>`;
      })
      .join('');
    const rate = v.rate.toFixed(2).replace(/\.?0+$/, '');
    el.innerHTML = `<div class="b-head"><span class="b-title">${v.n ? `ROUND ${v.n}/${v.rounds}` : `次の問題から ROUND 1/${v.rounds}`}</span><span class="b-pips">${pips}</span></div>
      <div class="b-ladder${v.up ? ' up' : ''}"><small>連続</small>${ladder}</div>
      <div class="b-table">${cells}</div>
      <div class="b-note">賞金 ＝ 符 × ${rate}・速答 ×${ECONOMY.fastMult}・全問正解で上乗せ</div>`;
    if (v.up && this.level() !== 'off') sfx.lampUp();
    el.hidden = false;
    this.premium = v.premium;
    // 台の表示は「BONUS」にまとめ、告知（BONUS 6R）は消す
    this.msg('', '');
    this.render();
  }

  private premium = false;

  /** BONUS の出題時の予告（2 赤・3 金・4 虹）。符が高い手ほど熱い */
  fuNotice(color: number): void {
    if (color < 2) {
      this.msg('', '');
      return;
    }
    const [text, cls] = color >= 4 ? ['激アツ!!', 'n-rainbow'] : color >= 3 ? ['高符チャンス!', 'n-gold'] : ['チャンス', 'n-red'];
    // 出題中なので画面を覆う演出は出さず、液晶帯の文字と音だけにする
    this.msg(text, cls);
    if (this.level() !== 'off') (color >= 3 ? sfx.gekiatsu : sfx.stamp)();
  }

  /** 保留も回転もない */
  get idle(): boolean {
    return !this.running && this.machine.holds.length === 0;
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
      if (t.rushEnd) this.rushEnded();
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

  private rushEnded(): void {
    this.fx.kakuhenEnd();
    this.msg('確変終了', 'end');
  }

  /** RUSH 中の不正解：ST を1回転消費する（抽選なし） */
  missSpin(): void {
    if (!this.machine.rush || this.root.classList.contains('bonus')) return;
    if (this.machine.missSpin()) {
      this.rushEnded();
      this.fx.syncRush(false);
      this.fx.rushChain(0);
      this.hooks.onState();
    } else this.msg('不正解 ST−1', 'end');
    this.render();
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
      await this.fx.jackpotIntro({ premium, rush, chain, rounds: this.machine.spec.rounds });
      if (g !== this.gen) return;
      // ラウンド問題の間は回答できるようにし、台は止めておく
      this.hooks.onBusy(false);
      this.msg(`BONUS ${this.machine.spec.rounds}R`, 'win');
      this.hooks.onEvent?.('jackpot');
      const res = await this.hooks.onJackpot({ premium });
      if (g !== this.gen) return;
      this.hooks.onBusy(true);
      const total = res.total;
      if (res.uwanose) {
        // 全問正解：リールがもう一度回って上乗せ倍率を抽選
        const u = res.uwanose;
        this.msg('全問正解!! 上乗せ', 'win');
        this.reel.spinAll();
        await this.wait(600);
        if (g !== this.gen) return;
        [0, 2, 1].forEach((i) => this.reel.stop(i, r.symbols[i]));
        this.reel.hit();
        const cands = (premium ? ECONOMY.uwanosePremium : ECONOMY.uwanose).map(([m]) => m);
        await this.fx.uwanose(u.mult, u.base, cands);
        if (g !== this.gen) return;
        u.pay();
      }
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
    const bonus = this.root.classList.contains('bonus');
    this.root.classList.toggle('rush', m.rush && !bonus);
    this.root.querySelector('.m-state')!.textContent = bonus
      ? this.premium
        ? 'PREMIUM'
        : 'BONUS'
      : m.rush
        ? `RUSH${m.data.rushChain > 1 ? ` ${m.data.rushChain}連` : ''}`
        : '通常';
    this.root.querySelector('.m-st')!.textContent = !bonus && m.rush ? `残り${m.stLeft}/${m.spec.st}` : '';
    const holds = this.root.querySelectorAll<HTMLElement>('.hold');
    holds.forEach((h, i) => {
      const hold = m.holds[i];
      h.className = `hold${hold ? ` on ${LAMP_NAMES[hold.color]}` : ''}`;
    });
    if (pop && m.holds.length) holds[m.holds.length - 1]?.classList.add('lamp-pop');
    this.root.querySelector('[data-k="sinceHit"]')!.textContent = String(m.data.sinceHit);
    this.root.querySelector('.m-spec')!.textContent = `${m.spec.name} ▾`;
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
    this.bonus(null);
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
