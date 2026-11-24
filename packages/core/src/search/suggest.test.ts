import { describe, expect, it } from 'vitest';
import { suggestWords } from './suggest';

describe('suggestWords', () => {
  it('completes the caption words that start with what was typed', () => {
    expect(suggestWords('rec', ['I reckon he recorded it'])).toEqual(['reckon', 'recorded']);
  });

  it('matches only at the start of a word', () => {
    expect(suggestWords('kon', ['I reckon so'])).toEqual([]);
  });

  it('ignores case', () => {
    expect(suggestWords('REC', ['Reckon so'])).toEqual(['reckon']);
  });

  it('lists the newest caption first', () => {
    expect(suggestWords('re', ['ready now', 'I reckon'])).toEqual(['reckon', 'ready']);
  });

  it('lists each word once', () => {
    expect(suggestWords('re', ['ready', 'ready or not'])).toEqual(['ready']);
  });

  it('completes the next word after a space', () => {
    expect(suggestWords('picked ', ['He picked up the phone'])).toEqual(['picked up']);
    expect(suggestWords('picked u', ['He picked up the phone'])).toEqual(['picked up']);
  });

  it('leaves out a word already typed in full', () => {
    expect(suggestWords('reckon', ['I reckon so'])).toEqual([]);
    expect(suggestWords('reckon ', ['I reckon.'])).toEqual([]);
  });

  it('suggests nothing until a letter is typed', () => {
    expect(suggestWords('', ['I reckon so'])).toEqual([]);
    expect(suggestWords('  ', ['I reckon so'])).toEqual([]);
  });

  it('suggests at most five words', () => {
    expect(suggestWords('a', ['able about above act add age ago'])).toEqual([
      'able',
      'about',
      'above',
      'act',
      'add',
    ]);
  });

  it('reads curly apostrophes as straight ones', () => {
    expect(suggestWords("you'", ['I knew you’d come'])).toEqual(["you'd"]);
  });

  it('skips sound tags and speaker names', () => {
    expect(suggestWords('m', ['[MUSIC] MARK: We must go'])).toEqual(['must']);
  });

  it('collapses spaces typed in a row', () => {
    expect(suggestWords('  picked   u', ['He picked up the phone'])).toEqual(['picked up']);
  });
});
