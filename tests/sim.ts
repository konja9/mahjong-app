import { generateQuestion, type Mode } from '../src/core/generator';
import { DEFAULT_RULES } from '../src/core/rules';
import { ECONOMY, ballsFor, costFor, drawUwanose, extraRoundsFor, roundPrize } from '../src/ui/machine/economy';
import { Machine, PREMIUM_SYMBOL } from '../src/ui/machine/machine';
import { type MachineSpec, SPECS } from '../src/ui/machine/specs';

/** 経済のシミュレーション（テストから使う。テストファイルではないので、読み込んでもテストは走らない） */

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** プレイヤーを模擬して回収率（払い出し ÷ 総コスト）を求める */
export function simulate(...a: Parameters<typeof simulateDetail>): number {
  const d = simulateDetail(...a);
  return d.won / d.spent;
}

/** 稼いだ yan（BONUS の賞金の合計）と使った BET も返す */
export function simulateDetail(
  mode: Mode,
  accuracy: number,
  fastRate: number,
  seed = 1,
  questions = 20000,
  spec: MachineSpec = SPECS.ama,
) {
  const rng = mulberry32(seed);
  const pick = (premium: boolean) => {
    const q = generateQuestion(mode, DEFAULT_RULES, { seat: 'any', win: 'any' }, rng, premium);
    const ext = extraRoundsFor(q.mode === 'hayami' ? q.score.limit : q.ev.score.limit);
    return q.mode === 'hayami'
      ? { fu: q.han >= 5 ? 0 : q.fu, yakuman: q.han >= 13, ext }
      : { fu: q.ev.yakuman ? 0 : q.ev.fu.fu, yakuman: q.ev.yakuman > 0, ext };
  };
  const normalPool = Array.from({ length: 800 }, () => pick(false));
  const premiumPool = Array.from({ length: 800 }, () => pick(true));
  const m = new Machine(() => 'off', rng, spec);
  let spent = 0;
  let won = 0;
  const jackpot = (premium: boolean) => {
    const pool = premium ? premiumPool : normalPool;
    let combo = 0;
    let total = 0;
    let perfect = true;
    let extra = 0;
    for (let k = 0; k < spec.rounds + extra; k++) {
      const q = pool[Math.floor(rng() * pool.length)];
      if (rng() < accuracy) {
        combo++;
        extra += Math.min(q.ext, ECONOMY.extraRounds.max - extra);
        total += roundPrize({ mode, fu: q.fu, yakuman: q.yakuman, fast: rng() < fastRate, combo, premium, spec });
      } else {
        combo = 0;
        perfect = false;
      }
    }
    if (perfect) total *= drawUwanose(rng, premium);
    won += total;
  };
  let streak = 0;
  for (let i = 0; i < questions; i++) {
    const correct = rng() < accuracy;
    streak = correct ? streak + 1 : 0;
    const fast = correct && rng() < fastRate;
    spent += costFor(correct, fast, spec);
    if (!correct) {
      m.missSpin();
      continue;
    }
    m.enter(ballsFor(mode, streak));
    for (let r = m.spin(); r; r = m.spin()) {
      if (r.hit) jackpot(r.symbols[0] === PREMIUM_SYMBOL);
      m.settle(r);
    }
  }
  return { won, spent, questions };
}

