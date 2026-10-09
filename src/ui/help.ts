/**
 * 遊び方ダイアログ（？ボタン）。数値は ECONOMY と台の定数から組み立て、調整しても説明がずれないようにする
 */
import { evaluate } from '../core/evaluate';
import type { Mode } from '../core/generator';
import { type Meld, defaultSituation } from '../core/hand';
import { DEFAULT_RULES, type Rules } from '../core/rules';
import { formatAnswer } from '../core/score';
import { parseTiles, windName } from '../core/tiles';
import { blocksHtml, fuTable } from './explain';
import { scoreTableHtml } from './scoreTable';
import { ECONOMY, costFor, denchuFor, fastSecondsFor, fuScale, uwanoseMean } from './machine/economy';
import { KAKUHEN_RATE, NORMAL_ODDS, RUSH_ODDS, ST_SPINS } from './machine/machine';
import { UPGRADE_COST } from './machine/parts';
import { MACHINE_IDS, SPECS, modesLabel } from './machine/specs';
import { FINAL_LEVEL, MODE_EXP } from './level';

export type HelpTab = 'basic' | 'score' | 'fu' | 'machine' | 'bonus' | 'grow' | 'terms';

const TABS: [HelpTab, string][] = [
  ['basic', '基本'],
  ['score', '点数'],
  ['fu', '符'],
  ['machine', '台'],
  ['bonus', 'BONUS'],
  ['grow', '成長'],
  ['terms', '用語'],
];

export const MODE_LABELS: Record<Mode, string> = { hayami: '早見', fu: '符計算', jissen: '実戦' };

/** 速答の締切「早見 6秒・符計算 12秒・実戦 20秒」 */
export function fastWindows(): string {
  return (Object.keys(MODE_LABELS) as Mode[]).map((m) => `${MODE_LABELS[m]} ${fastSecondsFor(m)}秒`).join('・');
}

/** 流れの3ステップ（初回導入と遊び方で共通） */
export const FLOW: { title: string; body: string }[] = [
  {
    title: '点数を答える',
    body: `麻雀の点数を4択で答えます。正解するたびに経験値がたまり、Lv が上がります。1問の BET は ${costFor(true, false)} yan。締切までに正解すると ${costFor(true, true)} yan に割引。間違えると −${costFor(false, false)} yan。`,
  },
  {
    title: '正解すると台が回る',
    body: '正解するたびに玉が台に入り、保留ランプが点きます。保留があるかぎり台は自動で回り、図柄が3つそろえば大当り。',
  },
  {
    title: `大当りで BONUS ${ECONOMY.rounds}問`,
    body: `大当りすると、そのとき出ている問題から${ECONOMY.rounds}問が BONUS ラウンド。BET なしで、正解した手の符が高いほど賞金が入ります。連続正解で倍率が上がり、満貫以上を当てるとラウンドが増え、全問正解なら上乗せ。確変なら RUSH に突入して、さらに当たりやすくなります。`,
  },
];

/** ヘルプのカード：見出し＋実際の画面と同じ見た目の小さな図＋説明 */
function card(id: string, title: string, visual: string, body: string): string {
  return `<section class="h-card" id="h-${id}">${visual ? `<div class="iv h-vis">${visual}</div>` : ''}<h4>${title}</h4><div class="h-txt">${body}</div></section>`;
}

const modeList = (f: (m: Mode) => string) => (Object.keys(MODE_LABELS) as Mode[]).map((m) => `${MODE_LABELS[m]} ${f(m)}`).join('・');
const holds = (colors: string[]) =>
  `<span class="iv-holds">${colors.map((c) => `<span class="hold${c ? ` on ${c}` : ''}"></span>`).join('')}</span>`;
const ladderVis = (now: number) =>
  `<div class="b-ladder"><small>連続</small>${ECONOMY.comboLadder
    .map((m, i) => `<i class="${i < now ? 'past' : i === now ? 'now' : ''}">×${m}</i>`)
    .join('<span>›</span>')}</div>`;
const pips = (n: number, on: number, extra = 0) =>
  `<span class="b-pips">${Array.from({ length: n + extra }, (_, i) => `<i class="${i < on ? 'on' : ''}${i >= n ? ' ext' : ''}"></i>`).join('')}</span>`;

