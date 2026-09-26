/**
 * yan の使い道：台の解放（液晶帯から開く台選び）・景品（交換所）・日替わりミッション（計器の上の帯）。
 * 保存は tensu.shop.v1 にまとめる。破産しても消えない（購入は恒久的な yan の使い道）
 */
import { MACHINE_IDS, type MachineId, SPECS } from './machine/specs';
import { type MissionState, ensureToday, missionDef } from './missions';
import { load, save } from './storage';

const KEY = 'tensu.shop.v1';

export type ItemKind = 'back' | 'skin' | 'title';

export interface ShopItem {
  id: string;
  kind: ItemKind;
  name: string;
  price: number;
  /** back：牌の背の色 / skin：液晶のスキン名 / title：称号の文字 */
  value: string;
}

export const ITEMS: ShopItem[] = [
  { id: 'back-green', kind: 'back', name: '深緑', price: 0, value: '#1f5c45' },
  { id: 'back-indigo', kind: 'back', name: '藍', price: 4000, value: '#243a6b' },
  { id: 'back-vermilion', kind: 'back', name: '朱', price: 4000, value: '#a8322a' },
  { id: 'back-black', kind: 'back', name: '漆黒', price: 8000, value: '#16161a' },
  { id: 'back-gold', kind: 'back', name: '金', price: 25000, value: '#c9a227' },
  { id: 'skin-gold', kind: 'skin', name: '黒金', price: 0, value: 'gold' },
  { id: 'skin-silver', kind: 'skin', name: '銀', price: 10000, value: 'silver' },
  { id: 'skin-urushi', kind: 'skin', name: '朱漆', price: 15000, value: 'urushi' },
  { id: 'skin-rainbow', kind: 'skin', name: '虹', price: 40000, value: 'rainbow' },
  { id: 'title-none', kind: 'title', name: 'なし', price: 0, value: '' },
  { id: 'title-regular', kind: 'title', name: '雀荘の常連', price: 3000, value: '雀荘の常連' },
  { id: 'title-fast', kind: 'title', name: '速答職人', price: 8000, value: '速答職人' },
  { id: 'title-yakuman', kind: 'title', name: '役満ハンター', price: 15000, value: '役満ハンター' },
  { id: 'title-master', kind: 'title', name: 'パチふと名人', price: 60000, value: 'パチふと名人' },
];

export interface ShopState {
  machine: MachineId;
  machines: MachineId[];
  owned: string[];
  equip: Record<ItemKind, string>;
  missions?: MissionState;
}

export const freshShop = (): ShopState => ({
  machine: 'ama',
  machines: ['ama'],
  owned: ITEMS.filter((i) => i.price === 0).map((i) => i.id),
  equip: { back: 'back-green', skin: 'skin-gold', title: 'title-none' },
});

export function loadShop(): ShopState {
  const s = load<ShopState>(KEY, freshShop());
  return { ...freshShop(), ...s, equip: { ...freshShop().equip, ...s.equip } };
}
export const saveShop = (s: ShopState): void => save(KEY, s);

export const itemOf = (id: string): ShopItem => ITEMS.find((i) => i.id === id)!;
export const equipped = (s: ShopState, kind: ItemKind): ShopItem => itemOf(s.equip[kind]);

/** 景品を買う。買えたら支払う額を返す（買えなければ 0） */
export function buyItem(s: ShopState, id: string, balance: number): number {
  const it = itemOf(id);
  if (!it || s.owned.includes(id) || balance < it.price) return 0;
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

/** 交換所：景品（見た目だけ） */
export function itemsHtml(s: ShopState, balance: number): string {
  const group = (kind: ItemKind, title: string) =>
    `<div class="set-sec">${title}</div>` +
    ITEMS.filter((i) => i.kind === kind)
      .map((i) => {
        const have = s.owned.includes(i.id);
        const on = s.equip[kind] === i.id;
        const swatch = kind === 'back' ? `<i class="swatch" style="background:${i.value}"></i>` : kind === 'skin' ? `<i class="swatch skin-${i.value}"></i>` : '';
        const btn = on
          ? '<span class="shop-state">装備中</span>'
          : have
            ? `<button class="shop-btn" data-equip="${i.id}">装備</button>`
            : `<button class="shop-btn buy" data-buy="${i.id}"${balance >= i.price ? '' : ' disabled'}>${yen(i.price)}</button>`;
        return `<div class="shop-row${on ? ' cur' : ''}"><div class="shop-name">${swatch}${i.name}</div>${btn}</div>`;
      })
      .join('');
  return group('back', '牌の背') + group('skin', '液晶のスキン') + group('title', '称号');
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
      .join('') + '<p class="help-note">ミッションは毎日変わります（ノーマルのみ）。達成すると yan がすぐに入ります。</p>'
  );
}

const TITLES: Record<ShopView, string> = { machine: '台選び', items: '交換所', missions: '今日のミッション' };

/** ダイアログの中身 */
export function shopHtml(s: ShopState, view: ShopView, balance: number, canSwitch: boolean): string {
  const body = view === 'machine' ? machinesHtml(s, balance, canSwitch) : view === 'items' ? itemsHtml(s, balance) : missionsHtml(s);
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
