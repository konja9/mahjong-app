import { describe, expect, it } from 'vitest';
import { MISSION_POOL, SKILL_KINDS, freshMissions, pickMissions, recordAnswer, type AnswerEvent } from '../src/ui/missions';

const ev = (p: Partial<AnswerEvent>): AnswerEvent => ({ mode: 'jissen', correct: true, fast: false, streak: 1, splitTsumo: false, ...p });

describe('ミッション', () => {
  it('同じ日付なら同じ3つ、重複しない', () => {
    const a = pickMissions('2026-09-26');
    expect(a).toEqual(pickMissions('2026-09-26'));
    expect(new Set(a).size).toBe(3);
  });

  it('プールは実力の条件だけ（運で決まる条件がない）', () => {
    for (const m of MISSION_POOL) expect(SKILL_KINDS).toContain(m.kind);
    for (const m of MISSION_POOL) expect(m.reward).toBeGreaterThanOrEqual(500);
    for (const m of MISSION_POOL) expect(m.reward).toBeLessThanOrEqual(1200);
  });

  it('進み具合と達成は1回だけ', () => {
    const s = freshMissions('x');
    s.ids = ['fast15', 'streak10', 'funomiss10'];
    let done: string[] = [];
    for (let i = 1; i <= 15; i++) done.push(...recordAnswer(s, ev({ fast: true, streak: i })).map((m) => m.id));
    expect(done).toEqual(['streak10', 'fast15']);
    expect(recordAnswer(s, ev({ fast: true, streak: 16 }))).toEqual([]);
    // 符計算は途中でミスすると数え直し
    for (let i = 0; i < 9; i++) recordAnswer(s, ev({ mode: 'fu' }));
    recordAnswer(s, ev({ mode: 'fu', correct: false }));
    expect(s.progress.funomiss10).toBe(9);
    done = [];
    for (let i = 0; i < 10; i++) done.push(...recordAnswer(s, ev({ mode: 'fu' })).map((m) => m.id));
    expect(done).toEqual(['funomiss10']);
  });

  it('正解率：20問で18問以上なら達成、足りなければやり直し', () => {
    const s = freshMissions('x');
    s.ids = ['acc20'];
    for (let i = 0; i < 20; i++) recordAnswer(s, ev({ correct: i >= 3 }));
    expect(s.done).toEqual([]);
    for (let i = 0; i < 20; i++) recordAnswer(s, ev({ correct: i !== 5 }));
    expect(s.done).toEqual(['acc20']);
  });
});
