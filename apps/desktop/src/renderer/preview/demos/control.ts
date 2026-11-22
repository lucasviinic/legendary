export interface Pointer {
  x: number;
  y: number;
  down: boolean;
}

interface DemoControl {
  durationMs: number;
  start(): void;
  advance(deltaMs: number): void;
  pointer(): Pointer | null;
}

declare global {
  interface Window {
    demo?: DemoControl;
  }
}

export interface Timeline {
  at(ms: number, run: () => void): void;
  every(ms: number, run: () => void): void;
}

export interface DemoScript {
  durationMs: number;
  play(clock: Timeline): void;
  pointerAt?(elapsedMs: number): Pointer | null;
}

const animationTimes = new WeakMap<Animation, number>();

function advanceAnimations(deltaMs: number) {
  for (const animation of document.getAnimations()) {
    const seen = animationTimes.get(animation);
    if (seen === undefined) animation.pause();
    const end = Number(animation.effect?.getComputedTiming().endTime ?? Infinity);
    const time = Math.min((seen ?? 0) + deltaMs, end);
    animationTimes.set(animation, time);
    if (time >= end) animation.finish();
    else animation.currentTime = time;
  }
}

export function registerDemo({ durationMs, play, pointerAt }: DemoScript): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const tickers: ReturnType<typeof setInterval>[] = [];
  const clock: Timeline = {
    at: (ms, run) => void timers.push(setTimeout(run, ms)),
    every: (ms, run) => void tickers.push(setInterval(run, ms)),
  };
  let startedAt = 0;
  window.demo = {
    durationMs,
    start: () => {
      startedAt = Date.now();
      play(clock);
    },
    advance: advanceAnimations,
    pointer: () => pointerAt?.(Date.now() - startedAt) ?? null,
  };
  return () => {
    timers.forEach(clearTimeout);
    tickers.forEach(clearInterval);
    delete window.demo;
  };
}
