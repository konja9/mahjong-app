import { describe, expect, it } from 'vitest';
import { GAP, MIN_H, layoutBubble } from '../src/ui/tutorial/layout';
import { START_LINES, loadingHtml, pickLine, startHtml, startSay } from '../src/ui/start';

describe('チュートリアルの吹き出しの置き場所', () => {
  const base = { vh: 700, safeTop: 0, safeBottom: 0, want: 104 };

  it('対象が上にあれば下の空きに置き、対象に重ねない', () => {
    const l = layoutBubble({ ...base, target: { top: 60, bottom: 200 } });
    expect(l.side).toBe('below');
    expect(l.top!).toBeGreaterThanOrEqual(200 + GAP);
    expect(l.top! + l.maxH).toBeLessThanOrEqual(700);
  });

  it('対象が下にあれば上の空きに置き、対象の上端より上に収める', () => {
    const l = layoutBubble({ ...base, target: { top: 480, bottom: 680 } });
    expect(l.side).toBe('above');
    const bottomEdge = 700 - l.bottom!;
    expect(bottomEdge).toBeLessThanOrEqual(480 - GAP);
    expect(bottomEdge - l.maxH).toBeGreaterThanOrEqual(0);
    expect(l.finger).toBe('inside');
  });

  it('空きが足りなければ、収まる高さに縮める', () => {
    const l = layoutBubble({ ...base, target: { top: 30, bottom: 600 } });
    expect(l.side).toBe('below');
    expect(l.maxH).toBeLessThan(104);
    expect(l.maxH).toBeGreaterThanOrEqual(MIN_H);
    expect(l.top! + l.maxH).toBeLessThanOrEqual(700);
  });

  it('上下どちらも狭ければ、上端の1行の帯にする', () => {
    const l = layoutBubble({ ...base, target: { top: 50, bottom: 660 } });
    expect(l.side).toBe('bar');
  });

  it('ノッチ・広告の分を空きから除く', () => {
    const l = layoutBubble({ ...base, safeTop: 120, target: { top: 200, bottom: 640 } });
    expect(l.side).toBe('bar');
  });

  it('答えさせる場面は、問題に重ねないよう画面の上端の帯にする', () => {
    const l = layoutBubble({ ...base, target: { top: 480, bottom: 680 }, answer: true });
    expect(l.side).toBe('bar');
    expect(l.top! + l.maxH).toBeLessThan(480);
  });

  it('指は吹き出しの反対側に出す', () => {
    expect(layoutBubble({ ...base, target: { top: 300, bottom: 340 } }).finger).toBe('above');
    expect(layoutBubble({ ...base, target: { top: 500, bottom: 540 } }).finger).toBe('below');
  });
});

describe('スタート画面', () => {
  it('初回は「スタート」だけを出し、押すとそのままチュートリアルへ', () => {
    const h = startHtml({ first: true, balance: 2000, level: 1, cleared: false });
    expect(h).toContain('st-btn st-go');
    expect(h).toContain('data-start="tutorial"');
    expect(h.match(/data-start=/g)).toHaveLength(1);
    expect(h).toContain('aria-label="スタート"');
    for (const x of ['data-start="pachinko"', 'data-start="keiko"', 'data-start="skip"', '2,000 yan']) expect(h).not.toContain(x);
  });

  it('2回目以降はパチンコと稽古を出し、チュートリアルは小さな文字ボタンにする', () => {
    const h = startHtml({ first: false, balance: 500, level: 3, cleared: false });
    expect(h).not.toContain('st-go');
    expect(h).not.toContain('data-start="skip"');
    expect(h).toContain('class="st-link" type="button" data-start="tutorial"');
    expect(h).toContain('data-start="pachinko"');
    expect(h).toContain('data-start="keiko"');
    expect(h).toContain('500 yan');
  });

  it('世界観の一文は25〜35本で、入り口に合った文を選ぶ', () => {
    expect(START_LINES.length).toBeGreaterThanOrEqual(25);
    expect(START_LINES.length).toBeLessThanOrEqual(35);
    for (const l of START_LINES) expect(l.text.length).toBeLessThanOrEqual(40);
    const keiko = START_LINES.filter((l) => l.for === 'keiko').map((l) => l.text);
    const pachi = START_LINES.filter((l) => l.for === 'pachinko').map((l) => l.text);
    // 乱数が小さいときはその入り口向けの文
    expect(keiko).toContain(pickLine('keiko', () => 0.1));
    expect(pachi).toContain(pickLine('pachinko', () => 0.1));
    expect(pachi).toContain(pickLine('tutorial', () => 0.1));
    // 大きいときは共通の文
    expect(START_LINES.find((l) => l.text === pickLine('keiko', () => 0.99))?.for).toBeUndefined();
  });

  it('物語に触れる一文は、その話を読める Lv になるまで出ない', () => {
    const gated = START_LINES.filter((l) => (l.minLevel ?? 1) > 1).map((l) => l.text);
    expect(gated.length).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) {
      const r = i / 200;
      expect(gated).not.toContain(pickLine('pachinko', () => r, 1));
      expect(gated).not.toContain(pickLine('keiko', () => r, 1));
    }
    const all = new Set(Array.from({ length: 400 }, (_, i) => pickLine('keiko', () => (i * 0.618) % 1, 20)));
    expect([...all].some((t) => gated.includes(t))).toBe(true);
  });

  it('スタート画面の一言は Lv で変わり、読んでいない話・所持金が少ないときを優先する', () => {
    const v = { first: false, balance: 1000, level: 1, cleared: false };
    const low = startSay(v, () => 0);
    const mid = startSay({ ...v, level: 12 }, () => 0);
    const done = startSay({ ...v, level: 22, cleared: true }, () => 0);
    expect(new Set([low, mid, done]).size).toBe(3);
    expect(startSay({ ...v, unread: 2 })).toContain('本を開いてみな');
    expect(startSay({ ...v, balance: 100 })).toContain('財布が軽そう');
    expect(startSay({ ...v, first: true })).toContain('ようこそ新顔');
  });

  it('ローディングは「タップして進む」を持ち、文を出す', () => {
    const h = loadingHtml('符を制する者が、卓を制す。');
    expect(h).toContain('タップして進む');
    expect(h).toContain('符を制する者が、卓を制す。');
    expect(h).toContain('class="ld-reels"');
  });
});