/** 画面の見方：スマホの画面を上から順に、番号つきの帯で描く */
const SCREEN: { band: string; cls: string; title: string; body: string }[] = [
  { band: '<span>パチンコ｜稽古</span><span>出題設定 ▾</span><span>≡</span>', cls: 'head', title: 'ヘッダー', body: '左の［パチンコ｜稽古］でモードを切り替え。<b>出題設定</b>で答え方（4択・入力）や出題の条件、<b>≡ メニュー</b>で台選び・改造・昇段試験・交換所・物語・成績・設定が開きます。' },
  { band: '<span>早見</span><span>符計算</span><span>実戦</span>', cls: 'tabs', title: '種目のタブ', body: 'タップで出題の種目を切り替えます（稽古では、学習の種類と出題の切り替え）。' },
  { band: '<span class="hp-reel"><i></i><i></i><i></i></span><span class="hp-lamps">◆◆◇◇</span><span class="hp-slots">▢▢🔒</span>', cls: 'lcd', title: '台の液晶帯', body: '図柄・保留ランプ・パチふとくん。<b>液晶帯をタップで台選び</b>、<b>改造の枠をタップで改造</b>、<b>パチふとくんをタップでひとこと</b>。' },
  { band: '<span>2翻 30符・子のロン</span>', cls: 'q', title: '問題と答え', body: '問題の下に選択肢（またはテンキー）。答えると判定と解説が出ます。' },
  { band: '<span>Lv 7</span><span class="hp-bar"><i></i></span><span>exp</span>', cls: 'xp', title: '経験値の帯', body: '正解でたまる経験値と Lv・段位・称号。タップでメニュー。' },
  { band: '<span>所持 1,000</span><span>本日 +95</span><span>BET 40</span>', cls: 'meter', title: '計器', body: '所持yan・本日の収支・1問の BET。BONUS 中は出玉に変わります。' },
];

function screenMap(): string {
  const n = (i: number) => `<b class="hp-n">${i + 1}</b>`;
  return `<div class="h-screen"><div class="h-phone">${SCREEN.map((r, i) => `<div class="hp-band hp-${r.cls}">${n(i)}${r.band}</div>`).join('')}</div>
    <ol class="h-legend">${SCREEN.map((r, i) => `<li>${n(i)}<div><b>${r.title}</b><p>${r.body}</p></div></li>`).join('')}</ol></div>`;
}

