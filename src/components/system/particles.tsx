"use client";
import { useEffect, useRef } from "react";

/** Ambient floating "mana" particles. Stays static under reduced motion; pauses in hidden tabs. */
export function ParticleField({ density = 0.00006, reduced }: { density?: number; reduced?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const osReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const still = reduced || osReduced;
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    type P = { x: number; y: number; r: number; vy: number; vx: number; a: number; hue: number; tw: number };
    let ps: P[] = [];
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(18, Math.min(110, Math.floor(w * h * density)));
      ps = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + 0.3, vy: -(Math.random() * 0.25 + 0.05), vx: (Math.random() - 0.5) * 0.08, a: Math.random() * 0.6 + 0.2, hue: Math.random() < 0.65 ? 199 : 262, tw: Math.random() * Math.PI * 2 }));
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        if (!still) {
          p.y += p.vy;
          p.x += p.vx;
          if (p.y < -5) {
            p.y = h + 5;
            p.x = Math.random() * w;
          }
        }
        const alpha = p.a * (0.6 + 0.4 * Math.sin(t / 900 + p.tw));
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 95%, 70%, ${alpha})`;
        ctx.shadowColor = `hsla(${p.hue}, 95%, 65%, ${alpha})`;
        ctx.shadowBlur = 8;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    resize();
    draw(0);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) raf = requestAnimationFrame(draw);
    };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density, reduced]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-70 light:opacity-30" aria-hidden="true" />;
}
