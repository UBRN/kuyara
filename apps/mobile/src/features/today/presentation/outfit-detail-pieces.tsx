import type { Dispatch, SetStateAction } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  ClosetColorDisc,
  colorFamilyFills,
  GarmentTileArtwork,
  Icon,
  Presence,
  PressScale,
  type useGarmentRoles,
  useTextScaling,
} from '@/components/ui';
import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';
import type { SwappableSlot } from '@/features/recommendation/domain/manual-mix';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import type { ClosetSeedOffer } from '@/features/today/application/outfit-detail-state';
import {
  OWN_TILE_SIZE,
  type PieceEntry,
  ROW_TILE_SIZE,
  type TodayCopy,
} from '@/features/today/presentation/outfit-detail-entries';
import { FadeOnChange } from '@/features/today/presentation/outfit-detail-fades';
import type { WardrobeItem, WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';
import type { PieceSheetTarget } from '@/features/wardrobe/presentation/piece-edit-sheet';
import { TourTarget } from '@/features/walkthrough/application/tour-target';
import type { getMessages } from '@/localization/messages';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { easierToSee } from '@/theme/easier-to-see';
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
  const theme = useKuyaraTheme();
  return (
    <>
      <Presence testID="outfit-detail-closet-seed" visible={closetSeed.status !== 'added'}>
        {seedAsking || closetSeed.status === 'busy' ? (
          <View style={styles.seedBlock} testID="outfit-detail-closet-seed-choice">
            <AppText accessibilityRole="header" variant="label">{copy.closetSeed.question}</AppText>
            <View style={styles.seedChoices}>
              {(['owned', 'wanted'] as const).map((entryState) => (
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
          <Icon color={theme.colors.successInk} name="checkCircle" size={16} />
          <AppText accessibilityLiveRegion="polite" style={styles.flexText} variant="caption">
            {copy.closetSeed.added(closetSeed.addedCount)}
          </AppText>
        </View>
      </Presence>
    </>
  );
}

export function OutfitDetailPieceRows({
  canChange,
  easierToSeeOn,
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
}: Readonly<{
  canChange: boolean;
  easierToSeeOn: boolean;
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
}>) {
  const theme = useKuyaraTheme();
  const { stacksButtonPair } = useTextScaling();
  const copy = messages.today;
  const colorName = (family: ColorFamily | null) => family
    ? messages.catalog[`catalog.color_family.${family}`] : messages.wardrobe.colorUnspecified;
  // O8: the user's own piece is named by its palette option when it has one, else by family.
  const ownColorName = (item: WardrobeItem) => (item.colorChoice?.kind === 'option'
    ? messages.wardrobe.colorOptionNames[item.colorChoice.id] : undefined) ?? colorName(item.colorFamily);
  const swatchFill = (family: ColorFamily) => {
    const fill = colorFamilyFills[theme.colorScheme][family];
    return typeof fill === 'string' ? fill : fill[0];
  };
  return (
    <View>
      {entries.map(({ piece, slot, match, status, target, spokenLabel }, index) => {
        const pressed = pressedRow === slot;
        const rowBody = (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[styles.rowBody, pressed && styles.rowPressed]}>
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
            <View style={styles.rowText} testID={`outfit-detail-piece-text-${piece.garmentTypeId}`}>
              <AppText variant="bodyStrong">{piece.item}</AppText>
              <AppText colorRole="textSecondary" variant="caption">{piece.slot}</AppText>
              {piece.changed ? (
                <AppText colorRole="brandAccent" testID={`outfit-detail-piece-changed-${piece.garmentTypeId}`}
                  variant="caption">
                  {copy.manualMix.changed}
                </AppText>
              ) : null}
              {match.kind !== 'none' && status ? (
                <View style={styles.rowStatus} testID={`outfit-detail-piece-status-${piece.garmentTypeId}`}>
                  <Icon color={theme.colors.brandAccent} name={match.kind === 'wanted' ? 'heartFilled' : 'hanger'} size={16} />
                  <AppText variant="caption">{status}</AppText>
                  {match.kind === 'owned' ? (
                    <Icon color={theme.colors.brandAccent} name="check" size={16} />
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
            {stacksButtonPair || !canChange ? (
              <Icon color={theme.colors.textSecondary} name="chevronRight" size={20} />
            ) : null}
          </View>
        );
        const change = canChange ? (
          <Button
            accessibilityLabel={copy.manualMix.changeAccessibilityLabel[slot as SwappableSlot](piece.item)}
            label={copy.manualMix.change}
            onPress={() => openPicker(slot as SwappableSlot)}
            size="medium"
            style={stacksButtonPair ? styles.changeStacked : undefined}
            testID={`outfit-detail-change-${slot}`}
            variant="plain"
          />
        ) : null;
        const rowLabel = [
          spokenLabel,
          piece.changed ? copy.manualMix.changed : null,
          match.kind === 'similar' ? copy.ownershipYours(ownColorName(match.item)) : null,
        ].filter(Boolean).join(', ');
        return (
          // Phase 8: the first piece row is the tour's step 2 control. The wrapper adds a
          // plain view around the whole row, so the tour lights the row, and nothing else.
          <TourTarget
            activate={() => onEditPiece(target)}
            id={index === 0 ? 'piece' : null}
            key={slot}
            label={rowLabel}
            name={piece.item}
            reveal={revealFirstPiece}
            scrollBy={scrollBy}>
            <View
              style={[styles.pieceRow, easierToSeeOn && styles.pieceRowLarge, index > 0 && {
                borderTopColor: theme.colors.borderSubtle,
                borderTopWidth: StyleSheet.hairlineWidth,
              }]}>
              {/* O6: the row is the one control that opens the piece's Closet sheet; the
                  Change control above it is its own element. */}
              <PressScale
                accessibilityHint={copy.editPieceAccessibilityHint}
                accessibilityLabel={rowLabel}
                accessibilityRole="button"
                onPress={() => onEditPiece(target)}
                onPressIn={() => setPressedRow(slot)}
                onPressOut={() => setPressedRow(null)}
                style={StyleSheet.absoluteFill}
                testID={`outfit-detail-piece-${piece.garmentTypeId}`}
              />
              <FadeOnChange animate={everChanged} key={piece.garmentTypeId}>
                <View pointerEvents="box-none" style={stacksButtonPair ? styles.rowStack : styles.rowLine}>
                  {rowBody}
                  {change}
                  {stacksButtonPair || !canChange ? null : (
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      pointerEvents="none"
                      style={pressed && styles.rowPressed}>
                      <Icon color={theme.colors.textSecondary} name="chevronRight" size={20} />
                    </View>
                  )}
                </View>
              </FadeOnChange>
            </View>
          </TourTarget>
        );
      })}
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