function basic(): string {
  const flow = `<div class="h-flow"><span class="iv-tag">正解</span><span class="iv-arrow">→</span><span class="h-chip">経験値<br><small>Lv・段位</small></span><span class="iv-arrow">→</span><span class="h-chip gold">BONUS<br><small>符で稼ぐ</small></span><span class="iv-arrow">→</span><span class="h-chip">yan<br><small>台・景品</small></span></div>`;
  return (
    card(
      'goal',
      'このゲームの目的',
      flow,
      `<p><b>麻雀の点数計算と符計算を、パチンコの台を回しながら身につける</b>ゲームです。</p>
      <ul>
        <li><b>実力で育つ</b>：正解するたびに経験値がたまり、Lv が上がります。Lv が上がると昇段試験・改造パーツ・<b>パチふとくんの記憶（物語）</b>が開きます。段位は試験に受かった実力の証です。</li>
        <li><b>yan で遊ぶ</b>：正確に・速く答えるほど yan が増えます。yan は台（ミドル・MAX）・スキン・BGM・称号に使えます。</li>
        <li><b>運と実力</b>：運で決まるのは大当りのタイミングだけ。長く遊ぶほど、計算の正確さと速さの差が出ます。</li>
        <li>数え方をじっくり身につけたいときは<b>稽古</b>（yan も演出もなし）。</li>
      </ul>`,
    ) +
    card('screen', '画面の見方', '', screenMap()) +
    card('flow', '1問の流れ', '', `<ol class="help-flow">${FLOW.map((s, i) => `<li><b><span class="n">${i + 1}</span>${s.title}</b><p>${s.body}</p></li>`).join('')}</ol>`) +
    card(
      'modes',
      'モードと出題',
      '',
      `<dl class="help-dl">
        <dt>パチンコ</dt><dd>yan を賭けて台を回すモード。問題は無制限で、所持金が尽きると破産です。</dd>
        <dt>稽古</dt><dd>演出も yan もない練習用。手牌1つを段階に分けて解きます。<b>重点学習</b>は 基本符 → 面子 → 雀頭 → 待ち → 符 → 翻 → 点数 の7段階、<b>簡易学習</b>は 符 → 翻 → 点数 の3段階。出題は 通常・苦手（正答率の低い要素）・復習（間違えた手）から選べます。経験値はパチンコと同じだけ入ります。</dd>
        <dt>早見</dt><dd>翻と符から点数を答える。点数表（「点数」のタブ）を覚える練習。</dd>
        <dt>符計算</dt><dd>手牌と状況から符を答える。答えは 20〜60符の6択（70符以上は出題しません。理由は「符の数え方」タブに）。</dd>
        <dt>実戦</dt><dd>手牌と状況から役・翻・符を数えて点数を答える。</dd>
      </dl>`,
    ) +
    card(
      'bet',
      'BET と速答',
      `<div class="mt-cell mt-bet"><div class="bet-box"><small>BET<em>速答で割引</em></small><span class="bet-v"><s>${costFor(true, false)}</s><b>${costFor(true, true)}</b></span><i class="bar"></i></div></div>`,
      `<p>1問の BET は ${costFor(true, false)} yan。締切までに正解すると ${costFor(true, true)} yan に割引（${fastWindows()}）。不正解・パス・時間切れは −${costFor(false, false)} yan（BET のまま。追加のペナルティはありません。そのかわり、不正解では経験値が入りません）。初期所持金は ${ECONOMY.initial.toLocaleString()} yan。</p>`,
    ) +
    card('meter', '計器と破産', '', `<p>画面下の計器に<b>所持yan</b>・<b>本日の収支</b>・BET を常に表示。本日の収支は BET と BONUS の賞金だけを数え（交換所の買い物は含めない）、<b>朝5時</b>に0に戻ります。BET は回答すると実際にかかった額に変わり、BONUS 中は収支の枠が出玉になります。</p><p>所持金が尽きると破産で、${ECONOMY.initial.toLocaleString()} yan から再スタート。経験値・Lv・段位は減りません。</p>`)
  );
}

/** 点数の出し方と点数表 */
function score(rules: Rules): string {
  const ex = (han: number, fu: number) => fu * 2 ** (han + 2);
  return (
    card(
      'score-flow',
      '点数の出し方',
      '',
      `<ol class="help-flow">
        <li><b><span class="n">1</span>翻と符を数える</b><p>翻は役とドラの合計、符は手の形・待ち・和了り方（「符」のタブ）。<b>5翻以上は符に関係なく</b>満貫以上の決まった点数です。</p></li>
        <li><b><span class="n">2</span>基本点 ＝ 符 × 2<sup>(翻＋2)</sup></b><p>例：30符3翻は 30 × 2<sup>5</sup> ＝ ${ex(3, 30)}。基本点が 2000 以上になったら満貫（基本点 2000）。</p></li>
        <li><b><span class="n">3</span>払う人の数を掛ける</b><p><b>子のロン</b> 基本点×4、<b>親のロン</b> ×6。<b>子のツモ</b>は子が×1・親が×2ずつ、<b>親のツモ</b>は子が×2ずつ（オール）。</p></li>
        <li><b><span class="n">4</span>100点単位に切り上げる</b><p>例：30符3翻の子のロンは ${ex(3, 30)}×4 ＝ ${ex(3, 30) * 4} → <b>3900</b>。ツモは1人ずつ切り上げるので、合計がロンと少しずれます（1000-2000 ＝ 4000）。</p></li>
      </ol>`,
    ) +
    card(
      'score-table',
      '点数表',
      '',
      `${scoreTableHtml(rules)}<p class="small">20符はツモ（平和ツモ）だけ、25符は七対子（2翻から）。1翻のツモ・ロンの組み合わせでありえないマスは「—」です。実戦と稽古では、答えのボタンの下の「点数表」からいつでも開けます（開くと同じ場所が「閉じる」に変わります）。</p>`,
    ) +
    card(
      'score-tips',
      '覚え方のコツ',
      '',
      `<ul>
        <li><b>翻が1つ増えると約2倍</b>、<b>符が2倍なら点数も約2倍</b>。30符1翻 1000 → 2翻 2000 → 3翻 3900 → 4翻 7700。</li>
        <li><b>親は子の1.5倍</b>。子 1000 なら親 1500、子 3900 なら親 5800。</li>
        <li>よく出るのは<b>30符と40符</b>。まずこの2行（子・親）を覚えると、実戦の点数がぐっと速くなります。</li>
        <li>4翻30符（7700）・3翻60符（7700）は満貫の一歩手前。${rules.kiriage ? 'このルールでは切り上げ満貫で 8000 として扱います。' : '切り上げ満貫のルールなら 8000（設定で変えられます）。'}</li>
      </ul>`,
    )
  );
}

