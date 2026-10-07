/**
 * yan の使い道：台の解放（液晶帯から開く台選び）・景品（交換所）。
 * 保存は tensu.shop.v1 にまとめる。破産しても消えない（購入は恒久的な yan の使い道）
 */
import type { Mode } from '../core/generator';
import { MACHINE_IDS, type MachineId, SPECS } from './machine/specs';
import { PARTS, PART_ORDER, type PartsState } from './machine/parts';
import { partSvg, slotRowHtml } from './machine/partArt';
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
  /** 交換所に出す世界観の一言 */
  flavor?: string;
}

const title = (id: string, name: string, price: number, flavor?: string): ShopItem => ({ id: `title-${id}`, kind: 'title', name, price, value: name, rarity: rarityByPrice(price), flavor });
const earned = (id: string, name: string, rarity: Rarity, unlock: Unlock, flavor?: string): ShopItem => ({ id: `title-${id}`, kind: 'title', name, price: 0, value: name, unlock, rarity, flavor });

export const ITEMS: ShopItem[] = [
  { id: 'back-green', kind: 'back', name: '深緑', price: 0, value: '#1f5c45' , flavor: '昔ながらの雀卓の色。いちばん目にやさしい' },
  { id: 'back-indigo', kind: 'back', name: '藍', price: 1500, value: '#243a6b' , flavor: '夜明け前の空の色。徹夜明けの雀士に人気' },
  { id: 'back-vermilion', kind: 'back', name: '朱', price: 1500, value: '#a8322a' , flavor: '昔の賭場の卓の色。見るだけで血がたぎる' },
  { id: 'back-black', kind: 'back', name: '漆黒', price: 3000, value: '#16161a' , flavor: 'ネオンの照り返しが映える。地下の常連御用達' },
  { id: 'back-gold', kind: 'back', name: '金', price: 8000, value: '#c9a227' , flavor: '成り上がった者だけが許される輝き' },
  { id: 'skin-gold', kind: 'skin', name: '黒金', price: 0, value: 'gold' , flavor: 'パチふとの標準仕様。デビューの日から変わらない' },
  { id: 'skin-silver', kind: 'skin', name: '銀', price: 3500, value: 'silver' , flavor: '昼のホール時代の限定色。今では珍しい' },
  { id: 'skin-urushi', kind: 'skin', name: '朱漆', price: 5000, value: 'urushi' , flavor: '職人が塗り重ねた漆。賭場の旦那衆が好んだ' },
  { id: 'skin-rainbow', kind: 'skin', name: '虹', price: 12000, value: 'rainbow' , flavor: '大当りの光をそのまま閉じ込めた、と言われる' },
  { id: 'bgm-standard', kind: 'bgm', name: 'スタンダード', price: 0, value: 'standard' , flavor: '通常時の曲を、BONUS 用に盛り上げたアレンジ' },
  { id: 'bgm-euro', kind: 'bgm', name: 'ユーロビート', price: 2500, value: 'euro' , flavor: 'ネオン街の夜を駆け抜けるビート' },
  { id: 'bgm-wa', kind: 'bgm', name: '和風', price: 4000, value: 'wa' , flavor: '祭り太鼓で大当りを祝う、昔ながらの賭場の音' },
  { id: 'bgm-chip', kind: 'bgm', name: 'チップチューン', price: 5000, value: 'chip' , flavor: '初代の筐体を思い出す、懐かしい電子音' },
  { id: 'bgm-enka', kind: 'bgm', name: '演歌', price: 6000, value: 'enka' , flavor: '泣きも笑いも、点棒といっしょに飲み込む' },
  { id: 'bgm-jazz', kind: 'bgm', name: 'ジャズ', price: 7500, value: 'jazz' , flavor: '地下のバーで鳴っていた、大人の勝負の音' },
  { id: 'bgm-metal', kind: 'bgm', name: 'メタル', price: 9000, value: 'metal' , flavor: 'BONUS の熱をそのまま音にした' },
  { id: 'title-none', kind: 'title', name: 'なし', price: 0, value: '' },
  // 買う称号（安い順）
  title('hayami-new', '早見の新人', 500, '早見表を片手に、今日も卓へ'),
  title('tenbou', '点棒係', 700, '点棒を数えるだけの係。だが数えられるだけマシだ'),
  title('fu-apprentice', '符の見習い', 800, '副底20符から一段ずつ。誰もが通った道'),
  title('regular', '雀荘の常連', 1000, '店員に顔を覚えられたら、一人前'),
  title('night', '夜の雀士', 1500, 'ネオンが灯ってからが本番'),
  title('fu-reader', '符読み', 2000, '手牌を見れば、符が透けて見える'),
  title('fast', '速答職人', 2500, '迷わない指先。BET 半額は伊達じゃない'),
  title('mangan', '満貫の申し子', 3000, '満貫の手前で止まらない'),
  title('oni', '点数の鬼', 4000, '点数のことなら、鬼より怖い'),
  title('yakuman', '役満ハンター', 5000, '一生に一度を、何度でも'),
  title('gambler', '鉄火場の勝負師', 7000, '身分を賭けた勝負から、逃げない'),
  title('legend', '伝説の打ち手', 12000, 'その名は、地下の賭場にも届いている'),
  title('master', 'パチふと名人', 20000, 'パチふとを知り尽くした者の証'),
  // 実力で解放する称号（運の条件は入れない）
  earned('first-perfect', '初陣', 'rare', { get: (s) => s.perfectBonus, target: 1, label: 'BONUS を初めて全問正解' }, '初めての BONUS 全問正解。忘れられない夜'),
  earned('perfect10', '完全試合', 'epic', { get: (s) => s.perfectBonus, target: 10, label: 'BONUS の全問正解 10 回' }, '数え間違いを知らない'),
  earned('streak20', '連チャン職人', 'rare', { get: (s) => s.maxStreak, target: 20, label: '20 連続正解' }, '波に乗ったら、降りない'),
  earned('streak50', '不動心', 'epic', { get: (s) => s.maxStreak, target: 50, label: '50 連続正解' }, '何が来ても、表情ひとつ変えない'),
  earned('streak100', '無双', 'legend', { get: (s) => s.maxStreak, target: 100, label: '100 連続正解' }, 'ここまで来ると、もはや伝説'),
  earned('fu500', '符の求道者', 'rare', { get: (s) => s.correct.fu, target: 500, label: '符計算で累計 500 問正解' }, '符の道は、まだ半ば'),
  earned('fu2000', '符の達人', 'legend', { get: (s) => s.correct.fu, target: 2000, label: '符計算で累計 2,000 問正解' }, '符を数えることが、呼吸と同じになった'),
  earned('hayami1000', '早見の鬼', 'epic', { get: (s) => s.correct.hayami, target: 1000, label: '早見で累計 1,000 問正解' }, '早見表は、もう頭の中にある'),
  earned('jissen500', '実戦派', 'rare', { get: (s) => s.correct.jissen, target: 500, label: '実戦で累計 500 問正解' }, '机上の計算より、卓の上の手牌'),
  earned('fast300', '電光石火', 'rare', { get: (s) => s.fast, target: 300, label: '速答で累計 300 問正解' }, '考えるより先に、答えが出る'),
  earned('tsumo200', 'ツモ計算士', 'rare', { get: (s) => s.splitTsumo, target: 200, label: '子のツモを累計 200 問正解' }, '子のツモの「子-親」で迷わない'),
  earned('precise', '精密機械', 'epic', { get: (s) => s.precise, target: 1, label: '1回の遊びで 100 問以上を正解率 95% 以上' }, '百問打って、ほとんど外さない'),
];

