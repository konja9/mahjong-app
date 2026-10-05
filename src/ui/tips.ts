import type { Mode } from '../core/generator';
import type { HelpTab } from './help';
import { ECONOMY, costFor } from './machine/economy';
import { type MachineSpec, SPECS } from './machine/specs';
import { load, save } from './storage';

const MODE_NAME: Record<Mode, string> = { hayami: '早見', fu: '符計算', jissen: '実戦' };

const KEY = 'tensu.tips.v1';

/**
 * 初めての人向けの一言ガイドの既読管理。
 * firstHit は「一度でも大当りした」印で、チュートリアル当りの判定に使う（ヒントのリセットでは消さない）
 */
export type TipId =
  | 'enter'
  | 'reach'
  | 'jackpot'
  | 'rush'
  | 'miss'
  | 'fast'
  | 'low'
  | 'firstHit'
  | 'denchuSoon'
  | 'denchu'
  | 'bonusFu'
  | 'ladder'
  | 'bonusMiss'
  | 'roundUp'
  | 'uwanose'
  | 'rushMiss'
  | 'shop'
  | 'machine'
  | 'mission';

export class Tips {
  private seen: Set<string>;

  constructor() {
    const raw = load<unknown>(KEY, []);
    this.seen = new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []);
  }

  has(id: TipId): boolean {
    return this.seen.has(id);
  }

  /** 未読なら既読にして true を返す */
  first(id: TipId): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    save(KEY, [...this.seen]);
    return true;
  }

  /** ヒントをもう一度表示する（大当り済みの印は残す） */
  reset(): void {
    const hit = this.seen.has('firstHit');
    this.seen = new Set(hit ? ['firstHit'] : []);
    save(KEY, [...this.seen]);
  }
}

/** 一言ガイドの文面。数値は ECONOMY と台の仕様から組み立てる */
export function tipText(id: Exclude<TipId, 'firstHit'>, fastSec: number, spec: MachineSpec = SPECS.ama, mode: Mode = 'jissen'): string {
  switch (id) {
    case 'enter':
      return '正解すると台に玉が入り、保留ランプが1つ点きます。保留があるかぎり台は自動で回ります';
    case 'reach':
      return 'リーチ！ 真ん中もそろえば大当り。保留や予告の色が熱いほど期待大';
    case 'jackpot':
      return `大当り！ ここから${spec.rounds}問は BONUS。BET なしで、符の高い手ほど賞金。連続正解で倍率アップ`;
    case 'rush':
      return `RUSH 突入！ ${spec.st}回転のあいだ大当り確率 1/${spec.rushOdds}。液晶帯の「残り」が ST。不正解でも1回転減ります`;
    case 'miss':
      return `不正解は BET と合わせて −${costFor(false, false)} yan。連続正解も切れます。解説を読んで次の問題へ`;
    case 'fast':
      return `速答ボーナス！ ${fastSec}秒以内に正解すると BET が ${costFor(true, true)} yan に割引されます`;
    case 'low':
      return '所持金が残りわずか。稽古なら yan を使わずに練習できます';
    case 'denchuSoon':
      return `あと2連で電チュー開放。${MODE_NAME[mode]}は ${ECONOMY.denchu[mode]}連から、正解1回で玉が2個入ります`;
    case 'denchu':
      return '電チュー開放！ 外すまで正解1回で玉が2個。問題数の横の ●● が目印です';
    case 'bonusFu':
      return 'BONUS の賞金は、正解した手の「符」で決まります。液晶帯の目盛りで確認できます';
    case 'ladder':
      return `連続正解で賞金の倍率が上がります（${ECONOMY.comboLadder.map((m) => `×${m}`).join(' → ')}）`;
    case 'bonusMiss':
      return 'パンク（賞金なし）。連続の倍率が ×1 に戻り、全問正解の上乗せもなくなります';
    case 'roundUp':
      return '満貫以上を正解したのでラウンド上乗せ。BONUS の問題が増えます';
    case 'uwanose':
      return '全問正解！ ラウンドの賞金に上乗せ抽選があります';
    case 'rushMiss':
      return 'RUSH 中の不正解は ST が1回転減ります。正解し続けるほど RUSH が長く続きます';
    case 'shop':
      return '交換所（右上の景品のアイコン）で称号・スキン・BGM が買えます';
    case 'machine':
      return `ミドル台を解放できる所持金になりました（${SPECS.middle.price.toLocaleString()} yan）。液晶帯の台の名前をタップ`;
    case 'mission':
      return 'ミッションは毎日3つ。計器の上の帯をタップすると一覧が見られます';
  }
}

/** 「詳しく」で開くヘルプのタブとカード（なければ出さない） */
export function tipLink(id: Exclude<TipId, 'firstHit'>): { tab: HelpTab; card: string } | null {
  const map: Partial<Record<Exclude<TipId, 'firstHit'>, [HelpTab, string]>> = {
    enter: ['basic', 'holds'],
    reach: ['basic', 'holds'],
    jackpot: ['bonus', 'bonus-fu'],
    rush: ['rush', 'st'],
    miss: ['money', 'bet'],
    fast: ['money', 'bet'],
    low: ['basic', 'modes'],
    denchuSoon: ['basic', 'denchu'],
    denchu: ['basic', 'denchu'],
    bonusFu: ['bonus', 'bonus-fu'],
    ladder: ['bonus', 'ladder'],
    bonusMiss: ['bonus', 'punk'],
    roundUp: ['bonus', 'roundup'],
    uwanose: ['bonus', 'uwanose'],
    rushMiss: ['rush', 'rush-miss'],
    shop: ['money', 'shop'],
    machine: ['money', 'machine'],
    mission: ['money', 'mission'],
  };
  const v = map[id];
  return v ? { tab: v[0], card: v[1] } : null;
}