/** 符の例題。数値は点数エンジンで計算するので、説明と正解がずれない */
export const FU_EXAMPLES: { title: string; concealed: string; win: string; melds?: Meld[]; tsumo?: boolean; round?: string; seat?: string; fu: number; point: string }[] = [
  { title: '平和のロン', concealed: '234m567p234s88s67s', win: '5s', fu: 30, point: '順子・数牌の雀頭・両面待ちはすべて0符。副底20＋門前ロン10＝30符' },
  { title: '暗刻と嵌張のツモ', concealed: '777m234p567m99p46s', win: '5s', tsumo: true, fu: 30, point: '中張の暗刻は4符、嵌張待ちは2符、ツモは2符。合計28符を切り上げて30符' },
  {
    title: '鳴いた手の么九の暗刻',
    concealed: '13p345p999p11z',
    win: '2p',
    melds: [{ type: 'chi', tile: 15 }],
    round: '1z',
    seat: '3z',
    fu: 40,
    point: '鳴いているので門前ロンは付かない。么九の暗刻8符、場風の雀頭2符、嵌張2符で32符→40符',
  },
];

function fuExample(ex: (typeof FU_EXAMPLES)[number]): string {
  const hand = { concealed: parseTiles(ex.concealed), winTile: parseTiles(ex.win)[0], melds: ex.melds ?? [], akaTiles: [] };
  const sit = defaultSituation({
    tsumo: !!ex.tsumo,
    ...(ex.round ? { roundWind: parseTiles(ex.round)[0] } : {}),
    ...(ex.seat ? { seatWind: parseTiles(ex.seat)[0] } : {}),
  });
  const ev = evaluate(hand, sit, DEFAULT_RULES);
  if (!ev) return '';
  const where = `${windName(sit.roundWind)}場・${windName(sit.seatWind)}家・${ex.tsumo ? 'ツモ' : 'ロン'}・${ex.melds?.length ? '鳴きあり' : '門前'}`;
  return `<div class="fu-ex"><div class="fu-ex-h"><b>${ex.title}</b><span class="muted small">${where} → ${ev.fu.fu}符（${ev.han}翻 ${formatAnswer(ev.score)}）</span></div>
    <div class="explain">${blocksHtml(hand, ev)}${fuTable(ev)}</div><p class="small">${ex.point}</p></div>`;
}

