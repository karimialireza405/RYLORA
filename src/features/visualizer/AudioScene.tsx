import { useEffect, useRef } from "react";
import { usePlayer } from "@/stores/player";
import { prefEnabled, useUi } from "@/stores/ui";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { usePlaybackAccent } from "@/hooks/usePlaybackAccent";
import { cn } from "@/utils/cn";
import { ParticleFieldScene } from "./ParticleFieldScene";
import {
  acquireSpectrum,
  BAND_COUNT,
  latestSpectrum,
  onSpectrum,
} from "./spectrumBus";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  radius: number;
};
interface Props {
  mode: "spectrum" | "timeline";
  progress?: number;
  accent?: string | null;
  mirrored?: boolean;
  coarse?: boolean;
  className?: string;
}

/** Live audio energy drives the light. The timeline is a seek ribbon, not a whole-file waveform. */
export function AudioScene({
  mode,
  progress = 0,
  accent,
  mirrored = false,
  coarse = false,
  className,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const playbackAccent = usePlaybackAccent();
  const sceneAccent = /^#[0-9a-f]{6}$/i.test(accent ?? "")
    ? accent!
    : playbackAccent;
  const propsRef = useRef({ progress, accent: sceneAccent });
  propsRef.current = { progress, accent: sceneAccent };
  const playing = usePlayer((s) => s.status === "playing");
  const reduced = useReducedMotion();
  const enabled = useUi((s) => prefEnabled(s.prefs, "visualizer"));
  useEffect(
    () => (enabled && !reduced ? acquireSpectrum() : undefined),
    [enabled, reduced],
  );
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const display = new Float32Array(BAND_COUNT),
      particles: Particle[] = [];
    const field = new ParticleFieldScene();
    let fieldActive = false;
    let width = 0,
      height = 0,
      raf = 0,
      last = 0,
      nextFrame = 0,
      phase = 0,
      running = false,
      intersecting = true;
    const glowColor = () =>
      /^#[0-9a-f]{6}$/i.test(propsRef.current.accent ?? "")
        ? propsRef.current.accent!
        : "#d7eee9";
    const trace = (points: { x: number; y: number }[]) => {
      const first = points[0];
      if (!first) return;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length - 1; i++) {
        const p = points[i]!,
          next = points[i + 1]!;
        ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
      }
      const end = points.at(-1)!;
      ctx.lineTo(end.x, end.y);
    };
    const paint = (now: number, dt: number) => {
      ctx.clearRect(0, 0, width, height);
      if (width < 1 || height < 1) return;
      const { bands, receivedAt } = latestSpectrum();
      const reactive = enabled && !reduced && playing && now - receivedAt < 300;
      let energy = 0;
      for (let i = 0; i < BAND_COUNT; i++) {
        const target = reactive ? (bands[i] ?? 0) / 255 : 0;
        const rate = target > display[i]! ? 0.24 : 0.1;
        display[i]! +=
          (target - display[i]!) * (1 - Math.pow(1 - rate, dt * 60));
        energy += display[i]!;
      }
      energy /= BAND_COUNT;
      if (playing && !reduced) phase += dt * (1.1 + energy * 2.5);
      const color = glowColor(),
        center = mode === "spectrum" ? height * 0.84 : height / 2,
        ratio = Math.max(0, Math.min(1, propsRef.current.progress));
      if (mode === "timeline") {
        const curve = (x: number, layer = 0) => {
          const t = x / Math.max(width, 1),
            edge = Math.pow(Math.sin(Math.PI * t), 0.65);
          const wave =
            Math.sin(t * Math.PI * 7 - phase + layer * 0.5) * 0.62 +
            Math.sin(t * Math.PI * 13 + phase * 0.75 + layer) * 0.23;
          return (
            center +
            wave *
              edge *
              (height * 0.18 + (reduced ? 0 : energy * height * 0.42))
          );
        };
        for (let layer = 2; layer >= 0; layer--) {
          const points = Array.from(
            { length: Math.ceil(width / 4) + 1 },
            (_, i) => {
              const x = Math.min(width, i * 4);
              return { x, y: curve(x, layer) };
            },
          );
          trace(points);
          ctx.strokeStyle = color;
          ctx.lineWidth = layer ? 0.7 : 1.1;
          ctx.globalAlpha = layer ? 0.1 : 0.22;
          ctx.shadowBlur = 0;
          ctx.stroke();
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, width * ratio, height);
          ctx.clip();
          trace(points);
          ctx.strokeStyle = color;
          ctx.globalAlpha = layer ? 0.22 : 0.95;
          ctx.lineWidth = layer ? 0.9 : 1.5;
          ctx.shadowColor = color;
          ctx.shadowBlur = layer ? 5 : 14;
          ctx.stroke();
          ctx.restore();
        }
        const x = width * ratio,
          y = curve(x);
        ctx.globalAlpha = 1;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(Math.min(width - 2, Math.max(2, x)), y, 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (
          reactive &&
          energy > 0.015 &&
          particles.length < 16 &&
          Math.random() < dt * 12
        )
          particles.push({
            x,
            y,
            vx: -10 - Math.random() * 18,
            vy: (Math.random() - 0.5) * 14,
            life: 0.6 + Math.random() * 0.4,
            age: 0,
            radius: 0.6 + Math.random() * 0.6,
          });
      } else {
        fieldActive = field.draw({
          ctx, width, height, bands: display, rawBands: bands, receivedAt,
          now, dt, energy, phase, color, reactive, coarse,
        });
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.age += dt;
        if (p.age >= p.life) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const edgeFade =
          mode === "spectrum" ? Math.max(0, Math.min(1, p.y / 28)) : 1;
        ctx.globalAlpha =
          Math.sin((p.age / p.life) * Math.PI) * 0.65 * edgeFade;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      return Math.max(energy, fieldActive ? 0.003 : 0);
    };
    const frame = (now: number) => {
      raf = 0;
      if (document.hidden || !intersecting) {
        running = false;
        last = 0;
        nextFrame = 0;
        return;
      }
      if (now < nextFrame) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const interval = 1000 / (mode === "spectrum" ? 60 : 30);
      nextFrame = !nextFrame || now - nextFrame > interval * 2
        ? now + interval
        : nextFrame + interval;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 30);
      last = now;
      const energy = paint(now, dt) ?? 0;
      if (!reduced && (playing || energy > 0.002 || particles.length)) {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
        last = 0;
        nextFrame = 0;
      }
    };
    const wake = () => {
      if (!running && !document.hidden && intersecting) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    const resize = () => {
      const box = canvas.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(performance.now(), 1 / 30);
      wake();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting ?? true;
      if (intersecting) wake();
    });
    io.observe(canvas);
    const offSpectrum = onSpectrum(wake);
    // Paused seeking still repaints without a perpetual animation loop.
    const offProgress = usePlayer.subscribe(wake);
    const update = () => wake();
    document.addEventListener("visibilitychange", update);
    canvas.addEventListener("rylora:paint", update);
    resize();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      offSpectrum();
      offProgress();
      document.removeEventListener("visibilitychange", update);
      canvas.removeEventListener("rylora:paint", update);
    };
  }, [mode, playing, reduced, enabled, mirrored, coarse]);
  useEffect(() => {
    ref.current?.dispatchEvent(new Event("rylora:paint"));
  }, [progress, sceneAccent]);
  return (
    <canvas
      ref={ref}
      data-audio-scene={mode}
      data-spectrum-style={mode === "spectrum" ? "particle-field" : undefined}
      data-audio-accent={sceneAccent}
      className={cn("pointer-events-none block h-full w-full", className)}
      aria-hidden
    />
  );
}
