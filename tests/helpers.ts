import { type Hand, type Meld, type Situation, defaultSituation } from '../src/core/hand';
import { DEFAULT_RULES, type Rules } from '../src/core/rules';
import { evaluate } from '../src/core/evaluate';
import { parseTiles } from '../src/core/tiles';

export function hand(concealed: string, win: string, melds: Meld[] = [], aka: string = ''): Hand {
  return {
    concealed: parseTiles(concealed),
    winTile: parseTiles(win)[0],
    melds,
    akaTiles: aka ? parseTiles(aka) : [],
  };
}

export const t = (s: string) => parseTiles(s)[0];

export function ev(h: Hand, sit: Partial<Situation> = {}, rules: Partial<Rules> = {}) {
  return evaluate(h, defaultSituation(sit), { ...DEFAULT_RULES, ...rules });
}

export const yakuNames = (e: ReturnType<typeof ev>) => (e ? e.yaku.map((y) => y.name).sort() : []);
