import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../src/core/rules';
import { calcScore, checkPointsAnswer, formatAnswer, isValidHanFu } from '../src/core/score';

const R = DEFAULT_RULES;
const key = (han: number, fu: number, dealer: boolean, tsumo: boolean, rules = R) =>
  formatAnswer(calcScore(han, fu, dealer, tsumo, rules));

describe('calcScore 子', () => {
  it.each([
    [1, 30, '1000'],
    [1, 40, '1300'],
    [2, 25, '1600'],
    [2, 30, '2000'],
    [3, 30, '3900'],
    [4, 30, '7700'],
    [3, 60, '7700'],
    [4, 40, '8000'],
    [3, 70, '8000'],
    [1, 110, '3600'],
    [2, 110, '7100'],
    [6, 30, '12000'],
    [8, 30, '16000'],
    [11, 30, '24000'],
    [13, 30, '32000'],
  ])('%i翻%i符 ロン = %s', (han, fu, exp) => {
    expect(key(han, fu, false, false)).toBe(exp);
  });

  it.each([
    [2, 20, '400-700'],
    [3, 20, '700-1300'],
    [4, 20, '1300-2600'],
    [3, 25, '800-1600'],
    [1, 30, '300-500'],
    [2, 30, '500-1000'],
    [3, 30, '1000-2000'],
    [4, 30, '2000-3900'],
    [1, 40, '400-700'],
    [3, 40, '1300-2600'],
    [5, 30, '2000-4000'],
  ])('%i翻%i符 ツモ = %s', (han, fu, exp) => {
    expect(key(han, fu, false, true)).toBe(exp);
  });
});

describe('calcScore 親', () => {
  it.each([
    [1, 30, false, '1500'],
    [2, 30, false, '2900'],
    [3, 30, false, '5800'],
    [4, 30, false, '11600'],
    [2, 25, false, '2400'],
    [5, 30, false, '12000'],
    [2, 20, true, '700オール'],
    [4, 30, true, '3900オール'],
    [3, 40, true, '2600オール'],
    [6, 30, true, '6000オール'],
  ])('%i翻%i符 tsumo=%s → %s', (han, fu, tsumo, exp) => {
    expect(key(han, fu, true, tsumo)).toBe(exp);
  });
});

describe('ルール', () => {
  it('切り上げ満貫', () => {
    const r = { ...R, kiriage: true };
    expect(key(4, 30, false, false, r)).toBe('8000');
    expect(key(3, 60, true, false, r)).toBe('12000');
  });
  it('数え役満なし', () => {
    expect(key(13, 30, false, false, { ...R, kazoe: false })).toBe('24000');
  });
  it('役満', () => {
    expect(formatAnswer(calcScore(13, 0, false, false, R, 1))).toBe('32000');
    expect(formatAnswer(calcScore(13, 0, true, true, R, 1))).toBe('16000オール');
    expect(formatAnswer(calcScore(26, 0, false, true, R, 2))).toBe('16000-32000');
  });
});

describe('回答チェック', () => {
  const tsumo = calcScore(3, 30, false, true, R);
  it.each(['1000-2000', '1000 2000', '1000/2000'])('子ツモ %s', (s) => {
    expect(checkPointsAnswer(s, tsumo)).toBe(true);
  });
  it('順番違いは誤答', () => expect(checkPointsAnswer('2000-1000', tsumo)).toBe(false));
  it('親ツモ', () => {
    const r = calcScore(4, 30, true, true, R);
    expect(checkPointsAnswer('3900', r)).toBe(true);
    expect(checkPointsAnswer('3900all', r)).toBe(true);
    expect(checkPointsAnswer('11700', r)).toBe(false);
  });
});

describe('isValidHanFu', () => {
  it('20符ロンは無効', () => expect(isValidHanFu(2, 20, false)).toBe(false));
  it('25符2翻ツモは無効', () => expect(isValidHanFu(2, 25, true)).toBe(false));
  it('1翻20符は無効', () => expect(isValidHanFu(1, 20, true)).toBe(false));
  it('30符1翻は有効', () => expect(isValidHanFu(1, 30, false)).toBe(true));
});
