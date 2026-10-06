import { Fragment, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, Presence, PressScale, useTextScaling } from '@/components/ui';
import {
  ClosetColorDisc,
  colorFamilyFills,
  GarmentSlotGlyph,
  GarmentTileArtwork,
  type useGarmentRoles,
} from '@/garment-art';
import { FADED_OPACITY } from '@/components/ui/empty-state-art';
import type { ColorFamily, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import {
  removableSlots,
  swappableSlots,
  type RemovableSlot,
  type SwappableSlot,
} from '@/features/recommendation/domain/manual-mix';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import type { ClosetSeedOffer } from '@/features/today/application/outfit-detail-state';
import {
  OWN_TILE_SIZE,
  type PieceEntry,
  ROW_TILE_SIZE,
  type TodayCopy,
} from '@/features/today/presentation/outfit-detail-entries';
import { FadeOnChange } from '@/features/today/presentation/outfit-detail-fades';
import { isClosetColorOptionId } from '@/features/wardrobe/domain/closet-color-options';
import {
  wardrobeEntryStateSchema,
  type WardrobeEntryState,
  type WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';
import type { PieceSheetTarget } from '@/features/wardrobe/presentation/piece-edit-sheet';
import { TourTarget } from '@/features/walkthrough/application/tour-target';
import type { getMessages } from '@/localization/messages';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { easierToSee, useEasierToSee } from '@/theme/easier-to-see';
import { PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const SWATCH_DOT_SIZE = 16;

/**
 * The empty Closet's one tap: the pieces go in as owned, in the colours drawn here, through
 * the Closet's own create path. Gone once the Closet holds anything.
 */
export function OutfitDetailClosetSeed({
  closetSeed,
  copy,
  entries,
  seedAnswer,
  seedAsking,
  setSeedAnswer,
  setSeedAsking,
}: Readonly<{
  closetSeed: ClosetSeedOffer;
  copy: TodayCopy;
  entries: readonly PieceEntry[];
  seedAnswer: WardrobeEntryState | null;
  seedAsking: boolean;
  setSeedAnswer: Dispatch<SetStateAction<WardrobeEntryState | null>>;
  setSeedAsking: Dispatch<SetStateAction<boolean>>;
}>) {
  const { controlScale } = useTextScaling();
  const theme = useKuyaraTheme();
  return (
    <>
      <Presence testID="outfit-detail-closet-seed" visible={closetSeed.status !== 'added'}>
        {seedAsking || closetSeed.status === 'busy' ? (
          <View style={styles.seedBlock} testID="outfit-detail-closet-seed-choice">
            <AppText accessibilityRole="header" variant="label">{copy.closetSeed.question}</AppText>
            <View style={styles.seedChoices}>
              {wardrobeEntryStateSchema.options.map((entryState) => (
                <Button
                  icon={entryState === 'owned' ? 'hanger' : 'heartFilled'}
                  key={entryState}
                  label={copy.closetSeed.choice[entryState]}
                  loading={closetSeed.status === 'busy' && seedAnswer === entryState}
                  onPress={() => {
                    if (closetSeed.status === 'busy') return;
                    setSeedAnswer(entryState);
                    closetSeed.onSeed(entries.map(({ piece, target }) => ({
                      garmentTypeId: piece.garmentTypeId,
                      colorFamily: target.suggestedColorFamily,
                    })), entryState);
                  }}
                  testID={`outfit-detail-closet-seed-${entryState}`}
                  variant="tonal"
                />
              ))}
              <Button
                label={copy.closetSeed.cancel}
                onPress={() => {
                  if (closetSeed.status !== 'busy') setSeedAsking(false);
                }}
                testID="outfit-detail-closet-seed-cancel"
                variant="plain"
              />
            </View>
          </View>
        ) : (
          <View style={styles.seedBlock}>
            <AppText colorRole="textSecondary" variant="caption">{copy.closetSeed.body}</AppText>
            <Button
              icon="plus"
              label={copy.closetSeed.action}
              onPress={() => setSeedAsking(true)}
              style={styles.seedButton}
              testID="outfit-detail-closet-seed-button"
              variant="tonal"
            />
          </View>
        )}
        {closetSeed.status === 'failed' ? (
          <AppText accessibilityRole="alert" colorRole="dangerInk" style={styles.seedFailed} variant="caption">
            {copy.closetSeed.failed}
          </AppText>
        ) : null}
      </Presence>
      <Presence testID="outfit-detail-closet-seeded" visible={closetSeed.status === 'added'}>
        <View style={styles.seedDone}>
          <Icon color={theme.colors.successInk} name="checkCircle" size={16 * controlScale} />
          <AppText accessibilityLiveRegion="polite" style={styles.flexText} variant="caption">
            {copy.closetSeed.added(closetSeed.addedCount)}
          </AppText>
        </View>
      </Presence>
    </>
  );
}

/** Where a layer slot's empty place draws its glyph from. */
export const layerCategory: Readonly<Record<RemovableSlot, StructuralCategory>> = {
  mid_layer: 'top',
  outer_layer: 'outerwear',
};

/** ADR 0021's empty place: the muted tile with the category's glyph faded, never a plate. */
export function EmptyPlaceTile({ category, size, testID }: Readonly<{
  category: StructuralCategory;
  size: number;
  testID?: string;
}>) {
  const theme = useKuyaraTheme();
  return (
    <PlateView color={theme.colors.surfaceMuted} style={[styles.placeTile, { height: size, width: size }]} testID={testID}>
      <View style={styles.faded}>
        <GarmentSlotGlyph category={category} color={theme.colors.textSecondary} size={size * 0.6} />
      </View>
    </PlateView>
  );
}

/**
 * The detail's one row shell (ADR 0028 anatomy): a tile, the words, an optional trailing
 * control, and a chevron when the whole row opens something. A row that opens nothing keeps
 * its words as one accessible element beside its control.
 */
function DetailRow({
  press,
  pressed,
  separated,
  tile,
  text,
  textLabel,
  textRef,
  textTestID,
  control,
  testID,
  wrapBody,
}: Readonly<{
  press: Readonly<{
    label: string;
    hint?: string;
    onPress: () => void;
    onPressIn: () => void;
    onPressOut: () => void;
    actions?: readonly Readonly<{ name: string; label: string; run: () => void }>[];
    testID: string;
  }> | null;
  pressed: boolean;
  separated: boolean;
  tile: ReactNode;
  text: ReactNode;
  /** Without a press, the words speak this as their own element. */
  textLabel?: string;
  textRef?: (node: View | null) => void;
  textTestID?: string;
  control: ReactNode;
  testID: string;
  /** Wraps the tile and words alone, never the trailing control; the wrapper takes the body's place. */
  wrapBody?: (body: ReactNode) => ReactNode;
}>) {
  const theme = useKuyaraTheme();
  const easierToSeeOn = useEasierToSee();
  const { stacksButtonPair } = useTextScaling();
  const chevron = press && !control;
  const body = (
    <View
      accessibilityElementsHidden={Boolean(press)}
      accessibilityLabel={press ? undefined : textLabel}
      accessible={!press}
      importantForAccessibility={press ? 'no-hide-descendants' : 'yes'}
      pointerEvents="none"
      ref={textRef}
      style={[styles.rowBody, pressed && styles.rowPressed]}
      testID={textTestID}>
      {tile}
      <View style={styles.rowText}>{text}</View>
      {chevron || (control && stacksButtonPair && press) ? (
        <Icon color={theme.colors.textSecondary} name="chevronRight" size={20} />
      ) : null}
    </View>
  );
  return (
    <View
      style={[styles.pieceRow, easierToSeeOn && styles.pieceRowLarge, separated && {
        borderTopColor: theme.colors.borderSubtle,
        borderTopWidth: StyleSheet.hairlineWidth,
      }]}
      testID={testID}>
      {press ? (
        <PressScale
          accessibilityActions={press.actions?.map(({ name, label }) => ({ name, label }))}
          accessibilityHint={press.hint}
          accessibilityLabel={press.label}
          accessibilityRole="button"
          onAccessibilityAction={({ nativeEvent }) =>
            press.actions?.find(({ name }) => name === nativeEvent.actionName)?.run()}
          onPress={press.onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={StyleSheet.absoluteFill}
          testID={press.testID}
        />
      ) : null}
      <View pointerEvents="box-none" style={stacksButtonPair ? styles.rowStack : styles.rowLine}>
        {wrapBody ? wrapBody(body) : body}
        {control ? (
          <View pointerEvents="box-none" style={stacksButtonPair ? styles.changeStacked : undefined}>{control}</View>
        ) : null}
        {control && press && !stacksButtonPair ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={pressed && styles.rowPressed}>
            <Icon color={theme.colors.textSecondary} name="chevronRight" size={20} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** "Add a layer" and "Add an accessory": the row shell with a plus tile, the whole row a button. */
export function DetailAddRow({ title, hint, onPress, separated = false, testID }: Readonly<{
  title: string;
  hint: string;
  onPress: () => void;
  separated?: boolean;
  testID: string;
}>) {
  const theme = useKuyaraTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <DetailRow
      control={null}
      press={{
        label: `${title}, ${hint}`,
        onPress,
        onPressIn: () => setPressed(true),
        onPressOut: () => setPressed(false),
        testID: `${testID}-button`,
      }}
      pressed={pressed}
      separated={separated}
      testID={testID}
      text={(
        <>
          <AppText variant="bodyStrong">{title}</AppText>
          <AppText colorRole="textSecondary" variant="caption">{hint}</AppText>
        </>
      )}
      tile={(
        <PlateView color={theme.colors.surfaceMuted} style={[styles.placeTile, styles.rowTile]}>
          <Icon color={theme.colors.textPrimary} name="plus" size={24} />
        </PlateView>
      )}
    />
  );
}

type RowItem =
  | Readonly<{ kind: 'piece'; slot: OutfitSlot; entry: PieceEntry }>
  | Readonly<{ kind: 'empty'; slot: RemovableSlot }>;

export function OutfitDetailPieceRows({
  canChange,
  entries,
  everChanged,
  messages,
  onEditPiece,
  openPicker,
  pieceRoles,
  pressedRow,
  revealFirstPiece,
  scrollBy,
  setPressedRow,
  removedSlots = [],
  addedSlots = [],
  pinnedSlots = [],
  onTakeOff,
  onAddLayer,
  emptyTargets,
}: Readonly<{
  canChange: boolean;
  entries: readonly PieceEntry[];
  everChanged: boolean;
  messages: ReturnType<typeof getMessages>;
  onEditPiece: (target: PieceSheetTarget) => void;
  openPicker: (slot: SwappableSlot) => void;
  pieceRoles: ReturnType<typeof useGarmentRoles>;
  pressedRow: OutfitSlot | null;
  revealFirstPiece: () => void;
  scrollBy: (dy: number) => void;
  setPressedRow: Dispatch<SetStateAction<OutfitSlot | null>>;
  /** Layers the reader took off: each keeps its place as an empty row. */
  removedSlots?: readonly RemovableSlot[];
  /** Layers the reader added: their rows read "Added". */
  addedSlots?: readonly OutfitSlot[];
  /** Pieces the reader chose to compose around: their rows read "Your choice". */
  pinnedSlots?: readonly OutfitSlot[];
  /** A layer row's VoiceOver action takes the layer off. */
  onTakeOff?: (slot: RemovableSlot) => void;
  /** Present while a layer slot is free: "Add a layer" follows the rows. */
  onAddLayer?: () => void;
  /** Each empty row's words, so focus can land there once its piece has gone. */
  emptyTargets?: RefObject<Map<RemovableSlot, View>>;
}>) {
  const { controlScale } = useTextScaling();
  const theme = useKuyaraTheme();
  const copy = messages.today;
  const mix = copy.manualMix;
  const colorName = (family: ColorFamily | null) => family
    ? messages.catalog[`catalog.color_family.${family}`] : messages.wardrobe.colorUnspecified;
  // O8: the user's own piece is named by its palette option when it has one, else by family.
  const ownColorName = (item: WardrobeItem) => (
    item.colorChoice?.kind === 'option' && isClosetColorOptionId(item.colorChoice.id)
      ? messages.wardrobe.colorOptionNames[item.colorChoice.id]
      : colorName(item.colorFamily));
  const swatchFill = (family: ColorFamily) => {
    const fill = colorFamilyFills[theme.colorScheme][family];
    return typeof fill === 'string' ? fill : fill[0];
  };
  // The rows keep the outfit's order; a layer taken off keeps its place.
  const items: RowItem[] = [
    ...entries.map((entry) => ({ kind: 'piece' as const, slot: entry.slot, entry })),
    ...removedSlots.map((slot) => ({ kind: 'empty' as const, slot })),
  ].sort((a, b) => swappableSlots.indexOf(a.slot as SwappableSlot) - swappableSlots.indexOf(b.slot as SwappableSlot));

  const emptyRow = (slot: RemovableSlot, index: number) => (
    <DetailRow
      control={canChange ? (
        <Button
          accessibilityLabel={mix.changeEmptyAccessibilityLabel[slot]}
          label={mix.change}
          onPress={() => openPicker(slot)}
          size="medium"
          testID={`outfit-detail-change-${slot}`}
          variant="plain"
        />
      ) : null}
      key={slot}
      press={null}
      pressed={false}
      separated={index > 0}
      testID={`outfit-detail-row-${slot}`}
      text={(
        <FadeOnChange animate={everChanged}>
          <View style={styles.rowTextLines}>
            <AppText variant="bodyStrong">{mix.noLayer[slot]}</AppText>
            <AppText colorRole="textSecondary" variant="caption">{mix.tookOff}</AppText>
          </View>
        </FadeOnChange>
      )}
      textLabel={`${mix.noLayer[slot]}, ${mix.tookOff}`}
      textRef={(node) => {
        if (node) emptyTargets?.current.set(slot, node);
        else emptyTargets?.current.delete(slot);
      }}
      textTestID={`outfit-detail-empty-${slot}`}
      tile={<EmptyPlaceTile category={layerCategory[slot]} size={ROW_TILE_SIZE} testID={`outfit-detail-empty-tile-${slot}`} />}
    />
  );

  const pieceRow = ({ piece, slot, match, status, target, spokenLabel }: PieceEntry, index: number) => {
    const pressed = pressedRow === slot;
    const added = addedSlots.includes(slot);
    const pinned = pinnedSlots.includes(slot);
    const note = added ? mix.added : piece.changed ? mix.changed : null;
    const rowLabel = [
      spokenLabel,
      pinned ? mix.yourChoice : null,
      note,
      match.kind === 'similar' ? copy.ownershipYours(ownColorName(match.item)) : null,
    ].filter(Boolean).join(', ');
    const layer = removableSlots.find((one) => one === slot);
    const text = (
      <View style={styles.rowTextLines} testID={`outfit-detail-piece-text-${piece.garmentTypeId}`}>
        <AppText variant="bodyStrong">{piece.item}</AppText>
        <AppText colorRole="textSecondary" variant="caption">{pinned ? mix.yourChoice : piece.slot}</AppText>
        {note ? (
          <AppText colorRole="brandAccent"
            testID={`outfit-detail-piece-${added ? 'added' : 'changed'}-${piece.garmentTypeId}`} variant="caption">
            {note}
          </AppText>
        ) : null}
        {match.kind !== 'none' && status ? (
          <View style={styles.rowStatus} testID={`outfit-detail-piece-status-${piece.garmentTypeId}`}>
            <Icon color={theme.colors.brandAccent} name={match.kind === 'wanted' ? 'heartFilled' : 'hanger'} size={16 * controlScale} />
            <AppText variant="caption">{status}</AppText>
            {match.kind === 'owned' ? (
              <Icon color={theme.colors.brandAccent} name="check" size={16 * controlScale} />
            ) : null}
          </View>
        ) : null}
        {match.kind === 'similar' ? (
          <View style={styles.rowStatus} testID={`outfit-detail-piece-yours-${piece.garmentTypeId}`}>
            <PlateView color={theme.colors.garmentTile} style={styles.ownTile}>
              <GarmentTileArtwork
                category={piece.category}
                colorChoice={match.item.colorChoice ?? null}
                colorFamily={match.item.colorFamily}
                garmentTypeId={piece.garmentTypeId}
                glyphSize={OWN_TILE_SIZE * 0.6}
                height={OWN_TILE_SIZE}
                photoTestID={`outfit-detail-yours-photo-${piece.garmentTypeId}`}
                photoUri={null}
                placeholderTestID={`outfit-detail-yours-glyph-${piece.garmentTypeId}`}
                silhouetteTestID={`outfit-detail-yours-silhouette-${piece.garmentTypeId}`}
                width={OWN_TILE_SIZE}
              />
            </PlateView>
            {match.item.colorChoice ? (
              <ClosetColorDisc
                choice={match.item.colorChoice}
                size={SWATCH_DOT_SIZE}
                testID={`outfit-detail-yours-swatch-${piece.garmentTypeId}`}
              />
            ) : match.item.colorFamily ? (
              <View style={[styles.swatchDot, {
                backgroundColor: swatchFill(match.item.colorFamily),
                borderColor: theme.colors.borderDefined,
              }]} />
            ) : null}
            <AppText colorRole="textSecondary" style={styles.flexText} variant="caption">
              {copy.ownershipYours(ownColorName(match.item))}
            </AppText>
          </View>
        ) : null}
      </View>
    );
    return (
      <Fragment key={slot}>
        {/* O6: the row is the one control that opens the piece's Closet sheet; the Change
            control beside it is its own element. The fade follows the piece. */}
        <FadeOnChange animate={everChanged} key={piece.garmentTypeId}>
          <DetailRow
            control={canChange ? (
              <Button
                accessibilityLabel={mix.changeAccessibilityLabel[slot as SwappableSlot](piece.item)}
                label={mix.change}
                onPress={() => openPicker(slot as SwappableSlot)}
                size="medium"
                testID={`outfit-detail-change-${slot}`}
                variant="plain"
              />
            ) : null}
            press={{
              label: rowLabel,
              hint: copy.editPieceAccessibilityHint,
              onPress: () => onEditPiece(target),
              onPressIn: () => setPressedRow(slot),
              onPressOut: () => setPressedRow(null),
              actions: layer && onTakeOff
                ? [{ name: 'takeOff', label: mix.takeOffAccessibilityLabel[layer], run: () => onTakeOff(layer) }]
                : undefined,
              testID: `outfit-detail-piece-${piece.garmentTypeId}`,
            }}
            pressed={pressed}
            separated={index > 0}
            testID={`outfit-detail-row-${slot}`}
            text={text}
            // Phase 8: the first piece row is the tour's step 2 control. The wrapper holds the
            // tile and words, a tap on which reaches the row's own press, and never the Change
            // beside them, so the step leaves exactly one control live.
            wrapBody={(body) => (
              <TourTarget
                activate={() => onEditPiece(target)}
                id={index === 0 ? 'piece' : null}
                label={rowLabel}
                name={piece.item}
                pointerEvents="box-none"
                reveal={revealFirstPiece}
                scrollBy={scrollBy}
                style={styles.rowBodySlot}>
                {body}
              </TourTarget>
            )}
            tile={(
              <PlateView color={theme.colors.garmentTile} style={styles.rowTile}>
                <GarmentTileArtwork
                  category={piece.category}
                  colorFamily={null}
                  garmentTypeId={piece.garmentTypeId}
                  glyphSize={ROW_TILE_SIZE * 0.6}
                  height={ROW_TILE_SIZE}
                  photoTestID={`outfit-detail-piece-photo-${piece.garmentTypeId}`}
                  photoUri={null}
                  placeholderTestID={`outfit-detail-piece-glyph-${piece.garmentTypeId}`}
                  roles={pieceRoles.get(slot)}
                  silhouetteTestID={`outfit-detail-piece-silhouette-${piece.garmentTypeId}`}
                  width={ROW_TILE_SIZE}
                />
              </PlateView>
            )}
          />
        </FadeOnChange>
      </Fragment>
    );
  };

  return (
    <View>
      {items.map((item, index) => (item.kind === 'piece' ? pieceRow(item.entry, index) : emptyRow(item.slot, index)))}
      {onAddLayer ? (
        <DetailAddRow
          hint={mix.addLayerHint}
          onPress={onAddLayer}
          separated={items.length > 0}
          testID="outfit-detail-add-layer"
          title={mix.addLayer}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flexText: {
    flex: 1,
    flexShrink: 1,
  },
  pieceRow: {
    minHeight: layout.minimumTouchTarget,
    paddingVertical: spacing.md,
  },
  pieceRowLarge: {
    minHeight: easierToSee.rowHeight,
  },
  rowLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowStack: {
    gap: spacing.xs,
  },
  // The tour's wrapper takes the body's place in the row and lays the body out across itself.
  rowBodySlot: {
    flex: 1,
    flexDirection: 'row',
  },
  rowBody: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowPressed: {
    opacity: interaction.pressedOpacity,
  },
  changeStacked: {
    alignSelf: 'flex-start',
    marginLeft: ROW_TILE_SIZE + spacing.md,
  },
  rowTile: {
    alignItems: 'center',
    borderRadius: radii.control,
    height: ROW_TILE_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: ROW_TILE_SIZE,
  },
  rowText: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xs,
  },
  rowTextLines: {
    gap: spacing.xs,
  },
  placeTile: {
    alignItems: 'center',
    borderRadius: radii.control,
    justifyContent: 'center',
  },
  faded: {
    opacity: FADED_OPACITY,
  },
  rowStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  ownTile: {
    alignItems: 'center',
    borderRadius: radii.control,
    height: OWN_TILE_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: OWN_TILE_SIZE,
  },
  seedBlock: {
    gap: spacing.sm,
  },
  seedButton: {
    alignSelf: 'flex-start',
  },
  seedChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  seedFailed: {
    marginTop: spacing.sm,
  },
  seedDone: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  swatchDot: {
    borderRadius: SWATCH_DOT_SIZE / 2,
    borderWidth: borderWidths.subtle,
    height: SWATCH_DOT_SIZE,
    width: SWATCH_DOT_SIZE,
  },
});