export interface ShopState {
  machine: MachineId;
  machines: MachineId[];
  owned: string[];
  equip: Record<ItemKind, string>;
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
  // 廃止した日替わりミッションの記録は読み捨てる
  const { missions: _old, ...rest } = s as Partial<ShopState> & { missions?: unknown };
  return { ...f, ...rest, owned, stats, equip: { ...f.equip, ...s.equip } };
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

/** ダイアログの種類：台選び・交換所（景品） */
export type ShopView = 'machine' | 'items';

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
        <div class="shop-flavor">${sp.flavor}</div>
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
    const flavor = i.flavor ? `<div class="shop-flavor">${i.flavor}</div>` : '';
    return `<div class="shop-row${on ? ' cur' : ''}${i.unlock && !have ? ' locked' : ''}"><div class="mis">${name}${flavor}${cond}</div><div class="shop-acts">${preview}${btn}</div></div>`;
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
    body = group('BGM（BONUS・RUSH の曲）', of('bgm')) + '<p class="help-note">BONUS と RUSH の間に流れる曲です（通常時・稽古・スタート画面の曲は固定）。試聴は BONUS・RUSH 中以外にできます。</p>';
  else
    body =
      '<p class="help-note top">装備すると、計器の Lv の下にプレートで表示されます。色はレア度（コモン・レア・エピック・レジェンド）。</p>' +
      group('称号', titles.filter((i) => !i.unlock)) +
      group(`実力の称号 <span class="muted small">${earnedCount}/${titles.filter((i) => i.unlock).length}</span>`, titles.filter((i) => i.unlock)) +
      '<p class="help-note">実力の称号は買えません。パチンコで条件を満たすと自動で手に入ります。</p>';
  return `<div class="cfg-group help-tabs items-tabs" role="tablist">${tabs}</div>${body}`;
}

const TITLES: Record<ShopView, string> = { machine: '台選び', items: '交換所' };
const MACHINE_TITLES: Record<MachineTab, string> = { machines: '台選び', parts: '改造', exam: '昇段試験' };

