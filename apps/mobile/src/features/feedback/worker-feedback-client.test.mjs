import assert from 'node:assert/strict';
import test from 'node:test';

import { sendFeedback } from './data/worker-feedback-client.ts';

test('sends only the validated fields and accepts the receipt', async () => {
  let sent;
  const fetcher = async (_url, init) => {
    sent = JSON.parse(init.body);
    return Response.json({ data: { status: 'received' } });
  };
  await sendFeedback('https://worker.test', { message: 'hello', submissionId: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b', appVersion: '0.1.20261002', platform: 'ios', locale: 'en' }, fetcher);
  assert.deepEqual(sent, { message: 'hello', submissionId: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b', appVersion: '0.1.20261002', platform: 'ios', locale: 'en' });
});

test('rejects malformed receipts', async () => {
  await assert.rejects(sendFeedback('https://worker.test',
    { message: 'hello', submissionId: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b', appVersion: '0.1.20261002', platform: 'ios', locale: 'en' },
    async () => Response.json({ data: { id: 'private' } })));
});
