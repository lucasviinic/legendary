import { describe, expect, it } from 'vitest';
import {
  CaptionEventSchema,
  ClientMessageSchema,
  EnrichResponseSchema,
  QuizQuestionDraftSchema,
  SenseMatchSchema,
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

  it('accepts the whole caption track of a video', () => {
    const track = { source: 'youtube', cues: ['I reckon so.', 'We headed out.'] };
    expect(ClientMessageSchema.parse({ type: 'track', track })).toEqual({ type: 'track', track });
  });

  it('accepts the bounds of the browser window with a caption', () => {
    const caption = {
      text: 'I reckon so.',
      startedAt: 1,
      source: 'youtube',
      bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    };
    expect(ClientMessageSchema.parse({ type: 'caption', caption })).toMatchObject({ caption });
  });

  it('rejects an empty caption track', () => {
    expect(() =>
      ClientMessageSchema.parse({ type: 'track', track: { source: 'youtube', cues: [] } }),
    ).toThrow();
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
          polysemous: false,
        },
      ],
    });
    expect(parsed.words[0]?.cefr).toBe('B2');
  });

  it('accepts the choice among known senses, or none', () => {
    expect(SenseMatchSchema.parse({ match: 1 }).match).toBe(1);
    expect(SenseMatchSchema.parse({ match: null }).match).toBeNull();
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
    expect(questions.map((question) => QuizQuestionDraftSchema.parse(question))).toHaveLength(
      types.length,
    );
  });

  it('rejects a question type outside the closed format', () => {
    expect(() =>
      QuizQuestionDraftSchema.parse({
        word: 'x',
        type: 'essay',
        prompt: 'p',
        options: null,
        answer: 'a',
        explanation: 'e',
        pairs: null,
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
    const parse = (cardsPerMinute: number) =>
      SettingsSchema.parse({ ...defaultSettings, cardsPerMinute }).cardsPerMinute;
    expect(parse(15)).toBe(15);
    expect(() => parse(16)).toThrow();
  });

  it('keeps six summaries and leaves the video alone by default', () => {
    expect(defaultSettings).toMatchObject({ maxSummaries: 6, rewindOnSearch: false });
  });

  it('translates only the words of the level by default', () => {
    expect(defaultSettings.translateAllWords).toBe(false);
  });

  it('starts with 10 quiz questions, and accepts from 5 to 20', () => {
    const parse = (quizQuestions: number) =>
      SettingsSchema.safeParse({ ...defaultSettings, quizQuestions }).success;
    expect(defaultSettings.quizQuestions).toBe(10);
    expect([parse(5), parse(20), parse(4), parse(21)]).toEqual([true, true, false, false]);
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
    const parse = (maxSummaries: number) =>
      SettingsSchema.parse({ ...defaultSettings, maxSummaries }).maxSummaries;
    expect(parse(12)).toBe(12);
    expect(() => parse(13)).toThrow();
    expect(() => parse(0)).toThrow();
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
