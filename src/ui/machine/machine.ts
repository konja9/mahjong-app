/**
 * パチンコ台の抽選エンジン（DOM 非依存）。
 * 正解＝始動口入賞で保留が増え、保留を消化するたびに抽選する。
 * 抽選結果は入賞時に確定し（先読み）、保留の色と演出はその結果から決める。
 */
import { type EffectLevel, type Rng, type Suspense, drawSuspense } from '../effects/performance';

export const NORMAL_ODDS = 8; // 通常時 1/8
export const RUSH_ODDS = 2; // 確変（ST）中 1/2
export const ST_SPINS = 8; // 確変の回転数
export const KAKUHEN_RATE = 0.6; // 大当りのうち確変になる割合
export const MAX_HOLDS = 4;

/**
 * 図柄 index 0〜8 は 1〜9、9〜11 は白發中（src/ui/effects/reel.ts の SYMBOLS と対応）。
 * 奇数と白發中が確変図柄。index 4（赤5筒）が PREMIUM。
 */
export const SYMBOL_COUNT = 12;
export const isKakuhenSymbol = (sym: number): boolean => sym >= 9 || sym % 2 === 0;
export const PREMIUM_SYMBOL = 4;

export interface Hold {
  hit: boolean;
  /** 当りのとき確変になるか */
  kakuhen: boolean;
  /** 保留の色 0:青 1:緑 2:赤 3:金 4:虹 */
  color: number;
}

export interface SpinResult extends Hold {
  plan: Suspense;
  /** 停止図柄 [左, 中, 右] */
  symbols: [number, number, number];
  reach: boolean;
  /** 回転時の状態 */
  rush: boolean;
}

export interface HitRecord {
  /** 前回の大当りから何回転目で当ったか */
  at: number;
  kakuhen: boolean;
  premium: boolean;
}

export interface MachineData {
  spins: number;
  /** 前回の大当りからの回転数 */
  sinceHit: number;
  /** 直近の大当り履歴（新しい順、最大5件） */
  log: HitRecord[];
  hits: number;
  rushChain: number;
  maxChain: number;
  rushEntries: number;
}

const freshData = (): MachineData => ({
  spins: 0,
  sinceHit: 0,
  log: [],
  hits: 0,
  rushChain: 0,
  maxChain: 0,
  rushEntries: 0,
});

function weighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r < 0) return v;
  }
  return entries[entries.length - 1][0];
}

export class Machine {
  holds: Hold[] = [];
  rush = false;
  stLeft = 0;
  data: MachineData = freshData();

  constructor(
    private level: () => EffectLevel = () => 'max',
    private rng: Rng = Math.random,
  ) {}

  /** 入賞。追加できた保留の数を返す */
  enter(n = 1): number {
    let added = 0;
    for (let i = 0; i < n && this.holds.length < MAX_HOLDS; i++) {
      this.holds.push(this.draw());
      added++;
    }
    return added;
  }

  private draw(): Hold {
    const odds = this.rush ? RUSH_ODDS : NORMAL_ODDS;
    const hit = this.rng() < 1 / odds;
    const kakuhen = hit && this.rng() < KAKUHEN_RATE;
    // 先読み：当りほど熱い色。虹は当りのみ
    const color = hit
      ? weighted(this.rng, [[0, 18], [1, 22], [2, 26], [3, 22], [4, 12]] as const)
      : weighted(this.rng, [[0, 72], [1, 19], [2, 8], [3, 1]] as const);
    return { hit, kakuhen, color };
  }

  /** 保留を1つ消化して回転する。保留がなければ null */
  spin(): SpinResult | null {
    const hold = this.holds.shift();
    if (!hold) return null;
    this.data.spins++;
    this.data.sinceHit++;
    let plan = drawSuspense({
      correct: hold.hit,
      lamp: hold.color,
      highValue: false,
      streak: 0,
      kakuhen: this.rush,
      level: this.level(),
    });
    // 当りは必ずリーチを経由する
    if (hold.hit && plan.kind === 'quick') plan = { ...plan, kind: this.level() === 'max' ? 'reel' : 'cutin' };
    const reach = plan.kind !== 'quick';

    let symbols: [number, number, number];
    if (hold.hit) {
      const pool = Array.from({ length: SYMBOL_COUNT }, (_, i) => i).filter((s) => isKakuhenSymbol(s) === hold.kakuhen);
      const s = pool[Math.floor(this.rng() * pool.length)];
      symbols = [s, s, s];
    } else if (reach) {
      const s = Math.floor(this.rng() * SYMBOL_COUNT);
      symbols = [s, (s + (this.rng() < 0.5 ? 1 : SYMBOL_COUNT - 1)) % SYMBOL_COUNT, s];
    } else {
      const l = Math.floor(this.rng() * SYMBOL_COUNT);
      let r = Math.floor(this.rng() * SYMBOL_COUNT);
      if (r === l) r = (r + 1 + Math.floor(this.rng() * (SYMBOL_COUNT - 2))) % SYMBOL_COUNT;
      symbols = [l, Math.floor(this.rng() * SYMBOL_COUNT), r];
    }
    return { ...hold, plan, symbols, reach, rush: this.rush };
  }

  /** 回転終了時の状態遷移。確変が終わったら true */
  settle(r: SpinResult): { rushStart: boolean; rushEnd: boolean } {
    if (r.hit) {
      this.data.hits++;
      this.data.log = [
        { at: this.data.sinceHit, kakuhen: r.kakuhen, premium: r.symbols[0] === PREMIUM_SYMBOL },
        ...this.data.log,
      ].slice(0, 5);
      this.data.sinceHit = 0;
      const wasRush = this.rush;
      if (r.kakuhen) {
        this.rush = true;
        this.stLeft = ST_SPINS;
        this.data.rushChain = wasRush ? this.data.rushChain + 1 : 1;
        this.data.maxChain = Math.max(this.data.maxChain, this.data.rushChain);
        if (!wasRush) this.data.rushEntries++;
        this.rerollHolds();
        return { rushStart: !wasRush, rushEnd: false };
      }
      // 通常大当り：確変は終了
      this.rush = false;
      this.stLeft = 0;
      this.data.rushChain = 0;
      this.rerollHolds();
      return { rushStart: false, rushEnd: wasRush };
    }
    if (this.rush) {
      this.stLeft--;
      if (this.stLeft <= 0) {
        this.rush = false;
        this.data.rushChain = 0;
        this.rerollHolds();
        return { rushStart: false, rushEnd: true };
      }
    }
    return { rushStart: false, rushEnd: false };
  }

  /** 状態が変わったら残りの保留を新しい確率で引き直す */
  private rerollHolds(): void {
    this.holds = this.holds.map(() => this.draw());
  }

  reset(): void {
    this.holds = [];
    this.rush = false;
    this.stLeft = 0;
    this.data = freshData();
  }
}
