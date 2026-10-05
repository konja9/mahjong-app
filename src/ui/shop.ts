/**
 * yan の使い道：台の解放（液晶帯から開く台選び）・景品（交換所）・日替わりミッション（計器の上の帯）。
 * 保存は tensu.shop.v1 にまとめる。破産しても消えない（購入は恒久的な yan の使い道）
 */
import type { Mode } from '../core/generator';
import { MACHINE_IDS, type MachineId, SPECS } from './machine/specs';
import { type MissionState, ensureToday, missionDef } from './missions';
import { load, save } from './storage';

const KEY = 'tensu.shop.v1';

export type ItemKind = 'back' | 'skin' | 'bgm' | 'title';

/** 実力で解放する称号の条件に使う、パチンコでの累計の記録 */
export interface PlayStats {
  correct: Record<Mode, number>;
  fast: number;
  splitTsumo: number;
  maxStreak: number;
  /** BONUS の全問正解の回数 */
  perfectBonus: number;
  /** 1回の遊び（「成績を見る」まで）で100問以上・正解率95%以上を達成した */
  precise: number;
}

export const freshStats = (): PlayStats => ({
  correct: { hayami: 0, fu: 0, jissen: 0 },
  fast: 0,
  splitTsumo: 0,
  maxStreak: 0,
  perfectBonus: 0,
  precise: 0,
});

/** 実力の称号の条件：記録の値が target 以上で解放 */
export interface Unlock {
  get: (s: PlayStats) => number;
  target: number;
  label: string;
}

/** 称号のレア度（計器のプレートの色） */
export type Rarity = 'common' | 'rare' | 'epic' | 'legend';
export const RARITY_LABEL: Record<Rarity, string> = { common: 'コモン', rare: 'レア', epic: 'エピック', legend: 'レジェンド' };

/** 買う称号のレア度は値段で決める */
const rarityByPrice = (p: number): Rarity => (p >= 20000 ? 'legend' : p >= 5000 ? 'epic' : p >= 1500 ? 'rare' : 'common');

export interface ShopItem {
  id: string;
  kind: ItemKind;
  name: string;
  price: number;
  /** back：牌の背の色 / skin：液晶のスキン名 / bgm：曲の id / title：称号の文字 */
  value: string;
  /** 実力で解放する称号（買えない） */
  unlock?: Unlock;
  /** 称号のレア度 */
  rarity?: Rarity;
}

const title = (id: string, name: string, price: number): ShopItem => ({ id: `title-${id}`, kind: 'title', name, price, value: name, rarity: rarityByPrice(price) });
const earned = (id: string, name: string, rarity: Rarity, unlock: Unlock): ShopItem => ({ id: `title-${id}`, kind: 'title', name, price: 0, value: name, unlock, rarity });

