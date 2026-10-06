import { describe, expect, it } from 'vitest';
import { TALK, TALK_GAP, Talker, correctEvent } from '../src/ui/charaTalk';
import { mergeLevelUp } from '../src/ui/level';

describe('液晶帯のパチふとくんの一言', () => {
  it('前の一言から間をあける（タップと長考は別）', () => {
    const t = new Talker(() => 0);
    expect(t.react('streak5', 0).line).not.toBe(null);
    expect(t.react('streak5', 1000).line).toBe(null);
    expect(t.react('streak5', 1000).face).toBe(TALK.streak5.face);
    expect(t.react('tap', 1200).line).not.toBe(null);
    expect(t.react('idle', 1300).line).not.toBe(null);
    expect(t.react('streak5', 1300 + TALK_GAP).line).not.toBe(null);
  });
  it('同じ文を続けて出さない', () => {
    let x = 0;
    const t = new Talker(() => (x = (x + 0.37) % 1) * 0);
    const a = t.react('tap', 0).line;
    const b = t.react('tap', 1).line;
    expect(a).not.toBe(b);
  });
  it('演出がオフなら表情だけ', () => {
    const t = new Talker(() => 0);
    const r = t.react('streak10', 0, false);
    expect(r.line).toBe(null);
    expect(r.face).toBe(TALK.streak10.face);
  });
  it('正解の出来事は大きいものを優先', () => {
    expect(correctEvent({ streak: 10, big: true, fast: true })).toBe('streak10');
    expect(correctEvent({ streak: 5, big: true, fast: true })).toBe('streak5');
    expect(correctEvent({ streak: 4, big: true, fast: true })).toBe('big');
    expect(correctEvent({ streak: 4, big: false, fast: true })).toBe('fast');
    expect(correctEvent({ streak: 1, big: false, fast: false })).toBe('correct');
    expect(correctEvent({ streak: 20, big: false, fast: false })).toBe('streak10');
  });
});

describe('Lv アップの演出の待ち', () => {
  it('まとめて上がったら最初から最後までを1回にする', () => {
    expect(mergeLevelUp(null, [])).toBe(null);
    expect(mergeLevelUp(null, [5])).toEqual({ from: 4, to: 5 });
    expect(mergeLevelUp(null, [5, 6, 7])).toEqual({ from: 4, to: 7 });
    // まだ見せていないうちにさらに上がった
    expect(mergeLevelUp({ from: 4, to: 5 }, [6])).toEqual({ from: 4, to: 6 });
  });
});
