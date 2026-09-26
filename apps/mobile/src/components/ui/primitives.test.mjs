import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createKuyaraTheme, layout, radii, typography } from '../../theme/theme.ts';
import {
  buttonGeometry,
  createPressHandler,
  resolveAppTextStyle,
  resolveButtonColors,
  resolveInteractiveAccessibilityState,
  resolveListRowGroupColors,
  resolveListRowSeparatorInset,
  resolveListRowTileGeometry,
  resolvePillColors,
  resolveCardFill,
  resolveSurfaceColors,
  surfaceColorRole,
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
  assert.match(appTextSource, /numberOfLines=\{fitSingleLine \? 1 : rest\.numberOfLines\}/);
  assert.match(appTextSource, /adjustsFontSizeToFit=\{fitSingleLine \? true : rest\.adjustsFontSizeToFit\}/);
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

test('Button roles resolve the O5 fills, pressed steps and disabled state in both appearances', () => {
  for (const scheme of ['light', 'dark']) {
    const theme = createKuyaraTheme(scheme);
    const { colors } = theme;
    const at = (variant, state = {}) =>
      resolveButtonColors(theme, variant, { disabled: false, pressed: false, ...state });

    assert.deepEqual(at('prominent'), {
      backgroundColor: colors.primaryFill, textColor: colors.textOnPrimaryFill,
    });
    assert.equal(at('prominent', { pressed: true }).backgroundColor, colors.primaryFillPressed);
    assert.deepEqual(at('tonal'), {
      backgroundColor: colors.surfaceInteractive, textColor: colors.brandAccent,
    });
    assert.equal(at('tonal', { raised: true }).backgroundColor, colors.controlTonalRaised);
    assert.equal(at('tonal', { pressed: true }).backgroundColor, colors.surfaceInteractivePressed);
    assert.deepEqual(at('plain'), { backgroundColor: 'transparent', textColor: colors.brandAccent });
    assert.equal(at('plain', { pressed: true }).backgroundColor, colors.surfaceInteractive);
    assert.deepEqual(at('destructive'), {
      backgroundColor: colors.dangerContainer, textColor: colors.dangerInk,
    });
    assert.equal(at('destructive', { pressed: true }).backgroundColor, colors.dangerContainerPressed);

    for (const variant of ['prominent', 'tonal', 'destructive']) {
      assert.deepEqual(at(variant, { disabled: true }), {
        backgroundColor: colors.surfaceMuted, textColor: colors.borderDefined,
      });
    }
    assert.deepEqual(at('plain', { disabled: true }), {
      backgroundColor: 'transparent', textColor: colors.borderDefined,
    });
  }
});

test('Button sizes are capsules with a 44-point target at every size', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(buttonGeometry).map(([size, { height }]) => [size, height])),
    { large: 50, medium: 44, small: 36 },
  );
  assert.equal(buttonGeometry.small.labelRole, 'label');
  assert.equal(buttonGeometry.large.labelRole, 'bodyStrong');
  assert.equal(radii.pill, 999);
});

