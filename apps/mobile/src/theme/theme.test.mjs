import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { getMessages, messages, resolveSupportedLanguage } from '../localization/messages.ts';
import { withAlpha } from './color-alpha.ts';
import {
  brandColors,
  createKuyaraTheme,
  darkSemanticColors,
  lightSemanticColors,
  reducedMotion,
  resolveColorScheme,
  resolveMotionTokens,
  standardMotion,
} from './theme.ts';
import { KuyaraThemeContext, useKuyaraTheme } from './theme-context.ts';

const requiredSemanticRoles = [
  'background',
  'backgroundElevated',
  'surface',
  'surfaceMuted',
  'surfaceInteractive',
  'textPrimary',
  'textSecondary',
  'textOnBrand',
  'brandPrimary',
  'brandAccent',
  'borderSubtle',
  'borderStrong',
  'focusRing',
  'iconPrimary',
  'iconSecondary',
  'scrim',
];

test('light and dark themes expose the same required semantic color roles', () => {
  const lightKeys = Object.keys(lightSemanticColors).sort();
  const darkKeys = Object.keys(darkSemanticColors).sort();

  assert.deepEqual(darkKeys, lightKeys);
  assert.deepEqual(lightKeys, requiredSemanticRoles.toSorted());
});

test('application themes expose semantic colors rather than primitive names', () => {
  const primitiveNames = Object.keys(brandColors);

  for (const scheme of ['light', 'dark']) {
    const theme = createKuyaraTheme(scheme);
    assert.equal(primitiveNames.some((name) => name in theme.colors), false);
  }
});

test('theme preference resolves explicit choices and defaults system safely', () => {
  assert.equal(resolveColorScheme('light', 'dark'), 'light');
  assert.equal(resolveColorScheme('dark', 'light'), 'dark');
  assert.equal(resolveColorScheme('system', 'dark'), 'dark');
  assert.equal(resolveColorScheme('system', 'light'), 'light');
  assert.equal(resolveColorScheme('system', 'unspecified'), 'light');
  assert.equal(resolveColorScheme('system', null), 'light');
});

test('Reduce Motion removes decorative duration while preserving standard timing otherwise', () => {
  assert.equal(resolveMotionTokens(false), standardMotion);
  assert.equal(resolveMotionTokens(true), reducedMotion);
  assert.equal(Object.values(reducedMotion).every((duration) => duration === 0), true);
});

function ShellThemeProbe() {
  const theme = useKuyaraTheme();

  return createElement(
    'main',
    {
      'data-color-scheme': theme.colorScheme,
      'data-reduce-motion': String(theme.isReduceMotionEnabled),
      style: {
        backgroundColor: theme.colors.background,
        color: theme.colors.textPrimary,
      },
    },
    theme.colorScheme,
  );
}

test('the current shell theme access renders under authored light and dark inputs', () => {
  for (const scheme of ['light', 'dark']) {
    const theme = createKuyaraTheme(scheme);
    const markup = renderToStaticMarkup(
      createElement(
        KuyaraThemeContext.Provider,
        { value: theme },
        createElement(ShellThemeProbe),
      ),
    );

    assert.match(markup, new RegExp(`data-color-scheme="${scheme}"`));
    assert.match(markup, new RegExp(theme.colors.background, 'i'));
    assert.match(markup, new RegExp(theme.colors.textPrimary, 'i'));
  }
});

test('English and Turkish locale resolution preserve the supported product languages', () => {
  assert.equal(resolveSupportedLanguage('en-US'), 'en');
  assert.equal(resolveSupportedLanguage('tr-TR'), 'tr');
  assert.equal(resolveSupportedLanguage('TR_tr'), 'tr');
  assert.equal(getMessages('en-US'), messages.en);
  assert.equal(getMessages('tr-TR'), messages.tr);
  assert.equal(messages.en.today.title, 'Today');
  assert.equal(messages.tr.today.title, 'Bugün');
  assert.equal(messages.en.today.slots.outer_layer, 'Outer layer');
  assert.equal(messages.tr.today.slots.outer_layer, 'Dış katman');
});

test('withAlpha converts a hex token to an rgba string at the given opacity', () => {
  assert.equal(withAlpha('#142F3B', 0.45), 'rgba(20, 47, 59, 0.45)');
  assert.equal(withAlpha('#EFF4F3', 0.1), 'rgba(239, 244, 243, 0.1)');
  assert.throws(() => withAlpha('not-a-color', 0.5));
});

test('feature source does not hardcode approved primitive colors or disable font scaling', async () => {
  const sourceRoot = new URL('../', import.meta.url);
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  const sourceFiles = entries.filter(
    (entry) =>
      entry.isFile() &&
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.parentPath.endsWith('/theme'),
  );

  for (const entry of sourceFiles) {
    const source = await readFile(`${entry.parentPath}/${entry.name}`, 'utf8');

    assert.equal(source.includes('allowFontScaling={false}'), false, entry.name);
    for (const color of Object.values(brandColors)) {
      assert.equal(source.toUpperCase().includes(color.toUpperCase()), false, entry.name);
    }
  }
});
