/** Canvas 2D の軽量パーティクル（玉・紙吹雪・火花） */

type Kind = 'coin' | 'confetti' | 'spark';

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
}

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
    this.ps = this.ps.filter((p) => p.life < p.max && p.y < innerHeight + 40);
    for (const p of this.ps) {
      p.life++;
      p.vy += p.kind === 'spark' ? 0.15 : p.kind === 'confetti' ? 0.12 : 0.32;
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
