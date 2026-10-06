import { load, save } from '../storage';
import { BASE_MODS, type Mods, setMods } from './mods';

/**
 * 台の改造パーツ。Lv アップのたびに決まった順に1つ手に入り、昇段試験に受かるほど台に付けられる枠が増える。
 * 効き目は mods.ts にまとめて、経済・抽選・演出がそこを見る
 */

export type PartId =
  | 'fast'
  | 'tank'
  | 'cushion'
  | 'lens'
  | 'denchu'
  | 'st'
  | 'combo'
  | 'kakuhen'
  | 'uwanose'
  | 'premium'
  | 'round'
  | 'gold';

export interface Part {
  id: PartId;
  name: string;
  /** 効果の説明 */
  desc: string;
  /** 世界観の一言 */
  flavor: string;
  apply: (m: Mods) => Mods;
}

export const PARTS: Record<PartId, Part> = {
  fast: {
    id: 'fast',
    name: '速答センサー',
    desc: '速答の締切 +2秒（早見は +1秒）',
    flavor: '指先の迷いを読み取る、感度の高いセンサー',
    apply: (m) => ({ ...m, fastBonus: { hayami: m.fastBonus.hayami + 1, fu: m.fastBonus.fu + 2, jissen: m.fastBonus.jissen + 2 } }),
  },
  tank: {
    id: 'tank',
    name: '保留タンク',
    desc: '保留の上限 4 → 5',
    flavor: '玉を一つ多く溜めておける、昔ながらの改造',
    apply: (m) => ({ ...m, holds: m.holds + 1 }),
  },
  cushion: {
    id: 'cushion',
    name: 'クッション',
    desc: '不正解の追加ペナルティ 20 → 10',
    flavor: '負けたときの痛みを、少しだけやわらげる',
    apply: (m) => ({ ...m, missPenalty: 10 }),
  },
  lens: {
    id: 'lens',
    name: '先読みレンズ',
    desc: '保留変化とパチふとくん予告が出やすくなる（演出だけ）',
    flavor: '液晶の奥まで見通せる、と言われるレンズ',
    apply: (m) => ({ ...m, noticeBoost: m.noticeBoost * 1.6 }),
  },
  denchu: {
    id: 'denchu',
    name: '電チュー増強',
    desc: '電チュー開放に必要な連続正解 −1',
    flavor: 'チューリップのばねを強くした',
    apply: (m) => ({ ...m, denchuMinus: m.denchuMinus + 1 }),
  },
  st: {
    id: 'st',
    name: 'ST 延長',
    desc: 'RUSH の回転数 +1',
    flavor: '確変の灯りを、少しだけ長く保つ',
    apply: (m) => ({ ...m, stPlus: m.stPlus + 1 }),
  },
  combo: {
    id: 'combo',
    name: '連続ブースター',
    desc: 'BONUS の連続正解の倍率の最上段 ×1.1 → ×1.15',
    flavor: '流れに乗った雀士を、さらに押し上げる',
    apply: (m) => ({ ...m, comboTop: 1.15 }),
  },
  kakuhen: {
    id: 'kakuhen',
    name: '確変ユニット',
    desc: '大当りが確変になる割合 +5%',
    flavor: '地下の賭場から流れてきた、出どころ不明の部品',
    apply: (m) => ({ ...m, kakuhenPlus: m.kakuhenPlus + 0.05 }),
  },
  uwanose: {
    id: 'uwanose',
    name: '上乗せ強化',
    desc: 'BONUS 全問正解の上乗せで、高い倍率が出やすくなる',
    flavor: '全部当てた者に、台が少しだけ気前よくなる',
    apply: (m) => ({ ...m, uwanoseUp: true }),
  },
  premium: {
    id: 'premium',
    name: '赤五筒センサー',
    desc: '確変大当りが PREMIUM（赤五筒）になりやすい',
    flavor: '赤い牌にだけ反応する、気まぐれなセンサー',
    apply: (m) => ({ ...m, premiumPlus: m.premiumPlus + 0.03 }),
  },
  round: {
    id: 'round',
    name: 'ラウンド追加',
    desc: '満貫以上のラウンド上乗せの上限 +1R（1回の BONUS で最大 +4R）',
    flavor: 'もう一問、数えさせてくれ',
    apply: (m) => ({ ...m, extraMaxPlus: m.extraMaxPlus + 1 }),
  },
  gold: {
    id: 'gold',
    name: '金の玉',
    desc: '大当り確率 ×1.05',
    flavor: '一度だけ見た、伝説の大当りの玉と同じ色',
    apply: (m) => ({ ...m, hitMult: m.hitMult * 1.05 }),
  },
};

