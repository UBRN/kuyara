import assert from 'node:assert/strict';
import test from 'node:test';

import { aiRecommendV2RequestSchema } from '@kuyara/contracts';

import { messages } from '../localization/messages.ts';
import { supportedLanguages } from './preferences.ts';

test('the supported languages are the ones the app has messages for and a request may name', () => {
  assert.deepEqual([...supportedLanguages].sort(), Object.keys(messages).sort());
  assert.deepEqual([...supportedLanguages].sort(), [...aiRecommendV2RequestSchema.shape.locale.options].sort());
});
