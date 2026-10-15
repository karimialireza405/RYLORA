import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useReducedMotion";
import { AudioPulseEnvelope } from "@/utils/audioPulse";
import {
  acquireSpectrum,
  latestSpectrum,
} from "@/features/visualizer/spectrumBus";

/** A visible pulse on real musical attacks, without rendering React per frame. */
export function useAudioPulse(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const enabled = active && !reduced;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!enabled) {
      node.style.transition = reduced ? "none" : "scale 200ms ease-out";
      node.style.scale = "1";
      return;
    }
    const release = acquireSpectrum();
    let raf = 0, last = 0;
    let pulse = new AudioPulseEnvelope();
    let visible = true;
    node.style.transition = "none";
    node.style.willChange = "scale";
    const reset = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      pulse = new AudioPulseEnvelope();
      node.style.scale = "1";
    };
    const frame = (now: number) => {
      raf = 0;
      if (document.hidden || !visible) { reset(); return; }
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 30);
      last = now;
      const { bands, receivedAt } = latestSpectrum();
      node.style.scale = String(pulse.step(bands, receivedAt, now, dt));
      raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const visibility = () => document.hidden ? reset() : wake();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) wake(); else reset();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", visibility);
    wake();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      release();
      node.style.willChange = "";
      node.style.transition = reduced ? "none" : "scale 200ms ease-out";
      node.style.scale = "1";
    };
  }, [enabled, reduced]);
  return { ref, enabled };
}
