import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichRequestWord, EnrichedWord, Provider } from '@legendary/contracts';
import { createProvider } from './provider-factory';

const reckon: EnrichRequestWord = {
  lemma: 'reckon',
  pos: 'verb',
  surface: 'reckon',
  sentence: 'I reckon so.',
};
const grumpy: EnrichRequestWord = {
  lemma: 'grumpy',
  pos: 'adj',
  surface: 'grumpy',
  sentence: 'He is grumpy.',
};

const answerOf = (word: EnrichRequestWord, translation: string): EnrichedWord => ({
  lemma: word.lemma,
  pos: word.pos,
  translation,
  explanation: 'Explicação curta.',
  exampleEn: 'An example.',
  examplePt: 'Um exemplo.',
  cefr: 'B2',
});

const FULL_ANSWER = JSON.stringify({
  words: [answerOf(reckon, 'achar, supor'), answerOf(grumpy, 'mal-humorado')],
});

/** Corta a resposta logo depois de cada campo `explanation` começar a ser escrito. */
const pieces = (json: string) => json.split(/(?<="explanation":")/);

/** Como cada provedor escreve um pedaço de texto na resposta em streaming. */
const SSE: Record<
  Provider,
  { start: string[]; text: (text: string) => string[]; finish: string[] }
> = {
  claude: {
    start: [
      JSON.stringify({
        type: 'message_start',
        message: { id: 'm', model: 'x', usage: { input_tokens: 1, output_tokens: 1 } },
      }),
      JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }),
    ],
    text: (text) => [
      JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text },
      }),
    ],
    finish: [
      JSON.stringify({ type: 'content_block_stop', index: 0 }),
      JSON.stringify({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1 },
      }),
      JSON.stringify({ type: 'message_stop' }),
    ],
  },
  deepseek: {
    start: [],
    text: (content) => [
      JSON.stringify({
        id: 'c',
        created: 1,
        model: 'x',
        choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
      }),
    ],
    finish: [
      JSON.stringify({
        id: 'c',
        created: 1,
        model: 'x',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      '[DONE]',
    ],
  },
  gemini: {
    start: [],
    text: (text) => [
      JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, index: 0 }] }),
    ],
    finish: [
      JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'STOP', index: 0 }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      }),
    ],
  },
};

const encoder = new TextEncoder();

/** Resposta em streaming que o teste vai escrevendo aos poucos. */
function streamedResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (value) => {
      controller = value;
    },
  });
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
    write: (events: string[]) =>
      events.forEach((event) => controller.enqueue(encoder.encode(`data: ${event}\n\n`))),
    close: () => controller.close(),
    fail: (error: Error) => controller.error(error),
  };
}

function respondWith(response: Response) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => response);
  vi.stubGlobal('fetch', fetchMock);
  const lastRequest = () => {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return { url, body: JSON.parse(String(init.body)) as Record<string, unknown> };
  };
  return { fetchMock, lastRequest };
}