export const ITEMS: ShopItem[] = [
  { id: 'back-green', kind: 'back', name: '深緑', price: 0, value: '#1f5c45' },
  { id: 'back-indigo', kind: 'back', name: '藍', price: 1500, value: '#243a6b' },
  { id: 'back-vermilion', kind: 'back', name: '朱', price: 1500, value: '#a8322a' },
  { id: 'back-black', kind: 'back', name: '漆黒', price: 3000, value: '#16161a' },
  { id: 'back-gold', kind: 'back', name: '金', price: 8000, value: '#c9a227' },
  { id: 'skin-gold', kind: 'skin', name: '黒金', price: 0, value: 'gold' },
  { id: 'skin-silver', kind: 'skin', name: '銀', price: 3500, value: 'silver' },
  { id: 'skin-urushi', kind: 'skin', name: '朱漆', price: 5000, value: 'urushi' },
  { id: 'skin-rainbow', kind: 'skin', name: '虹', price: 12000, value: 'rainbow' },
  { id: 'bgm-standard', kind: 'bgm', name: 'スタンダード', price: 0, value: 'standard' },
  { id: 'bgm-euro', kind: 'bgm', name: 'ユーロビート', price: 2500, value: 'euro' },
  { id: 'bgm-wa', kind: 'bgm', name: '和風', price: 4000, value: 'wa' },
  { id: 'bgm-chip', kind: 'bgm', name: 'チップチューン', price: 5000, value: 'chip' },
  { id: 'title-none', kind: 'title', name: 'なし', price: 0, value: '' },
  // 買う称号（安い順）
  title('hayami-new', '早見の新人', 500),
  title('tenbou', '点棒係', 700),
  title('fu-apprentice', '符の見習い', 800),
  title('regular', '雀荘の常連', 1000),
  title('night', '夜の雀士', 1500),
  title('fu-reader', '符読み', 2000),
  title('fast', '速答職人', 2500),
  title('mangan', '満貫の申し子', 3000),
  title('oni', '点数の鬼', 4000),
  title('yakuman', '役満ハンター', 5000),
  title('gambler', '鉄火場の勝負師', 7000),
  title('legend', '伝説の打ち手', 12000),
  title('master', 'パチふと名人', 20000),
  // 実力で解放する称号（運の条件は入れない）
  earned('first-perfect', '初陣', 'rare', { get: (s) => s.perfectBonus, target: 1, label: 'BONUS を初めて全問正解' }),
  earned('perfect10', '完全試合', 'epic', { get: (s) => s.perfectBonus, target: 10, label: 'BONUS の全問正解 10 回' }),
  earned('streak20', '連チャン職人', 'rare', { get: (s) => s.maxStreak, target: 20, label: '20 連続正解' }),
  earned('streak50', '不動心', 'epic', { get: (s) => s.maxStreak, target: 50, label: '50 連続正解' }),
  earned('streak100', '無双', 'legend', { get: (s) => s.maxStreak, target: 100, label: '100 連続正解' }),
  earned('fu500', '符の求道者', 'rare', { get: (s) => s.correct.fu, target: 500, label: '符計算で累計 500 問正解' }),
  earned('fu2000', '符の達人', 'legend', { get: (s) => s.correct.fu, target: 2000, label: '符計算で累計 2,000 問正解' }),
  earned('hayami1000', '早見の鬼', 'epic', { get: (s) => s.correct.hayami, target: 1000, label: '早見で累計 1,000 問正解' }),
  earned('jissen500', '実戦派', 'rare', { get: (s) => s.correct.jissen, target: 500, label: '実戦で累計 500 問正解' }),
  earned('fast300', '電光石火', 'rare', { get: (s) => s.fast, target: 300, label: '速答で累計 300 問正解' }),
  earned('tsumo200', 'ツモ計算士', 'rare', { get: (s) => s.splitTsumo, target: 200, label: '子のツモを累計 200 問正解' }),
  earned('precise', '精密機械', 'epic', { get: (s) => s.precise, target: 1, label: '1回の遊びで 100 問以上を正解率 95% 以上' }),
];

export interface ShopState {
  machine: MachineId;
  machines: MachineId[];
  owned: string[];
  equip: Record<ItemKind, string>;
  missions?: MissionState;
  stats: PlayStats;
}

/** 最初から持っている景品（無料で、実力の条件がないもの） */
const FREE = ITEMS.filter((i) => i.price === 0 && !i.unlock).map((i) => i.id);

export const freshShop = (): ShopState => ({
  machine: 'ama',
  machines: ['ama'],
  owned: [...FREE],
  equip: { back: 'back-green', skin: 'skin-gold', bgm: 'bgm-standard', title: 'title-none' },
  stats: freshStats(),
});

export function loadShop(): ShopState {
  const s = load<Partial<ShopState>>(KEY, freshShop());
  const f = freshShop();
  const stats = { ...f.stats, ...s.stats, correct: { ...f.stats.correct, ...s.stats?.correct } };
  // 後から増えた無料の景品（BGM のスタンダードなど）も持っていることにする
  const owned = [...new Set([...(s.owned ?? []), ...FREE])].filter((id) => ITEMS.some((i) => i.id === id));
  return { ...f, ...s, owned, stats, equip: { ...f.equip, ...s.equip } };
}

/** 実力の称号のうち、条件を満たしたのに未取得のものを取得し、新しく取れたものを返す */
export function checkUnlocks(s: ShopState): ShopItem[] {
  const got = ITEMS.filter((i) => i.unlock && !s.owned.includes(i.id) && i.unlock.get(s.stats) >= i.unlock.target);
  for (const i of got) s.owned.push(i.id);
  return got;
}
export const saveShop = (s: ShopState): void => save(KEY, s);

export const itemOf = (id: string): ShopItem => ITEMS.find((i) => i.id === id)!;
export const equipped = (s: ShopState, kind: ItemKind): ShopItem => itemOf(s.equip[kind]);

/** 景品を買う。買えたら支払う額を返す（買えなければ 0） */
export function buyItem(s: ShopState, id: string, balance: number): number {
  const it = itemOf(id);
  if (!it || it.unlock || s.owned.includes(id) || balance < it.price) return 0;
  s.owned.push(id);
  s.equip[it.kind] = id;
  return it.price;
}

