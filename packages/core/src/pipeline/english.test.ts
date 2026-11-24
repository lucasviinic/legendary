import { describe, expect, it } from 'vitest';
import { isMostlyEnglish } from './english';

const ranks = new Map(
  ['i', 'you', 'be', "'re", 'on', 'my', 'mind', 'want', 'it'].map((word, index) => [
    word,
    index + 1,
  ]),
);

describe('isMostlyEnglish', () => {
  it('accepts lyrics in English', () => {
    expect(isMostlyEnglish(["You're on my mind", 'I want it'], ranks)).toBe(true);
  });

  it('refuses lyrics in Portuguese', () => {
    expect(isMostlyEnglish(['Eu quero você aqui comigo', 'Não vá embora agora'], ranks)).toBe(
      false,
    );
  });

  it('refuses lyrics with less than half of the words in English', () => {
    expect(isMostlyEnglish(['I want você aqui comigo agora'], ranks)).toBe(false);
  });

  it('refuses lyrics without words', () => {
    expect(isMostlyEnglish([], ranks)).toBe(false);
  });
});
