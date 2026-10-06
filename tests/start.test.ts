import { describe, expect, it } from 'vitest';
import { GAP, MIN_H, layoutBubble } from '../src/ui/tutorial/layout';
import { START_LINES, loadingHtml, pickLine, startHtml } from '../src/ui/start';

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
  it('初回はチュートリアルを大きく出し、とばすボタンも出す', () => {
    const h = startHtml({ first: true, balance: 2000, level: 1, cleared: false });
    expect(h).toContain('st-btn st-tutorial big');
    expect(h).toContain('data-start="skip"');
    expect(h).toContain('2,000 yan');
  });

  it('2回目以降はチュートリアルを小さな文字ボタンにする', () => {
    const h = startHtml({ first: false, balance: 500, level: 3, cleared: false });
    expect(h).not.toContain('st-tutorial big');
    expect(h).not.toContain('data-start="skip"');
    expect(h).toContain('class="st-link" type="button" data-start="tutorial"');
    expect(h).toContain('data-start="pachinko"');
    expect(h).toContain('data-start="keiko"');
  });

  it('世界観の一文は15〜20本で、入り口に合った文を選ぶ', () => {
    expect(START_LINES.length).toBeGreaterThanOrEqual(15);
    expect(START_LINES.length).toBeLessThanOrEqual(20);
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

  it('ローディングは「タップして進む」を持ち、文を出す', () => {
    const h = loadingHtml('符を制する者が、卓を制す。');
    expect(h).toContain('タップして進む');
    expect(h).toContain('符を制する者が、卓を制す。');
  });
});
