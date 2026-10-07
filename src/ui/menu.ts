import { charaSvg } from './tutorial/chara';

/**
 * 右上の「メニュー」。ゲーム画面には答えるのに要るものだけを残し、
 * 台選び・改造・昇段試験・交換所・物語・成績・遊び方・設定・スタート画面はここから開く
 */

export type MenuItem = 'machine' | 'parts' | 'exam' | 'shop' | 'story' | 'summary' | 'help' | 'settings' | 'start';

export interface MenuBadges {
  /** 受けられる昇段試験がある */
  exam: boolean;
  /** 枠が空いていて、付けていないパーツがある */
  parts: boolean;
  /** 読んでいない話がある */
  story: boolean;
}

export function menuBadges(o: { canExam: boolean; slots: number; equipped: number; owned: number; unread: number }): MenuBadges {
  return {
    exam: o.canExam,
    parts: o.equipped < o.slots && o.owned > o.equipped,
    story: o.unread > 0,
  };
}

/** メニューのアイコンに赤い点を出すか */
export const hasBadge = (b: MenuBadges): boolean => b.exam || b.parts || b.story;

export interface MenuView {
  level: number;
  /** 今の Lv の中での経験値と、次の Lv までに要る量 */
  into: number;
  need: number;
  rank: string;
  title: string;
  balance: number;
  dayNet: number;
  slots: number;
  equipped: number;
  machine: string;
  /** 稽古中（台・改造・昇段試験・成績はパチンコに切り替えて開く） */
  keiko: boolean;
  badges: MenuBadges;
}

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString()}`;

export function menuHtml(v: MenuView): string {
  const pct = Math.round((v.into / Math.max(1, v.need)) * 100);
  const tile = (id: MenuItem, label: string, sub: string, badge = false) =>
    `<button class="mn-tile" type="button" data-menu="${id}"><b>${label}</b><small>${sub}</small>${badge ? '<em class="mn-new">NEW</em>' : ''}</button>`;
  const pachi = v.keiko ? '（パチンコへ）' : '';
  return `<div class="settings menu">
    <div class="set-head"><span>メニュー</span><button class="icon-btn" data-menu-close aria-label="閉じる">×</button></div>
    <div class="mn-me">
      <div class="mn-face">${charaSvg('grin')}</div>
      <div class="mn-stat">
        <div class="mn-lv"><b>Lv ${v.level}</b>${v.rank ? `<span class="xp-rank">${v.rank}</span>` : '<span class="mn-norank">段位なし</span>'}${v.title ? `<span class="mn-title">${v.title}</span>` : ''}</div>
        <div class="mn-xp"><i style="width:${pct}%"></i></div>
        <small class="mn-next">${v.into.toLocaleString()} / ${v.need.toLocaleString()} exp</small>
        <div class="mn-money">所持 <b>${v.balance.toLocaleString()}</b> yan ・ 本日 <b class="${v.dayNet < 0 ? 'minus' : ''}">${signed(v.dayNet)}</b></div>
      </div>
    </div>
    <div class="mn-grid">
      ${tile('machine', '台選び', `${v.machine}${pachi}`)}
      ${tile('parts', '改造', `枠 ${v.equipped}/${v.slots}`, v.badges.parts)}
      ${tile('exam', '昇段試験', v.rank ? `今は ${v.rank}` : 'まだ段位なし', v.badges.exam)}
      ${tile('shop', '交換所', '称号・スキン・BGM')}
      ${tile('story', '物語', 'パチふとくんの記憶', v.badges.story)}
      ${tile('summary', '成績を見る', v.keiko ? 'パチンコの成績' : '正答率・収支で区切る')}
      ${tile('help', '遊び方', '符の数え方・台のしくみ')}
      ${tile('settings', '設定', '演出・音・ルール')}
      ${tile('start', 'スタート画面へ', 'チュートリアルもここから')}
    </div>
  </div>`;
}
