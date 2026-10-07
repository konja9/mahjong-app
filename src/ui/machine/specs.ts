/**
 * 台（機種）の定義。甘デジは最初から遊べ、ミドル・MAX は yan で解放する。
 * 上の台ほど大当りは重いが、ラウンドが長く賞金が大きい（振れ幅が大きい）。
 * 賞金倍率は tests/economy.test.ts のシミュレーションで、中級者の回収率がどの台でもほぼ100%になるよう決めた
 */
import type { Mode } from '../../core/generator';

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
  /** 種目ごとの賞金の補正（ない種目は ×1）。ミドルの符計算は実戦より稼げるので抑え、甘デジと MAX の間に置く */
  modePrize?: Partial<Record<Mode, number>>;
  /** BET の倍率 */
  betMult: number;
  /** 解放価格（0 は最初から） */
  price: number;
  /** その台で出せる種目（上の台ほど難しい種目に限る） */
  modes: Mode[];
  /** 台選びに出す世界観の一言 */
  flavor: string;
}

export const SPECS: Record<MachineId, MachineSpec> = {
  ama: { id: 'ama', name: '甘デジ', odds: 20, rushOdds: 4, st: 6, kakuhenRate: 0.6, rounds: 6, prizeMult: 1, betMult: 1, price: 0, modes: ['hayami', 'fu', 'jissen'], flavor: '新顔の登竜門。負けても笑って帰れた、あの頃の名残' },
  middle: { id: 'middle', name: 'ミドル', odds: 60, rushOdds: 6, st: 9, kakuhenRate: 0.6, rounds: 10, prizeMult: 2.89, modePrize: { fu: 0.92 }, betMult: 1.5, price: 3000, modes: ['fu', 'jissen'], flavor: '常連たちの主戦場。勝負の重みは、ここから一段上がる' },
  max: { id: 'max', name: 'MAX', odds: 150, rushOdds: 8, st: 12, kakuhenRate: 0.6, rounds: 15, prizeMult: 6.72, betMult: 2, price: 10000, modes: ['jissen'], flavor: 'ギャンブル王の椅子に一番近い台。座った者の半分は帰ってこない' },
};

export const MACHINE_IDS: MachineId[] = ['ama', 'middle', 'max'];

/** その台で出せる種目か */
export const allows = (spec: MachineSpec, mode: Mode): boolean => spec.modes.includes(mode);

/** 出せない種目なら、その台で出せる最初の種目に替える（ミドルで早見なら符計算） */
export const fallbackMode = (spec: MachineSpec, mode: Mode): Mode => (allows(spec, mode) ? mode : spec.modes[0]);

const MODE_NAME: Record<Mode, string> = { hayami: '早見', fu: '符計算', jissen: '実戦' };

/** 台で出せる種目の名前（「符計算・実戦」「実戦のみ」）。全部出せる台は空 */
export function modesLabel(spec: MachineSpec): string {
  if (spec.modes.length === 3) return '';
  return spec.modes.length === 1 ? `${MODE_NAME[spec.modes[0]]}のみ` : spec.modes.map((m) => MODE_NAME[m]).join('・');
}
