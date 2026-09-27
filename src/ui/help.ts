/**
 * 遊び方ダイアログ（？ボタン）。数値は ECONOMY と台の定数から組み立て、調整しても説明がずれないようにする
 */
import type { Mode } from '../core/generator';
import { ECONOMY, costFor, fuScale, uwanoseMean } from './machine/economy';
import { KAKUHEN_RATE, NORMAL_ODDS, RUSH_ODDS, ST_SPINS } from './machine/machine';
import { MACHINE_IDS, SPECS } from './machine/specs';

export type HelpTab = 'basic' | 'bonus' | 'rush' | 'money' | 'terms';

const TABS: [HelpTab, string][] = [
  ['basic', '基本'],
  ['bonus', 'BONUS'],
  ['rush', 'RUSH'],
  ['money', 'お金と景品'],
  ['terms', '用語'],
];

export const MODE_LABELS: Record<Mode, string> = { hayami: '早見', fu: '符計算', jissen: '実戦' };

/** 速答の締切「早見 6秒・符計算 12秒・実戦 20秒」 */
export function fastWindows(): string {
  return (Object.keys(MODE_LABELS) as Mode[]).map((m) => `${MODE_LABELS[m]} ${ECONOMY.fastSeconds[m]}秒`).join('・');
}

/** 流れの3ステップ（初回導入と遊び方で共通） */
export const FLOW: { title: string; body: string }[] = [
  {
    title: '点数を答える',
    body: `麻雀の点数を4択で答えます。1問の BET は ${costFor(true, false)} yan。締切までに正解すると ${costFor(true, true)} yan に割引。間違えると −${costFor(false, false)} yan。`,
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

function basic(): string {
  const flow = `<div class="h-flow"><span class="iv-tag">正解</span><span class="iv-arrow">→</span>${holds(['blue', 'red', '', ''])}<span class="iv-arrow">→</span><span class="iv-reel"><b>7</b><b>7</b><b>7</b></span><span class="iv-arrow">→</span><span class="h-chip gold">BONUS<br><small>符で稼ぐ</small></span><span class="iv-arrow">→</span><span class="h-chip">yan</span><span class="iv-arrow">→</span><span class="h-chip">台・景品</span></div>`;
  return (
    card(
      'goal',
      'このゲームの目的',
      flow,
      `<p><b>麻雀の点数計算と符計算を、パチンコの台を回しながら身につける</b>ゲームです。</p>
      <ul>
        <li><b>勝ち方</b>：正確に・速く答えるほど yan が増えます。速答で BET が割引、連続正解で電チュー（玉が2個）、BONUS は符が高い手ほど賞金。</li>
        <li><b>運と実力</b>：運で決まるのは大当りのタイミングだけ。長く遊ぶほど、計算の正確さと速さの差が収支に出ます。</li>
        <li><b>やり込み</b>：yan で台（ミドル・MAX）・スキン・BGM・称号を集めます。実力でしか取れない称号と、毎日のミッションが目標です。</li>
        <li>練習だけしたいときは<b>プラクティス</b>（yan も演出もなし）。</li>
      </ul>`,
    ) +
    card('flow', '1問の流れ', '', `<ol class="help-flow">${FLOW.map((s, i) => `<li><b><span class="n">${i + 1}</span>${s.title}</b><p>${s.body}</p></li>`).join('')}</ol>`) +
    card(
      'modes',
      '2つのモードと3つの出題',
      '',
      `<dl class="help-dl">
        <dt>ノーマル</dt><dd>yan を賭けて台を回すモード。問題は無制限で、所持金が尽きると破産です。</dd>
        <dt>プラクティス</dt><dd>演出も yan もない練習用。10・25・50問のスコア制で、速く正解するほど高得点。</dd>
        <dt>早見</dt><dd>翻と符から点数を答える。点数表を覚える練習。</dd>
        <dt>符計算</dt><dd>手牌と状況から符を答える。</dd>
        <dt>実戦</dt><dd>手牌と状況から役・翻・符を数えて点数を答える。</dd>
      </dl>`,
    ) +
    card(
      'holds',
      '保留と先読み',
      holds(['blue', 'green', 'red', 'gold']),
      `<p>正解すると玉が入り、液晶帯のランプ（保留）が1つ点きます。最大4つ。保留があるかぎり台は自動で回ります。</p><p>ランプの色は当たりやすさの予告で、青 &lt; 緑 &lt; 赤 &lt; 金 &lt; 虹。</p>`,
    ) +
    card(
      'denchu',
      'コンボと電チュー開放',
      `<div class="h-progress"><span>19連</span><span class="balls b2"><i></i><i></i></span></div>`,
      `<p>連続正解が続くと<b>電チュー開放</b>。正解1回で玉が2個入り、大当りまでが早くなります。外すと1個に戻ります。</p>
      <p>必要な連続数：${modeList((m) => `${ECONOMY.denchu[m]}連`)}（早見は連続正解しやすいので多め）。問題数の横の ●● が目印です。</p>
      <p>10連・20連…の節目には大きな表示が出ます。</p>`,
    ) +
    card(
      'keys',
      '操作',
      '',
      `<dl class="help-dl keys">
        <dt><kbd>1</kbd>-<kbd>4</kbd></dt><dd>選択肢を選ぶ（タップでも可）</dd>
        <dt><kbd>Tab</kbd></dt><dd>パス / 次へ</dd>
        <dt><kbd>Esc</kbd></dt><dd>やり直し</dd>
        <dt>入力</dt><dd>出題設定で「入力」にすると数字で答えられます。子のツモは「子-親」（例 1000-2000）</dd>
      </dl>`,
    )
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
      `<p>大当りすると、そのとき出ている問題から ${ECONOMY.rounds} 問が BONUS（BET なし）。正解した手の<b>符 × レート</b>が賞金です（${MODE_LABELS[mode]}・1問目の例）。翻・ドラ・親子では増えません。早見の満貫以上は30符ぶん。</p>
      <p>速答なら ×${ECONOMY.fastMult}。4択の誤答は「同じ翻で符だけ違う点数」なので、符が分からないと当たりません。</p>`,
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

function rush(): string {
  return (
    card(
      'st',
      '確変と RUSH',
      `<div class="h-lcd"><span class="h-rush">RUSH</span><span>残り5/${ST_SPINS}</span></div>`,
      `<p>大当りの ${Math.round(KAKUHEN_RATE * 100)}% は確変（奇数と白發中でそろう）。${ST_SPINS} 回転のあいだ大当り確率が 1/${RUSH_ODDS} になります（通常は 1/${NORMAL_ODDS}）。回転中に当たれば RUSH 継続。</p>`,
    ) +
    card('rush-miss', '不正解で ST が減る', '', `<p>RUSH 中は<b>不正解でも ST が1回転減ります</b>（抽選はなし）。正解し続けるほど RUSH が長く続きます。</p>`) +
    card('rush-q', '4択は符違いで迷わせる', `<div class="iv-choices"><span>2000</span><span class="on">2600</span><span>3200</span><span>3900</span></div>`, `<p>BONUS と RUSH の4択は、4翻以下の手なら「同じ翻で符だけ違う点数」が並びます。</p>`) +
    card(
      'machines',
      '台ごとの数値',
      '',
      `<table class="help-table"><tr><th></th><th>大当り</th><th>RUSH</th><th>BONUS</th></tr>${MACHINE_IDS.map((id) => {
        const sp = SPECS[id];
        return `<tr><th>${sp.name}</th><td>1/${sp.odds}</td><td>1/${sp.rushOdds}×${sp.st}</td><td>${sp.rounds}問</td></tr>`;
      }).join('')}</table><p>ミドル以上は実戦のみ。液晶帯の台の名前 ▾ をタップで台選び。</p>`,
    )
  );
}

function money(): string {
  const bet = `<div class="mt-cell mt-bet"><div class="bet-box"><small>BET<em>速答で割引</em></small><span class="bet-v"><s>${costFor(true, false)}</s><b>${costFor(true, true)}</b></span><i class="bar"></i></div></div>`;
  const plates = `<div class="h-plates">${(['common', 'rare', 'epic', 'legend'] as const)
    .map((r) => `<span class="mt-title r-${r}">${{ common: 'コモン', rare: 'レア', epic: 'エピック', legend: 'レジェンド' }[r]}</span>`)
    .join('')}</div>`;
  return (
    card(
      'bet',
      'BET と速答',
      bet,
      `<p>1問の BET は ${costFor(true, false)} yan。締切までに正解すると ${costFor(true, true)} yan に割引（${fastWindows()}）。不正解・パス・時間切れは −${costFor(false, false)} yan。初期所持金は ${ECONOMY.initial.toLocaleString()} yan。</p>`,
    ) +
    card('meter', '計器', '', `<p>画面下に所持金・BET・収支を常に表示。BET は回答すると実際にかかった額に変わり、BONUS 中は収支の枠が出玉になります。</p>`) +
    card('machine', '台選び', '', `<p>液晶帯の台の名前 ▾ をタップ。大当りは重いが BONUS が長く賞金の大きいミドル・MAX を yan で解放できます（ミドル以上は実戦のみ）。</p>`) +
    card(
      'shop',
      '交換所（称号・スキン・BGM）',
      plates,
      `<p>右上の景品のアイコンから。<b>称号</b>は装備すると計器の「所持」の横にプレートで出ます（色はレア度）。<b>実力の称号</b>は買えず、連続正解や累計正解数などの条件で手に入ります。<b>スキン</b>は牌の背と液晶、<b>BGM</b> は BONUS・RUSH の曲（試聴できます）。</p>`,
    ) +
    card(
      'mission',
      'ミッション',
      `<div class="h-mission"><small>ミッション 1/3</small><span>実戦で10問正解 7/10</span></div>`,
      `<p>計器の上の帯に今日のミッション。毎日3つ、実力で決まる条件だけです。達成すると yan がもらえます。帯をタップで一覧。</p>`,
    ) +
    card('settle', '精算と破産', '', `<p>出題設定の「精算」で成績・収支・大当り履歴を表示（所持金と台はそのまま続きから）。所持金が尽きると破産で、${ECONOMY.initial.toLocaleString()} yan から再スタート。</p>`)
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
      ['保留', '液晶帯のひし形のランプ。正解で1つ増え、最大4つまで溜まる。回転するたびに1つ減る'],
      ['先読み', '保留ランプの色。青 < 緑 < 赤 < 金 < 虹 の順に当たりやすい'],
      ['電チュー', '連続正解が続くと開き、正解1回で玉が2個入る'],
      ['リーチ', '左右の図柄がそろった状態。真ん中もそろえば大当り'],
      ['発展', 'リーチから大きな演出に移ること。回答はいったん止まる'],
      ['確変', '確率変動。大当り確率が上がった状態'],
      ['ST・RUSH', `確変が続く回転数（${ST_SPINS}回転）と、その間の状態。不正解でも1回転減る`],
      ['ラウンド上乗せ', 'BONUS 中に満貫以上を正解すると、BONUS の問題数が増える'],
      ['上乗せ', 'BONUS を全問正解すると、ラウンドの賞金に倍率を掛ける抽選がある'],
      ['パンク', 'BONUS 中の不正解。その問題の賞金は 0'],
      ['回転', '前回の大当りから回った数（液晶帯の右上）'],
      ['レア度', '称号の格。コモン・レア・エピック・レジェンドの順'],
      ['スランプグラフ', '精算画面に出る所持金の推移。点線が初期所持金'],
    ])}`;
}

export function helpHtml(tab: HelpTab, mode: Mode): string {
  const body = tab === 'basic' ? basic() : tab === 'bonus' ? bonus(mode) : tab === 'rush' ? rush() : tab === 'money' ? money() : terms();
  return `<div class="settings help">
    <div class="set-head"><span>遊び方</span><button class="icon-btn" data-help-close aria-label="閉じる">×</button></div>
    <div class="cfg-group help-tabs" role="tablist">${TABS.map(
      ([t, l]) => `<button class="cfg${t === tab ? ' on' : ''}" role="tab" aria-selected="${t === tab}" data-help-tab="${t}">${l}</button>`,
    ).join('')}</div>
    <div class="help-body">${body}</div>
  </div>`;
}
