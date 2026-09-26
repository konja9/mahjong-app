import { describe, expect, it } from 'vitest';
import { sameShape, splitDigits } from '../src/ui/odometer';

describe('オドメーター', () => {
  it('桁と記号に分ける', () => {
    expect(splitDigits('−1,240')).toEqual([{ char: '−' }, { digit: 1 }, { char: ',' }, { digit: 2 }, { digit: 4 }, { digit: 0 }]);
  });

  it('桁数と記号が同じときだけ帯を動かすだけで済む', () => {
    expect(sameShape(splitDigits('1,000'), splitDigits('1,240'))).toBe(true);
    expect(sameShape(splitDigits('980'), splitDigits('1,000'))).toBe(false);
    expect(sameShape(splitDigits('+40'), splitDigits('−40'))).toBe(false);
  });
});
