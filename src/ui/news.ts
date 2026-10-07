import type { MachineId } from './machine/specs';

/**
 * 「世紀末ニュース」。パチふとくんが、回答中にときどき世間話として話す（gossipLine）。
 * 物語に出てくる事柄（勝者法・数え屋・ギャンブル王など）は、その話を読める Lv になってから出す（ネタばれ防止）
 */

export interface NewsContext {
  level: number;
  balance: number;
  /** 本日の収支 */
  dayNet: number;
  machine: MachineId;
  rush: boolean;
  /** 段位の名前（なしは空） */
  rank?: string;
}

interface NewsItem {
  /** この Lv から出す（物語の第N話を読める Lv） */
  minLevel?: number;
  /** 出す条件 */
  when?: (c: NewsContext) => boolean;
  text: string | ((c: NewsContext) => string);
  /** パチふとくん自身の言葉（頭に「聞いたか？」を付けない） */
  self?: boolean;
}

const MACHINE_NAME: Record<MachineId, string> = { ama: '甘デジ', middle: 'ミドル', max: 'MAX' };
const yan = (n: number) => `${n.toLocaleString()} yan`;

export const NEWS: NewsItem[] = [
  // 街のニュース
  { text: '本日の破産者 312 名。数えられない者から消える街に、今日も雨' },
  { text: 'yan 相場、高止まり。点数の数え違いによる取りこぼし、全体の 3 割との試算' },
  { text: '公認勝負場のネオン、今夜も紫と金。窓のある店は残りわずか' },
  { text: '「満貫を跳満と言われて払った」相談が急増。数え間違いに注意' },
  { text: '早見表の闇市価格、また高騰。手書きの古い表ほど値が張る' },
  { text: '路地裏で「親の跳満は 18000」と叫ぶ男。周囲は誰も否定できず' },
  { text: '本日の格言：払い過ぎた点棒は、二度と戻ってこない' },
  { text: '子の 30 符 1 翻ロン、1000 点。この一行から始めた者は強い' },
  { text: '雀荘跡地に新たな勝負場。看板だけが妙に明るい' },
  { text: '深夜の勝負場で停電。暗闇でも点数を言い当てた客がいたという' },
  // 物語に沿ったニュース（その話を読める Lv から）
  { minLevel: 5, text: '景品カウンター、今日も長蛇の列。昔は駄菓子と交換できたらしい' },
  { minLevel: 7, text: '勝者法の施行から幾年。点数がそのまま身分になる暮らし、すっかり定着' },
  { minLevel: 7, text: '勝者法、また改正。高い点数の者ほど発言が重くなる' },
  { minLevel: 8, text: '街のホール、また 1 軒閉店。跡地には「公認勝負場」の看板' },
  { minLevel: 10, text: '地下賭場の BGM、年々音量が上がる。客の顔から笑いは消えたまま' },
  { minLevel: 11, text: '数え屋の取り分、相場は勝ち分の 3 割。少なく数える悪質な数え屋に注意' },
  { minLevel: 11, text: '「自分で数えられるようになれ」。古い教えが、若い雀士の間で再評価' },
  { minLevel: 12, text: '改造された筐体の摘発、相次ぐ。数え間違いの賞金を胴元に流す仕掛け' },
  { minLevel: 13, text: '地下の筐体に「妖精が住む」との噂。液晶の中で何かが動いたとの証言' },
  { minLevel: 14, text: 'ギャンブル王の椅子、依然空席。挑んだ勝負師の多くは途中で姿を消す' },
  { minLevel: 14, text: '王の椅子に座った者は、法そのものを書き換えられる──根強い噂' },
  { minLevel: 15, text: '白髪の老雀士、BONUS 全問正解の伝説。最後の手は親の跳満ツモ' },
  { minLevel: 20, text: '数えられる者が、また一人増えた。街の空気が、少しだけ変わり始めている' },
  // プレイヤーに触れるニュース
  { text: (c) => `新顔の雀士（Lv ${c.level}）、${MACHINE_NAME[c.machine]}で連日出撃中` },
  { when: (c) => c.dayNet > 0, text: (c) => `本日の収支 +${yan(c.dayNet)} の新顔に、常連もざわつく` },
  { when: (c) => c.dayNet < 0, text: (c) => `本日の収支 ${yan(c.dayNet)}。負けを数えられる者は、まだ終わっていない` },
  { when: (c) => c.balance >= 10000, text: (c) => `所持 ${yan(c.balance)}。新顔、勝者法の査定で上位に食い込む` },
  { when: (c) => c.balance < 300, text: '財布の軽い雀士、甘デジの前で深呼吸。まずは BET を守れ' },
  { when: (c) => c.rush, text: 'RUSH 継続中の台あり。周りの客が固唾をのむ' },
  { when: (c) => c.level >= 10, text: (c) => `Lv ${c.level} の雀士、数え屋いらずと評判に` },
  { when: (c) => !!c.rank, text: (c) => `${c.rank}の札を下げた新顔、卓で一度も払い過ぎず` },
  { minLevel: 11, when: (c) => !!c.rank, text: (c) => `${c.rank}の雀士が来た日、数え屋は店の外で煙草を吸っていた` },
  { minLevel: 11, text: '段位持ちの雀士には、数え屋も声をかけない。数えの段位は、賭場の通行証だ' },
  // 台・遊びのニュース
  { text: 'MAX 台、本日も沈黙。ギャンブル王の椅子に一番近い台' },
  { text: 'ミドル台の BONUS、10 ラウンド完走者に拍手' },
  { text: '速答の雀士、BET 半額で荒稼ぎ。速さは yan になる' },
  { text: '符の高い手ほど BONUS は高配当。40 符以上を見抜けるかが勝負' },
  { text: '連続正解で電チュー開放。玉が 2 つ入る台に行列' },
  { text: '保留ランプが金に光った台、周囲の視線を一身に' },
  // 小ネタ
  { text: 'オレ様の目の牌は、気分で変わるんだよ。クケケ', self: true },
  { text: '目が回らないのかって？　毎日回ってりゃ慣れるさ', self: true },
  { text: '雀の字から取った通貨 yan。雀は今日も電線で数を数えている' },
];

const textOf = (n: NewsItem, c: NewsContext) => (typeof n.text === 'function' ? n.text(c) : n.text);

/** 今出せる見出し */
export function availableNews(c: NewsContext): string[] {
  return NEWS.filter((n) => (n.minLevel ?? 1) <= c.level && (!n.when || n.when(c))).map((n) => textOf(n, c));
}

/** 世間話の頭の言葉 */
const LEADS = ['聞いたか？　', '噂じゃ、', '世紀末ニュースだ。', 'クケ、知ってるか。'];

/** 見出しを、パチふとくんのしゃべり言葉にする */
export function gossipLine(text: string, rng: () => number = Math.random): string {
  if (NEWS.some((n) => n.self && n.text === text)) return text;
  return LEADS[Math.floor(rng() * LEADS.length) % LEADS.length] + text;
}

/** 見出しを1本選ぶ。recent（直近に出した見出し）は避ける */
export function pickNews(c: NewsContext, recent: string[] = [], rng: () => number = Math.random): string {
  const all = availableNews(c);
  const fresh = all.filter((t) => !recent.includes(t));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}
