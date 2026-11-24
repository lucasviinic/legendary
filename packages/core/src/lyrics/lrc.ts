export interface LrcLine {
  at: number;
  text: string;
}

const STAMP = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const text = raw
      .replace(/\[[^\]]*\]/g, '')
      .replace(/<\d+:\d+(?:\.\d+)?>/g, '')
      .replace(/♪/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    for (const [, minutes, seconds] of raw.matchAll(STAMP)) {
      lines.push({ at: Number(minutes) * 60 + Number(seconds), text });
    }
  }
  return lines.sort((a, b) => a.at - b.at);
}