function fu(): string {
  const tri = (label: string, a: number, b: number) => `<tr><th>${label}</th><td>${a}</td><td>${b}</td></tr>`;
  return (
    card(
      'fu-flow',
      '符を数える順番',
      '',
      `<ol class="help-flow fu-steps">
        <li><b><span class="n">1</span>決まった形を先に見る</b><p><b>七対子は25符</b>、<b>平和のツモは20符</b>で固定。ここで終わり。</p></li>
        <li><b><span class="n">2</span>副底 20符</b><p>どの手にも付く土台。</p></li>
        <li><b><span class="n">3</span>和了り方</b><p><b>門前でロン +10符</b>（鳴いていたら付かない）。<b>ツモ +2符</b>（平和のツモには付かない）。</p></li>
        <li><b><span class="n">4</span>面子</b><p>順子は0符。刻子・槓子は下の表。</p></li>
        <li><b><span class="n">5</span>雀頭</b><p>役牌（白發中・場風・自風）なら <b>+2符</b>。場風かつ自風（連風牌）は設定で2符か4符。数牌・客風牌は0符。</p></li>
        <li><b><span class="n">6</span>待ち</b><p><b>嵌張・辺張・単騎 +2符</b>。両面・双碰は0符。</p></li>
        <li><b><span class="n">7</span>10符単位に切り上げ</b><p>例 32符 → 40符。鳴いて合計20符のロン（喰い平和形）は30符にする。</p></li>
      </ol>`,
    ) +
    card(
      'fu-mentsu',
      '刻子・槓子の符',
      '',
      `<table class="help-table fu-grid"><tr><th></th><th>中張<br><small>2〜8</small></th><th>么九<br><small>1・9・字牌</small></th></tr>${tri('明刻', 2, 4)}${tri('暗刻', 4, 8)}${tri('明槓', 8, 16)}${tri('暗槓', 16, 32)}</table>
      <p>覚え方：<b>明刻2符</b>が基本。<b>暗なら×2</b>、<b>么九なら×2</b>、<b>槓子なら×4</b>。</p>
      <p>手の内の刻子でも、<b>双碰待ちをロンで完成させた刻子は明刻</b>として数えます（ツモなら暗刻）。</p>`,
    ) +
    card(
      'fu-wait',
      '待ちの符と分け方',
      '',
      `<dl class="help-dl">
        <dt>+2符</dt><dd>嵌張（4_6 の5）・辺張（12_ の3、_89 の7）・単騎（雀頭を待つ）</dd>
        <dt>0符</dt><dd>両面（23 で1か4）・双碰（2つの対子のどちらか）</dd>
      </dl>
      <p>同じ手でも面子の分け方で待ちが変わることがあります。そのときは<b>点数が高くなる分け方</b>で数えます（高点法）。解説に「別の分け方」が出たら、その手です。</p>`,
    ) +
    card(
      'fu-range',
      '出題する符は20〜60符',
      '<div class="iv-choices"><span>20</span><span>25</span><span class="on">30</span><span>40</span><span>50</span><span>60</span></div>',
      `<p>70符以上になるのは、么九の暗刻や槓子がいくつも重なった手だけで、実戦ではまれです。そのため、このゲームでは<b>早見・符計算・実戦のどれでも70符以上は出題しません</b>。</p>
      <p>符計算の答えは <b>20・25・30・40・50・60符</b> の6つのボタンから選びます。入力モードでも正解は60符までです。</p>
      <p>数え方そのものは同じです。70符以上の手も、上の順番と表の通りに数えれば求められます。</p>`,
    ) +
    card('fu-examples', '例題', '', FU_EXAMPLES.map(fuExample).join(''))
  );
}

function bonus(mode: Mode): string {
  const plain = fuScale(mode, false);
  const prem = fuScale(mode, true);
  const table = `<div class="b-table">${plain.map((c) => `<div class="b-cell${c.key === 50 ? ' lit' : ''}"><small>${c.label}<u>符</u></small><b>${c.prize}</b></div>`).join('')}</div>`;
  const ex = ECONOMY.extraRounds;
  return (
    card(
      'bonus-fu',
      '賞金は「符」で決まる',
      table,
      `<p>大当りすると、そのとき出ている問題から ${ECONOMY.rounds} 問が BONUS（BET なし）。正解した手の<b>符のマスの額</b>が賞金です（${MODE_LABELS[mode]}・1問目の例）。出にくく数えるのが難しい<b>高い符ほど大きく</b>、60符は30符の約${ECONOMY.fuPrize[60] / ECONOMY.fuPrize[30]}倍。翻・ドラ・親子では増えません。早見の満貫以上は30符のマス。</p>
      <p>${ECONOMY.fastMult > 1 ? `速答なら ×${ECONOMY.fastMult}。` : '速答の得は BET の割引（BONUS 中は BET なし）。'}4択の誤答は「同じ翻で符だけ違う点数」なので、符が分からないと当たりません。</p>`,
    ) +
    card(
      'ladder',
      '連続正解の倍率',
      ladderVis(2),
      `<p>BONUS の中で連続正解すると、賞金の倍率が ${ECONOMY.comboLadder.map((m) => `×${m}`).join(' → ')} と上がります。1問外すと ×1 に戻ります。</p>`,
    ) +
    card(
      'roundup',
      'ラウンド上乗せ（満貫以上）',
      pips(ECONOMY.rounds, 2, 2),
      `<p>BONUS 中に<b>満貫以上</b>を正解すると、BONUS の問題が増えます。満貫・跳満 +${ex.mangan}R、倍満・三倍満 +${ex.baiman}R、役満 +${ex.yakuman}R（1回の BONUS で最大 +${ex.max}R）。</p>`,
    ) +
    card(
      'uwanose',
      '全問正解の上乗せ',
      `<div class="uwa-roll done mini"><small>上乗せ</small><b>×3</b></div>`,
      `<p>BONUS を<b>全問正解</b>すると、リールがもう一度回ってラウンドの賞金に倍率を掛ける抽選（×${ECONOMY.uwanose[0][0]}〜×${ECONOMY.uwanose.at(-1)![0]}、平均 約×${uwanoseMean(false).toFixed(1)}）。運が入るのはここだけで、条件は実力です。</p>`,
    ) +
    card(
      'premium',
      'PREMIUM 大当り',
      '',
      `<p>赤五筒でそろうと PREMIUM。賞金 ×${ECONOMY.premiumMult}、役満の問題が出やすく（役満 +${prem.at(-1)!.prize.toLocaleString()} yan）、上乗せは最低 ×${ECONOMY.uwanosePremium[0][0]}。</p>`,
    ) +
    card('punk', 'パンク', '', `<p>BONUS 中に外すと、その問題の賞金は 0（BET はかかりません）。連続の倍率が ×1 に戻り、全問正解の上乗せもなくなります。</p>`)
  );
}

