import { AudioPulseEnvelope } from "@/utils/audioPulse";

type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; radius: number };
type Ripple = { age: number; strength: number };
interface Frame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  bands: Float32Array;
  rawBands: Uint8Array;
  receivedAt: number;
  now: number;
  dt: number;
  energy: number;
  phase: number;
  color: string;
  reactive: boolean;
  coarse: boolean;
}

/** Perspective point-cloud surface: native frequency energy gives the terrain its height. */
export class ParticleFieldScene {
  private sparks: Spark[] = [];
  private ripples: Ripple[] = [];
  private pulse = new AudioPulseEnvelope();
  private lastPulse = 0;
  private lastRipple = -Infinity;
  private paletteKey = "";
  private light = "";
  private glow: HTMLCanvasElement | null = null;

  draw({ ctx, width, height, bands, rawBands, receivedAt, now, dt, energy, phase, color, reactive, coarse }: Frame) {
    if (color !== this.paletteKey) {
      this.paletteKey = color;
      const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
      this.light = `rgb(${rgb.map(c => Math.round(c + (255 - c) * 0.62)).join(" ")})`;
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = 32;
      const brush = sprite.getContext("2d")!;
      const halo = brush.createRadialGradient(16, 16, 0, 16, 16, 16);
      halo.addColorStop(0, this.light);
      halo.addColorStop(0.12, color + "b0");
      halo.addColorStop(0.4, color + "28");
      halo.addColorStop(1, color + "00");
      brush.fillStyle = halo;
      brush.fillRect(0, 0, 32, 32);
      this.glow = sprite;
    }
    const pulse = (this.pulse.step(rawBands, reactive ? receivedAt : 0, now, dt) - 1) / 0.08;
    if (reactive && pulse > 0.25 && pulse > this.lastPulse + 0.012 && now - this.lastRipple > 420) {
      this.ripples.push({ age: 0, strength: Math.min(1, pulse * 1.5) });
      if (this.ripples.length > 3) this.ripples.shift();
      this.lastRipple = now;
    }
    this.lastPulse = pulse;
    const floor = height * 0.9;
    const amplitude = Math.min(height * 0.36, coarse ? 64 : 112);
    const rows = coarse ? 12 : 22;
    const columns = coarse ? 64 : 160;
    const sample = (t: number) => {
      const p = Math.min(bands.length - 1, Math.max(0, t * (bands.length - 1)));
      const i = Math.floor(p), next = Math.min(bands.length - 1, i + 1);
      return bands[i]! + (bands[next]! - bands[i]!) * (p - i);
    };
    const elevation = (t: number, depth: number) => {
      const frequency = Math.abs(t - 0.5) * 2;
      const level = sample(frequency);
      const edge = Math.pow(Math.sin(Math.PI * t), 0.8);
      const fold = 0.62 + Math.sin(t * Math.PI * 5 + depth * 5.2 - phase * 0.8) * 0.23
        + Math.cos(t * Math.PI * 9 - depth * 3.5 + phase * 0.4) * 0.15;
      return Math.pow(level, 0.8) * edge * fold * amplitude * (0.6 + depth * 0.4) * (1 + pulse * 0.18);
    };

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Low, wide atmospheric light; the actual cover hue remains the source colour.
    ctx.save();
    ctx.translate(width / 2, floor - amplitude * 0.25);
    ctx.scale(1, Math.max(0.12, height / width * 0.7));
    const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.48);
    haze.addColorStop(0, color + "36");
    haze.addColorStop(0.45, color + "14");
    haze.addColorStop(1, color + "00");
    ctx.fillStyle = haze;
    ctx.globalAlpha = 0.18 + energy * 0.7 + pulse * 0.12;
    ctx.fillRect(-width / 2, -width / 2, width, width);
    ctx.restore();

    // Far-to-near perspective rows form a floating terrain, never vertical bars.
    for (let row = 0; row < rows; row++) {
      const depth = (row + 1) / rows;
      const span = width * (0.44 + depth * 0.55);
      const baseY = height * 0.65 + Math.pow(depth, 1.6) * height * 0.25;
      const offset = (row % 2) * 0.5;
      ctx.beginPath();
      for (let col = 0; col < columns; col++) {
        const t = (col + offset) / columns;
        const level = sample(Math.abs(t - 0.5) * 2);
        const x = width / 2 + (t - 0.5) * span;
        const y = baseY - elevation(t, depth);
        const radius = (0.35 + depth * 0.65 + level * 0.3) * (coarse ? 0.85 : 1);
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = row % 5 === 0 ? this.light : color;
      ctx.globalAlpha = (0.08 + depth * 0.48) * (0.25 + Math.min(1, energy * 2.4))
        * (1 + pulse * 0.24);
      ctx.fill();
    }

    // A fine illuminated ridge defines the front edge, with a soft floor reflection.
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let col = 0; col <= columns; col++) {
        const t = col / columns;
        const x = width * (0.005 + t * 0.99);
        const lift = elevation(t, 1);
        const y = pass ? floor + lift * 0.2 : floor - lift;
        const radius = pass ? 0.55 : 0.9;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = pass ? color : this.light;
      ctx.globalAlpha = (pass ? 0.06 : 0.48) * Math.min(1, energy * 3);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Beat-driven elliptical ripples sit in the same perspective plane.
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i]!;
      ripple.age += dt;
      const t = ripple.age / 1.4;
      if (t >= 1) { this.ripples.splice(i, 1); continue; }
      const radius = width * (0.05 + (1 - Math.pow(1 - t, 2)) * 0.43);
      ctx.beginPath();
      ctx.ellipse(width / 2, floor - amplitude * 0.23, radius, radius * height / width * 0.19, 0, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = Math.pow(1 - t, 2) * 0.22 * ripple.strength;
      ctx.stroke();
    }

    // Individual high-rising motes: no streaks, tails or moving strand shapes.
    const cap = coarse ? 28 : 84;
    if (reactive && energy > 0.015 && this.sparks.length < cap && Math.random() < dt * (12 + energy * 35)) {
      const t = 0.08 + Math.random() * 0.84;
      this.sparks.push({
        x: width * t, y: floor - elevation(t, 1),
        vx: (Math.random() - 0.5) * 16, vy: -28 - Math.random() * 42 - pulse * 25,
        age: 0, life: 3 + Math.random() * 2, radius: 0.6 + Math.random() * 0.9,
      });
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i]!;
      spark.age += dt;
      if (spark.age >= spark.life) { this.sparks.splice(i, 1); continue; }
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      const fade = Math.max(0, Math.min(1, spark.y / 30));
      ctx.globalAlpha = Math.sin(spark.age / spark.life * Math.PI) * 0.65 * fade;
      ctx.fillStyle = i % 3 ? color : this.light;
      const glowSize = spark.radius * 10;
      if (this.glow) ctx.drawImage(this.glow, spark.x - glowSize / 2, spark.y - glowSize / 2, glowSize, glowSize);
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return this.sparks.length > 0 || this.ripples.length > 0;
  }
}