function answeredStream(provider: Provider, text = FULL_ANSWER) {
  const stream = streamedResponse();
  stream.write(SSE[provider].start);
  stream.write(SSE[provider].text(text));
  stream.write(SSE[provider].finish);
  stream.close();
  return stream;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PROVIDERS: Provider[] = ['claude', 'deepseek', 'gemini'];

describe.each(PROVIDERS)('translating words with %s', (provider) => {
  it('returns the complete answer', async () => {
    respondWith(answeredStream(provider).response);
    const words = await createProvider(provider, 'key').enrichWords([reckon, grumpy]);
    expect(words).toEqual([answerOf(reckon, 'achar, supor'), answerOf(grumpy, 'mal-humorado')]);
  });

  it('announces each translation as soon as it is complete, before the answer ends', async () => {
    const stream = streamedResponse();
    respondWith(stream.response);
    stream.write(SSE[provider].start);

    const onTranslation = vi.fn();
    const answer = createProvider(provider, 'key').enrichWords([reckon, grumpy], onTranslation);
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [first, second, rest] = pieces(FULL_ANSWER);
    stream.write(SSE[provider].text(first!));
    await vi.waitFor(() => expect(onTranslation).toHaveBeenCalledTimes(1));
    expect(onTranslation).toHaveBeenCalledWith(reckon, 'achar, supor');

    stream.write(SSE[provider].text(second!));
    await vi.waitFor(() => expect(onTranslation).toHaveBeenCalledTimes(2));
    expect(onTranslation).toHaveBeenLastCalledWith(grumpy, 'mal-humorado');

    stream.write(SSE[provider].text(rest!));
    stream.write(SSE[provider].finish);
    stream.close();
    await answer;
    expect(onTranslation).toHaveBeenCalledTimes(2);
  });

  it('fails instead of hanging when the provider refuses the request', async () => {
    respondWith(
      new Response(JSON.stringify({ error: { message: 'bad key', type: 'auth' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(createProvider(provider, 'key').enrichWords([reckon])).rejects.toThrow();
  });

  it('fails instead of hanging when the connection drops midway', async () => {
    const stream = streamedResponse();
    respondWith(stream.response);
    stream.write(SSE[provider].start);
    const answer = createProvider(provider, 'key').enrichWords([reckon]);
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    stream.write(SSE[provider].text(pieces(FULL_ANSWER)[0]!));
    stream.fail(new Error('connection lost'));
    await expect(answer).rejects.toThrow();
  });

  it('fails when the answer is not the expected JSON', async () => {
    respondWith(answeredStream(provider, 'Desculpe, não posso ajudar.').response);
    await expect(createProvider(provider, 'key').enrichWords([reckon])).rejects.toThrow();
  });
});

describe('what is sent to translate words', () => {
  it('uses Haiku on Claude, without thinking and without the fallback it does not have', async () => {
    const { lastRequest } = respondWith(answeredStream('claude').response);
    await createProvider('claude', 'key').enrichWords([reckon]);
    const { url, body } = lastRequest();
    expect(url).toContain('/messages');
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      stream: true,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
    });
    expect(body).not.toHaveProperty('fallbacks');
    expect(body).not.toHaveProperty('tool_choice');
  });

  it('turns off the thinking mode of DeepSeek, which is on by default', async () => {
    const { lastRequest } = respondWith(answeredStream('deepseek').response);
    await createProvider('deepseek', 'key').enrichWords([reckon]);
    expect(lastRequest().body).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: true,
      thinking: { type: 'disabled' },
    });
  });

  it('turns off the thinking of Gemini', async () => {
    const { lastRequest } = respondWith(answeredStream('gemini').response);
    await createProvider('gemini', 'key').enrichWords([reckon]);
    const { url, body } = lastRequest();
    expect(url).toContain('gemini-2.5-flash:streamGenerateContent');
    expect(body).toMatchObject({ generationConfig: { thinkingConfig: { thinkingBudget: 0 } } });
  });
});

describe('what is sent to build the quiz', () => {
  const word = {
    word: 'reckon',
    translation: 'achar',
    explanation: 'e',
    sentence: 'I reckon so.',
    surface: 'reckon',
  };

  it('keeps Opus on Claude, with the server-side fallback', async () => {
    const { lastRequest } = respondWith(
      new Response(
        JSON.stringify({
          id: 'm',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [{ type: 'text', text: JSON.stringify({ questions: [] }) }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await createProvider('claude', 'key').generateQuiz([word], 10);
    expect(lastRequest().body).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      output_config: { effort: 'low' },
    });
  });
});

describe('checking a key', () => {
  it('uses the fast model on Claude', async () => {
    const { lastRequest } = respondWith(
      new Response(
        JSON.stringify({
          id: 'm',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await createProvider('claude', 'key').check();
    expect(lastRequest().body).toMatchObject({ model: 'claude-haiku-5-5' });
  });
});