function machine(): string {
  return (
    card(
      'holds',
      '保留と先読み',
      holds(['blue', 'green', 'red', 'gold']),
      `<p>正解すると玉が入り、液晶帯のランプ（保留）が1つ点きます。最大4つ。保留があるかぎり台は自動で回ります。</p><p>ランプの色は当たりやすさの予告で、青 &lt; 緑 &lt; 赤 &lt; 金 &lt; 虹。回る直前にパチふとくんがランプを叩いて色が上がる<b>保留変化</b>もあります。</p><p>回転の頭にパチふとくんが顔を出したら<b>パチふとくん予告</b>。吹き出しの色も白 &lt; 赤 &lt; 金 &lt; 虹の順に熱く、虹なら当り確定。リーチから<b>パチふとくんリーチ</b>に発展すると大チャンス。一度外れても<b>復活</b>することがあります。</p>`,
    ) +
    card(
      'denchu',
      'コンボと電チュー開放',
      `<div class="h-progress"><span>19連</span><span class="balls b2"><i></i><i></i></span></div>`,
      `<p>連続正解が続くと<b>電チュー開放</b>。正解1回で玉が2個入り、大当りまでが早くなります。外すと1個に戻ります。</p>
      <p>必要な連続数：${modeList((m) => `${denchuFor(m)}連`)}（早見は連続正解しやすいので多め）。問題数の横の ●● が目印です。</p>
      <p>10連・20連…の節目には大きな表示が出ます。</p>`,
    ) +
    card(
      'st',
      '確変と RUSH',
      `<div class="h-lcd"><span class="h-rush">RUSH</span><span>残り5/${ST_SPINS}</span></div>`,
      `<p>大当りの ${Math.round(KAKUHEN_RATE * 100)}% は確変（奇数と白發中でそろう）。${ST_SPINS} 回転のあいだ大当り確率が 1/${RUSH_ODDS} になります（通常は 1/${NORMAL_ODDS}）。回転中に当たれば RUSH 継続。</p>`,
    ) +
    card('rush-miss', '不正解で ST が減る', '', `<p>RUSH 中は<b>不正解でも ST が1回転減ります</b>（抽選はなし）。正解し続けるほど RUSH が長く続きます。</p>`) +
    card('rush-q', '4択は符違いで迷わせる', `<div class="iv-choices"><span>2000</span><span class="on">2600</span><span>3200</span><span>3900</span></div>`, `<p>BONUS と RUSH の4択は、4翻以下の手なら「同じ翻で符だけ違う点数」が並びます。</p>`) +
    card(
      'machine',
      '台選び',
      '',
      `<p><b>液晶帯をタップ</b>するか、メニューの「台選び」から。大当りは重いが BONUS が長く賞金の大きいミドル・MAX を yan で解放できます。上の台ほど出せる種目が難しいものに限られます。</p>
      <table class="help-table"><tr><th></th><th>種目</th><th>大当り</th><th>RUSH</th><th>BONUS</th></tr>${MACHINE_IDS.map((id) => {
        const sp = SPECS[id];
        return `<tr><th>${sp.name}</th><td>${modesLabel(sp) || 'すべて'}</td><td>1/${sp.odds}</td><td>1/${sp.rushOdds}×${sp.st}</td><td>${sp.rounds}問</td></tr>`;
      }).join('')}</table>`,
    )
  );
}

