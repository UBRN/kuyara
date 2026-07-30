import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createOnboardingDraft,
  onboardingPreferencesFromDraft,
  reduceOnboardingDraft,
} from './application/onboarding-state.ts';
import {
  canOpenSettings,
  resolveProfileHomeRoute,
} from './application/profile-route-gate.ts';
import { resolveLanguagePreference } from '../../localization/language-preference.ts';
import { messages } from '../../localization/messages.ts';

const profile = (onboardingCompleted) => ({
  id: 'profile-id',
  clothingPreference: onboardingCompleted ? 'womens' : null,
  languagePreference: 'system',
  themePreference: 'system',
  onboardingCompleted,
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:00.000Z',
});

test('onboarding requires an accessible clothing choice before the final step', () => {
  let draft = createOnboardingDraft({
    clothingPreference: null,
    languagePreference: 'system',
    themePreference: 'system',
  });

  draft = reduceOnboardingDraft(draft, { type: 'continue' });
  assert.equal(draft.step, 1);
  draft = reduceOnboardingDraft(draft, { type: 'continue' });
  assert.equal(draft.step, 1);
  assert.equal(draft.hasValidationError, true);
  assert.equal(onboardingPreferencesFromDraft(draft), null);

  draft = reduceOnboardingDraft(draft, { type: 'select-clothing', value: 'womens' });
  assert.equal(draft.hasValidationError, false);
  draft = reduceOnboardingDraft(draft, { type: 'continue' });
  assert.equal(draft.step, 2);
});

test('onboarding keeps clothing, language, and theme selections independent and reviewable', () => {
  let draft = createOnboardingDraft({
    clothingPreference: null,
    languagePreference: 'system',
    themePreference: 'system',
  });
  draft = reduceOnboardingDraft(draft, { type: 'select-clothing', value: 'mens' });
  draft = reduceOnboardingDraft(draft, { type: 'select-language', value: 'tr' });
  draft = reduceOnboardingDraft(draft, { type: 'select-theme', value: 'dark' });

  assert.deepEqual(onboardingPreferencesFromDraft(draft), {
    clothingPreference: 'mens',
    languagePreference: 'tr',
    themePreference: 'dark',
  });
  draft = reduceOnboardingDraft({ ...draft, step: 2 }, { type: 'back' });
  assert.equal(draft.step, 1);
  assert.equal(draft.clothingPreference, 'mens');
});

test('language preference follows the device only in system mode', () => {
  assert.equal(resolveLanguagePreference('system', 'tr-TR'), 'tr');
  assert.equal(resolveLanguagePreference('system', 'en-US'), 'en');
  assert.equal(resolveLanguagePreference('tr', 'en-US'), 'tr');
  assert.equal(resolveLanguagePreference('en', 'tr-TR'), 'en');
});

test('incomplete and completed profiles resolve to the correct local route gate', () => {
  assert.equal(resolveProfileHomeRoute(profile(false)), 'onboarding');
  assert.equal(resolveProfileHomeRoute(profile(true)), 'today');
  assert.equal(canOpenSettings(profile(false)), false);
  assert.equal(canOpenSettings(profile(true)), true);
});

test('English and Turkish include complete onboarding, Settings, and accessibility copy', () => {
  for (const language of ['en', 'tr']) {
    const copy = messages[language];
    assert.ok(copy.onboarding.welcomeTitle);
    assert.ok(copy.onboarding.clothingRequiredError);
    assert.ok(copy.onboarding.saveError);
    assert.ok(copy.preferences.womensClothing);
    assert.ok(copy.preferences.mensClothing);
    assert.ok(copy.preferences.languageSystem);
    assert.ok(copy.preferences.themeDark);
    assert.ok(copy.settings.title);
    assert.ok(copy.settings.saveError);
    assert.ok(copy.navigation.today);
    assert.ok(copy.navigation.weather);
    assert.ok(copy.navigation.wardrobe);
    assert.ok(copy.navigation.settings);
    assert.ok(copy.weather.introduction);
    assert.ok(copy.wardrobe.emptyBody);
    assert.ok(copy.wardrobe.typeRequiredError);
    assert.ok(copy.wardrobe.discardAction);
    assert.ok(copy.wardrobe.confirmDeleteAction);
    assert.ok(copy.today.settingsAction);
    assert.ok(copy.today.settingsHint);
  }
  assert.equal(messages.en.preferences.womensClothing, 'Women’s clothing');
  assert.equal(messages.tr.preferences.womensClothing, 'Kadın giyim');
});

test('route and presentation sources preserve local gating and accessible selected states', async () => {
  const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
  const [todayRoute, onboardingRoute, settingsRoute, layout, tabsLayout, tabBar, option, onboarding, settings, today] =
    await Promise.all([
      source('../../app/(tabs)/(today)/index.tsx'),
      source('../../app/onboarding.tsx'),
      source('../../app/(tabs)/settings/index.tsx'),
      source('../../app/_layout.tsx'),
      source('../../app/(tabs)/_layout.tsx'),
      source('../../navigation/primary-tab-bar.tsx'),
      source('./presentation/preference-option.tsx'),
      source('./presentation/onboarding-screen.tsx'),
      source('./presentation/settings-screen.tsx'),
      source('../today/presentation/today-screen.tsx'),
    ]);
  const routeSources = `${todayRoute}\n${onboardingRoute}\n${settingsRoute}\n${tabsLayout}`;
  const presentationSources = `${tabBar}\n${option}\n${onboarding}\n${settings}\n${today}`;

  assert.match(tabsLayout, /<Redirect href="\/onboarding"/);
  assert.match(onboardingRoute, /<Redirect href="\/"/);
  assert.match(layout, /gestureEnabled: false/);
  assert.match(layout, /name="\(tabs\)"/);
  assert.match(settingsRoute, /<SettingsScreen/);
  assert.match(today, /testID="today-settings-button"/);
  assert.match(tabBar, /accessibilityRole="tab"/);
  assert.match(tabBar, /accessibilityState=\{\{ selected: isSelected \}\}/);
  assert.match(option, /accessibilityRole="radio"/);
  assert.match(option, /accessibilityState=\{\{ disabled, selected \}\}/);
  assert.match(onboarding, /accessibilityRole="alert"/);
  assert.match(settings, /settings-language-/);
  assert.match(settings, /settings-theme-/);
  assert.match(settings, /settings-clothing-/);
  assert.doesNotMatch(routeSources, /expo-sqlite|useSQLiteContext|SELECT |UPDATE |INSERT /i);
  assert.doesNotMatch(presentationSources, /expo-sqlite|useSQLiteContext|SELECT |UPDATE |INSERT /i);
  assert.doesNotMatch(presentationSources, /biological sex|gender identity/i);
});
