"use client";

/**
 * Original synthesized sound effects (Web Audio). No audio files or third-party assets are used.
 */
let ctx: AudioContext | null = null;
let enabled = true;
let ambient: { stop: () => void } | null = null;

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (!v) stopAmbient();
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; glideTo?: number } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export type Sfx = "notify" | "xp" | "levelup" | "rankup" | "achievement" | "error" | "boss" | "clear" | "click";

export function play(sfx: Sfx) {
  if (!enabled) return;
  switch (sfx) {
    case "click":
      tone(880, 0, 0.06, { type: "triangle", gain: 0.04 });
      break;
    case "notify":
      tone(659.25, 0, 0.18, { type: "triangle", gain: 0.08 });
      tone(987.77, 0.09, 0.28, { type: "sine", gain: 0.07 });
      break;
    case "xp":
      tone(1046.5, 0, 0.12, { type: "sine", gain: 0.06 });
      tone(1318.5, 0.06, 0.16, { type: "sine", gain: 0.05 });
      break;
    case "levelup":
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.09, 0.5, { type: "triangle", gain: 0.09 }));
      tone(130.81, 0, 1.4, { type: "sawtooth", gain: 0.03 });
      break;
    case "rankup":
      tone(220, 0, 1.2, { type: "sawtooth", gain: 0.04, glideTo: 880 });
      [880, 1108.73, 1318.5].forEach((f, i) => tone(f, 0.5 + i * 0.12, 0.7, { type: "sine", gain: 0.07 }));
      break;
    case "achievement":
      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => tone(f, i * 0.07, 0.45, { type: "sine", gain: 0.06 }));
      break;
    case "boss":
      tone(55, 0, 1.6, { type: "sawtooth", gain: 0.08, glideTo: 41 });
      tone(110, 0.2, 1.2, { type: "square", gain: 0.03 });
      break;
    case "clear":
      [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.1, 0.6, { type: "triangle", gain: 0.08 }));
      break;
    case "error":
      tone(196, 0, 0.25, { type: "square", gain: 0.04, glideTo: 146.83 });
      break;
  }
}

/** Low, slowly modulated drone for dungeon focus sessions. */
export function startAmbient() {
  if (!enabled || ambient) return;
  const c = ac();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = 0.0001;
  master.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 3);
  master.connect(c.destination);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 600;
  filter.connect(master);
  const oscs = [55, 82.41, 110.0, 164.81].map((f, i) => {
    const o = c.createOscillator();
    o.type = i % 2 ? "triangle" : "sine";
    o.frequency.value = f;
    o.detune.value = (i - 1.5) * 4;
    o.connect(filter);
    o.start();
    return o;
  });
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  ambient = {
    stop: () => {
      const t = c.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      setTimeout(() => {
        oscs.forEach((o) => o.stop());
        lfo.stop();
        master.disconnect();
      }, 1700);
    },
  };
}

export function stopAmbient() {
  ambient?.stop();
  ambient = null;
}
