// The sync consent wording is the lawyer-approved text (ADR 0041 section 10). The account keeps
// the version of the text each answer was given to, so a changed word must come with a new
// version: this test pins a hash of both languages' wording to `SYNC_CONSENT_TEXT_VERSION`.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { messages } from '../../localization/messages.ts';
import { ACCOUNT_SCREENS_ENABLED } from './application/account-screens-flag.ts';
import { SYNC_CONSENT_TEXT_VERSION } from './domain/sync-consent.ts';

/** Every consent text version that has shipped, with the hash of its wording. Append only. */
const wordingHashes = {
  '2026-10-04': 'd262b28decb2965e29d4e6c4095c10fc2a68feb71feae0ff3257a69cab7c3ebe',
  '2026-10-06': '5b18bc250282bdb980f8474948616970f3379c92fe5afe10f42d870f5f5a2f15',
};

const wording = (language) => {
  const { syncConsentBox, syncConsentSubtitle, syncConsentText } = messages[language].account.consent;
  return { syncConsentSubtitle, syncConsentBox, syncConsentText };
};

test('the consent wording in both languages matches the hash pinned to its text version', () => {
  const hash = createHash('sha256').update(JSON.stringify({ en: wording('en'), tr: wording('tr') })).digest('hex');
  assert.equal(
    hash,
    wordingHashes[SYNC_CONSENT_TEXT_VERSION],
    'The consent wording changed: give it a new SYNC_CONSENT_TEXT_VERSION and add its hash here.',
  );
});

test('no consent string still holds a reviewer marker once the account screens are on', () => {
  const strings = ['en', 'tr'].flatMap((language) => {
    const { syncConsentText, ...lines } = messages[language].account.consent;
    return [...Object.values(lines), ...syncConsentText];
  });
  const marked = strings.filter((text) => text.includes('['));
  assert.ok(!ACCOUNT_SCREENS_ENABLED || marked.length === 0, `Reviewer markers remain: ${marked.join(' | ')}`);
});

test('the full text has a bold title, its paragraphs and the five kinds of records as bullets', () => {
  for (const language of ['en', 'tr']) {
    const { syncConsentText } = messages[language].account.consent;
    assert.match(syncConsentText[0], /^\*\*[^*]+\*\*$/);
    assert.equal(syncConsentText.filter((line) => line.startsWith('- ')).length, 5);
  }
});
