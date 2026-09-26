/**
 * 台（機種）の定義。甘デジは最初から遊べ、ミドル・MAX は yan で解放する。
 * 上の台ほど大当りは重いが、ラウンドが長く賞金が大きい（振れ幅が大きい）。
 * 賞金倍率は tests/economy.test.ts のシミュレーションで、中級者の回収率がどの台でもほぼ100%になるよう決めた
 */
export type MachineId = 'ama' | 'middle' | 'max';

export interface MachineSpec {
  id: MachineId;
  name: string;
  /** 通常時の大当り確率 1/odds */
  odds: number;
  /** RUSH 中の大当り確率 1/rushOdds */
  rushOdds: number;
  /** RUSH（ST）の回転数 */
  st: number;
  /** 大当りのうち確変になる割合 */
  kakuhenRate: number;
  /** 1回の大当りのラウンド数（ラウンド問題の数） */
  rounds: number;
  /** ラウンド賞金の倍率 */
  prizeMult: number;
  /** BET の倍率 */
  betMult: number;
  /** 解放価格（0 は最初から） */
  price: number;
  /** 出題を実戦に限る */
  jissenOnly: boolean;
}

export const SPECS: Record<MachineId, MachineSpec> = {
  ama: { id: 'ama', name: '甘デジ', odds: 20, rushOdds: 3, st: 8, kakuhenRate: 0.6, rounds: 6, prizeMult: 1, betMult: 1, price: 0, jissenOnly: false },
  middle: { id: 'middle', name: 'ミドル', odds: 60, rushOdds: 4, st: 10, kakuhenRate: 0.6, rounds: 10, prizeMult: 2.56, betMult: 1.5, price: 8000, jissenOnly: true },
  max: { id: 'max', name: 'MAX', odds: 150, rushOdds: 5, st: 12, kakuhenRate: 0.6, rounds: 15, prizeMult: 6.65, betMult: 2, price: 30000, jissenOnly: true },
};

export const MACHINE_IDS: MachineId[] = ['ama', 'middle', 'max'];
