import type { Mode } from '../core/generator';
import type { HelpTab } from './help';
import { ECONOMY, costFor, denchuFor } from './machine/economy';
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
  | 'levelUp';

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

/**
 * 一言ガイドの文面。案内役のパチふとくんの口調（「〜だぜ」「クケケ」）で話す。
 * 数値は ECONOMY と台の仕様から組み立てる
 */
export function tipText(id: Exclude<TipId, 'firstHit'>, fastSec: number, spec: MachineSpec = SPECS.ama, mode: Mode = 'jissen'): string {
  switch (id) {
    case 'enter':
      return '正解したから玉が入ったぜ。保留ランプが点いてる間は、台が勝手に回る';
    case 'reach':
      return 'リーチだ！ 真ん中もそろえば大当り。保留や予告の色が熱いほど期待できるぜ';
    case 'jackpot':
      return `大当りだ！ ここから${spec.rounds}問は BONUS。BET なしで、符の高い手ほど賞金がデカいぜ`;
    case 'rush':
      return `RUSH 突入だ！ ${spec.st}回転のあいだ大当り 1/${spec.rushOdds}。外すと回転が減るから、腕で引っぱりな`;
    case 'miss':
      return `外したな。BET と合わせて −${costFor(false, false)} yan、連続正解も切れる。解説を読んで取り返しな`;
    case 'fast':
      return `速いじゃねえか。${fastSec}秒以内の正解は BET が ${costFor(true, true)} yan に割引だぜ`;
    case 'low':
      return '所持金がヤバいぜ。稽古なら yan を使わずに数え方を叩き込めるぞ';
    case 'denchuSoon':
      return `あと2連で電チュー開放だ。${MODE_NAME[mode]}は ${denchuFor(mode)}連から、正解1回で玉が2個入るぜ`;
    case 'denchu':
      return '電チュー開放！ 外すまで正解1回で玉2個だ。問題数の横の ●● が目印だぜ';
    case 'bonusFu':
      return 'BONUS の賞金は、正解した手の「符」のマスで決まる。液晶帯の目盛りを見な';
    case 'ladder':
      return `連続正解で倍率が上がるぜ（${ECONOMY.comboLadder.map((m) => `×${m}`).join(' → ')}）。外すと戻る`;
    case 'bonusMiss':
      return 'パンクだ、その問題の賞金はなし。連続の倍率も戻って、全問正解の上乗せも消えたぜ';
    case 'roundUp':
      return '満貫以上を当てたから、ラウンド上乗せだ。BONUS の問題が増えるぜ';
    case 'uwanose':
      return '全問正解だ！ クケケ、上乗せ抽選があるぜ';
    case 'rushMiss':
      return 'RUSH 中に外すと回転が1つ減る。当て続けるほど RUSH が長く続くぜ';
    case 'shop':
      return '交換所（右上の景品のアイコン）で称号・スキン・BGM が買えるぜ。格を見せつけな';
    case 'machine':
      return `ミドル台を解放できるだけ稼いだな（${SPECS.middle.price.toLocaleString()} yan）。液晶帯の台の名前をタップだ`;
    case 'levelUp':
      return 'Lv が上がるたび、オレ様の記憶が1話ずつ戻ってくる。経験値のバーか、右上の本のマークで読めるぜ';
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
    levelUp: ['money', 'level'],
  };
  const v = map[id];
  return v ? { tab: v[0], card: v[1] } : null;
}
