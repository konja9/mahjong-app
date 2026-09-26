import { costFor } from './machine/economy';
import { type MachineSpec, SPECS } from './machine/specs';
import { load, save } from './storage';

const KEY = 'tensu.tips.v1';

/**
 * 初めての人向けの一言ガイドの既読管理。
 * firstHit は「一度でも大当りした」印で、チュートリアル当りの判定に使う（ヒントのリセットでは消さない）
 */
export type TipId = 'enter' | 'reach' | 'jackpot' | 'rush' | 'miss' | 'fast' | 'low' | 'firstHit';

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

/** 一言ガイドの文面 */
export function tipText(id: Exclude<TipId, 'firstHit'>, fastSec: number, spec: MachineSpec = SPECS.ama): string {
  switch (id) {
    case 'enter':
      return '正解すると台に玉が入り、保留ランプが1つ点きます。保留があるかぎり台は自動で回ります';
    case 'reach':
      return 'リーチ！ 真ん中もそろえば大当り。保留や予告の色が熱いほど期待大';
    case 'jackpot':
      return `大当り！ 次の${spec.rounds}問は BONUS。BET なしで、符の高い手を当てるほど賞金。連続正解で倍率アップ`;
    case 'rush':
      return `RUSH 突入！ ${spec.st}回転のあいだ大当り確率 1/${spec.rushOdds}。4択は符の違いで迷わせてきます`;
    case 'miss':
      return `不正解は BET と合わせて −${costFor(false, false)} yan。解説を読んで次の問題へ`;
    case 'fast':
      return `速答ボーナス！ ${fastSec}秒以内に正解すると BET が ${costFor(true, true)} yan に割引されます`;
    case 'low':
      return '所持金が残りわずか。プラクティスなら yan を使わずに練習できます';
  }
}
