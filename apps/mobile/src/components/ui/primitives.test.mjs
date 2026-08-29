import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createKuyaraTheme, layout, typography } from '../../theme/theme.ts';
import {
  createPressHandler,
  resolveAppTextStyle,
  resolveButtonColors,
  resolveInteractiveAccessibilityState,
  resolvePillColors,
  resolveSurfaceColors,
  surfaceColorRoleByVariant,
} from './primitive-contracts.ts';

const source = (name) => readFile(new URL(name, import.meta.url), 'utf8');

test('AppText resolves typed semantic variants and colors in both appearances', () => {
  for (const scheme of ['light', 'dark']) {
    const theme = createKuyaraTheme(scheme);
    const [variantStyle, colorStyle] = resolveAppTextStyle(theme, 'title', 'textSecondary');
    const [accessibilityStyle] = resolveAppTextStyle(
      theme,
      'title',
      'textSecondary',
      true,
    );

    assert.equal(variantStyle, typography.title);
    assert.equal(colorStyle.color, theme.colors.textSecondary);
    assert.equal('lineHeight' in accessibilityStyle, false);
  }
});

test('AppText preserves scaling, heading props, and normal Text props', async () => {
  const appTextSource = await source('./app-text.tsx');

  assert.match(appTextSource, /allowFontScaling = true/);
  assert.match(appTextSource, /allowFontScaling=\{allowFontScaling\}/);
  assert.match(appTextSource, /fontScale > 1\.5/);
  assert.match(appTextSource, /\.\.\.rest/);
  assert.doesNotMatch(appTextSource, /numberOfLines=/);
});

test('Button invokes enabled presses and blocks disabled or loading presses', () => {
  let pressCount = 0;
  const onPress = () => {
    pressCount += 1;
  };

  createPressHandler(onPress, false)?.({});
  assert.equal(pressCount, 1);
  assert.equal(createPressHandler(onPress, true), undefined);

  const disabledState = resolveInteractiveAccessibilityState(true, false);
  const loadingState = resolveInteractiveAccessibilityState(false, true);
  assert.deepEqual(disabledState, { disabled: true, busy: false });
  assert.deepEqual(loadingState, { disabled: true, busy: true });
});

test('Button semantic variants resolve for light and dark appearances', () => {
  for (const scheme of ['light', 'dark']) {
    const theme = createKuyaraTheme(scheme);
    const primary = resolveButtonColors(theme, 'primary', false);
    const secondary = resolveButtonColors(theme, 'secondary', false);
    const quietPressed = resolveButtonColors(theme, 'quiet', true);

    assert.equal(primary.backgroundColor, theme.colors.brandPrimary);
    assert.equal(primary.textColor, theme.colors.textOnBrand);
    assert.equal(secondary.backgroundColor, theme.colors.surfaceInteractive);
    assert.equal(secondary.textColor, theme.colors.textPrimary);
    assert.equal(quietPressed.backgroundColor, theme.colors.surfaceInteractive);
    assert.equal(quietPressed.textColor, theme.colors.brandAccent);
  }
});

test('Button exposes its label, role, stable loading layout, focus, and minimum target', async () => {
  const buttonSource = await source('./button.tsx');

  assert.match(buttonSource, /accessibilityRole="button"/);
  assert.match(buttonSource, /accessibilityLabel \?\? label/);
  assert.match(buttonSource, /disabled=\{isUnavailable\}/);
  assert.match(buttonSource, /\{label\}/);
  assert.match(buttonSource, /loading && styles\.hiddenLabel/);
  assert.match(buttonSource, /theme\.colors\.focusRing/);
  assert.match(buttonSource, /minHeight: layout\.minimumTouchTarget/);
  assert.equal(layout.minimumTouchTarget, 44);
});

test('IconButton requires an accessible label and uses the shared interaction contract', async () => {
  const iconButtonSource = await source('./icon-button.tsx');

  assert.match(iconButtonSource, /accessibilityLabel: string/);
  assert.match(iconButtonSource, /accessibilityRole="button"/);
  assert.match(iconButtonSource, /disabled=\{disabled\}/);
  assert.match(iconButtonSource, /onPress=\{pressHandler\}/);
  assert.match(iconButtonSource, /width: layout\.minimumTouchTarget/);
  assert.match(iconButtonSource, /height: layout\.minimumTouchTarget/);
  assert.match(iconButtonSource, /theme\.colors\.focusRing/);
});

test('Screen and Surface keep children on semantic light and dark foundations', async () => {
  const [screenSource, surfaceSource] = await Promise.all([
    source('./screen.tsx'),
    source('./surface.tsx'),
  ]);

  for (const scheme of ['light', 'dark']) {
    const theme = createKuyaraTheme(scheme);

    for (const [variant, role] of Object.entries(surfaceColorRoleByVariant)) {
      assert.equal(resolveSurfaceColors(theme, variant).backgroundColor, theme.colors[role]);
    }

    assert.match(screenSource, /theme\.colors\.background/);
    assert.match(screenSource, /\{children\}/);
    assert.match(surfaceSource, /\.\.\.rest/);
  }
});

test('Pill tones resolve distinct semantic colors in both appearances', () => {
  for (const scheme of ['light', 'dark']) {
    const theme = createKuyaraTheme(scheme);
    const filled = resolvePillColors(theme, 'accent-filled');
    const bordered = resolvePillColors(theme, 'bordered');

    assert.equal(filled.backgroundColor, theme.colors.brandAccent);
    assert.equal(filled.textColorRole, 'textOnBrand');
    assert.equal(bordered.backgroundColor, 'transparent');
    assert.equal(bordered.borderColor, theme.colors.borderSubtle);
    assert.equal(bordered.textColorRole, 'textPrimary');
  }
});

test('PhotoPlaceholder derives its stripe tint from the theme accent, not a hardcoded color', async () => {
  const photoPlaceholderSource = await source('./photo-placeholder.tsx');

  assert.match(photoPlaceholderSource, /withAlpha\(theme\.colors\.brandAccent/);
  assert.doesNotMatch(photoPlaceholderSource, /#[0-9a-fA-F]{6}/);
});

test('PhotoPlaceholder only renders its label when the box is tall enough to fit it', async () => {
  const photoPlaceholderSource = await source('./photo-placeholder.tsx');

  assert.match(photoPlaceholderSource, /height >= MINIMUM_LABEL_HEIGHT/);
  assert.match(photoPlaceholderSource, /MINIMUM_LABEL_HEIGHT\s*=\s*96/);
});

test('SectionHeader reflows large text and exposes heading semantics', async () => {
  const sectionHeaderSource = await source('./section-header.tsx');

  assert.match(sectionHeaderSource, /fontScale > 1\.5/);
  assert.match(sectionHeaderSource, /accessibilityRole="header"/);
  assert.match(sectionHeaderSource, /stackedContainer/);
});
