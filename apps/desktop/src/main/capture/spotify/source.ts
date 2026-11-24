import { EventEmitter } from 'node:events';
import type { CaptionEvent, CaptionTrack } from '@legendary/contracts';
import type { LrcLine } from '@legendary/core';
import { isMostlyEnglish } from '@legendary/core/pipeline';
import type { CaptionSource } from '../caption-source';
import type { LyricsClient } from './lyrics';
import type { SpotifyPlayer, SpotifyState } from './player';

export type SpotifyNotice = 'spotify_waiting' | 'spotify_denied' | 'no_lyrics';

export interface SpotifySourceDeps {
  player: SpotifyPlayer;
  lyrics: LyricsClient;
  ranks: ReadonlyMap<string, number>;
  now: () => number;
}

type Playing = Extract<SpotifyState, { kind: 'track' }>;

interface Anchor {
  positionS: number;
  at: number;
  playing: boolean;
}

const POLL_MS = 1_000;
const SEEK_TOLERANCE_S = 1.5;
const EARLY_S = 0.05;

export class SpotifySource extends EventEmitter implements CaptionSource {
  private running = false;
  private reading = false;
  private poller: ReturnType<typeof setInterval> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private trackId: string | null = null;
  private title = '';
  private lines: LrcLine[] | null = null;
  private next = 0;
  private lastSaid = -1;
  private anchor: Anchor | null = null;
  private notice: SpotifyNotice | null | undefined;

  constructor(private readonly deps: SpotifySourceDeps) {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.poll();
    this.poller = setInterval(() => void this.poll(), POLL_MS);
  }

  stop(): void {
    this.running = false;
    clearInterval(this.poller);
    clearTimeout(this.timer);
    this.trackId = null;
    this.lines = null;
    this.anchor = null;
    this.lastSaid = -1;
    this.notice = undefined;
  }

  private async poll() {
    if (this.reading || !this.running) return;
    this.reading = true;
    try {
      const at = this.deps.now();
      const state = await this.deps.player.read();
      if (this.running) await this.apply(state, at);
    } finally {
      this.reading = false;
    }
  }

  private async apply(state: SpotifyState, at: number) {
    if (state.kind !== 'track') {
      clearTimeout(this.timer);
      this.anchor = null;
      this.setNotice(state.kind === 'denied' ? 'spotify_denied' : 'spotify_waiting');
      return;
    }
    if (state.id !== this.trackId) await this.changeTrack(state);
    if (!this.running || state.id !== this.trackId) return;
    this.setNotice(this.lines ? null : 'no_lyrics');
    this.follow(state, at);
  }

  private async changeTrack(state: Playing) {
    clearTimeout(this.timer);
    this.trackId = state.id;
    this.title = `${state.name} · ${state.artist}`;
    this.lines = null;
    this.anchor = null;
    this.next = 0;
    this.lastSaid = -1;
    this.emit('song', { id: state.id, title: this.title });

    const found = await this.deps.lyrics.find({
      id: state.id,
      name: state.name,
      artist: state.artist,
      album: state.album,
      durationS: state.durationMs / 1000,
    });
    if (!this.running || this.trackId !== state.id) return;
    if (
      !found ||
      !isMostlyEnglish(
        found.map((line) => line.text),
        this.deps.ranks,
      )
    )
      return;
    this.lines = found;
    const track: CaptionTrack = { source: 'spotify', cues: found.map((line) => line.text) };
    this.emit('track', track);
  }

  private follow(state: Playing, at: number) {
    const previous = this.anchor;
    this.anchor = { positionS: state.positionS, at, playing: state.playing };
    if (!this.lines || !state.playing) {
      clearTimeout(this.timer);
      return;
    }
    const expected =
      previous?.playing === true ? previous.positionS + (at - previous.at) / 1000 : null;
    if (expected === null || Math.abs(state.positionS - expected) > SEEK_TOLERANCE_S) {
      const current = this.lineAt(this.estimate());
      if (current >= 0 && current !== this.lastSaid) this.say(current);
      this.next = current + 1;
    }
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    const lines = this.lines;
    if (!lines || !this.anchor?.playing || this.next >= lines.length) return;
    const wait = (lines[this.next]!.at - this.estimate()) * 1000;
    if (wait <= 0) {
      this.reach();
      return;
    }
    this.timer = setTimeout(() => this.reach(), wait);
  }

  private reach() {
    const lines = this.lines;
    if (!lines || !this.anchor) return;
    const position = this.estimate();
    while (this.next < lines.length && lines[this.next]!.at <= position + EARLY_S) {
      this.say(this.next);
      this.next += 1;
    }
    this.schedule();
  }

  private say(index: number) {
    const line = this.lines![index]!;
    this.lastSaid = index;
    const caption: CaptionEvent = {
      text: line.text,
      startedAt: this.deps.now(),
      source: 'spotify',
      mediaTitle: this.title,
    };
    this.emit('caption', caption);
  }

  private estimate(): number {
    const anchor = this.anchor!;
    return anchor.positionS + (anchor.playing ? (this.deps.now() - anchor.at) / 1000 : 0);
  }

  private lineAt(position: number): number {
    let index = -1;
    this.lines!.forEach((line, i) => {
      if (line.at <= position) index = i;
    });
    return index;
  }

  private setNotice(notice: SpotifyNotice | null) {
    if (notice === this.notice) return;
    this.notice = notice;
    this.emit('notice', notice);
  }
}
