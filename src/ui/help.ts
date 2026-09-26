/**
 * 遊び方ダイアログ（？ボタン）。数値は ECONOMY と台の定数から組み立て、調整しても説明がずれないようにする
 */
import type { Mode } from '../core/generator';
import { ECONOMY, costFor, fuScale, uwanoseMean } from './machine/economy';
import { KAKUHEN_RATE, NORMAL_ODDS, RUSH_ODDS, ST_SPINS } from './machine/machine';

export type HelpTab = 'howto' | 'rules' | 'terms';

const TABS: [HelpTab, string][] = [
  ['howto', '遊び方'],
  ['rules', 'ノーマルのルール'],
  ['terms', '用語集'],
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
    body: `麻雀の点数を4択で答えます。1問の BET は ${costFor(true, false)} yan。締切までに正解すると半額の ${costFor(true, true)} yan で済みます。間違えると −${costFor(false, false)} yan。`,
  },
  {
    title: '正解すると台が回る',
    body: '正解するたびに玉が台に入り、保留ランプが点きます。保留があるかぎり台は自動で回り、図柄が3つそろえば大当り。',
  },
  {
    title: `大当りで BONUS ${ECONOMY.rounds}問`,
    body: `大当りすると次の${ECONOMY.rounds}問が BONUS ラウンド。BET なしで、正解した手の符が高いほど賞金が入ります。連続正解で倍率が上がり、全問正解なら上乗せ。確変なら RUSH に突入して、さらに当たりやすくなります。`,
  },
];

function howto(): string {
  return `
    <ol class="help-flow">${FLOW.map((s, i) => `<li><b><span class="n">${i + 1}</span>${s.title}</b><p>${s.body}</p></li>`).join('')}</ol>
    <div class="set-sec">2つのモード</div>
    <dl class="help-dl">
      <dt>ノーマル</dt><dd>yan を賭けて台を回すモード。問題は無制限で、所持金が尽きると破産です。</dd>
      <dt>プラクティス</dt><dd>演出も yan もない練習用。10・25・50問のスコア制で、速く正解するほど高得点。</dd>
    </dl>
    <div class="set-sec">3つの出題</div>
    <dl class="help-dl">
      <dt>早見</dt><dd>翻と符から点数を答える。点数表を覚える練習。</dd>
      <dt>符計算</dt><dd>手牌と状況から符を答える。</dd>
      <dt>実戦</dt><dd>手牌と状況から役・翻・符を数えて点数を答える。</dd>
    </dl>
    <div class="set-sec">操作</div>
    <dl class="help-dl keys">
      <dt><kbd>1</kbd>-<kbd>4</kbd></dt><dd>選択肢を選ぶ（タップでも可）</dd>
      <dt><kbd>Tab</kbd></dt><dd>パス / 次へ</dd>
      <dt><kbd>Esc</kbd></dt><dd>やり直し</dd>
      <dt>入力</dt><dd>出題設定で「入力」にすると数字で答えられます。子のツモは「子-親」（例 1000-2000）</dd>
    </dl>`;
}

