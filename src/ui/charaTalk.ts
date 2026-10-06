import type { Face } from './tutorial/chara';

/**
 * 通常プレイ中のパチふとくん（液晶帯の隅に常駐）の一言。
 * 出来事ごとに表情と、一言を出す確率・文を決める。出しすぎないよう、前の一言から間をあける。
 * DOM には触らない（表示は MachinePanel）
 */

export type TalkEvent =
  | 'correct'
  | 'fast'
  | 'streak3'
  | 'streak5'
  | 'streak10'
  | 'big'
  | 'nearMiss'
  | 'miss'
  | 'holdMax'
  | 'idle'
  | 'reach'
  | 'jackpot'
  | 'bonusEnd'
  | 'rushStart'
  | 'rushEnd'
  | 'lowMoney'
  | 'tap';

interface TalkDef {
  face: Face;
  /** 一言を出す確率（表情は必ず変える） */
  p: number;
  lines: string[];
}

export const TALK: Record<TalkEvent, TalkDef> = {
  correct: { face: 'grin', p: 0.12, lines: ['クケケ、いい数えっぷりだ', 'その調子だぜ', '悪くねえ', 'よし、玉が入った', '点棒は正直だな'] },
  fast: { face: 'proud', p: 0.35, lines: ['速えな！ BET 半額だ', '見えてるじゃねえか', '迷いがねえ。いいぜ', '電光石火ってやつだ'] },
  streak3: { face: 'proud', p: 0.4, lines: ['3連続！ 波に乗ってきたな', '止まらねえな', 'その流れ、切るなよ'] },
  streak5: { face: 'proud', p: 0.7, lines: ['5連続だ！ 台が温まってきたぜ', 'クケケ、乗ってるねえ', 'そろそろ何か起きるぜ'] },
  streak10: { face: 'grin', p: 0.9, lines: ['10連続!? お前、本物だな', 'ギャンブル王の器かもな…', 'ここまで数えるとはな'] },
  big: { face: 'surprise', p: 0.5, lines: ['満貫以上を見切ったか！', 'デカい手ほど落ち着いてるな', 'いい手だ。いい数えだ'] },
  nearMiss: { face: 'sweat', p: 0.4, lines: ['惜しい！ あと一歩だ', '筋はいい。数え直してみな', 'どこでずれたか、解説を見な'] },
  miss: { face: 'sweat', p: 0.2, lines: ['ドンマイ。次だ次', '符は裏切らねえ。もう一度だ', 'クケ…まあそういう日もある', '解説を見りゃすぐ分かる'] },
  holdMax: { face: 'surprise', p: 0.5, lines: ['保留MAXだ！ 回るのを待ちな', 'もう玉が入らねえぜ', '溜まってるねえ'] },
  idle: { face: 'neutral', p: 1, lines: ['ゆっくり数えな、逃げやしねえ', '副底20符からだぜ', '迷ったら面子を一つずつだ', '焦るな。符は数えれば分かる'] },
  reach: { face: 'surprise', p: 0, lines: [] },
  jackpot: { face: 'grin', p: 0, lines: [] },
  bonusEnd: { face: 'grin', p: 0.7, lines: ['ごっそさん！ いい BONUS だった', 'クケケ、稼いだな', '次の大当りも頼むぜ'] },
  rushStart: { face: 'grin', p: 0.8, lines: ['RUSH だ！ 間違えるなよ', 'ここからが本番だぜ', '確変突入！ 数えまくれ'] },
  rushEnd: { face: 'sweat', p: 0.6, lines: ['RUSH 終了か…次だ次', 'また引き戻せばいい', '確変は終わっても、腕は残る'] },
  lowMoney: { face: 'sweat', p: 0.6, lines: ['yan が心細いな…丁寧にいけ', '速答で BET を浮かせな', '破産だけは勘弁だぜ'] },
  tap: {
    face: 'grin',
    p: 1,
    lines: [
      'なんだ？ オレ様は忙しいんだ',
      'この街じゃ、数えられない奴から消える',
      'yan は雀の字から来てるらしいぜ',
      '目の牌？ 気分で変わるんだよ',
      'ゲンさんは、子の30符を目をつぶって数えたもんだ',
      'クケケ、つつくな。くすぐってえ',
      '満貫の手前で止まる奴に、王の椅子はねえ',
    ],
  },
};

/** 前の一言から最低あける時間（ミリ秒）。タップと長考は別 */
export const TALK_GAP = 15000;

/** 表情と、出すなら一言（line は null で表情だけ） */
export interface Reaction {
  face: Face;
  line: string | null;
}

export class Talker {
  private lastAt = -Infinity;
  private last = new Map<TalkEvent, string>();

  constructor(private rng: () => number = Math.random) {}

  /** 出来事への反応を決める。now はミリ秒（performance.now など） */
  react(ev: TalkEvent, now: number, canSpeak = true): Reaction {
    const def = TALK[ev];
    const free = ev === 'tap' || ev === 'idle';
    if (!canSpeak || !def.lines.length || (!free && now - this.lastAt < TALK_GAP) || this.rng() >= def.p) {
      return { face: def.face, line: null };
    }
    // 同じ文を続けて出さない
    const prev = this.last.get(ev);
    const pool = def.lines.length > 1 ? def.lines.filter((l) => l !== prev) : def.lines;
    const line = pool[Math.floor(this.rng() * pool.length) % pool.length];
    this.last.set(ev, line);
    this.lastAt = now;
    return { face: def.face, line };
  }
}

/** 正解したときの出来事（大きいものを優先） */
export function correctEvent(o: { streak: number; big: boolean; fast: boolean }): TalkEvent {
  if (o.streak === 10 || (o.streak > 10 && o.streak % 10 === 0)) return 'streak10';
  if (o.streak === 5) return 'streak5';
  if (o.streak === 3) return 'streak3';
  if (o.big) return 'big';
  if (o.fast) return 'fast';
  return 'correct';
}