function grow(): string {
  const plates = `<div class="h-plates">${(['common', 'rare', 'epic', 'legend'] as const)
    .map((r) => `<span class="mt-title r-${r}">${{ common: 'コモン', rare: 'レア', epic: 'エピック', legend: 'レジェンド' }[r]}</span>`)
    .join('')}</div>`;
  return (
    card(
      'level',
      '経験値と Lv',
      `<div class="h-xp"><b class="xp-lv">Lv 7</b><span class="mt-title r-rare">符読み</span><span class="xp-bar"><i style="width:62%"></i></span><small class="xp-next">次まで 2,140</small></div>`,
      `<p>計器の上の帯。Lv は<b>点数計算の実力</b>で上がります。<b>正解するたびに経験値がたまり</b>、難しい種目ほど多く入ります。</p>
      <table class="help-table"><tr><th>早見</th><th>符計算</th><th>実戦</th></tr><tr><td>${MODE_EXP.hayami}</td><td>${MODE_EXP.fu}</td><td>${MODE_EXP.jissen}</td></tr></table>
      <p>パチンコの通常の問題・BONUS・稽古のどれでも同じ量で、稽古の重点学習は正解した段階の割合に応じて入ります。yan の稼ぎとは関係なく、BET や買い物、破産では減りません。Lv1 から始まり、上限はありません。</p>
      <p>Lv が上がるたびに、<b>改造パーツ</b>が1つと、<b>物語</b>の次の話が手に入ります。</p>`,
    ) +
    card(
      'exam',
      '昇段試験',
      '',
      `<p>パチふとくんが課す「数えの試験」。段位は、賭場で数え屋に頼らずに数えられる証です。<b>Lv 2 ごと</b>に次の段位の試験（10問）が受けられます。5級（早見）から始まり、符計算・実戦と進んで、Lv 20 で<b>名人</b>。上の段位ほど正確さと速さが求められます。</p>
      <p>何度でも受け直せて、受かると計器の Lv の横に段位の札が付きます。試験中は yan・台・経験値は動きません。受かるたびに、ある人の手書きの帳面が1頁ずつ戻ってきます（物語の本の「帳面」で読めます）。メニューの「昇段試験」から。</p>`,
    ) +
    card(
      'parts',
      '台の改造',
      '',
      `<p>Lv が上がるたびに<b>改造パーツ</b>が1つ手に入ります（保留タンク・速答センサー・確変ユニットなど）。<b>台の改造の枠をタップ</b>するか、メニューの「改造」で台に付けると、台が少し有利になります。</p>
      <p>持っているパーツは、<b>yan で強化</b>できます（Lv1→2 が ${UPGRADE_COST[0].toLocaleString()} yan、Lv2→3 が ${UPGRADE_COST[1].toLocaleString()} yan。速答の締切・ST の回転数・確変の割合などが段階ごとに伸びます）。改造の画面の「強化」から。</p>
      <p>改造の枠は<b>5つ</b>。最初はすべて鍵がかかっていて、<b>昇段試験の5級・3級・1級・二段・名人</b>に受かるたびに1つずつ開きます。枠を開ける試験が受けられるときは、次の鍵が光ります。<b>光っている鍵をタップ</b>すると、昇段試験の画面が開きます。</p>`,
    ) +
    card(
      'story',
      '物語（パチふとくんの記憶）',
      '',
      `<p>経験を積むほど、パチふとくんの失った記憶が流れ込んできます。<b>Lv が上がるたびに1話ずつ</b>読めるようになり、<b>Lv ${FINAL_LEVEL} の第${FINAL_LEVEL}話で完結</b>。メニューの「物語」で読めます。</p>`,
    ) +
    card('settle', '成績', '', `<p>メニューの「成績」で、答えた記録を見られます。「腕前」は種目ごとの直近50問の正答率と速さ、次の昇段試験の基準との比べ。「推移」は遊んだ日ごとのグラフ、「苦手」は状況・符の要素・早見の点数ごとの弱いところ、「台」は収支と大当り履歴です。</p>`) +
    card(
      'shop',
      '交換所（称号・スキン・BGM）',
      plates,
      `<p>メニューの「交換所」で yan と交換します。<b>称号</b>は装備すると計器の Lv の下にプレートで出ます（色はレア度）。<b>実力の称号</b>は買えず、連続正解や累計正解数などの条件で手に入ります。<b>スキン</b>は牌の背と液晶、<b>BGM</b> は BONUS・RUSH の曲（試聴できます）。効果音と BGM の音量は、設定で別々に変えられます（0 で鳴らさない）。</p>`,
    ) +
    card('games', '実績・ランキング', '', `<p>アプリ版では Google Play ゲームにログインすると、<b>実績</b>・<b>ランキング</b>（最大連続正解・累計正解数）・<b>クラウドセーブ</b>が使えます。メニューの「実績・ランキング」から。</p>`)
  );
}

