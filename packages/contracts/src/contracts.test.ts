import { describe, expect, it } from 'vitest';
import {
  CaptionEventSchema,
  ClientMessageSchema,
  EnrichResponseSchema,
  QuizResponseSchema,
  SettingsSchema,
  defaultSettings,
  eventChannels,
  invokeChannels,
} from './index';

describe('CaptionEvent', () => {
  it('accepts a caption from the extension', () => {
    const parsed = CaptionEventSchema.parse({
      text: 'I reckon we should head out.',
      startedAt: 1000,
      source: 'netflix',
      mediaTitle: 'Northbound · T1E3',
    });
    expect(parsed.source).toBe('netflix');
  });

  it('rejects an empty caption', () => {
    expect(() => CaptionEventSchema.parse({ text: '', startedAt: 1, source: 'netflix' })).toThrow();
  });

  it('rejects an unknown source', () => {
    expect(() => CaptionEventSchema.parse({ text: 'a', startedAt: 1, source: 'hbo' })).toThrow();
  });
});

describe('WebSocket messages', () => {
  it('parses a caption message', () => {
    const msg = ClientMessageSchema.parse({
      type: 'caption',
      caption: { text: 'hi there', startedAt: 1, source: 'youtube' },
    });
    expect(msg.type).toBe('caption');
  });

  it('rejects an unknown message type', () => {
    expect(() => ClientMessageSchema.parse({ type: 'eval', code: 'x' })).toThrow();
  });
});

describe('AI responses', () => {
  it('accepts an enriched word', () => {
    const parsed = EnrichResponseSchema.parse({
      words: [
        {
          lemma: 'reckon',
          pos: 'verb',
          translation: 'achar, supor',
          explanation: 'Jeito informal de dar uma opinião.',
          exampleEn: 'I reckon it will rain.',
          examplePt: 'Acho que vai chover.',
          cefr: 'B2',
        },
      ],
    });
    expect(parsed.words[0]?.cefr).toBe('B2');
  });

  it('accepts every quiz question type in the closed format', () => {
    const types = [
      'mc_en_pt',
      'mc_pt_en',
      'cloze',
      'context_sense',
      'match',
      'true_false',
      'type_word',
    ];
    const questions = types.map((type) => ({
      word: 'reckon',
      type,
      prompt: 'prompt',
      options: type === 'match' ? null : ['a', 'b'],
      answer: 'a',
      explanation: 'porque sim',
      pairs: type === 'match' ? [{ word: 'reckon', meaning: 'achar' }] : null,
    }));
    expect(QuizResponseSchema.parse({ questions }).questions).toHaveLength(types.length);
  });

  it('rejects a question type outside the closed format', () => {
    expect(() =>
      QuizResponseSchema.parse({
        questions: [
          {
            word: 'x',
            type: 'essay',
            prompt: 'p',
            options: null,
            answer: 'a',
            explanation: 'e',
            pairs: null,
          },
        ],
      }),
    ).toThrow();
  });
});

describe('Settings', () => {
  it('has defaults that match the mockup', () => {
    expect(SettingsSchema.parse(defaultSettings)).toMatchObject({
      level: 'B2',
      cardsPerMinute: 2,
      corner: 'tr',
      highlightSubtitles: true,
      wsPort: 47615,
    });
  });

  it('never carries an API key', () => {
    const parsed = SettingsSchema.parse({ ...defaultSettings, apiKey: 'sk-secret' });
    expect(parsed).not.toHaveProperty('apiKey');
  });

  it('limits cards per minute to the slider range', () => {
    expect(SettingsSchema.parse({ ...defaultSettings, cardsPerMinute: 10 }).cardsPerMinute).toBe(
      10,
    );
    expect(() => SettingsSchema.parse({ ...defaultSettings, cardsPerMinute: 11 })).toThrow();
  });

  it('keeps six summaries and leaves the video alone by default', () => {
    expect(defaultSettings).toMatchObject({ maxSummaries: 6, rewindOnSearch: false });
  });

  it('keeps one card at a time for 10 seconds by default', () => {
    expect(defaultSettings).toMatchObject({ cardSeconds: 10, cardsAtOnce: 1 });
  });

  it('limits the time of a card and how many stay open at once', () => {
    const parse = (patch: object) => SettingsSchema.parse({ ...defaultSettings, ...patch });
    expect(parse({ cardSeconds: 3, cardsAtOnce: 3 })).toMatchObject({
      cardSeconds: 3,
      cardsAtOnce: 3,
    });
    expect(() => parse({ cardSeconds: 2 })).toThrow();
    expect(() => parse({ cardSeconds: 31 })).toThrow();
    expect(() => parse({ cardsAtOnce: 0 })).toThrow();
    expect(() => parse({ cardsAtOnce: 4 })).toThrow();
  });

  it('limits the summaries to the slider range', () => {
    expect(SettingsSchema.parse({ ...defaultSettings, maxSummaries: 10 }).maxSummaries).toBe(10);
    expect(() => SettingsSchema.parse({ ...defaultSettings, maxSummaries: 11 })).toThrow();
    expect(() => SettingsSchema.parse({ ...defaultSettings, maxSummaries: 0 })).toThrow();
  });
});

describe('IPC channels', () => {
  it('declares every channel from the spec', () => {
    const expected = [
      'session:start',
      'session:stop',
      'vocab:mark-known',
      'vocab:save',
      'overlay:set-interactive',
      'quiz:get',
      'quiz:answer',
      'quiz:finish',
      'history:list',
      'history:words',
      'settings:get',
      'settings:set',
    ];
    expect(Object.keys(invokeChannels)).toEqual(expect.arrayContaining(expected));
    expect(Object.keys(eventChannels)).toEqual(
      expect.arrayContaining(['session:status', 'vocab:card']),
    );
  });

  it('validates a payload through the channel schema', () => {
    expect(invokeChannels['vocab:save'].request.parse({ lemma: 'reckon' })).toEqual({
      lemma: 'reckon',
    });
    expect(() => invokeChannels['vocab:save'].request.parse({ lemma: 1 })).toThrow();
  });

  it('refuses an empty search or one longer than an expression', () => {
    const { request } = invokeChannels['search:submit'];
    expect(request.parse({ query: 'reckon' })).toEqual({ query: 'reckon' });
    expect(() => request.parse({ query: '' })).toThrow();
    expect(() => request.parse({ query: 'x'.repeat(61) })).toThrow();
  });

  it('accepts a missing payload on channels without one', () => {
    expect(invokeChannels['session:stop'].request.parse(undefined)).toBeUndefined();
  });
});
