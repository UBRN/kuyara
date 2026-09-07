import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createKuyaraTheme, layout, typography } from '../../theme/theme.ts';
import {
  createPressHandler,
  resolveAppTextStyle,
  resolveButtonColors,
  resolveInteractiveAccessibilityState,
  resolveListRowGroupColors,
  resolveListRowSeparatorInset,
  resolveListRowTileGeometry,
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
  assert.match(appTextSource, /useTextScaling\(\)/);
  assert.match(appTextSource, /usesStackedLayout/);
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
    const destructive = resolveButtonColors(theme, 'destructive', false);
    const destructivePressed = resolveButtonColors(theme, 'destructive', true);
    const quietPressed = resolveButtonColors(theme, 'quiet', true);

    assert.equal(primary.backgroundColor, theme.colors.brandPrimary);
    assert.equal(primary.textColor, theme.colors.textOnBrand);
    assert.equal(secondary.backgroundColor, theme.colors.surfaceInteractive);
    assert.equal(secondary.borderColor, theme.colors.borderDefined);
    assert.equal(secondary.textColor, theme.colors.textPrimary);
    assert.equal(destructive.backgroundColor, theme.colors.dangerInk);
    assert.equal(destructive.borderColor, theme.colors.dangerInk);
    assert.equal(destructive.textColor, theme.colors.textOnBrand);
    assert.deepEqual(destructivePressed, destructive);
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
      const resolvedStyle = resolveSurfaceColors(theme, variant);

      assert.equal(resolvedStyle.backgroundColor, theme.colors[role]);
      if (variant === 'elevated') {
        assert.equal(resolvedStyle.shadowColor, theme.elevation.raised.shadowColor);
        assert.equal(resolvedStyle.elevation, theme.elevation.raised.elevation);
      } else {
        assert.equal('shadowColor' in resolvedStyle, false);
        assert.equal('elevation' in resolvedStyle, false);
      }
    }

    assert.match(screenSource, /theme\.colors\.background/);
    assert.match(screenSource, /\{children\}/);
    assert.match(surfaceSource, /\.\.\.rest/);
  }
});

test('Divider uses semantic tokens, supports one inset, and stays decorative', async () => {
  const dividerSource = await source('./divider.tsx');

  assert.match(dividerSource, /variant\?: 'full' \| 'inset'/);
  assert.match(dividerSource, /theme\.colors\.borderSubtle/);
  assert.match(dividerSource, /borderWidths\.subtle/);
  assert.match(dividerSource, /marginStart: spacing\.[a-zA-Z0-9]+/);
  assert.match(dividerSource, /accessibilityElementsHidden/);
  assert.match(dividerSource, /importantForAccessibility="no-hide-descendants"/);
  assert.match(dividerSource, /accessible=\{false\}/);
  assert.doesNotMatch(dividerSource, /#[0-9a-fA-F]{6}/);
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

  assert.match(sectionHeaderSource, /useTextScaling\(\)/);
  assert.match(sectionHeaderSource, /accessibilityRole="header"/);
  assert.match(sectionHeaderSource, /stackedContainer/);
});

test('useTextScaling caps the control scale and derives the stacked-layout threshold from ADR 0028 section 3', async () => {
  const hookSource = await source('./use-text-scaling.ts');

  assert.match(hookSource, /STACKED_LAYOUT_THRESHOLD = 1\.5/);
  assert.match(hookSource, /MAXIMUM_CONTROL_SCALE = 1\.5/);
});

test('ListRowTile geometry matches ADR 0028 section 3 at the default and largest accessibility text sizes', () => {
  const defaultGeometry = resolveListRowTileGeometry(1);
  const largestGeometry = resolveListRowTileGeometry(1.5);

  assert.equal(defaultGeometry.size, 28);
  assert.equal(defaultGeometry.glyphSize, 20);
  assert.equal(defaultGeometry.borderRadius, 7);
  assert.equal(largestGeometry.size, 42);
  assert.equal(largestGeometry.glyphSize, 30);
  assert.equal(largestGeometry.borderRadius, 10.5);
});

test('The list-row separator starts at the text edge, 56 by default and 70 at the capped control scale', () => {
  assert.equal(resolveListRowSeparatorInset(1), 56);
  assert.equal(resolveListRowSeparatorInset(1.5), 70);
});

test('The list-row group is a hairline outline in light and the Night Layer surface step with no border in dark', () => {
  const light = createKuyaraTheme('light');
  const dark = createKuyaraTheme('dark');

  const lightColors = resolveListRowGroupColors(light);
  const darkColors = resolveListRowGroupColors(dark);

  assert.equal(lightColors.backgroundColor, 'transparent');
  assert.equal(lightColors.borderColor, light.colors.borderDefined);
  assert.equal(lightColors.borderWidth, 1);
  assert.equal(darkColors.backgroundColor, dark.colors.backgroundElevated);
  assert.equal(darkColors.borderWidth, 0);
});

test('ListRow and ListRowGroup use semantic tokens for the leading tile, separator, and group appearance', async () => {
  const [listRowSource, listRowTileSource] = await Promise.all([
    source('./list-row.tsx'),
    source('./list-row-tile.tsx'),
  ]);

  assert.match(listRowTileSource, /withAlpha\(theme\.colors\.textPrimary/);
  assert.match(listRowSource, /accessibilityRole="button"/);
  assert.match(listRowSource, /accessibilityLabel \?\?/);
  assert.match(listRowSource, /minHeight: layout\.minimumTouchTarget/);
  assert.doesNotMatch(listRowSource, /#[0-9a-fA-F]{6}/);
  assert.doesNotMatch(listRowTileSource, /#[0-9a-fA-F]{6}/);
});