export function equipItem(s: ShopState, id: string): boolean {
  if (!s.owned.includes(id)) return false;
  s.equip[itemOf(id).kind] = id;
  return true;
}

/** 台を解放する。解放できたら支払う額を返す */
export function unlockMachine(s: ShopState, id: MachineId, balance: number): number {
  const p = SPECS[id].price;
  if (s.machines.includes(id) || balance < p) return 0;
  s.machines.push(id);
  return p;
}

/** ダイアログの種類：台選び・交換所（景品）・ミッション */
export type ShopView = 'machine' | 'items' | 'missions';

const yen = (n: number) => `${n.toLocaleString()} yan`;

/** 台選び：台の一覧・解放・切り替え */
export function machinesHtml(s: ShopState, balance: number, canSwitch: boolean): string {
  return (
    MACHINE_IDS.map((id) => {
      const sp = SPECS[id];
      const have = s.machines.includes(id);
      const cur = s.machine === id;
      const btn = cur
        ? '<span class="shop-state">使用中</span>'
        : have
          ? `<button class="shop-btn" data-machine="${id}"${canSwitch ? '' : ' disabled'}>この台にする</button>`
          : `<button class="shop-btn buy" data-unlock="${id}"${balance >= sp.price ? '' : ' disabled'}>${yen(sp.price)}で解放</button>`;
      return `<div class="shop-row${cur ? ' cur' : ''}">
        <div><div class="shop-name">${sp.name}${sp.jissenOnly ? '<em>実戦のみ</em>' : ''}</div>
        <div class="shop-desc">大当り 1/${sp.odds}・RUSH 1/${sp.rushOdds}（${sp.st}回転）・BONUS ${sp.rounds}問・BET ×${sp.betMult}・賞金 ×${sp.prizeMult}</div></div>${btn}</div>`;
    }).join('') +
    (canSwitch ? '' : '<p class="help-note">BONUS 中と台が回っている間は、台を切り替えられません。</p>') +
    '<p class="help-note">上の台ほど大当りは重いが、BONUS が長く賞金が大きい。連続正解の倍率が長く続くので、実力のある人ほど大きく稼げます。</p>'
  );
}

/** 交換所：景品（見た目と音だけ。学習には影響しない） */
/** 交換所のタブ */
export type ItemsTab = 'title' | 'skin' | 'bgm';
export const ITEMS_TABS: [ItemsTab, string, ItemKind[]][] = [
  ['title', '称号', ['title']],
  ['skin', 'スキン', ['back', 'skin']],
  ['bgm', 'BGM', ['bgm']],
];

export function itemsHtml(s: ShopState, balance: number, canPreview = true, tab: ItemsTab = 'title'): string {
  const row = (i: ShopItem) => {
    const have = s.owned.includes(i.id);
    const on = s.equip[i.kind] === i.id;
    const swatch =
      i.kind === 'back' ? `<i class="swatch" style="background:${i.value}"></i>` : i.kind === 'skin' ? `<i class="swatch skin-${i.value}"></i>` : '';
    const preview =
      i.kind === 'bgm' ? `<button class="shop-btn ghost" data-preview="${i.value}"${canPreview ? '' : ' disabled'}>試聴</button>` : '';
    let btn: string;
    if (on) btn = '<span class="shop-state">装備中</span>';
    else if (have) btn = `<button class="shop-btn" data-equip="${i.id}">装備</button>`;
    else if (i.unlock) btn = '<span class="shop-lock" aria-label="未解放">🔒</span>';
    else btn = `<button class="shop-btn buy" data-buy="${i.id}"${balance >= i.price ? '' : ' disabled'}>${yen(i.price)}</button>`;
    // 実力の称号：条件と進み具合
    let cond = '';
    if (i.unlock && !have) {
      const v = Math.min(i.unlock.get(s.stats), i.unlock.target);
      cond = `<div class="shop-desc">${i.unlock.label}</div><div class="mis-bar"><i style="width:${(v / i.unlock.target) * 100}%"></i></div><div class="shop-desc">${v.toLocaleString()}/${i.unlock.target.toLocaleString()}</div>`;
    } else if (i.unlock) cond = `<div class="shop-desc">${i.unlock.label}</div>`;
    const rar = i.rarity && i.value ? `<span class="rar r-${i.rarity}">${RARITY_LABEL[i.rarity]}</span>` : '';
    const name = `<div class="shop-name">${swatch}${i.name}${rar}${i.unlock ? '<em>実力</em>' : ''}</div>`;
    return `<div class="shop-row${on ? ' cur' : ''}${i.unlock && !have ? ' locked' : ''}"><div class="mis">${name}${cond}</div><div class="shop-acts">${preview}${btn}</div></div>`;
  };
  const group = (title: string, items: ShopItem[]) => `<div class="set-sec">${title}</div>${items.map(row).join('')}`;
  const of = (kind: ItemKind) => ITEMS.filter((i) => i.kind === kind);
  const titles = of('title');
  const earnedCount = titles.filter((i) => i.unlock && s.owned.includes(i.id)).length;
  // タブ：所持数を小さく出す（「なし」など最初から持っているものも数える）
  const tabs = ITEMS_TABS.map(([t, label, kinds]) => {
    const all = ITEMS.filter((i) => kinds.includes(i.kind) && i.value !== '');
    const have = all.filter((i) => s.owned.includes(i.id)).length;
    return `<button class="cfg${t === tab ? ' on' : ''}" role="tab" aria-selected="${t === tab}" data-items-tab="${t}">${label}<small>${have}/${all.length}</small></button>`;
  }).join('');
  let body: string;
  if (tab === 'skin') body = group('牌の背', of('back')) + group('液晶のスキン', of('skin'));
  else if (tab === 'bgm')
    body = group('BGM（BONUS・RUSH の曲）', of('bgm')) + '<p class="help-note">BONUS と RUSH の間に流れる曲です。試聴は BONUS・RUSH 中以外にできます。</p>';
  else
    body =
      '<p class="help-note top">装備すると、画面下の計器の「所持」の横にプレートで表示されます。色はレア度（コモン・レア・エピック・レジェンド）。</p>' +
      group('称号', titles.filter((i) => !i.unlock)) +
      group(`実力の称号 <span class="muted small">${earnedCount}/${titles.filter((i) => i.unlock).length}</span>`, titles.filter((i) => i.unlock)) +
      '<p class="help-note">実力の称号は買えません。パチンコで条件を満たすと自動で手に入ります。</p>';
  return `<div class="cfg-group help-tabs items-tabs" role="tablist">${tabs}</div>${body}`;
}

