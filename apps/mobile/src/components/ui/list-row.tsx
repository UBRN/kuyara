import { Children, Fragment, type ReactElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { ListRowTile, type ListRowTileGlyph } from '@/components/ui/list-row-tile';
import { Pill } from '@/components/ui/pill';
import {
  createPressHandler,
  resolveListRowGroupColors,
  resolveListRowSeparatorInset,
} from '@/components/ui/primitive-contracts';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { easierToSee, useEasierToSee } from '@/theme/easier-to-see';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0028 section 2, the list-row anatomy, and section 3, its text scaling. This is the
// shared row and group primitive that Profile, the Closet and Settings adopt unchanged;
// `labelWeight` is the one exception, added for Profile's Location row, whose label is
// `bodyStrong` rather than the anatomy's default `body` (section 1 item 5).
// no feature screen is composed here. A full-width row confirms a press with its pressed
// highlight alone, the way an iOS row does; it never scales, because a scaling row reads as
// the whole screen giving way under the finger.
const CHEVRON_BASE_SIZE = 20;

export type ListRowProps = Readonly<{
  glyph: ListRowTileGlyph;
  label: string;
  labelWeight?: 'body' | 'bodyStrong';
  supportingText?: string;
  value?: string;
  valueTabular?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * The gated press style (ADR 0041 section 5): a feature for members that a non-member sees.
   * Words, glyph and chevron take the derived `textGated` ink, muted but legible on every
   * ground; the row stays a full button and never takes the disabled or dimmed trait.
   */
  gated?: boolean;
  /** A short tag after the label, such as "Members"; spoken after the label. */
  chip?: string;
  /** The current choice: a trailing check in `brandAccent` and the selected trait. */
  selected?: boolean;
  testID?: string;
}>;

export function ListRow({
  accessibilityHint,
  accessibilityLabel,
  chip,
  gated = false,
  glyph,
  label,
  labelWeight = 'body',
  onPress,
  selected = false,
  supportingText,
  testID,
  value,
  valueTabular = false,
}: ListRowProps) {
  const theme = useKuyaraTheme();
  // O13: a kuyara-drawn row is 60 points tall while Easier to see is on.
  const rowHeight = useEasierToSee() ? { minHeight: easierToSee.rowHeight } : null;
  const { controlScale, usesStackedLayout } = useTextScaling();
  const pressHandler = createPressHandler(onPress, false);

  const content = (
    <>
      <ListRowTile gated={gated} glyph={glyph} testID={testID ? `${testID}-tile` : undefined} />
      <View style={styles.textColumn}>
        <View style={styles.labelLine} testID={testID ? `${testID}-label-line` : undefined}>
          <AppText colorRole={gated ? 'textGated' : 'textPrimary'} style={styles.label} variant={labelWeight}>
            {label}
          </AppText>
          {chip ? <Pill label={chip} testID={testID ? `${testID}-chip` : undefined} tone="muted" /> : null}
          {!usesStackedLayout && value ? (
            <AppText
              colorRole="textSecondary"
              tabularNumbers={valueTabular}
              testID={testID ? `${testID}-value-inline` : undefined}
              variant="body">
              {value}
            </AppText>
          ) : null}
          {selected ? (
            <View testID={testID ? `${testID}-check` : undefined}>
              <Icon color={theme.colors.brandAccent} name="check" size={CHEVRON_BASE_SIZE * controlScale} />
            </View>
          ) : null}
          {onPress ? (
            <Icon
              color={gated ? theme.colors.textGated : theme.colors.textSecondary}
              name="chevronRight"
              size={CHEVRON_BASE_SIZE * controlScale}
            />
          ) : null}
        </View>
        {usesStackedLayout && value ? (
          <AppText
            colorRole="textSecondary"
            tabularNumbers={valueTabular}
            testID={testID ? `${testID}-value-stacked` : undefined}
            variant="body">
            {value}
          </AppText>
        ) : null}
        {supportingText ? (
          <AppText colorRole={gated ? 'textGated' : 'textSecondary'} variant="caption">
            {supportingText}
          </AppText>
        ) : null}
      </View>
    </>
  );

  const spokenLabel = accessibilityLabel ?? [label, chip, value].filter(Boolean).join(', ');
  const selectedState = selected ? { selected } : undefined;

  if (!onPress) {
    // A plain row is read part by part; a selected one is one element, so its state is heard.
    return (
      <View
        accessibilityLabel={selected ? spokenLabel : undefined}
        accessibilityState={selectedState}
        accessible={selected || undefined}
        style={[styles.row, rowHeight]}
        testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={spokenLabel}
      accessibilityRole="button"
      accessibilityState={selectedState}
      onPress={pressHandler}
      style={({ pressed }) => [styles.row, rowHeight, pressed && styles.pressed]}
      testID={testID}>
      {content}
    </Pressable>
  );
}

export type ListRowGroupProps = Readonly<{
  heading?: string;
  children: ReactNode;
  testID?: string;
}>;

export function ListRowGroup({ children, heading, testID }: ListRowGroupProps) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const separatorInset = resolveListRowSeparatorInset(controlScale);
  const groupColors = resolveListRowGroupColors(theme);
  const rows = Children.toArray(children) as ReactElement[];

  return (
    <View testID={testID}>
      {heading ? (
        <AppText
          accessibilityRole="header"
          colorRole="textSecondary"
          style={styles.heading}
          variant="bodyStrong">
          {heading}
        </AppText>
      ) : null}
      <View
        style={[
          styles.group,
          {
            backgroundColor: groupColors.backgroundColor,
            borderColor: groupColors.borderColor,
            borderWidth: groupColors.borderWidth,
          },
        ]}
        testID={testID ? `${testID}-group` : undefined}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {row}
            {index < rows.length - 1 ? (
              <View
                style={[
                  styles.separator,
                  { borderTopColor: theme.colors.borderSubtle, marginStart: separatorInset },
                ]}
                testID={testID ? `${testID}-separator-${index}` : undefined}
              />
            ) : null}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  textColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  labelLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    flex: 1,
  },
  heading: {
    marginBottom: spacing.md,
  },
  group: {
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  separator: {
    borderTopWidth: borderWidths.subtle,
  },
});
