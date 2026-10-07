import type { Face } from './chara';

/**
 * チュートリアルの台本。ステップのリストとして持ち、セリフ・光らせる場所・進み方をここにまとめる。
 * 文言の修正やステップの追加は、このファイルだけを直せばよい
 *
 * 世界観：ギャンブル世紀末。人の値打ちは「どれだけ勝てるか」だけで決まる。頂点は麻雀とパチンコ。
 * 案内役は麻雀牌スロットの妖精「パチふとくん」。プレイヤーは「お前」「新顔」と呼ばれる
 */

/** アプリ側で起きる出来事（runner.notify で知らせる） */
/** idle：BONUS 中でない（BONUS が終わったときに知らせる。すでに BONUS 中でなければ待たずに進む） */
export type TutorialEvent = 'answered' | 'bonusStart' | 'bonusEnd' | 'stepAnswered' | 'idle';

/** 画面の準備（アプリ側の処理） */
export type TutorialAction =
  | 'pachinko' // パチンコの早見・選択にする
  | 'fixedQuestion' // 決まった簡単な問題（1翻30符・子のロン）を出す
  | 'armJackpot' // あと2問正解したら大当りにする
  | 'nextQuestion' // 判定のあと次の問題へ
  | 'freeBet' // チュートリアル中の BET をなしにする
  | 'paidBet' // BET を元に戻す
  | 'keikoFocus' // 稽古の重点学習・通常の出題にする
  | 'modeHayami' // 早見に切り替えて問題を出す
  | 'modeFu' // 符計算に切り替えて問題を出す
  | 'modeJissen' // 実戦に切り替えて問題を出す
  | 'haltMachine'; // 台を止める（残りの保留で次の大当りが起きないように。稽古へ移るときは台がリセットされる）

export type Step =
  /** セリフ。タップで次へ */
  | { kind: 'say'; face: Face; text: string }
  /**
   * 光らせる。next が 'tap' ならセリフのタップで次へ、'click' なら光らせた場所を押したら次へ、
   * それ以外は指定の出来事が起きたら次へ（光らせた場所だけ押せる）
   */
  | { kind: 'spot'; target: string; face: Face; text: string; next: 'tap' | 'click' | TutorialEvent; pad?: number }
  /** 光らせずに自由に遊ばせ、指定の出来事が起きたら次へ（吹き出しは小さく出す） */
  | { kind: 'free'; face: Face; text: string; until: TutorialEvent }
  /** 画面の準備 */
  | { kind: 'do'; action: TutorialAction };

export type ChapterId = 'prologue' | 'pachinko' | 'keiko' | 'tools';

