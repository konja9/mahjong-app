import { describe, expect, it } from 'vitest';
import { evaluate, evaluateAll } from '../src/core/evaluate';
import { generateQuestion } from '../src/core/generator';
import { defaultSituation } from '../src/core/hand';
import { DEFAULT_RULES } from '../src/core/rules';
import { parseTiles } from '../src/core/tiles';
import { blocksHtml, handExplain } from '../src/ui/explain';
import { FU_EXAMPLES, helpHtml } from '../src/ui/help';
import { ev, hand } from './helpers';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tileCount = (html: string) => (html.match(/<svg class="tile/g) ?? []).length;

describe('符の内訳（解説用の全項目）', () => {
  it('0符の項目も含めた合計が、切り上げ前の符と一致する', () => {
    const rng = mulberry32(5);
    for (const mode of ['fu', 'jissen'] as const) {
      for (let i = 0; i < 800; i++) {
        const q = generateQuestion(mode, DEFAULT_RULES, { seat: 'any', win: 'any' }, rng);
        if (q.mode === 'hayami' || q.ev.yakuman) continue;
        const sum = q.ev.fu.rows.reduce((s, r) => s + r.fu, 0);
        expect(sum).toBe(q.ev.fu.raw);
      }
    }
  });

  it('平和ツモは各項目0符で合計20符、ツモ符を付けない理由が出る', () => {
    const e = ev(hand('234m567p234s88p67s', '5s'), { tsumo: true })!;
    expect(e.fu.fu).toBe(20);
    expect(e.fu.rows.find((r) => r.label === 'ツモ')).toMatchObject({ fu: 0, note: '平和ツモには付けない' });
  });

  it('双碰待ちのロンで完成した刻子は「ロンで完成＝明刻扱い」', () => {
    const e = ev(hand('234m567p555s99m11p', '1p'), { riichi: true })!;
    const row = e.fu.rows.find((r) => r.label.startsWith('明刻 1筒'));
    expect(row?.fu).toBe(4);
    expect(row?.note).toContain('ロンで完成');
  });

  it('鳴いた手のロンは門前ロンが付かない理由を出す', () => {
    // 喰いタンの双碰待ち
    const e = ev(hand('234m567p88s33p', '3p', [{ type: 'chi', tile: parseTiles('3s')[0] }]))!;
    expect(e).not.toBeNull();
    expect(e.fu.rows.find((r) => r.label === '門前ロン')).toMatchObject({ fu: 0, note: '鳴いているので付かない' });
  });
});

describe('面子の区切り図', () => {
  it('和了牌で完成した面子（winGroup）に和了牌が入っている', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 800; i++) {
      const q = generateQuestion('fu', DEFAULT_RULES, { seat: 'any', win: 'any' }, rng);
      if (q.mode !== 'fu' || q.ev.interp.form !== 'standard') continue;
      const it = q.ev.interp;
      const win = q.hand.winTile;
      if (it.winGroup === -1) expect(it.pair).toBe(win);
      else {
        const g = it.groups[it.winGroup];
        expect(g.called).toBe(false);
        expect(win >= g.tile && win <= g.tile + (g.kind === 'shuntsu' ? 2 : 0)).toBe(true);
      }
    }
  });

  it('区切り図の牌の数は手牌と同じ（槓子は4枚）で、和了牌が1枚だけ光る', () => {
    const rng = mulberry32(12);
    for (let i = 0; i < 400; i++) {
      const q = generateQuestion('jissen', DEFAULT_RULES, { seat: 'any', win: 'any' }, rng);
      if (q.mode === 'hayami' || q.ev.yakuman) continue;
      const html = blocksHtml(q.hand, q.ev);
      const kans = q.hand.melds.filter((m) => m.type === 'minkan' || m.type === 'ankan').length;
      expect(tileCount(html)).toBe(14 + kans);
      expect((html.match(/tile win/g) ?? []).length).toBe(1);
    }
  });
});

describe('別の分け方', () => {
  it('evaluate は evaluateAll の先頭（高点法）', () => {
    const h = hand('234m567p234s88s45s', '3s');
    const sit = defaultSituation({ tsumo: true });
    expect(evaluate(h, sit, DEFAULT_RULES)).toEqual(evaluateAll(h, sit, DEFAULT_RULES)[0]);
  });

  it('分け方で符が変わる手は、解説に別の分け方と高点法の説明が出る', () => {
    const rng = mulberry32(21);
    let found = 0;
    for (let i = 0; i < 3000 && found < 5; i++) {
      const q = generateQuestion('fu', DEFAULT_RULES, { seat: 'any', win: 'any' }, rng);
      if (q.mode !== 'fu') continue;
      const all = evaluateAll(q.hand, q.sit, DEFAULT_RULES);
      if (new Set(all.map((e) => e.fu.fu)).size < 2) continue;
      found++;
      const html = handExplain(q, DEFAULT_RULES);
      expect(html).toContain('別の分け方');
      expect(html).toContain('高点法');
    }
    expect(found).toBe(5);
  });

  it('分け方が1つの手には出さない', () => {
    const h = hand('234m567p234s88s67s', '5s');
    const sit = defaultSituation();
    const q = { mode: 'fu' as const, hand: h, sit, ev: evaluate(h, sit, DEFAULT_RULES)! };
    expect(handExplain(q, DEFAULT_RULES)).not.toContain('別の分け方');
  });
});

describe('符の数え方（ヘルプ）', () => {
  it('例題の符は点数エンジンの計算と一致する', () => {
    for (const ex of FU_EXAMPLES) {
      const html = helpHtml('fu', 'fu');
      expect(html).toContain(ex.title);
      const e = ev(
        hand(ex.concealed, ex.win, ex.melds ?? []),
        {
          tsumo: !!ex.tsumo,
          ...(ex.round ? { roundWind: parseTiles(ex.round)[0] } : {}),
          ...(ex.seat ? { seatWind: parseTiles(ex.seat)[0] } : {}),
        },
      );
      expect(e?.fu.fu).toBe(ex.fu);
    }
  });

  it('順番・刻子の表・待ち・例題のカードがあり、解説の「符の数え方」から開ける', () => {
    const html = helpHtml('fu', 'fu');
    for (const id of ['fu-flow', 'fu-mentsu', 'fu-wait', 'fu-examples']) expect(html).toContain(`id="h-${id}"`);
    expect(html).toContain('data-help-tab="fu"');
    const h = hand('234m567p234s88s67s', '5s');
    const sit = defaultSituation();
    const q = { mode: 'fu' as const, hand: h, sit, ev: evaluate(h, sit, DEFAULT_RULES)! };
    expect(handExplain(q, DEFAULT_RULES)).toContain('data-help-link="fu"');
  });
});
