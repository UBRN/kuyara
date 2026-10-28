import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  GlassButton,
  Icon,
  NativeSheet,
  PressScale,
  SegmentedControl,
  type SegmentedControlOption,
  useTextScaling,
} from '@/components/ui';
import {
  GarmentCandidateTile,
  useGarmentCandidateRoles,
  useSwatchedCandidateRoles,
  type GarmentOutfitPalette,
} from '@/garment-art';
import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
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

/** One of the reader's own Closet pieces under "Yours": a tap wears its type in its colour. */
export type PiecePickerOwnOption = PiecePickerOption & Readonly<{
  /** The Closet record's id. */
  id: string;
  /** The record's own name; without one the row is named by its type, `name`. */
  ownName: string | null;
  swatchId: GarmentSwatchId;
  colorName: string;
  /** Its type is among the slot's "Other pieces". */
  unusual: boolean;
  photoUri: string | null;
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
  /**
   * The reader's own Closet pieces for the slot, before the groups. `current` is the record the
   * slot wears, its type in its colour: "Current" moves to its row from the catalog's.
   */
  own?: Readonly<{ options: readonly PiecePickerOwnOption[]; current: string | null }> | null;
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
  /** The Closet marker an own piece carries in its tile's corner, the strip's. */
  ownBadge: ReactNode;
  /** A piece, or null for "wear without"; an own piece comes with its colour. */
  onChoose: (option: PiecePickerOption | null, swatchId?: GarmentSwatchId) => void;
  onDismiss: () => void;
}>;

/**
 * Phase 7: the row's Change opens every catalog piece for the slot, the
 * profile's gender applicability kept, pieces that fit today's weather first and the rest
 * under a short explanation. The same list adds a layer or an accessory. The reader's own
 * Closet pieces of the slot's catalog types stand first under "Yours", a shortcut to a
 * candidate type in the piece's colour that never becomes a candidate. A choice closes the
 * sheet; the board plays the change once the sheet has gone.
 */
export function PiecePickerSheet({ target, palette, ownBadge, onChoose, onDismiss }: PiecePickerSheetProps) {
  return (
    <NativeSheet onDismiss={onDismiss} testID="piece-picker-sheet" visible={target !== null}>
      {target ? (
        <PiecePickerList onChoose={onChoose} onDismiss={onDismiss} ownBadge={ownBadge} palette={palette} target={target} />
      ) : null}
    </NativeSheet>
  );
}

/** The picker's content, for a sheet that hosts it. */
export function PiecePickerList({
  target,
  palette,
  ownBadge,
  onChoose,
  onDismiss,
}: Readonly<{
  target: PiecePickerTarget;
  palette: GarmentOutfitPalette | null;
  ownBadge: ReactNode;
  onChoose: (option: PiecePickerOption | null, swatchId?: GarmentSwatchId) => void;
  onDismiss: () => void;
}>) {
  const messages = useMessages();
  const copy = messages.today.manualMix;
  const theme = useKuyaraTheme();
  const rowHeight = useEasierToSee() ? easierToSee.rowHeight : layout.minimumTouchTarget;
  const without = target.without ?? null;
  const own = target.own?.options.length ? target.own : null;
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
          currentTestID="piece-picker-current-none"
          label={without.label}
          minHeight={rowHeight}
          onPress={() => onChoose(null)}
          testID="piece-picker-option-none"
          tile={<EmptyPlaceTile category={without.category} size={layout.minimumTouchTarget} />}
        />
      ) : null}
      {own ? (
        <PickerSection hint={copy.yoursHint} id="yours" title={copy.yours}>
          {own.options.map((option, index) => (
            <PickerRow
              accessibilityHint={option.unusual ? copy.otherPieceHint : undefined}
              accessibilityLabel={copy.yoursPiece(option.name, option.colorName)}
              current={option.id === own.current}
              currentLabel={copy.pickerCurrent}
              currentTestID={`piece-picker-current-own-${option.id}`}
              key={option.id}
              label={option.ownName ?? option.name}
              minHeight={rowHeight}
              onPress={() => onChoose(option, option.swatchId)}
              separator={separated(index)}
              subline={[option.ownName ? option.name : null, option.colorName, option.unusual ? copy.unusual : null]
                .filter((part) => part !== null).join(' · ')}
              testID={`piece-picker-own-${option.id}`}
              tile={<OwnTile badge={ownBadge} option={option} palette={palette} />}
            />
          ))}
        </PickerSection>
      ) : null}
      {target.groups.map((group) => (
        <PickerSection hint={group.hint} id={group.id} key={group.id} title={group.title}>
          {group.options.map((option, index) => (
            <PickerRow
              current={option.garmentTypeId === target.current && !own?.current}
              currentLabel={copy.pickerCurrent}
              currentTestID={`piece-picker-current-${option.garmentTypeId}`}
              key={`${option.slot}-${option.garmentTypeId}`}
              label={option.name}
              minHeight={rowHeight}
              onPress={() => onChoose(option)}
              separator={separated(index)}
              testID={`piece-picker-option-${option.garmentTypeId}`}
              tile={<OptionTile option={option} palette={palette} />}
            />
          ))}
        </PickerSection>
      ))}
    </ScrollView>
  );
}

