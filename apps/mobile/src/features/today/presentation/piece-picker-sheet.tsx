import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  GarmentCandidateTile,
  GlassButton,
  Icon,
  NativeSheet,
  PressScale,
  SegmentedControl,
  useGarmentCandidateRoles,
  type GarmentOutfitPalette,
  type SegmentedControlOption,
  useTextScaling,
} from '@/components/ui';
import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import type { TodayCopy } from '@/features/today/presentation/outfit-detail-entries';
import { EmptyPlaceTile } from '@/features/today/presentation/outfit-detail-pieces';
import { useMessages } from '@/localization/use-messages';
import { easierToSee, useEasierToSee } from '@/theme/easier-to-see';
import { layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type PiecePickerOption = Readonly<{
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
  name: string;
  /** The slot the piece would fill: its tile shows the colour the outfit would give it there. */
  slot: OutfitSlot;
}>;

export type PiecePickerGroup = Readonly<{
  id: string;
  title: string;
  hint?: string;
  options: readonly PiecePickerOption[];
}>;

export type PiecePickerTarget = Readonly<{
  title: string;
  /** The piece the slot wears now; null while a layer is off. */
  current: GarmentTypeId | null;
  /** A layer taken off: "wear without" stands first, outside the groups and their order. */
  without?: Readonly<{ label: string; category: StructuralCategory }> | null;
  groups: readonly PiecePickerGroup[];
  /** Several free layer slots: one segment for each, the groups following the chosen one. */
  tabs?: Readonly<{
    options: readonly SegmentedControlOption<string>[];
    value: string;
    onChange: (value: string) => void;
  }> | null;
}>;

/**
 * One slot's candidates as the picker groups them: the pieces that keep the outfit suitable
 * for today's weather first, then the rest under a short explanation.
 */
export function slotPickerGroups(
  options: readonly (PiecePickerOption & Readonly<{ suitable: boolean }>)[],
  copy: TodayCopy['manualMix'],
): readonly PiecePickerGroup[] {
  return [
    { id: 'fits', title: copy.pickerFits, options: options.filter(({ suitable }) => suitable) },
    { id: 'others', title: copy.pickerOther, hint: copy.pickerOtherHint, options: options.filter(({ suitable }) => !suitable) },
  ].filter(({ options: group }) => group.length > 0);
}

type PiecePickerSheetProps = Readonly<{
  target: PiecePickerTarget | null;
  /** The outfit's palette, so each tile shows the piece in the colour the outfit would give it. */
  palette: GarmentOutfitPalette | null;
  /** A piece, or null for "wear without". */
  onChoose: (option: PiecePickerOption | null) => void;
  onDismiss: () => void;
}>;

/**
 * Phase 7: the row's Change opens every catalog piece for the slot, the
 * profile's gender applicability kept, pieces that fit today's weather first and the rest
 * under a short explanation. The same list adds a layer or an accessory. The Closet never
 * supplies a candidate. A choice closes the sheet; the board plays the change once the sheet
 * has gone.
 */
export function PiecePickerSheet({ target, palette, onChoose, onDismiss }: PiecePickerSheetProps) {
  return (
    <NativeSheet onDismiss={onDismiss} testID="piece-picker-sheet" visible={target !== null}>
      {target ? <PiecePickerList onChoose={onChoose} onDismiss={onDismiss} palette={palette} target={target} /> : null}
    </NativeSheet>
  );
}

/** The picker's content, for a sheet that hosts it. */
export function PiecePickerList({
  target,
  palette,
  onChoose,
  onDismiss,
}: Readonly<{
  target: PiecePickerTarget;
  palette: GarmentOutfitPalette | null;
  onChoose: (option: PiecePickerOption | null) => void;
  onDismiss: () => void;
}>) {
  const messages = useMessages();
  const copy = messages.today.manualMix;
  const theme = useKuyaraTheme();
  const rowHeight = useEasierToSee() ? easierToSee.rowHeight : layout.minimumTouchTarget;
  const without = target.without ?? null;
  const separated = (index: number) => index > 0 && {
    borderTopColor: theme.colors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <GlassButton kind="close" label={messages.today.dailyStyle.close} onPress={onDismiss}
          testID="piece-picker-close" />
        <AppText accessibilityRole="header" style={styles.title} variant="bodyStrong">{target.title}</AppText>
        <View style={styles.headBalance} />
      </View>
      {target.tabs ? (
        <SegmentedControl
          onChange={target.tabs.onChange}
          options={target.tabs.options}
          testID="piece-picker-tabs"
          value={target.tabs.value}
        />
      ) : null}
      {without ? (
        <PickerRow
          current={target.current === null}
          currentLabel={copy.pickerCurrent}
          label={without.label}
          minHeight={rowHeight}
          onPress={() => onChoose(null)}
          testID="none"
          tile={<EmptyPlaceTile category={without.category} size={layout.minimumTouchTarget} />}
        />
      ) : null}
      {target.groups.map((group) => (
        <View key={group.id} style={styles.section} testID={`piece-picker-${group.id}`}>
          <View style={styles.sectionHead}>
            <AppText accessibilityRole="header" variant="bodyStrong">{group.title}</AppText>
            {group.hint ? <AppText colorRole="textSecondary" variant="caption">{group.hint}</AppText> : null}
          </View>
          <View>
            {group.options.map((option, index) => (
              <PickerRow
                current={option.garmentTypeId === target.current}
                currentLabel={copy.pickerCurrent}
                key={`${option.slot}-${option.garmentTypeId}`}
                label={option.name}
                minHeight={rowHeight}
                onPress={() => onChoose(option)}
                separator={separated(index)}
                testID={option.garmentTypeId}
                tile={<OptionTile option={option} palette={palette} />}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function OptionTile({ option, palette }: Readonly<{ option: PiecePickerOption; palette: GarmentOutfitPalette | null }>) {
  const roles = useGarmentCandidateRoles(palette, option.slot, [option.garmentTypeId]);
  return (
    <GarmentCandidateTile
      category={option.category}
      garmentTypeId={option.garmentTypeId}
      roles={roles.get(option.garmentTypeId)}
      testIDPrefix="piece-picker"
    />
  );
}

function PickerRow({
  current,
  currentLabel,
  label,
  minHeight,
  onPress,
  separator,
  testID,
  tile,
}: Readonly<{
  current: boolean;
  currentLabel: string;
  label: string;
  minHeight: number;
  onPress: () => void;
  separator?: false | Readonly<{ borderTopColor: string; borderTopWidth: number }>;
  testID: string;
  tile: ReactNode;
}>) {
  const { controlScale } = useTextScaling();
  const theme = useKuyaraTheme();
  return (
    <PressScale
      accessibilityLabel={current ? `${label}, ${currentLabel}` : label}
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      onPress={onPress}
      style={[styles.row, { minHeight }, separator]}
      testID={`piece-picker-option-${testID}`}>
      {tile}
      <AppText style={styles.name} variant="bodyStrong">{label}</AppText>
      {current ? (
        <View style={styles.current} testID={`piece-picker-current-${testID}`}>
          <Icon color={theme.colors.brandAccent} name="check" size={16 * controlScale} />
          <AppText colorRole="brandAccent" variant="caption">{currentLabel}</AppText>
        </View>
      ) : null}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  head: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  headBalance: { width: layout.minimumTouchTarget },
  title: { flex: 1, textAlign: 'center' },
  section: { gap: spacing.sm },
  sectionHead: { gap: spacing.xs },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  name: { flex: 1, flexShrink: 1 },
  current: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
});
