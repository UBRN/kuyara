import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  GarmentCandidateTile,
  GlassButton,
  Icon,
  NativeSheet,
  PressScale,
  useGarmentCandidateRoles,
  type GarmentOutfitPalette,
} from '@/components/ui';
import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { useMessages } from '@/localization/use-messages';
import { easierToSee, useEasierToSee } from '@/theme/easier-to-see';
import { layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type PiecePickerOption = Readonly<{
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
  name: string;
  suitable: boolean;
}>;

export type PiecePickerTarget = Readonly<{
  slot: OutfitSlot;
  title: string;
  current: GarmentTypeId;
  options: readonly PiecePickerOption[];
}>;

type PiecePickerSheetProps = Readonly<{
  target: PiecePickerTarget | null;
  /** The outfit's palette, so each tile shows the piece in the colour the outfit would give it. */
  palette: GarmentOutfitPalette | null;
  onChoose: (garmentTypeId: GarmentTypeId) => void;
  onDismiss: () => void;
}>;

/**
 * Phase 7, owner answer 2: the row's Change opens every catalog piece for the slot, the
 * profile's gender applicability kept, pieces that fit today's weather first and the rest
 * under a short explanation. The Closet never supplies a candidate. A choice closes the
 * sheet; the board plays the change once the sheet has gone.
 */
export function PiecePickerSheet({ target, palette, onChoose, onDismiss }: PiecePickerSheetProps) {
  return (
    <NativeSheet onDismiss={onDismiss} testID="piece-picker-sheet" visible={target !== null}>
      {target ? <PiecePickerList onChoose={onChoose} onDismiss={onDismiss} palette={palette} target={target} /> : null}
    </NativeSheet>
  );
}

function PiecePickerList({
  target,
  palette,
  onChoose,
  onDismiss,
}: Readonly<{
  target: PiecePickerTarget;
  palette: GarmentOutfitPalette | null;
  onChoose: (garmentTypeId: GarmentTypeId) => void;
  onDismiss: () => void;
}>) {
  const messages = useMessages();
  const copy = messages.today.manualMix;
  const theme = useKuyaraTheme();
  const rowHeight = useEasierToSee() ? easierToSee.rowHeight : layout.minimumTouchTarget;
  const roles = useGarmentCandidateRoles(palette, target.slot,
    target.options.map(({ garmentTypeId }) => garmentTypeId));
  const fits = target.options.filter(({ suitable }) => suitable);
  const others = target.options.filter(({ suitable }) => !suitable);

  const row = (option: PiecePickerOption, index: number) => {
    const current = option.garmentTypeId === target.current;
    return (
      <PressScale
        accessibilityLabel={current ? `${option.name}, ${copy.pickerCurrent}` : option.name}
        accessibilityRole="button"
        accessibilityState={{ selected: current }}
        key={option.garmentTypeId}
        onPress={() => onChoose(option.garmentTypeId)}
        style={[styles.row, { minHeight: rowHeight }, index > 0 && {
          borderTopColor: theme.colors.borderSubtle,
          borderTopWidth: StyleSheet.hairlineWidth,
        }]}
        testID={`piece-picker-option-${option.garmentTypeId}`}>
        <GarmentCandidateTile
          category={option.category}
          garmentTypeId={option.garmentTypeId}
          roles={roles.get(option.garmentTypeId)}
          testIDPrefix="piece-picker"
        />
        <AppText style={styles.name} variant="bodyStrong">{option.name}</AppText>
        {current ? (
          <View style={styles.current} testID={`piece-picker-current-${option.garmentTypeId}`}>
            <Icon color={theme.colors.brandAccent} name="check" size={16} />
            <AppText colorRole="brandAccent" variant="caption">{copy.pickerCurrent}</AppText>
          </View>
        ) : null}
      </PressScale>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <GlassButton kind="close" label={messages.today.dailyStyle.close} onPress={onDismiss}
          testID="piece-picker-close" />
        <AppText accessibilityRole="header" style={styles.title} variant="bodyStrong">{target.title}</AppText>
        <View style={styles.headBalance} />
      </View>
      {fits.length > 0 ? (
        <View style={styles.section} testID="piece-picker-fits">
          <AppText accessibilityRole="header" variant="bodyStrong">{copy.pickerFits}</AppText>
          <View>{fits.map(row)}</View>
        </View>
      ) : null}
      {others.length > 0 ? (
        <View style={styles.section} testID="piece-picker-others">
          <View style={styles.sectionHead}>
            <AppText accessibilityRole="header" variant="bodyStrong">{copy.pickerOther}</AppText>
            <AppText colorRole="textSecondary" variant="caption">{copy.pickerOtherHint}</AppText>
          </View>
          <View>{others.map(row)}</View>
        </View>
      ) : null}
    </ScrollView>
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