function PickerSection({ children, hint, id, title }: Readonly<{
  children: ReactNode;
  hint?: string;
  id: string;
  title: string;
}>) {
  return (
    <View style={styles.section} testID={`piece-picker-${id}`}>
      <View style={styles.sectionHead}>
        <AppText accessibilityRole="header" variant="bodyStrong">{title}</AppText>
        {hint ? <AppText colorRole="textSecondary" variant="caption">{hint}</AppText> : null}
      </View>
      <View>{children}</View>
    </View>
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

// One Closet piece's tile: its photo when it has one, else its type drawn in its colour, with the
// Closet marker in the corner as on the strip.
function OwnTile({ badge, option, palette }: Readonly<{
  badge: ReactNode;
  option: PiecePickerOwnOption;
  palette: GarmentOutfitPalette | null;
}>) {
  const roles = useSwatchedCandidateRoles(palette, option.slot,
    [{ key: option.id, garmentTypeId: option.garmentTypeId, swatchId: option.swatchId }]);
  return (
    <View>
      <GarmentCandidateTile
        category={option.category}
        garmentTypeId={option.garmentTypeId}
        photoUri={option.photoUri}
        roles={roles.get(option.id)}
        testIDPrefix={`piece-picker-own-${option.id}`}
      />
      <View style={styles.badge} testID={`piece-picker-own-${option.id}-mark`}>{badge}</View>
    </View>
  );
}

function PickerRow({
  accessibilityHint,
  accessibilityLabel,
  current,
  currentLabel,
  currentTestID,
  label,
  minHeight,
  onPress,
  separator,
  subline,
  testID,
  tile,
}: Readonly<{
  accessibilityHint?: string;
  /** The row's spoken name when it says more than `label`. */
  accessibilityLabel?: string;
  current: boolean;
  currentLabel: string;
  currentTestID: string;
  label: string;
  minHeight: number;
  onPress: () => void;
  separator?: false | Readonly<{ borderTopColor: string; borderTopWidth: number }>;
  subline?: string;
  testID: string;
  tile: ReactNode;
}>) {
  const { controlScale } = useTextScaling();
  const theme = useKuyaraTheme();
  const spoken = accessibilityLabel ?? label;
  return (
    <PressScale
      accessibilityHint={accessibilityHint}
      accessibilityLabel={current ? `${spoken}, ${currentLabel}` : spoken}
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      onPress={onPress}
      style={[styles.row, { minHeight }, separator]}
      testID={testID}>
      {tile}
      <View style={styles.text}>
        <AppText variant="bodyStrong">{label}</AppText>
        {subline ? <AppText colorRole="textSecondary" variant="caption">{subline}</AppText> : null}
      </View>
      {current ? (
        <View style={styles.current} testID={currentTestID}>
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
  text: { flex: 1, flexShrink: 1, gap: spacing.xs },
  // The Closet marker in the own piece's corner, inside its 44-point tile.
  badge: { position: 'absolute', right: 0, top: 0 },
  current: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
});
