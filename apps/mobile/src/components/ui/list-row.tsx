import { Children, Fragment, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { ListRowTile, type ListRowTileGlyph } from '@/components/ui/list-row-tile';
import { PressScale } from '@/components/ui/press-scale';
import {
  createPressHandler,
  resolveListRowGroupColors,
  resolveListRowSeparatorInset,
} from '@/components/ui/primitive-contracts';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0028 section 2, the list-row anatomy, and section 3, its text scaling. This is the
// shared row and group primitive that Profile, the Closet and Settings adopt unchanged;
// `labelWeight` is the one exception, added for Profile's Location row, whose label is
// `bodyStrong` rather than the anatomy's default `body` (section 1 item 5).
// no feature screen is composed here.
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
  testID?: string;
}>;

export function ListRow({
  accessibilityLabel,
  glyph,
  label,
  labelWeight = 'body',
  onPress,
  supportingText,
  testID,
  value,
  valueTabular = false,
}: ListRowProps) {
  const theme = useKuyaraTheme();
  const { controlScale, usesStackedLayout } = useTextScaling();
  const pressHandler = createPressHandler(onPress, false);

  const content = (
    <>
      <ListRowTile glyph={glyph} testID={testID ? `${testID}-tile` : undefined} />
      <View style={styles.textColumn}>
        <View style={styles.labelLine} testID={testID ? `${testID}-label-line` : undefined}>
          <AppText style={styles.label} variant={labelWeight}>
            {label}
          </AppText>
          {!usesStackedLayout && value ? (
            <AppText
              colorRole="textSecondary"
              tabularNumbers={valueTabular}
              testID={testID ? `${testID}-value-inline` : undefined}
              variant="body">
              {value}
            </AppText>
          ) : null}
          {onPress ? (
            <Icon
              color={theme.colors.textSecondary}
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
          <AppText colorRole="textSecondary" variant="caption">
            {supportingText}
          </AppText>
        ) : null}
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <PressScale
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
      accessibilityRole="button"
      onPress={pressHandler}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={testID}>
      {content}
    </PressScale>
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
