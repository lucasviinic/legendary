import { describe, expect, it } from 'vitest';
import { parseLrc } from './lrc';

describe('parseLrc', () => {
  it('reads the time and the text of each line', () => {
    expect(parseLrc("[00:43.69] You're on my mind\n[00:48.35] Already gave you the time")).toEqual([
      { at: 43.69, text: "You're on my mind" },
      { at: 48.35, text: 'Already gave you the time' },
    ]);
  });

  it('counts the minutes', () => {
    expect(parseLrc('[01:02.50] Line')).toEqual([{ at: 62.5, text: 'Line' }]);
  });

  it('drops lines left without words', () => {
    expect(parseLrc('[00:01.00]\n[00:02.00] ♪\n[00:03.00] Hi')).toEqual([{ at: 3, text: 'Hi' }]);
  });

  it('repeats a line with several times, in time order', () => {
    expect(parseLrc('[00:10.00][00:30.00] Chorus\n[00:20.00] Verse')).toEqual([
      { at: 10, text: 'Chorus' },
      { at: 20, text: 'Verse' },
      { at: 30, text: 'Chorus' },
    ]);
  });

  it('skips tags without time and the times of each word', () => {
    expect(parseLrc('[ar:Someone]\n[00:05.00] <00:05.00>Hello <00:05.50>there')).toEqual([
      { at: 5, text: 'Hello there' },
    ]);
  });
});