function rules(mode: Mode): string {
  const cells = fuScale(mode, true, false);
  const plain = fuScale(mode, false, false);
  return `
    <div class="set-sec">お金（yan）</div>
    <table class="help-table">
      <tr><th>初期所持金</th><td>${ECONOMY.initial.toLocaleString()} yan</td></tr>
      <tr><th>1問の BET</th><td>${costFor(true, false)} yan</td></tr>
      <tr><th>速答で正解</th><td>半額の ${costFor(true, true)} yan（締切 ${fastWindows()}）</td></tr>
      <tr><th>不正解・パス・時間切れ</th><td>${costFor(false, false)} yan</td></tr>
      <tr><th>計器（画面下）</th><td>所持金・BET・収支を常に表示。BET は回答すると実際にかかった額に変わります。BONUS 中は収支の枠が出玉になります</td></tr>
    </table>
    <div class="set-sec">台</div>
    <table class="help-table">
      <tr><th>大当り確率</th><td>通常 1/${NORMAL_ODDS}・RUSH 中 1/${RUSH_ODDS}（正解1回で1回転）</td></tr>
      <tr><th>確変</th><td>大当りの ${Math.round(KAKUHEN_RATE * 100)}%。奇数と白發中でそろうと確変で、${ST_SPINS}回転の RUSH に入ります</td></tr>
      <tr><th>台の選択</th><td>液晶帯（台の名前 ▾）をタップすると台選び。大当りは重いが賞金の大きいミドル・MAX を yan で解放できます。ミドル以上は実戦のみ。上の表は甘デジの値です</td></tr>
      <tr><th>BONUS・RUSH の問題</th><td>出る手は通常時と同じ。4択の誤答は「同じ翻で符だけ違う点数」になり、符が分からないと当てられません</td></tr>
    </table>
    <div class="set-sec">BONUS ラウンドの賞金 <span class="muted small">${MODE_LABELS[mode]}・1問目</span></div>
    <table class="help-table prize">
      ${plain.map((c) => `<tr><th>${c.label}符</th><td>+${c.prize.toLocaleString()} yan</td></tr>`).join('')}
    </table>
    <p class="help-note">賞金は<b>正解した手の符</b>で決まります（翻・ドラ・親子では増えません。早見の満貫以上は30符ぶん）。速答は×${ECONOMY.fastMult}。ラウンド内の連続正解で ${ECONOMY.comboLadder.map((m) => `×${m}`).join('→')} と上がり、1問外すと×1に戻ります。<b>全問正解</b>ならラウンドの賞金に上乗せ抽選（平均×${uwanoseMean(false).toFixed(1)}）。赤五筒でそろう PREMIUM 大当りは賞金×${ECONOMY.premiumMult}、役満が出やすく（役満 +${cells.at(-1)!.prize.toLocaleString()} yan）、上乗せは最低×${ECONOMY.uwanosePremium[0][0]}。不正解はパンク（賞金なし）ですが、BET はかかりません。</p>
    <div class="set-sec">その他</div>
    <table class="help-table">
      <tr><th>ハイローラー</th><td>BET ×${ECONOMY.highRoller.costMult}、BONUS の賞金 ×${ECONOMY.highRoller.prizeMult}。画面下の計器の「×2」でいつでも切り替え</td></tr>
      <tr><th>交換所</th><td>稼いだ yan で景品（牌の背・液晶のスキン・称号）を買えます（右上の景品のアイコン）</td></tr>
      <tr><th>ミッション</th><td>計器の上の帯に今日のミッション。達成すると yan がもらえます。タップで一覧</td></tr>
      <tr><th>精算</th><td>出題設定の「精算」で、ここまでの成績・収支・大当り履歴を表示します。所持金と台はそのまま続きから遊べます</td></tr>
      <tr><th>破産</th><td>所持金が尽きると終了。${ECONOMY.initial.toLocaleString()} yan から再スタートします</td></tr>
    </table>`;
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
      ['リーチ', '左右の図柄がそろった状態。真ん中もそろえば大当り'],
      ['発展', 'リーチから大きな演出に移ること。回答はいったん止まる'],
      ['確変', '確率変動。大当り確率が上がった状態'],
      ['ST・RUSH', `確変が続く回転数（${ST_SPINS}回転）と、その間の状態。RUSH 中の4択は符の違いで迷わせる`],
      ['上乗せ', 'BONUS を全問正解すると、ラウンドの賞金に倍率を掛ける抽選がある'],
      ['回転', '前回の大当りから回った数（液晶帯の右上）'],
      ['スランプグラフ', '精算画面に出る所持金の推移。点線が初期所持金'],
    ])}`;
}

export function helpHtml(tab: HelpTab, mode: Mode): string {
  const body = tab === 'howto' ? howto() : tab === 'rules' ? rules(mode) : terms();
  return `<div class="settings help">
    <div class="set-head"><span>遊び方</span><button class="icon-btn" data-help-close aria-label="閉じる">×</button></div>
    <div class="cfg-group help-tabs" role="tablist">${TABS.map(
      ([t, l]) => `<button class="cfg${t === tab ? ' on' : ''}" role="tab" aria-selected="${t === tab}" data-help-tab="${t}">${l}</button>`,
    ).join('')}</div>
    <div class="help-body">${body}</div>
  </div>`;
}
