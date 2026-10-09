import { load, save } from '../storage';
import { BASE_MODS, type Mods, setMods } from './mods';

/**
 * 台の改造パーツ。Lv アップのたびに決まった順に1つ手に入る。台には5つの枠があり、昇段試験に受かるたびに枠の鍵が1つずつ開く。
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

/** パーツの1段階分（Lv1 は手に入れたときの効果。強化すると Lv2・Lv3 になる） */
export interface PartLevel {
  /** 効果の説明 */
  desc: string;
  apply: (m: Mods) => Mods;
}

export interface Part {
  id: PartId;
  name: string;
  /** 世界観の一言 */
  flavor: string;
  /** Lv1 の効果の説明（手に入れたときの表示に使う） */
  desc: string;
  /** 段階ごとの効果（1〜3段階。数字で伸ばせるものだけ強化できる） */
  levels: PartLevel[];
}

const lv = (desc: string, apply: (m: Mods) => Mods): PartLevel => ({ desc, apply });
const part = (id: PartId, name: string, flavor: string, levels: PartLevel[]): Part => ({ id, name, flavor, desc: levels[0].desc, levels });

export const PARTS: Record<PartId, Part> = {
  fast: part('fast', '速答センサー', '指先の迷いを読み取る、感度の高いセンサー', [
    lv('速答の締切 +2秒（早見は +1秒）', (m) => ({ ...m, fastBonus: { hayami: 1, fu: 2, jissen: 2 } })),
    lv('速答の締切 +3秒（早見は +1秒）', (m) => ({ ...m, fastBonus: { hayami: 1, fu: 3, jissen: 3 } })),
    lv('速答の締切 +4秒（早見は +2秒）', (m) => ({ ...m, fastBonus: { hayami: 2, fu: 4, jissen: 4 } })),
  ]),
  tank: part('tank', '保留タンク', '玉を一つ多く溜めておける、昔ながらの改造', [
    lv('保留の上限 4 → 5', (m) => ({ ...m, holds: 5 })),
    lv('保留の上限 4 → 6', (m) => ({ ...m, holds: 6 })),
  ]),
  cushion: part('cushion', 'クッション', '負けたときの痛みを、少しだけやわらげる', [
    lv('不正解のとき、BET の 10% が戻る', (m) => ({ ...m, missRefund: 0.1 })),
    lv('不正解のとき、BET の 20% が戻る', (m) => ({ ...m, missRefund: 0.2 })),
    lv('不正解のとき、BET の 30% が戻る', (m) => ({ ...m, missRefund: 0.3 })),
  ]),
  lens: part('lens', '先読みレンズ', '液晶の奥まで見通せる、と言われるレンズ', [
    lv('保留変化とパチふとくん予告が出やすくなる（演出だけ）', (m) => ({ ...m, noticeBoost: m.noticeBoost * 1.6 })),
    lv('保留変化とパチふとくん予告がさらに出やすくなる（演出だけ）', (m) => ({ ...m, noticeBoost: m.noticeBoost * 2 })),
    lv('保留変化とパチふとくん予告がとても出やすくなる（演出だけ）', (m) => ({ ...m, noticeBoost: m.noticeBoost * 2.5 })),
  ]),
  denchu: part('denchu', '電チュー増強', 'チューリップのばねを強くした', [
    lv('電チュー開放に必要な連続正解 −1', (m) => ({ ...m, denchuMinus: m.denchuMinus + 1 })),
    lv('電チュー開放に必要な連続正解 −2', (m) => ({ ...m, denchuMinus: m.denchuMinus + 2 })),
  ]),
  st: part('st', 'ST 延長', '確変の灯りを、少しだけ長く保つ', [
    lv('RUSH の回転数 +1', (m) => ({ ...m, stPlus: m.stPlus + 1 })),
    lv('RUSH の回転数 +2', (m) => ({ ...m, stPlus: m.stPlus + 2 })),
    lv('RUSH の回転数 +3', (m) => ({ ...m, stPlus: m.stPlus + 3 })),
  ]),
  combo: part('combo', '連続ブースター', '流れに乗った雀士を、さらに押し上げる', [
    lv('BONUS の連続正解の倍率の最上段 ×1.1', (m) => ({ ...m, comboTopMult: 1.1 })),
    lv('BONUS の連続正解の倍率の最上段 ×1.2', (m) => ({ ...m, comboTopMult: 1.2 })),
    lv('BONUS の連続正解の倍率の最上段 ×1.3', (m) => ({ ...m, comboTopMult: 1.3 })),
  ]),
  kakuhen: part('kakuhen', '確変ユニット', '地下の賭場から流れてきた、出どころ不明の部品', [
    lv('大当りが確変になる割合 +5%', (m) => ({ ...m, kakuhenPlus: m.kakuhenPlus + 0.05 })),
    lv('大当りが確変になる割合 +8%', (m) => ({ ...m, kakuhenPlus: m.kakuhenPlus + 0.08 })),
    lv('大当りが確変になる割合 +12%', (m) => ({ ...m, kakuhenPlus: m.kakuhenPlus + 0.12 })),
  ]),
  uwanose: part('uwanose', '上乗せ強化', '全部当てた者に、台が少しだけ気前よくなる', [
    lv('BONUS 全問正解の上乗せで、高い倍率が出やすくなる', (m) => ({ ...m, uwanoseUp: true })),
  ]),
  premium: part('premium', '赤五筒センサー', '赤い牌にだけ反応する、気まぐれなセンサー', [
    lv('確変大当りが PREMIUM（赤五筒）になりやすい（+3%）', (m) => ({ ...m, premiumPlus: m.premiumPlus + 0.03 })),
    lv('確変大当りが PREMIUM（赤五筒）になりやすい（+5%）', (m) => ({ ...m, premiumPlus: m.premiumPlus + 0.05 })),
    lv('確変大当りが PREMIUM（赤五筒）になりやすい（+8%）', (m) => ({ ...m, premiumPlus: m.premiumPlus + 0.08 })),
  ]),
  round: part('round', 'ラウンド追加', 'もう一問、数えさせてくれ', [
    lv('満貫以上のラウンド上乗せの上限 +1R（1回の BONUS で最大 +4R）', (m) => ({ ...m, extraMaxPlus: m.extraMaxPlus + 1 })),
    lv('満貫以上のラウンド上乗せの上限 +2R（1回の BONUS で最大 +5R）', (m) => ({ ...m, extraMaxPlus: m.extraMaxPlus + 2 })),
  ]),
  gold: part('gold', '金の玉', '一度だけ見た、伝説の大当りの玉と同じ色', [
    lv('大当り確率 ×1.05', (m) => ({ ...m, hitMult: m.hitMult * 1.05 })),
    lv('大当り確率 ×1.08', (m) => ({ ...m, hitMult: m.hitMult * 1.08 })),
    lv('大当り確率 ×1.12', (m) => ({ ...m, hitMult: m.hitMult * 1.12 })),
  ]),
};

