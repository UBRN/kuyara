import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WorkerAiProbeClient,
  WorkerAiProbeClientError,
} from './worker-ai-probe-client.ts';

const successData = {
  status: 'ok',
  checkedAt: '2026-08-29T12:00:00.000Z',
};

test('posts the probe request and returns validated data', async () => {
  let received;
  const client = new WorkerAiProbeClient({
    baseUrl: 'https://worker.example/',
    fetch: async (input, init) => {
      received = { input, init };
      return new Response(JSON.stringify({ data: successData }), { status: 200 });
    },
  });

  assert.deepEqual(await client.probe(), successData);
  assert.equal(received.input, 'https://worker.example/v1/ai/probe');
  assert.equal(received.init.method, 'POST');
  assert.equal(received.init.headers['content-type'], 'application/json');
  assert.equal(received.init.body, '{}');
});

test('maps rate-limited and other service responses without leaking details', async () => {
  const cases = [
    [{ error: { code: 'rate_limited' } }, 429, 'rate-limited'],
    [{ error: { code: 'ai_unavailable' } }, 503, 'service'],
  ];

  for (const [body, status, kind] of cases) {
    const client = new WorkerAiProbeClient({
      baseUrl: 'https://worker.example',
      fetch: async () => new Response(JSON.stringify(body), { status }),
    });

    await assert.rejects(
      () => client.probe(),
      (error) => error instanceof WorkerAiProbeClientError &&
        error.kind === kind &&
        !/rate_limited|ai_unavailable|provider|model/i.test(String(error)),
    );
  }
});

test('rejects non-JSON and wrong-shape bodies as invalid responses', async () => {
  const responses = [
    new Response('upstream body detail', { status: 200 }),
    new Response(JSON.stringify({ data: { status: 'ok', checkedAt: 'not-a-date' } }), {
      status: 200,
    }),
    new Response('upstream error detail', { status: 503 }),
  ];

  for (const response of responses) {
    const client = new WorkerAiProbeClient({
      baseUrl: 'https://worker.example',
      fetch: async () => response,
    });

    await assert.rejects(
      () => client.probe(),
      (error) => error instanceof WorkerAiProbeClientError &&
        error.kind === 'invalid-response' &&
        !/upstream|not-a-date/i.test(String(error)),
    );
  }
});

test('maps fetch rejection and timeout abort to sanitized network errors', async () => {
  const cases = [
    {
      fetch: async () => { throw new Error('raw network detail'); },
    },
    {
      fetch: async (_input, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('raw timeout detail')));
      }),
      requestTimeoutMilliseconds: 1,
    },
  ];

  for (const scenario of cases) {
    const client = new WorkerAiProbeClient({
      baseUrl: 'https://worker.example',
      fetch: scenario.fetch,
      requestTimeoutMilliseconds: scenario.requestTimeoutMilliseconds,
    });

    await assert.rejects(
      () => client.probe(),
      (error) => error instanceof WorkerAiProbeClientError &&
        error.kind === 'network' &&
        !/network detail|timeout detail|provider|model/i.test(String(error)),
    );
  }
});
