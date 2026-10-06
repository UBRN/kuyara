import assert from 'node:assert/strict';
import test from 'node:test';

import { styleAestheticsLimit } from '@kuyara/contracts';

import { accountIntroLimits } from '../features/account/application/account-intro-pages.ts';
import { displayNameMaxLength, displayNameMinLength } from '../features/profile/domain/profile.ts';
import { composePieceLimit } from '../features/recommendation/application/compose-around-pieces.ts';
import { regenerationPolicy } from '../features/recommendation/domain/regeneration-policy.ts';
import { messages } from './messages.ts';
import { capitalizedNumberWord, numberWord } from './number-words.ts';

// A number that a rule owns is spelled once, by its owner: the copy takes it as a parameter.
// These sentences read exactly as they always did while the owners hold today's numbers, and
// they follow the owner when it changes.

test('a small number is a word in each language and digits past ten', () => {
  assert.equal(numberWord(3, 'en'), 'three');
  assert.equal(numberWord(3, 'tr'), 'üç');
  assert.equal(capitalizedNumberWord(3, 'en'), 'Three');
  assert.equal(capitalizedNumberWord(3, 'tr'), 'Üç');
  assert.equal(capitalizedNumberWord(2, 'tr'), 'İki');
  assert.equal(numberWord(11, 'en'), '11');
  assert.equal(numberWord(11, 'tr'), '11');
});

test('the owners hold the numbers the copy used to spell', () => {
  assert.equal(composePieceLimit, 3);
  assert.equal(regenerationPolicy.dailyAiRegenerations, 5);
  assert.equal(regenerationPolicy.memberDailyAiRegenerations, 10);
  assert.equal(displayNameMinLength, 2);
  assert.equal(displayNameMaxLength, 30);
});

test('the compose sheet reads as it did with the owner\'s piece limit', () => {
  const en = messages.en.today.compose;
  const tr = messages.tr.today.compose;
  assert.equal(en.subtitle(composePieceLimit),
    'Choose up to three pieces. kuyara completes the rest for today’s weather.');
  assert.equal(en.limitHint(composePieceLimit), 'Three pieces are chosen. Let one go to choose this one.');
  assert.equal(en.chosenCount(2, composePieceLimit), '2 / 3 pieces chosen');
  assert.equal(tr.subtitle(composePieceLimit), 'En çok üç parça seç. Kalanını kuyara bugünkü havaya göre tamamlar.');
  assert.equal(tr.limitHint(composePieceLimit), 'Üç parça seçili. Bunu seçmek için birini bırak.');
  assert.equal(tr.chosenCount(2, composePieceLimit), '2 / 3 parça seçildi');
});

test('the compose sheet follows a changed piece limit', () => {
  assert.equal(messages.en.today.compose.chosenCount(1, 4), '1 / 4 pieces chosen');
  assert.match(messages.en.today.compose.subtitle(4), /^Choose up to four pieces\./);
  assert.match(messages.tr.today.compose.limitHint(4), /^Dört parça seçili\./);
});

test('the sign-in pages read as they did with the owners\' limits', () => {
  const en = messages.en.account.signIn.pages(accountIntroLimits);
  const tr = messages.tr.account.signIn.pages(accountIntroLimits);
  assert.equal(en.askAgain.body, 'With an account, you can ask the stylist again up to 10 times a day instead of 5.');
  assert.equal(en.compose.body, 'Signed in, you choose up to three pieces and kuyara builds the outfit around them.');
  assert.equal(tr.askAgain.body, 'Hesabınla stiliste günde 5 yerine 10 kez tekrar sorabilirsin.');
  assert.equal(tr.compose.body, 'Giriş yaptığında en çok üç parça seçersin, kuyara kombini onların çevresinde kurar.');
});

test('the sign-in pages follow changed limits', () => {
  const limits = { askAgainRegular: 6, askAgainMember: 12, composePieces: 4 };
  assert.match(messages.en.account.signIn.pages(limits).askAgain.body, /up to 12 times a day instead of 6\.$/);
  assert.match(messages.tr.account.signIn.pages(limits).compose.body, /en çok dört parça seçersin/);
});

test('the sign-in limits come from the rules that own them', () => {
  assert.deepEqual(accountIntroLimits, {
    askAgainRegular: regenerationPolicy.dailyAiRegenerations,
    askAgainMember: regenerationPolicy.memberDailyAiRegenerations,
    composePieces: composePieceLimit,
  });
});

test('the name errors read as they did with the owner\'s length rule', () => {
  assert.equal(messages.en.onboarding.nameShortError(displayNameMinLength),
    'Enter at least 2 characters, or choose Not now.');
  assert.equal(messages.en.onboarding.nameLongError(displayNameMaxLength), 'Use 30 characters or fewer.');
  assert.equal(messages.tr.onboarding.nameShortError(displayNameMinLength),
    'En az 2 karakter yaz veya Şimdi değil seçeneğini kullan.');
  assert.equal(messages.tr.onboarding.nameLongError(displayNameMaxLength), 'En fazla 30 karakter kullan.');
});

test('the name errors follow a changed length rule', () => {
  assert.match(messages.en.onboarding.nameShortError(3), /at least 3 characters/);
  assert.match(messages.tr.onboarding.nameLongError(40), /^En fazla 40 karakter/);
});

test('the style preference copy reads as it did with the contract\'s style limit', () => {
  assert.equal(styleAestheticsLimit, 3);
  assert.equal(messages.en.onboarding.stylePreferencesBody(styleAestheticsLimit),
    'Optional. Choose up to three styles. They shape the order of suggestions, without excluding outfits.');
  assert.equal(messages.en.preferences.stylePreferencesBody(styleAestheticsLimit), 'Choose up to three styles.');
  assert.equal(messages.en.preferences.stylePreferencesLimit(styleAestheticsLimit),
    'You can choose up to three styles.');
  assert.equal(messages.tr.onboarding.stylePreferencesBody(styleAestheticsLimit),
    'İsteğe bağlı. En fazla üç stil seç. Bu seçimler kombinleri elemeden öneri sırasını etkiler.');
  assert.equal(messages.tr.preferences.stylePreferencesBody(styleAestheticsLimit), 'En fazla üç stil seç.');
  assert.equal(messages.tr.preferences.stylePreferencesLimit(styleAestheticsLimit),
    'En fazla üç stil seçebilirsin.');
});

test('the style preference copy follows a changed style limit', () => {
  assert.match(messages.en.preferences.stylePreferencesLimit(2), /up to two styles/);
  assert.match(messages.tr.onboarding.stylePreferencesBody(4), /En fazla dört stil seç\./);
});