/** Lv 2 から順に手に入るパーツ（Lv 2 で fast、Lv 3 で tank …） */
export const PART_ORDER: PartId[] = ['fast', 'tank', 'cushion', 'lens', 'denchu', 'st', 'combo', 'kakuhen', 'uwanose', 'premium', 'round', 'gold'];

/** その Lv で手に入るパーツ（なければ null） */
export const partForLevel = (level: number): PartId | null => PART_ORDER[level - 2] ?? null;

/** パーツがもらえない Lv の祝い金 */
export const levelCash = (level: number): number => level * 150;

/** 台の改造の枠の数（台にはいつもこの数の穴があり、開いていない枠には鍵がかかっている） */
export const MAX_SLOTS = 5;
/** 枠の鍵が開く段位（1 で5級 … 10 で名人）：5級・3級・1級・二段・名人 */
export const SLOT_RANKS = [1, 3, 5, 7, 10] as const;

/** 段位（0 は未受験、1 で5級 … 10 で名人）から、台に付けられる枠の数（最初は0、最大5） */
export function slotsFor(rank: number): number {
  return SLOT_RANKS.filter((r) => rank >= r).length;
}

/** 次に枠の鍵が開く段位（すべて開いていれば null） */
export function nextSlotRank(rank: number): number | null {
  return SLOT_RANKS.find((r) => r > rank) ?? null;
}

export interface PartsState {
  owned: PartId[];
  equip: PartId[];
  /** 強化の段階（ないものは 1） */
  lv?: Partial<Record<PartId, number>>;
}

const KEY = 'tensu.parts.v1';
const isPart = (id: unknown): id is PartId => typeof id === 'string' && id in PARTS;

export function loadParts(level: number): PartsState {
  const s = load<Partial<PartsState>>(KEY, {});
  const owned = (s.owned ?? []).filter(isPart);
  const equip = (s.equip ?? []).filter((id) => isPart(id) && owned.includes(id));
  // 強化の段階：持っているパーツの、1〜最大段階の整数だけ（壊れた値は 1 に戻す）
  const lv: Partial<Record<PartId, number>> = {};
  for (const id of owned) {
    const n = Math.floor(Number(s.lv?.[id]));
    if (n >= 2) lv[id] = Math.min(n, PARTS[id].levels.length);
  }
  const st: PartsState = { owned, equip, lv };
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

/** パーツの今の強化の段階（1〜） */
export const partLevel = (s: PartsState, id: PartId): number => Math.min(Math.max(1, s.lv?.[id] ?? 1), PARTS[id].levels.length);

/** 強化の費用：今の段階から次の段階へ（Lv1→2、Lv2→3） */
export const UPGRADE_COST = [1500, 4500] as const;

/** 次の段階への強化の費用（最大段階なら null） */
export function upgradeCost(s: PartsState, id: PartId): number | null {
  const lv = partLevel(s, id);
  return lv >= PARTS[id].levels.length ? null : UPGRADE_COST[lv - 1];
}

/** パーツを1段階強化する。払った額を返す（持っていない・最大段階・お金が足りないなら 0） */
export function upgradePart(s: PartsState, id: PartId, balance: number): number {
  const cost = upgradeCost(s, id);
  if (!s.owned.includes(id) || cost === null || balance < cost) return 0;
  s.lv = { ...s.lv, [id]: partLevel(s, id) + 1 };
  return cost;
}

/** 付けているパーツをまとめた効き目（lv：強化の段階。ないものは Lv1） */
export function modsFor(equip: PartId[], lv: Partial<Record<PartId, number>> = {}): Mods {
  return equip.reduce((m, id) => PARTS[id].levels[Math.min(Math.max(1, lv[id] ?? 1), PARTS[id].levels.length) - 1].apply(m), BASE_MODS);
}

/** 付けているパーツの効き目を台・経済に反映する。枠より多く付いていたら後ろから外す */
export function applyParts(s: PartsState, slots: number): void {
  if (s.equip.length > slots) s.equip = s.equip.slice(0, slots);
  setMods(modsFor(s.equip, s.lv));
}
