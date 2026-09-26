/**
 * 初めて開いたときだけ出す3ステップの導入。
 * 「正解 → 玉が入って台が回る → 大当りで BONUS」の流れを先に見せる
 */
import { ECONOMY, costFor, fuScale } from './machine/economy';
import { FLOW } from './help';
import { load, save } from './storage';

const KEY = 'tensu.intro.v1';

export const introSeen = (): boolean => load<boolean>(KEY, false) === true;
export const markIntroSeen = (): void => save(KEY, true);

/** 各ステップの小さな図（実際の計器・液晶帯と同じ見た目） */
const VISUALS = [
  `<div class="iv iv-q">
    <div class="mt-cell mt-bet"><div class="bet-box"><small>BET<em>速答で割引</em></small><span class="bet-v"><s>${costFor(true, false)}</s><b>${costFor(true, true)}</b></span><i class="bar"></i></div></div>
    <div class="iv-choices"><span><kbd>1</kbd>3900</span><span class="on"><kbd>2</kbd>5200</span><span><kbd>3</kbd>6400</span><span><kbd>4</kbd>7700</span></div>
  </div>`,
  `<div class="iv iv-flow">
    <span class="iv-tag">正解</span><span class="iv-arrow">→</span>
    <span class="iv-holds"><span class="hold on blue"></span><span class="hold on red"></span><span class="hold on gold"></span><span class="hold"></span></span>
    <span class="iv-arrow">→</span><span class="iv-reel"><b>7</b><b>7</b><b>7</b></span>
  </div>`,
  `<div class="iv iv-bonus">
    <div class="b-head"><span class="b-title">ROUND 2/${ECONOMY.rounds}</span><span class="b-pips">${Array.from({ length: ECONOMY.rounds }, (_, i) => `<i class="${i < 2 ? 'on' : ''}"></i>`).join('')}</span></div>
    <div class="b-ladder"><small>連続</small>${ECONOMY.comboLadder.map((m, i) => `<i class="${i < 1 ? 'past' : i === 1 ? 'now' : ''}">×${m}</i>`).join('<span>›</span>')}</div>
    <div class="b-table">${fuScale('jissen', false)
      .map((c) => `<div class="b-cell${c.key === 50 ? ' lit' : ''}"><small>${c.label}<u>符</u></small><b>${c.prize}</b></div>`)
      .join('')}</div>
  </div>`,
];

export function introHtml(step: number): string {
  const s = FLOW[step];
  const last = step === FLOW.length - 1;
  const dots = FLOW.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('');
  const note = last
    ? '<p class="intro-note">点数計算に自信がなければ、yan を使わないプラクティスで練習できます。遊び方はいつでも右上の <b>？</b> から。</p>'
    : '';
  const actions = last
    ? '<button class="cfg" data-intro="practice">プラクティスで練習</button><button class="cfg on" data-intro="start">はじめる</button>'
    : '<button class="cfg ghost" data-intro="skip">スキップ</button><button class="cfg on" data-intro="next">次へ</button>';
  return `<div class="intro">
    <div class="intro-head"><span class="intro-step">STEP ${step + 1}/${FLOW.length}</span><span class="intro-dots">${dots}</span></div>
    ${VISUALS[step]}
    <h2>${s.title}</h2>
    <p>${s.body}</p>
    ${note}
    <div class="intro-actions">${actions}</div>
  </div>`;
}