export interface Chapter {
  id: ChapterId;
  title: string;
  steps: Step[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'prologue',
    title: 'プロローグ',
    steps: [
      { kind: 'say', face: 'grin', text: 'クケケケ、久しぶりの新顔だな。このアプリが起動できたということは、お前は選ばれたってことだ。ようこそ、パチふとへ。' },
      { kind: 'say', face: 'neutral', text: 'オレ様はパチふとくん。麻雀牌スロットの妖精だ。この筐体に住んでる。' },
      { kind: 'say', face: 'proud', text: '今はギャンブル世紀末。人の値打ちも名誉も、どれだけ勝てるかだけで決まる。' },
      { kind: 'say', face: 'neutral', text: '頂点にあるのが麻雀とパチンコだ。どっちも、点数を正しく速く数えられるヤツが勝つ。' },
      { kind: 'say', face: 'sweat', text: '……で、お前は符計算もままならない、と。そのままじゃ、払い過ぎと取りこぼしで身ぐるみはがされるぜ。' },
      { kind: 'say', face: 'grin', text: 'ギャンブル王になりたいんだろ？　ならオレ様がとっくんしてやる。まずは賭場の歩き方からだ。' },
    ],
  },
  {
    id: 'pachinko',
    title: 'パチンコの基本',
    steps: [
      { kind: 'do', action: 'pachinko' },
      { kind: 'do', action: 'freeBet' },
      { kind: 'do', action: 'fixedQuestion' },
      { kind: 'spot', target: '#question', face: 'neutral', text: 'ここが問題だ。1翻30符、子のロン。いくらになる？', next: 'tap' },
      { kind: 'spot', target: '#choices [data-tut="correct"]', face: 'grin', text: '答えは1000点。光ってるボタンを押しな。', next: 'answered' },
      { kind: 'do', action: 'armJackpot' },
      { kind: 'say', face: 'proud', text: 'クケケ、正解だ。正解すると台に玉が入るぜ。' },
      { kind: 'spot', target: '#machine .m-holds', face: 'neutral', text: '玉が入ると、液晶のランプ（保留）が点く。保留がある限り、台は勝手に回るぜ。', next: 'tap', pad: 8 },
      { kind: 'spot', target: '#meter', face: 'neutral', text: '下が計器だ。左が所持yan と本日の収支、右が1問の BET（40 yan）。速く正解すりゃ半額、今だけはオレ様のおごりだ。', next: 'tap' },
      { kind: 'do', action: 'nextQuestion' },
      { kind: 'free', face: 'grin', text: 'あと2問正解してみな。いいことがあるぜ、クケケ。', until: 'bonusStart' },
      { kind: 'say', face: 'surprise', text: '来たァ！　大当りだ！　BONUS に入るぜ！' },
      { kind: 'spot', target: '#machine .b-table', face: 'proud', text: 'BONUS は BET なし。正解した手の符のマスの額がそのまま賞金だ。いつもは6問以上だが、今回は2問のお試しだぜ。', next: 'tap', pad: 6 },
      { kind: 'do', action: 'nextQuestion' },
      { kind: 'spot', target: '#choices', face: 'neutral', text: '手牌の符を考えて答えてみな。外すとその問題の賞金はパンク（0）だ。', next: 'answered' },
      { kind: 'free', face: 'grin', text: 'その調子だ。BONUS を最後まで答えて、賞金を受け取りな。', until: 'bonusEnd' },
      { kind: 'do', action: 'paidBet' },
      { kind: 'say', face: 'neutral', text: '出題は3種類あって、上のタブで切り替えられる。実際に見せてやるぜ。' },
      { kind: 'do', action: 'modeHayami' },
      { kind: 'spot', target: '#question', face: 'neutral', text: 'これが「早見」。翻と符が出て、点数だけを答える。点数表を体に叩き込むモードだな。', next: 'tap', pad: 6 },
      { kind: 'do', action: 'modeFu' },
      { kind: 'spot', target: '#question', face: 'proud', text: 'これが「符計算」。手牌から符を数える。BONUS の賞金は符で決まるから、ここを鍛えりゃ稼ぎが変わるぜ。', next: 'tap', pad: 6 },
      { kind: 'do', action: 'modeJissen' },
      { kind: 'spot', target: '#question', face: 'grin', text: 'これが「実戦」。翻も符も数えて点数まで出す、卓と同じ本番だ。上の台は実戦だけだぜ。', next: 'tap', pad: 6 },
      { kind: 'do', action: 'modeHayami' },
      { kind: 'say', face: 'proud', text: 'BONUS のあとに確変を引けば RUSH だ。当たりやすい時間が続くが、外すと回転が減る。腕で引っぱるんだぜ。' },
      { kind: 'spot', target: '#exp-strip', face: 'surprise', text: '……ん？　計器の上が経験値だ。次の Lv まであと何 exp か出てる。Lv が上がると改造パーツがもらえて、オレ様の記憶も少し戻る、らしい。', next: 'tap', pad: 4 },
      { kind: 'say', face: 'neutral', text: 'ここからは BET も本物だ。所持金が尽きたら破産だから気をつけな。' },
    ],
  },
  {
    id: 'keiko',
    title: '稽古（道場）',
    steps: [
      // RUSH でまた大当りしていたら、その BONUS を遊び終えてから道場へ
      { kind: 'free', face: 'grin', text: 'おっと、また BONUS か。まずはこいつを遊び切りな。', until: 'idle' },
      { kind: 'do', action: 'haltMachine' },
      { kind: 'say', face: 'sweat', text: '……とはいえ、数え方を知らなきゃ賭場じゃカモだ。yan を使わない道場で叩き込むぜ。' },
      { kind: 'spot', target: '.play-tab[data-play="keiko"]', face: 'neutral', text: '「稽古」を押しな。', next: 'click' },
      { kind: 'do', action: 'keikoFocus' },
      { kind: 'spot', target: '#mode-tabs .study-tabs', face: 'neutral', text: '重点学習は、符を1段ずつ数える。簡易学習は 符 → 翻 → 点数 の仕上げだ。', next: 'tap', pad: 6 },
      { kind: 'spot', target: '#steps', face: 'proud', text: '答えた符はこの帯に積み上がる。今どこまで数えたか、ひと目で分かるぜ。', next: 'tap', pad: 6 },
      { kind: 'spot', target: '#choices', face: 'neutral', text: '最初の段階だ。アガり方で何符足すか、答えてみな。', next: 'stepAnswered' },
      { kind: 'spot', target: '#mode-tabs .source-tabs', face: 'grin', text: '間違えた手は全部覚えてるぜ、クケケ。「復習」で解き直し、「苦手」で弱いところを集中して鍛えられる。', next: 'tap', pad: 6 },
    ],
  },
  {
    id: 'tools',
    title: '道具の場所',
    steps: [
      { kind: 'free', face: 'grin', text: 'BONUS を遊び切ったら、道具の場所を教えるぜ。', until: 'idle' },
      { kind: 'do', action: 'pachinko' },
      { kind: 'spot', target: '#cfg-toggle', face: 'neutral', text: '出題の設定はここだ。答え方（選択・入力）や、親子・ロンツモを絞れるぜ。', next: 'tap', pad: 6 },
      { kind: 'spot', target: '#open-menu', face: 'proud', text: 'ほかの道具は全部このメニューだ。台選び、改造、昇段試験、交換所、物語、遊び方、設定。', next: 'tap', pad: 6 },
      { kind: 'say', face: 'neutral', text: 'メニューに赤い点が付いたら、やることがある合図だ。受けられる昇段試験や、付けてない改造パーツだな。' },
      { kind: 'say', face: 'neutral', text: 'この案内は、メニューの「スタート画面へ」からいつでも見られるぜ。' },
      { kind: 'say', face: 'grin', text: 'さあ、行ってこい新顔。ギャンブル王の椅子は、数えられるヤツにしか座れないぜ。クケケケ！' },
    ],
  },
];

export const chapter = (id: ChapterId): Chapter => CHAPTERS.find((c) => c.id === id)!;
