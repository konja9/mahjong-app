/**
 * 計器の数字をオドメーターのように回す。
 * 数字は桁ごとに 0〜9 の縦の帯にし、変わった桁だけ帯を動かす（動きは CSS の transition）
 */

export type OdoPart = { digit: number } | { char: string };

/** 表示文字列を桁と記号（カンマ・符号など）に分ける */
export function splitDigits(text: string): OdoPart[] {
  return [...text].map((c) => (c >= '0' && c <= '9' ? { digit: Number(c) } : { char: c }));
}

/** 桁数と記号の位置が同じなら、帯を動かすだけで済む */
export function sameShape(a: OdoPart[], b: OdoPart[]): boolean {
  return a.length === b.length && a.every((p, i) => ('digit' in p) === ('digit' in b[i]) && ('char' in p ? p.char === (b[i] as { char: string }).char : true));
}

const STRIP = Array.from({ length: 10 }, (_, i) => `<i>${i}</i>`).join('');

export function renderOdometer(el: HTMLElement, text: string): void {
  const next = splitDigits(text);
  const prevText = el.dataset.odo;
  el.dataset.odo = text;
  el.setAttribute('aria-label', text);
  if (prevText !== undefined && sameShape(splitDigits(prevText), next)) {
    const strips = el.querySelectorAll<HTMLElement>('.odo-s');
    let k = 0;
    for (const p of next) {
      if ('digit' in p) strips[k++].style.transform = `translateY(${-p.digit * 10}%)`;
    }
    return;
  }
  el.innerHTML = next
    .map((p) =>
      'digit' in p
        ? `<span class="odo-d" aria-hidden="true"><span class="odo-s" style="transform:translateY(${-p.digit * 10}%)">${STRIP}</span></span>`
        : `<span class="odo-c" aria-hidden="true">${p.char}</span>`,
    )
    .join('');
}
