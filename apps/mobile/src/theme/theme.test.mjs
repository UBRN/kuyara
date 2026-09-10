import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { getMessages, messages, resolveSupportedLanguage } from '../localization/messages.ts';
import { withAlpha } from './color-alpha.ts';
import { blend } from './color-blend.ts';
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
  'stage',
  'surfaceMuted',
  'surfaceInteractive',
  'textPrimary',
  'textSecondary',
  'textOnBrand',
  'textOnPrimaryFill',
  'brandPrimary',
  'brandAccent',
  'primaryFill',
  'borderSubtle',
  'borderDefined',
  'borderStrong',
  'focusRing',
  'iconPrimary',
  'iconSecondary',
  'successInk',
  'successContainer',
  'warningInk',
  'warningContainer',
  'dangerInk',
  'dangerContainer',
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
  assert.deepEqual(light.elevation.raised, {
    shadowColor: brandColors.nightLayer,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  });
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
  assert.equal(
    messages.en.profile.closetHeadingAccessibilityLabel({ count: 3 }),
    'Closet, 3.',
  );
  assert.equal(
    messages.tr.profile.closetHeadingAccessibilityLabel({ count: 3 }),
    'Gardırop, 3.',
  );
  assert.equal(
    messages.en.profile.railItemAccessibilityLabel({ label: 'Rain jacket', position: 1, total: 3 }),
    'Rain jacket, 1 of 3.',
  );
  assert.equal(
    messages.tr.profile.railItemAccessibilityLabel({ label: 'Yağmurluk', position: 1, total: 3 }),
    'Yağmurluk, 3 parçadan 1.',
  );
  assert.equal(messages.en.wardrobe.addAction, 'Add');
  assert.equal(messages.tr.wardrobe.addAction, 'Ekle');
});

test('withAlpha converts a hex token to an rgba string at the given opacity', () => {
  assert.equal(withAlpha('#142F3B', 0.45), 'rgba(20, 47, 59, 0.45)');
  assert.equal(withAlpha('#EFF4F3', 0.1), 'rgba(239, 244, 243, 0.1)');
  assert.throws(() => withAlpha('not-a-color', 0.5));
});

const atmosphereStates = [
  'neutral',
  'clearDay',
  'veiledDay',
  'fallingDay',
  'clearNight',
  'veiledNight',
  'fallingNight',
];

const lightAtmosphereSpecs = {
  clearDay: { from: 'quietSky', to: 'cloudWhite', ratio: 0.549, hex: '#CBE1E5' },
  veiledDay: { from: 'calmCurrent', to: 'softMist', ratio: 0.756, hex: '#C2D1D3' },
  fallingDay: { from: 'calmCurrent', to: 'quietSky', ratio: 0.943, hex: '#98C3CF' },
  clearNight: { from: 'deepAtmosphere', to: 'quietSky', ratio: 0.888, hex: '#8FB8C4' },
  veiledNight: { from: 'deepAtmosphere', to: 'softMist', ratio: 0.645, hex: '#A4AFB3' },
  fallingNight: { from: 'deepAtmosphere', to: 'quietSky', ratio: 0.758, hex: '#7DA4B0' },
};