/** 今日のミッションの一覧 */
export function missionsHtml(s: ShopState): string {
  const m = ensureToday(s.missions);
  return (
    m.ids
      .map((id) => {
        const d = missionDef(id);
        const v = m.progress[id] ?? 0;
        const done = m.done.includes(id);
        return `<div class="shop-row${done ? ' cur' : ''}"><div class="mis"><div class="shop-name">${d.label}</div>
          <div class="mis-bar"><i style="width:${(v / d.target) * 100}%"></i></div><div class="shop-desc">${done ? '達成' : `${v}/${d.target}`}</div></div>
          <span class="shop-reward">+${d.reward.toLocaleString()}</span></div>`;
      })
      .join('') + '<p class="help-note">ミッションは毎日変わります（パチンコのみ）。達成すると yan がすぐに入ります。</p>'
  );
}

const TITLES: Record<ShopView, string> = { machine: '台選び', items: '交換所', missions: '今日のミッション' };

/** ダイアログの中身 */
export function shopHtml(s: ShopState, view: ShopView, balance: number, canSwitch: boolean, tab: ItemsTab = 'title'): string {
  // canSwitch：台選びでは台を切り替えられるか、交換所では試聴できるか
  const body =
    view === 'machine' ? machinesHtml(s, balance, canSwitch) : view === 'items' ? itemsHtml(s, balance, canSwitch, tab) : missionsHtml(s);
  return `<div class="settings help shop">
    <div class="set-head"><span>${TITLES[view]}</span><span class="shop-wallet">所持 <b>${balance.toLocaleString()}</b> yan</span><button class="icon-btn" data-shop-close aria-label="閉じる">×</button></div>
    <div class="help-body">${body}</div>
  </div>`;
}

/** 計器の上の帯：未達成のうち最も進んでいるミッション（全部達成なら完了表示） */
export function missionStrip(s: ShopState): { text: string; done: number; total: number; ratio: number } {
  const m = ensureToday(s.missions);
  const open = m.ids.filter((id) => !m.done.includes(id));
  if (!open.length) return { text: '今日のミッションはすべて達成', done: m.ids.length, total: m.ids.length, ratio: 1 };
  const ratio = (id: string) => (m.progress[id] ?? 0) / missionDef(id).target;
  const id = open.reduce((a, b) => (ratio(b) > ratio(a) ? b : a));
  const d = missionDef(id);
  return {
    text: `${d.label} ${m.progress[id] ?? 0}/${d.target}`,
    done: m.done.length,
    total: m.ids.length,
    ratio: ratio(id),
  };
}
