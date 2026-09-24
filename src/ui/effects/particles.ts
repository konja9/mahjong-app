/** Canvas 2D の軽量パーティクル（玉・紙吹雪・火花） */

type Kind = 'coin' | 'confetti' | 'spark' | 'tile' | 'shard';

interface P {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  /** tile: 表示する字 / shard: 多角形の頂点 */
  glyph?: string;
  poly?: [number, number][];
}

const TILE_GLYPHS = ['中', '發', '東', '南', '西', '北', '一', '九', '五', '七'];

const CONFETTI = ['#e2b714', '#f44c7f', '#4fd1c5', '#7c83fd', '#ff9f43', '#ffffff'];

export class Particles {
  private ctx: CanvasRenderingContext2D | null;
  private ps: P[] = [];
  private running = false;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = innerWidth * this.dpr;
    this.canvas.height = innerHeight * this.dpr;
  }

  burst(x: number, y: number, count: number, kind: Kind = 'coin', power = 1): void {
    for (let i = 0; i < count; i++) {
      const a = kind === 'coin' ? -Math.PI / 2 + (Math.random() - 0.5) * 1.8 : Math.random() * Math.PI * 2;
      const sp = (kind === 'spark' ? 4 + Math.random() * 8 : 5 + Math.random() * 9) * power;
      const max = kind === 'spark' ? 30 + Math.random() * 20 : 70 + Math.random() * 50;
      this.ps.push({
        kind,
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (kind === 'confetti' ? 4 : 0),
        life: 0,
        max,
        size: kind === 'coin' ? 5 + Math.random() * 4 : kind === 'confetti' ? 4 + Math.random() * 5 : 1.5 + Math.random() * 2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: kind === 'confetti' ? CONFETTI[i % CONFETTI.length] : kind === 'spark' ? '#fff3b0' : '#e2b714',
      });
    }
    this.start();
  }

  /** 画面上部から玉を降らせる */
  rain(count: number): void {
    for (let i = 0; i < count; i++) {
      this.ps.push({
        kind: Math.random() < 0.7 ? 'coin' : 'confetti',
        x: Math.random() * innerWidth,
        y: -20 - Math.random() * innerHeight * 0.6,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 4,
        life: 0,
        max: 160,
        size: 5 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: CONFETTI[i % CONFETTI.length],
      });
    }
    this.start();
  }

  /** 牌の雨 */
  tileRain(count: number): void {
    for (let i = 0; i < count; i++) {
      this.ps.push({
        kind: 'tile',
        x: Math.random() * innerWidth,
        y: -40 - Math.random() * innerHeight * 0.8,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 3 + Math.random() * 4,
        life: 0,
        max: 220,
        size: 14 + Math.random() * 14,
        rot: (Math.random() - 0.5) * 1.2,
        vr: (Math.random() - 0.5) * 0.12,
        color: '#f3efe2',
        glyph: TILE_GLYPHS[i % TILE_GLYPHS.length],
      });
    }
    this.start();
  }

  /** ガラスの破片：画面中央から飛び散る */
  shatter(x: number, y: number, count = 70): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 16;
      const r = 10 + Math.random() * 40;
      const n = 3 + Math.floor(Math.random() * 2);
      const poly: [number, number][] = Array.from({ length: n }, (_, k) => {
        const t = (k / n) * Math.PI * 2 + Math.random() * 0.8;
        return [Math.cos(t) * r * (0.4 + Math.random() * 0.6), Math.sin(t) * r * (0.4 + Math.random() * 0.6)];
      });
      this.ps.push({
        kind: 'shard',
        x: x + Math.cos(a) * Math.random() * 120,
        y: y + Math.sin(a) * Math.random() * 80,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 3,
        life: 0,
        max: 60 + Math.random() * 40,
        size: r,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: 'rgba(220,240,255,0.55)',
        poly,
      });
    }
    this.start();
  }

  /** 超確変中に漂う粒（少量ずつ） */
  ambient(): void {
    for (let i = 0; i < 3; i++) {
      const tile = Math.random() < 0.3;
      this.ps.push({
        kind: tile ? 'tile' : 'spark',
        x: Math.random() * innerWidth,
        y: innerHeight + 10,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -1.5 - Math.random() * 2,
        life: 0,
        max: 260,
        size: tile ? 10 + Math.random() * 6 : 1.5 + Math.random() * 2.5,
        rot: 0,
        vr: (Math.random() - 0.5) * 0.04,
        color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        glyph: TILE_GLYPHS[Math.floor(Math.random() * TILE_GLYPHS.length)],
      });
    }
    this.start();
  }

  clear(): void {
    this.ps = [];
  }

  private start(): void {
    if (this.running || !this.ctx) return;
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    this.ps = this.ps.filter((p) => p.life < p.max && p.y < innerHeight + 60 && p.y > -innerHeight);
    for (const p of this.ps) {
      p.life++;
      const floating = p.vy < 0 && p.max === 260;
      p.vy += floating ? 0 : p.kind === 'spark' ? 0.15 : p.kind === 'confetti' ? 0.12 : p.kind === 'tile' ? 0.05 : 0.32;
      p.vx *= p.kind === 'confetti' ? 0.97 : 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const alpha = Math.min(1, (p.max - p.life) / 20);
      ctx.globalAlpha = alpha;
      if (p.kind === 'coin') {
        // 銀玉風：回転で横幅が変わる
        const w = Math.abs(Math.cos(p.rot)) * p.size + 1;
        const g = ctx.createRadialGradient(p.x - p.size * 0.3, p.y - p.size * 0.3, 1, p.x, p.y, p.size);
        g.addColorStop(0, '#fffbe0');
        g.addColorStop(0.5, '#e2b714');
        g.addColorStop(1, '#8a6d00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, w, p.size, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'tile') {
        const w = p.size;
        const h = p.size * 1.33;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = '#b9b29c';
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2 + 2, w, h, w * 0.15);
        ctx.fill();
        ctx.fillStyle = p.color === '#f3efe2' ? p.color : '#f3efe2';
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.15);
        ctx.fill();
        ctx.fillStyle = p.glyph === '發' ? '#1d8a50' : p.glyph === '中' || p.glyph === '五' ? '#c8323c' : '#1c1c1c';
        ctx.font = `700 ${w * 0.72}px 'Noto Serif JP', serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.glyph ?? '中', 0, 1);
        ctx.restore();
      } else if (p.kind === 'shard' && p.poly) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        p.poly.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (this.ps.length) requestAnimationFrame(this.frame);
    else {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      this.running = false;
    }
  };
}