/** Lv 2 から順に手に入るパーツ（Lv 2 で fast、Lv 3 で tank …） */
export const PART_ORDER: PartId[] = ['fast', 'tank', 'cushion', 'lens', 'denchu', 'st', 'combo', 'kakuhen', 'uwanose', 'premium', 'round', 'gold'];

/** その Lv で手に入るパーツ（なければ null） */
export const partForLevel = (level: number): PartId | null => PART_ORDER[level - 2] ?? null;

/** パーツがもらえない Lv の祝い金 */
export const levelCash = (level: number): number => level * 150;

/** 段位（0 は未受験、1 で5級 … 10 で名人）から、台に付けられる枠の数 */
export function slotsFor(rank: number): number {
  return 1 + [1, 3, 5, 7, 10].filter((r) => rank >= r).length;
}

export interface PartsState {
  owned: PartId[];
  equip: PartId[];
}

const KEY = 'tensu.parts.v1';
const isPart = (id: unknown): id is PartId => typeof id === 'string' && id in PARTS;

export function loadParts(level: number): PartsState {
  const s = load<Partial<PartsState>>(KEY, {});
  const owned = (s.owned ?? []).filter(isPart);
  const equip = (s.equip ?? []).filter((id) => isPart(id) && owned.includes(id));
  const st = { owned, equip };
  // 改造パーツができる前から Lv が上がっていた人にも、その Lv までのパーツを渡す
  syncOwned(st, level);
  return st;
}

export const saveParts = (s: PartsState): void => save(KEY, s);

/** その Lv までに手に入るはずのパーツを持たせる */
export function syncOwned(s: PartsState, level: number): void {
  for (let lv = 2; lv <= level; lv++) {
    const p = partForLevel(lv);
    if (p && !s.owned.includes(p)) s.owned.push(p);
  }
}

/** Lv アップの報酬（新しく上がった Lv の並び）：パーツと祝い金 */
export function rewardsFor(s: PartsState, ups: number[]): { parts: PartId[]; cash: number } {
  const parts: PartId[] = [];
  let cash = 0;
  for (const lv of ups) {
    const p = partForLevel(lv);
    if (p && !s.owned.includes(p)) {
      s.owned.push(p);
      parts.push(p);
    } else cash += levelCash(lv);
  }
  return { parts, cash };
}

/** パーツを台に付ける。付けられたら true（持っていない・付け済み・枠がいっぱいなら false） */
export function equipPart(s: PartsState, id: PartId, slots: number): boolean {
  if (!s.owned.includes(id) || s.equip.includes(id) || s.equip.length >= slots) return false;
  s.equip.push(id);
  return true;
}

export function unequipPart(s: PartsState, id: PartId): void {
  s.equip = s.equip.filter((p) => p !== id);
}

/** 付けているパーツをまとめた効き目 */
export function modsFor(equip: PartId[]): Mods {
  return equip.reduce((m, id) => PARTS[id].apply(m), BASE_MODS);
}

/** 付けているパーツの効き目を台・経済に反映する。枠より多く付いていたら後ろから外す */
export function applyParts(s: PartsState, slots: number): void {
  if (s.equip.length > slots) s.equip = s.equip.slice(0, slots);
  setMods(modsFor(s.equip));
}