/** 台の改造（パーツの一覧と枠）。canChange：付け替えできるか（BONUS 中・回転中はできない） */
export interface PartsView {
  state: PartsState;
  slots: number;
  /** 今の段位の名前（なしは空） */
  rank: string;
  /** 次に枠が増える段位（最大なら null） */
  nextSlotRank: string | null;
  /** 5つの枠それぞれの、鍵が開く段位の名前 */
  slotRanks: string[];
  canChange: boolean;
}

export function partsHtml(v: PartsView): string {
  const used = v.state.equip.length;
  const names = Object.fromEntries(v.state.equip.map((id) => [id, PARTS[id].name]));
  const row = slotRowHtml({ equip: v.state.equip, slots: v.slots, ranks: v.slotRanks, labels: true, names });
  const sleeping = v.slotRanks.length - v.slots;
  const desc = v.nextSlotRank
    ? `あと${sleeping}つの枠が鍵の中。次は<b>${v.nextSlotRank}</b>の昇段試験で開く`
    : '台の枠は、すべて開いた';
  const head = `<div class="parts-head"><div><b>改造の枠</b><small class="muted">開いた枠 ${v.slots}/${v.slotRanks.length}・付けている ${used}${v.rank ? `・段位 ${v.rank}` : ''}</small></div>
    <div class="slot-row big">${row}</div>
    <div class="shop-desc">${desc}</div></div>`;
  const rows = PART_ORDER.map((id, i) => {
    const p = PARTS[id];
    const have = v.state.owned.includes(id);
    const on = v.state.equip.includes(id);
    let btn: string;
    if (!have) btn = `<span class="shop-lock">Lv ${i + 2}</span>`;
    else if (on) btn = `<button class="shop-btn" data-part-off="${id}"${v.canChange ? '' : ' disabled'}>外す</button>`;
    else if (!v.slots) btn = `<span class="shop-lock">枠が鍵の中</span>`;
    else btn = `<button class="shop-btn buy" data-part-on="${id}"${v.canChange && used < v.slots ? '' : ' disabled'}>付ける</button>`;
    const art = `<div class="part-thumb${on ? ' on' : ''}${have ? '' : ' unknown'}">${partSvg(id)}</div>`;
    return `<div class="shop-row part-row${on ? ' cur' : ''}${have ? '' : ' locked'}">${art}<div class="mis"><div class="shop-name">${have ? p.name : '？？？'}${on ? '<em>装着中</em>' : ''}</div>${have ? `<div class="shop-flavor">${p.flavor}</div><div class="shop-desc">${p.desc}</div>` : `<div class="shop-desc">Lv ${i + 2} で手に入る</div>`}</div><div class="shop-acts">${btn}</div></div>`;
  }).join('');
  const note = v.canChange ? '' : '<p class="help-note">BONUS 中と台が回っている間は、付け替えできません。</p>';
  const zero = v.slots ? '' : `<p class="help-note parts-zero">${v.nextSlotRank}の昇段試験に受かると、台の枠の鍵が開いてパーツを付けられます。</p>`;
  return head + zero + rows + note + `<p class="help-note">改造パーツは Lv が上がるたびに1つ手に入ります（Lv ${PART_ORDER.length + 1} まで）。台の枠は5つ。昇段試験の5級・3級・1級・二段・名人に受かるたびに、鍵が1つずつ開きます。</p>`;
}

/** 台のダイアログで出す画面（メニューの台選び・改造・昇段試験） */
export type MachineTab = 'machines' | 'parts' | 'exam';

/** ダイアログの中身 */
export function shopHtml(
  s: ShopState,
  view: ShopView,
  balance: number,
  canSwitch: boolean,
  tab: ItemsTab = 'title',
  parts?: { view: PartsView; tab: MachineTab; examHtml?: string },
): string {
  // canSwitch：台選びでは台を切り替えられるか、交換所では試聴できるか
  // 台のダイアログは、メニューで選んだ画面（台選び・改造・昇段試験）だけを出す
  let body: string;
  let title: string = TITLES[view];
  if (view === 'machine') {
    const t = parts?.tab ?? 'machines';
    title = MACHINE_TITLES[t];
    body = parts && t === 'parts' ? partsHtml(parts.view) : parts && t === 'exam' ? (parts.examHtml ?? '') : machinesHtml(s, balance, canSwitch);
  } else body = itemsHtml(s, balance, canSwitch, tab);
  return `<div class="settings help shop">
    <div class="set-head"><span>${title}</span><span class="shop-wallet">所持yan <b>${balance.toLocaleString()}</b> yan</span><button class="icon-btn" data-shop-close aria-label="閉じる">×</button></div>
    <div class="help-body">${body}</div>
  </div>`;
}
