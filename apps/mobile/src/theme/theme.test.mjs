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

test('themes expose two calm, platform-complete elevation levels independent of motion', () => {
  const light = createKuyaraTheme('light');
  const dark = createKuyaraTheme('dark');
  const reduced = createKuyaraTheme('light', true);

  for (const theme of [light, dark]) {
    assert.deepEqual(Object.keys(theme.elevation).sort(), ['chrome', 'raised']);

    for (const level of Object.values(theme.elevation)) {
      assert.equal(level.shadowColor, brandColors.nightLayer);
      assert.deepEqual(Object.keys(level).sort(), [
        'elevation',
        'shadowColor',
        'shadowOffset',
        'shadowOpacity',
        'shadowRadius',
      ]);
      assert.equal(typeof level.elevation, 'number');
    }

    assert.ok(theme.elevation.chrome.shadowOpacity > theme.elevation.raised.shadowOpacity);
    assert.ok(theme.elevation.chrome.elevation > theme.elevation.raised.elevation);
  }

  assert.ok(light.elevation.raised.shadowOpacity > dark.elevation.raised.shadowOpacity);
  assert.ok(light.elevation.chrome.shadowOpacity > dark.elevation.chrome.shadowOpacity);
  assert.equal(reduced.elevation, light.elevation);
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

test('feature source keeps typography on theme roles instead of literal fontSize/lineHeight styles', async () => {
  const sourceRoot = new URL('../features/', import.meta.url);
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  const sourceFiles = entries.filter(
    (entry) =>
      entry.isFile() &&
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.parentPath.replaceAll('\\', '/').includes('/components/ui'),
  );

  for (const entry of sourceFiles) {
    const source = await readFile(`${entry.parentPath}/${entry.name}`, 'utf8');

    assert.equal(
      /\b(fontSize|lineHeight)\s*:\s*-?\d/.test(source),
      false,
      `${entry.parentPath}/${entry.name} declares a literal fontSize/lineHeight; use a theme typography role instead`,
    );
  }
});

// --- WCAG 1.4.3 / 1.4.11 contrast evidence -------------------------------

function hexToRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    throw new Error(`Expected a 6-digit hex color, received: ${hex}`);
  }
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function compositeOver(foregroundHex, alpha, background) {
  const fg = hexToRgb(foregroundHex);
  const bg = typeof background === 'string' ? hexToRgb(background) : background;
  const blend = (fgChannel, bgChannel) =>
    Math.round(fgChannel * alpha + bgChannel * (1 - alpha));

  return {
    r: blend(fg.r, bg.r),
    g: blend(fg.g, bg.g),
    b: blend(fg.b, bg.b),
  };
}

function relativeLuminance(rgb) {
  const linearize = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(rgbA, rgbB) {
  const luminanceA = relativeLuminance(rgbA);
  const luminanceB = relativeLuminance(rgbB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

function contrastOfHexOverBackground(foregroundHex, backgroundHex) {
  return contrastRatio(hexToRgb(foregroundHex), hexToRgb(backgroundHex));
}

test('light and dark surface ladders retain visible, monotone elevation steps', () => {
  for (const semanticColors of [lightSemanticColors, darkSemanticColors]) {
    assert.ok(
      contrastOfHexOverBackground(semanticColors.surface, semanticColors.background) >= 1.2,
      'surface and background must retain at least 1.2:1 contrast',
    );

    const background = relativeLuminance(hexToRgb(semanticColors.background));
    const surfaceInteractive = relativeLuminance(hexToRgb(semanticColors.surfaceInteractive));
    const surfaceMuted = relativeLuminance(hexToRgb(semanticColors.surfaceMuted));
    const surface = relativeLuminance(hexToRgb(semanticColors.surface));
    const backgroundElevated = relativeLuminance(hexToRgb(semanticColors.backgroundElevated));

    // surfaceMuted and surfaceInteractive intentionally invert between schemes.
    assert.equal(
      background,
      Math.min(background, surfaceInteractive, surfaceMuted, surface, backgroundElevated),
    );
    assert.ok(backgroundElevated >= surface);
  }
});

const CARD_BACKGROUND_ALPHA = 0.08;
const PHOTO_PLACEHOLDER_BACKGROUND_ALPHA = 0.05;
const RAIN_BAR_MUTED_ALPHA = 0.77;

test('weather-card and photo-placeholder tinted surfaces meet WCAG contrast thresholds', () => {
  for (const semanticColors of [lightSemanticColors, darkSemanticColors]) {
    const cardBackground = compositeOver(
      semanticColors.brandAccent,
      CARD_BACKGROUND_ALPHA,
      semanticColors.background,
    );
    const photoPlaceholderBackground = compositeOver(
      semanticColors.brandAccent,
      PHOTO_PLACEHOLDER_BACKGROUND_ALPHA,
      semanticColors.surface,
    );
    const mutedRainBar = compositeOver(
      semanticColors.brandAccent,
      RAIN_BAR_MUTED_ALPHA,
      cardBackground,
    );

    assert.ok(
      contrastRatio(hexToRgb(semanticColors.textPrimary), cardBackground) >= 4.5,
      'textPrimary on card background must meet 4.5:1',
    );
    assert.ok(
      contrastRatio(hexToRgb(semanticColors.textSecondary), cardBackground) >= 4.5,
      'textSecondary on card background must meet 4.5:1',
    );
    assert.ok(
      contrastRatio(hexToRgb(semanticColors.brandAccent), cardBackground) >= 4.5,
      'brandAccent text on card background must meet 4.5:1',
    );
    assert.ok(
      contrastOfHexOverBackground(semanticColors.textOnBrand, semanticColors.brandAccent) >= 4.5,
      'textOnBrand on brandAccent (accent-filled Pill) must meet 4.5:1',
    );
    assert.ok(
      contrastRatio(hexToRgb(semanticColors.textSecondary), photoPlaceholderBackground) >= 4.5,
      'textSecondary on photo-placeholder background must meet 4.5:1',
    );
    assert.ok(
      contrastRatio(mutedRainBar, cardBackground) >= 3.0,
      'muted rain bar on card background must meet the 3.0:1 non-text contrast minimum',
    );
  }
});