test('atmosphere colors retain their recorded brand blends', () => {
  const theme = createKuyaraTheme('light');
  assert.equal(theme.atmosphere.neutral, theme.colors.stage);

  for (const [state, spec] of Object.entries(lightAtmosphereSpecs)) {
    const derived = blend(brandColors[spec.from], brandColors[spec.to], spec.ratio);
    assert.equal(derived, spec.hex, `${state} blend`);
    assert.equal(theme.atmosphere[state], spec.hex, `${state} theme value`);
  }
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
    fgChannel * alpha + bgChannel * (1 - alpha);

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

function channelDistance(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

test('every atmosphere state clears its ink floors and appearance constraints', (context) => {
  const diagnostics = [];

  for (const appearance of ['light', 'dark']) {
    const theme = createKuyaraTheme(appearance);
    assert.deepEqual(Object.keys(theme.atmosphere), atmosphereStates);

    for (const state of atmosphereStates) {
      const stage = theme.atmosphere[state];
      const textContrast = contrastOfHexOverBackground(theme.colors.textPrimary, stage);
      const glyphContrast = contrastRatio(
        compositeOver(theme.colors.textPrimary, 0.70, stage),
        hexToRgb(stage),
      );
      const groundContrast = contrastOfHexOverBackground(stage, theme.colors.background);
      const groundDistance = channelDistance(stage, theme.colors.background);

      assert.ok(textContrast >= 4.5, `${appearance} ${state} text: ${textContrast.toFixed(2)}:1`);
      assert.ok(glyphContrast >= 3, `${appearance} ${state} glyph: ${glyphContrast.toFixed(2)}:1`);
      if (appearance === 'light') {
        assert.ok(groundDistance >= 15, `${state} distance from ground: ${groundDistance}`);
      } else {
        assert.equal(stage, theme.atmosphere.neutral, `${state} dark neutral`);
      }

      diagnostics.push([
        appearance,
        state,
        stage,
        relativeLuminance(hexToRgb(stage)).toFixed(4),
        textContrast.toFixed(2),
        glyphContrast.toFixed(2),
        groundContrast.toFixed(3),
        groundDistance,
      ].join(' | '));
    }
  }

  context.diagnostic('appearance | state | hex | L | text | glyph@0.70 | vs ground | levels');
  for (const row of diagnostics) context.diagnostic(row);
});

test('Direction E replaces the light card step with legible stage and supporting ink', () => {
  assert.equal(lightSemanticColors.background, brandColors.softMist);
  assert.equal(lightSemanticColors.backgroundElevated, lightSemanticColors.background);
  assert.equal(lightSemanticColors.surface, '#FFFFFF');
  const lightStep = contrastOfHexOverBackground(
    lightSemanticColors.surface, lightSemanticColors.background,
  );
  // ADR 0021 supersedes the 1.2:1 light card-over-ground invariant.
  assert.equal(Number(lightStep.toFixed(3)), 1.085, `light card step: ${lightStep.toFixed(3)}:1`);

  for (const [appearance, colors] of Object.entries({ light: lightSemanticColors, dark: darkSemanticColors })) {
    const ratio = contrastOfHexOverBackground(colors.textSecondary, colors.background);
    assert.ok(ratio >= 4.5, `${appearance} textSecondary on background: ${ratio.toFixed(3)}:1 >= 4.5:1`);
  }

  assert.equal(lightSemanticColors.primaryFill, lightSemanticColors.brandPrimary);
  assert.equal(lightSemanticColors.textOnPrimaryFill, lightSemanticColors.textOnBrand);

  for (const [appearance, colors] of Object.entries({ light: lightSemanticColors, dark: darkSemanticColors })) {
    const ratio = contrastOfHexOverBackground(colors.textOnPrimaryFill, colors.primaryFill);
    assert.ok(ratio >= 4.5, `${appearance} primary button label: ${ratio.toFixed(3)}:1 >= 4.5:1`);
  }

  assert.notEqual(darkSemanticColors.primaryFill, darkSemanticColors.brandAccent);
  assert.notEqual(darkSemanticColors.backgroundElevated, darkSemanticColors.surface);
  assert.ok(
    contrastOfHexOverBackground(
      darkSemanticColors.backgroundElevated,
      darkSemanticColors.background,
    ) >= 1.2,
  );
  assert.ok(
    contrastOfHexOverBackground(
      darkSemanticColors.textSecondary,
      darkSemanticColors.backgroundElevated,
    ) >= 4.5,
  );

  // The dark allocation still uses the original plane step; light muted surfaces
  // are now below the page ground and chrome equals it, so that ordering is retired.
  const colors = darkSemanticColors;
  const darkStep = contrastOfHexOverBackground(colors.surface, colors.background);
  assert.ok(darkStep >= 1.2, `dark surface step: ${darkStep.toFixed(3)}:1 >= 1.2:1`);
  const background = relativeLuminance(hexToRgb(colors.background));
  for (const role of ['surfaceInteractive', 'surfaceMuted', 'surface', 'backgroundElevated']) {
    assert.ok(background < relativeLuminance(hexToRgb(colors[role])));
  }
  assert.ok(relativeLuminance(hexToRgb(colors.backgroundElevated)) > relativeLuminance(hexToRgb(colors.surface)));
});

test('status inks stay inside the accent contrast band and remain legible on every plane', () => {
  const statusRoles = [
    ['successInk', 'successContainer'],
    ['warningInk', 'warningContainer'],
    ['dangerInk', 'dangerContainer'],
  ];

  for (const semanticColors of [lightSemanticColors, darkSemanticColors]) {
    const accentContrast = contrastOfHexOverBackground(
      semanticColors.brandAccent,
      semanticColors.surface,
    );
    const expectedContainerContrast = semanticColors === lightSemanticColors ? 1.23 : 1.14;

    for (const [inkRole, containerRole] of statusRoles) {
      const ink = semanticColors[inkRole];
      const container = semanticColors[containerRole];

      assert.ok(contrastOfHexOverBackground(ink, semanticColors.surface) >= 4.5);
      assert.ok(contrastOfHexOverBackground(ink, semanticColors.background) >= 4.5);
      assert.ok(
        Math.abs(contrastOfHexOverBackground(ink, semanticColors.surface) - accentContrast) <=
          0.8,
      );

      const containerContrast = contrastOfHexOverBackground(container, semanticColors.surface);
      assert.ok(Math.abs(containerContrast - expectedContainerContrast) <= 0.02);
      assert.ok(containerContrast < 3);
      assert.ok(contrastOfHexOverBackground(ink, container) >= 4.5);
    }

    assert.ok(
      contrastOfHexOverBackground(semanticColors.textOnBrand, semanticColors.dangerInk) >= 4.5,
    );
  }
});

test('defined borders identify interactive boundaries on every plane', () => {
  for (const semanticColors of [lightSemanticColors, darkSemanticColors]) {
    for (const plane of ['surface', 'background', 'backgroundElevated']) {
      assert.ok(
        contrastOfHexOverBackground(semanticColors.borderDefined, semanticColors[plane]) >= 3,
      );
    }
  }

  assert.ok(
    contrastOfHexOverBackground(lightSemanticColors.borderDefined, lightSemanticColors.surface) <
      contrastOfHexOverBackground(lightSemanticColors.textSecondary, lightSemanticColors.surface),
  );
});

test('elevation contact contrast pins light thresholds and the accepted dark defect', () => {
  const light = createKuyaraTheme('light');
  const dark = createKuyaraTheme('dark');
  const lightBackground = hexToRgb(light.colors.background);
  const darkBackground = hexToRgb(dark.colors.background);

  assert.ok(
    contrastRatio(
      compositeOver(
        light.elevation.raised.shadowColor,
        light.elevation.raised.shadowOpacity,
        lightBackground,
      ),
      lightBackground,
    ) >= 1.2,
  );
  assert.ok(
    contrastRatio(
      compositeOver(
        light.elevation.chrome.shadowColor,
        light.elevation.chrome.shadowOpacity,
        lightBackground,
      ),
      lightBackground,
    ) >= 1.35,
  );

  for (const elevation of [dark.elevation.raised, dark.elevation.chrome]) {
    // Dark shadows are decorative. The 1.51:1 elevated-plane step
    // plus the hairline separates content; no dark screen may rely on shadow alone.
    assert.equal(
      contrastRatio(
        compositeOver(elevation.shadowColor, elevation.shadowOpacity, darkBackground),
        darkBackground,
      ),
      1,
    );
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