function terms(): string {
  const dl = (items: [string, string][]) =>
    `<dl class="help-dl">${items.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl>`;
  return `
    <div class="set-sec">麻雀</div>
    ${dl([
      ['翻（ハン）', '役やドラの数。多いほど点数が高い'],
      ['符（フ）', '手の形・待ち・和了り方で決まる細かい点。翻が4以下のときに点数を左右する'],
      ['満貫〜役満', '翻が多い手は符に関係なく点数が決まる。満貫(5翻) < 跳満(6-7) < 倍満(8-10) < 三倍満(11-12) < 役満'],
      ['親・子', '親（東家）は子の1.5倍の点数'],
      ['ロン・ツモ', 'ロンは1人から、ツモは全員から受け取る。ツモは支払いが分かれるので答え方も変わる'],
    ])}
    <div class="set-sec">パチンコ</div>
    ${dl([
      ['保留', '台の液晶帯のひし形のランプ。正解で1つ増え、最大4つまで溜まる。回転するたびに1つ減る'],
      ['先読み', '保留ランプの色。青 < 緑 < 赤 < 金 < 虹 の順に当たりやすい'],
      ['電チュー', '連続正解が続くと開き、正解1回で玉が2個入る'],
      ['リーチ', '左右の図柄がそろった状態。真ん中もそろえば大当り'],
      ['発展', 'リーチから大きな演出に移ること。回答はいったん止まる'],
      ['確変', '確率変動。大当り確率が上がった状態'],
      ['ST・RUSH', `確変が続く回転数（${ST_SPINS}回転）と、その間の状態。不正解でも1回転減る`],
      ['ラウンド上乗せ', 'BONUS 中に満貫以上を正解すると、BONUS の問題数が増える'],
      ['上乗せ', 'BONUS を全問正解すると、ラウンドの賞金に倍率を掛ける抽選がある'],
      ['パンク', 'BONUS 中の不正解。その問題の賞金は 0'],
      ['回転', '前回の大当りから回った数（台の液晶帯の右上）'],
      ['レア度', '称号の格。コモン・レア・エピック・レジェンドの順'],
      ['スランプグラフ', '成績の「台」に出る所持金の推移。点線が初期所持金'],
    ])}`;
}

export function helpHtml(tab: HelpTab, mode: Mode, rules: Rules = DEFAULT_RULES): string {
  const body =
    tab === 'basic' ? basic() : tab === 'score' ? score(rules) : tab === 'fu' ? fu() : tab === 'machine' ? machine() : tab === 'bonus' ? bonus(mode) : tab === 'grow' ? grow() : terms();
  return `<div class="settings help">
    <div class="set-head"><span>遊び方</span><button class="icon-btn" data-help-close aria-label="閉じる">×</button></div>
    <div class="cfg-group help-tabs" role="tablist">${TABS.map(
      ([t, l]) => `<button class="cfg${t === tab ? ' on' : ''}" role="tab" aria-selected="${t === tab}" data-help-tab="${t}">${l}</button>`,
    ).join('')}</div>
    <div class="help-body">${body}</div>
  </div>`;
}