test('Button exposes its label, role, capsule, loading slot, focus ring and touch target', async () => {
  const buttonSource = await source('./button.tsx');

  assert.match(buttonSource, /accessibilityRole="button"/);
  assert.match(buttonSource, /accessibilityLabel \?\? label/);
  assert.match(buttonSource, /disabled=\{isUnavailable\}/);
  assert.match(buttonSource, /\{label\}/);
  assert.match(buttonSource, /borderRadius: radii\.pill/);
  // Loading turns the leading slot into the spinner and keeps the label (O5).
  assert.match(buttonSource, /loading \? \(\s*<ActivityIndicator/);
  assert.match(buttonSource, /theme\.colors\.focusRing/);
  assert.match(buttonSource, /layout\.minimumTouchTarget - geometry\.height/);
  // The label wraps rather than truncates, and pressed never drops the opacity.
  assert.doesNotMatch(buttonSource, /numberOfLines/);
  assert.doesNotMatch(buttonSource, /pressedOpacity|opacity:/);
  // Law 8: only the prominent role confirms its own press.
  assert.match(buttonSource, /if \(variant === 'prominent'\) haptics\.impactLight\(\)/);
  assert.equal(layout.minimumTouchTarget, 44);
});

test('IconButton is a labelled 44-point tonal circle with no opacity press', async () => {
  const iconButtonSource = await source('./icon-button.tsx');

  assert.match(iconButtonSource, /accessibilityLabel: string/);
  assert.match(iconButtonSource, /accessibilityRole="button"/);
  assert.match(iconButtonSource, /disabled=\{disabled\}/);
  assert.match(iconButtonSource, /onPress=\{pressHandler\}/);
  assert.match(iconButtonSource, /width: layout\.minimumTouchTarget/);
  assert.match(iconButtonSource, /height: layout\.minimumTouchTarget/);
  assert.match(iconButtonSource, /borderRadius: radii\.pill/);
  assert.match(iconButtonSource, /resolveButtonColors\(theme, 'tonal'/);
  assert.match(iconButtonSource, /theme\.colors\.focusRing/);
  assert.doesNotMatch(iconButtonSource, /pressedOpacity/);
});

test('GlassButton leaves Liquid Glass to the system and keeps SwiftUI off Android', async () => {
  const glassSource = await source('./glass-button.tsx');

  assert.match(glassSource, /buttonStyle\('glass'\)/);
  assert.match(glassSource, /role="close"/);
  assert.match(glassSource, /systemImage="chevron\.left"/);
  assert.match(glassSource, /ios: \(\) => require\('@expo\/ui\/swift-ui'\)/);
  assert.doesNotMatch(glassSource, /expo-glass-effect/);
});

test('Screen and Surface keep children on semantic light and dark foundations', async () => {
  const [screenSource, surfaceSource] = await Promise.all([
    source('./screen.tsx'),
    source('./surface.tsx'),
  ]);

  for (const scheme of ['light', 'dark']) {
    const theme = createKuyaraTheme(scheme);

    for (const variant of Object.keys(surfaceColorRoleByVariant)) {
      const resolvedStyle = resolveSurfaceColors(theme, variant);

      assert.equal(resolvedStyle.backgroundColor, theme.colors[surfaceColorRole(theme, variant)]);
      if (variant === 'elevated') {
        assert.equal(resolvedStyle.shadowColor, theme.elevation.raised.shadowColor);
        assert.equal(resolvedStyle.elevation, theme.elevation.raised.elevation);
      } else {
        assert.equal('shadowColor' in resolvedStyle, false);
        assert.equal('elevation' in resolvedStyle, false);
      }
    }

    // O14 dark cards B: the dark card is the elevated plane with no hairline; light is unchanged.
    const card = resolveSurfaceColors(theme, 'default');
    assert.equal(card.backgroundColor, scheme === 'dark' ? theme.colors.backgroundElevated : theme.colors.surface);
    assert.equal(card.borderColor, scheme === 'dark' ? 'transparent' : theme.colors.borderSubtle);
    assert.equal(resolveCardFill(theme), card.backgroundColor);

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
    const provenance = resolvePillColors(theme, 'provenance');

    assert.equal(filled.backgroundColor, theme.colors.brandAccent);
    assert.equal(filled.textColorRole, 'textOnBrand');
    assert.equal(bordered.backgroundColor, 'transparent');
    assert.equal(bordered.borderColor, theme.colors.borderSubtle);
    assert.equal(bordered.textColorRole, 'textPrimary');
    // The provenance tone spends no accent: container and border are the same controlled
    // role, so the badge never counts against Law 1's one accent-filled element.
    assert.equal(provenance.backgroundColor, theme.colors.provenanceContainer);
    assert.equal(provenance.borderColor, theme.colors.provenanceContainer);
    assert.equal(provenance.textColorRole, 'provenanceInk');
    assert.notEqual(provenance.backgroundColor, theme.colors.brandAccent);
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
  // O5: a button pair stacks, stronger action first, above text factor 1.2.
  assert.match(hookSource, /BUTTON_PAIR_STACK_THRESHOLD = 1\.2/);
});

test('NativeDatePicker owns the Expo UI date control boundary and is exported', async () => {
  const [pickerSource, indexSource] = await Promise.all([
    source('./native-date-picker.tsx'),
    source('./index.ts'),
  ]);

  assert.match(pickerSource, /@expo\/ui\/swift-ui/);
  assert.match(pickerSource, /displayedComponents=\{\['date'\]\}/);
  assert.match(indexSource, /NativeDatePicker/);
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

test('Pill keeps its label on the caption role instead of a compact literal scale (Law 5)', async () => {
  const pillSource = await source('./pill.tsx');

  assert.match(pillSource, /variant="caption"/);
  assert.doesNotMatch(
    pillSource,
    /\b(fontSize|lineHeight)\s*:\s*-?\d/,
    'pill.tsx declares a literal fontSize/lineHeight; Law 5 allows nothing below caption 13',
  );
  assert.ok(typography.caption.fontSize >= 13);
});
