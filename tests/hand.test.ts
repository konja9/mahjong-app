import { describe, expect, it } from 'vitest';
import { formatAnswer } from '../src/core/score';
import { ev, hand, t, yakuNames } from './helpers';

const E = t('1z');
const S = t('2z');

describe('符計算', () => {
  it('平和ツモは20符', () => {
    const e = ev(hand('234m567p234s88p67s', '5s'), { tsumo: true });
    expect(e?.fu.fu).toBe(20);
    expect(yakuNames(e)).toContain('平和');
  });

  it('門前ロン平和 30符1翻 = 1000', () => {
    const e = ev(hand('123m567p234s88s67s', '5s'));
    // 役: 平和のみ
    expect(yakuNames(e)).toEqual(['平和']);
    expect(e?.fu.fu).toBe(30);
    expect(formatAnswer(e!.score)).toBe('1000');
  });

  it('嵌張待ちは+2符', () => {
    const e = ev(hand('234m567p234s88s57s', '6s'), { riichi: true });
    expect(e?.fu.items.some((i) => i.label === '嵌張待ち')).toBe(true);
    expect(e?.fu.fu).toBe(40); // 20+10+2 = 32 → 40
  });

  it('辺張待ちは+2符', () => {
    const e = ev(hand('234m567p234s88s12s', '3s'), { riichi: true });
    expect(e?.fu.items.some((i) => i.label === '辺張待ち')).toBe(true);
  });

  it('七対子は25符', () => {
    const e = ev(hand('1122m3344p5566s7z', '7z'), { riichi: true });
    expect(e?.fu.fu).toBe(25);
    expect(yakuNames(e)).toEqual(['七対子', '立直']);
    expect(formatAnswer(e!.score)).toBe('3200');
  });

  it('暗槓・么九は32符', () => {
    const e = ev(hand('234m567p234s8s', '8s', [{ type: 'ankan', tile: E + 4 }]), { riichi: true });
    // 白暗槓(32) + 門前ロン10 + 副底20 + 単騎2 = 64 → 70
    expect(e?.fu.fu).toBe(70);
    expect(yakuNames(e)).toContain('役牌 白');
  });

  it('シャンポン待ちのロンは明刻扱い', () => {
    const e = ev(hand('234m567p555s99m11p', '1p'), { riichi: true });
    // 555s 暗刻 4, 111p ロン → 明刻 么九 4 → 20+10+8 = 38 → 40
    expect(e?.fu.fu).toBe(40);
  });

  it('連風牌の雀頭', () => {
    const h = hand('234m567p234s678s1z', '1z');
    const two = ev(h, { riichi: true, roundWind: E, seatWind: E });
    const four = ev(h, { riichi: true, roundWind: E, seatWind: E }, { doubleWindPairFu: 4 });
    // 20+10+2(単騎)+2 = 34→40 / +4 = 36 → 40
    expect(two?.fu.raw).toBe(34);
    expect(four?.fu.raw).toBe(36);
  });

  it('喰い平和形のロンは30符', () => {
    const e = ev(hand('567p234s88s67s', '5s', [{ type: 'chi', tile: t('2m') }]));
    expect(yakuNames(e)).toEqual(['断么九']);
    expect(e?.fu.fu).toBe(30);
  });
});

describe('役判定', () => {
  it('役なしは null', () => {
    expect(ev(hand('123m567p234s88s67s', '5s', []), { roundWind: E, seatWind: S })).not.toBeNull(); // 平和
    expect(ev(hand('567p234s88s67s', '5s', [{ type: 'chi', tile: t('1m') }]))).toBeNull();
  });

  it('高点法：二盃口と七対子', () => {
    const e = ev(hand('223344m556677p8s', '8s'), { riichi: true });
    expect(yakuNames(e)).toContain('二盃口');
    expect(yakuNames(e)).not.toContain('七対子');
  });

  it('高点法：三暗刻 vs 平和一盃口（111222333m）', () => {
    const e = ev(hand('111222333m456p5s', '5s'), { tsumo: true });
    expect(yakuNames(e)).toContain('三暗刻');
  });

  it('一気通貫・混一色', () => {
    const e = ev(hand('123456789m11z22z', '2z'), { roundWind: E, seatWind: S });
    expect(yakuNames(e)).toEqual(expect.arrayContaining(['一気通貫', '混一色']));
  });

  it('清一色', () => {
    const e = ev(hand('1223345678999m', '2m'));
    expect(yakuNames(e)).toContain('清一色');
  });

  it('三色同順（鳴き）', () => {
    const e2 = ev(hand('345p345s678m1z', '1z', [{ type: 'chi', tile: t('3m') }]), { roundWind: t('1z'), seatWind: S });
    expect(yakuNames(e2)).toEqual(['三色同順']);
    expect(e2?.han).toBe(1);
  });

  it('対々和・役牌', () => {
    const e = ev(
      hand('222m99p55z', '5z', [
        { type: 'pon', tile: t('7z') },
        { type: 'pon', tile: t('3s') },
      ]),
    );
    expect(yakuNames(e)).toEqual(expect.arrayContaining(['対々和', '役牌 中', '役牌 白']));
  });

  it('断么九は喰いタンなしで不成立', () => {
    const h = hand('567p234s88s67s', '5s', [{ type: 'chi', tile: t('2m') }]);
    expect(ev(h, {}, { kuitan: false })).toBeNull();
  });

  it('チャンタ・純チャン', () => {
    expect(yakuNames(ev(hand('123m789p111z789s9m', '9m'), { riichi: true }))).toContain('混全帯么九');
    expect(yakuNames(ev(hand('123m789p111p789s9m', '9m'), { riichi: true }))).toContain('純全帯么九');
  });

  it('小三元', () => {
    const e2 = ev(hand('555z666z77z234m11p', '1p'));
    expect(yakuNames(e2)).toEqual(expect.arrayContaining(['小三元', '役牌 白', '役牌 發']));
  });

  it('ドラ・赤ドラ・裏ドラ', () => {
    const e = ev(hand('234m456p234s88s67s', '5s', [], '5p'), {
      riichi: true,
      doraIndicators: [t('7s')],
      uraIndicators: [t('1m')],
    });
    const names = e!.dora.map((d) => `${d.name}${d.han}`);
    expect(names).toEqual(['ドラ2', '赤ドラ1', '裏ドラ1']);
  });
});

describe('役満', () => {
  it('国士無双', () => {
    const e = ev(hand('19m19p19s1234567z', '1m'));
    expect(e?.yakuman).toBe(1);
    expect(formatAnswer(e!.score)).toBe('32000');
  });
  it('国士十三面（ダブル役満あり）', () => {
    const e = ev(hand('19m19p19s1234567z', '1m'), {}, { doubleYakuman: true });
    expect(e?.yakuman).toBe(2);
  });
  it('四暗刻（ツモ）', () => {
    const e = ev(hand('111m222p333s44z55z', '5z'), { tsumo: true });
    expect(yakuNames(e)).toEqual(['四暗刻']);
  });
  it('四暗刻はロンのシャンポンだと三暗刻', () => {
    const e = ev(hand('111m222p333s44z55z', '5z'));
    expect(e?.yakuman).toBe(0);
    expect(yakuNames(e)).toEqual(expect.arrayContaining(['三暗刻', '対々和']));
  });
  it('大三元', () => {
    const e = ev(hand('555z666z777z23m99p', '1m'));
    expect(yakuNames(e)).toEqual(['大三元']);
  });
  it('九蓮宝燈', () => {
    const e = ev(hand('1112345678999m', '5m'));
    expect(yakuNames(e)).toEqual(['九蓮宝燈']);
  });
});

