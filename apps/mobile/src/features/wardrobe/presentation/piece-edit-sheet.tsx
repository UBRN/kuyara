import { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  GarmentTileArtwork,
  GlassButton,
  haptics,
  Icon,
  NativeSheet,
  Surface,
} from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import type {
  ColorFamily,
  GarmentTypeId,
  StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  unchangedWardrobePhoto,
  type WardrobePhotoChange,
} from '@/features/wardrobe/application/wardrobe-photo-manager';
import { sameClosetColorChoice } from '@/features/wardrobe/application/wardrobe-form';
import { useClosetWearCounts } from '@/features/wardrobe/application/use-closet-wear-counts';
import type { StagedWardrobePhoto } from '@/features/wardrobe/data/wardrobe-photo-adapters';
import {
  colorChoiceFamily,
  type ClosetColorChoice,
} from '@/features/wardrobe/domain/closet-color-options';
import type { PieceOwnershipMatch } from '@/features/wardrobe/domain/garment-type-ownership';
import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';
import {
  closetColorName,
  ClosetColorPalette,
} from '@/features/wardrobe/presentation/closet-color-palette';
import { WardrobeOption } from '@/features/wardrobe/presentation/wardrobe-option';
import { TourSheetScope, TourTarget } from '@/features/walkthrough/application/tour-target';
import { useMessages } from '@/localization/use-messages';
import { radii, spacing } from '@/theme/theme';
import { PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The piece drawn large at the head of the sheet, and the two small ones in the similar card.
const HERO_SIZE = 112;
const CARD_TILE_SIZE = 56;

/** One recommended piece, opened from the outfit-detail board or its row (O6). */
export type PieceSheetTarget = Readonly<{
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
  name: string;
  slot: string;
  /** The family the outfit draws this piece in; the colour a new record starts on. */
  suggestedColorFamily: ColorFamily | null;
  match: PieceOwnershipMatch;
}>;

export type PieceSheetValues = Readonly<{
  entryState: WardrobeEntryState;
  colorFamily: ColorFamily | null;
  /**
   * The palette choice, present only when the user picked one other than the record's. An
   * untouched colour sends no choice, so the repository keeps what is stored (O8).
   */
  colorChoice?: ClosetColorChoice;
  photoChange: WardrobePhotoChange;
}>;

type PieceEditSheetProps = Readonly<{
  target: PieceSheetTarget | null;
  onDismiss: () => void;
  /** Rejects when the write failed; the sheet then stays open with its answers. */
  onSave: (values: PieceSheetValues) => Promise<void>;
  onSelectPhoto: () => Promise<StagedWardrobePhoto | null>;
  onDiscardStagedPhoto: (photo: StagedWardrobePhoto) => Promise<void>;
  resolvePhotoUri: (relativePath: string | null) => string | null;
}>;

/**
 * ADR 0026 section 5: the one sheet that owns a detail piece's Closet record. An owned or
 * wanted record of the piece is edited in place; a similar or untracked piece is added as a
 * new record. Closet data never reaches a recommendation.
 */
export function PieceEditSheet({ target, onDismiss, ...rest }: PieceEditSheetProps) {
  return (
    <NativeSheet onDismiss={onDismiss} testID="piece-edit-sheet" visible={target !== null}>
      {target ? (
        // Phase 8: the tour lights this sheet and rings its Close.
        <TourSheetScope>
          <PieceEditForm
            key={`${target.garmentTypeId}:${target.match.kind === 'none' ? '' : target.match.item.id}`}
            onDismiss={onDismiss}
            target={target}
            {...rest}
          />
        </TourSheetScope>
      ) : null}
    </NativeSheet>
  );
}

function PieceEditForm({
  target,
  onDismiss,
  onSave,
  onSelectPhoto,
  onDiscardStagedPhoto,
  resolvePhotoUri,
}: Omit<PieceEditSheetProps, 'target'> & Readonly<{ target: PieceSheetTarget }>) {
  const messages = useMessages();
  const copy = messages.wardrobe;
  const theme = useKuyaraTheme();
  const { match } = target;
  const record = match.kind === 'owned' || match.kind === 'wanted' ? match.item : null;
  const wornCount = useClosetWearCounts().get(record?.id ?? '') ?? 0;
  const [entryState, setEntryState] = useState<WardrobeEntryState | null>(record?.entryState ?? null);
  const [colorFamily, setColorFamily] = useState<ColorFamily | null>(
    record ? record.colorFamily : target.suggestedColorFamily,
  );
  const [colorChoice, setColorChoice] = useState<ClosetColorChoice | null>(record?.colorChoice ?? null);
  const [photoChange, setPhotoChange] = useState<WardrobePhotoChange>(unchangedWardrobePhoto);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  // A stored file that exists but cannot be decoded: the preview steps aside for the hero's
  // drawing (Change and Remove stay reachable) instead of leaving a blank block.
  const [unreadablePhotoUri, setUnreadablePhotoUri] = useState<string | null>(null);
  const staged = useRef<StagedWardrobePhoto | null>(null);
  const discard = useRef(onDiscardStagedPhoto);
  useEffect(() => { discard.current = onDiscardStagedPhoto; }, [onDiscardStagedPhoto]);
  // A picked photo that was never saved leaves with the sheet.
  useEffect(() => () => {
    if (staged.current) void discard.current(staged.current).catch(() => undefined);
  }, []);

  const photoUri = photoChange.kind === 'replace'
    ? photoChange.stagedPhoto.previewUri
    : photoChange.kind === 'remove' ? null : resolvePhotoUri(record?.photoRelativePath ?? null);
  const saveErrorCopy = saveError ? (record ? copy.updateError : copy.createError) : null;
  useErrorAnnouncement(saveErrorCopy);
  useErrorAnnouncement(photoError ? copy.photoError : null);
  const chooseColor = (next: ClosetColorChoice) => {
    setColorChoice(next);
    setColorFamily(colorChoiceFamily(next));
  };

  const replacePhoto = (next: WardrobePhotoChange) => {
    const previous = staged.current;
    if (previous) void onDiscardStagedPhoto(previous).catch(() => undefined);
    staged.current = next.kind === 'replace' ? next.stagedPhoto : null;
    setPhotoChange(next);
  };
  const selectPhoto = () => {
    if (busy) return;
    setPhotoError(false);
    setBusy(true);
    void onSelectPhoto()
      .then((photo) => { if (photo) replacePhoto({ kind: 'replace', stagedPhoto: photo }); })
      .catch(() => setPhotoError(true))
      .finally(() => setBusy(false));
  };
  const save = () => {
    if (busy || !entryState) return;
    setSaveError(false);
    setBusy(true);
    const changedChoice = colorChoice && !sameClosetColorChoice(colorChoice, record?.colorChoice)
      ? colorChoice : null;
    void onSave(changedChoice
      ? { entryState, colorFamily, colorChoice: changedChoice, photoChange }
      : { entryState, colorFamily, photoChange })
      // The record now owns a committed photo, so the unmount must not discard it.
      .then(() => { staged.current = null; })
      .catch(() => { setSaveError(true); setBusy(false); });
  };
  const chooseEntryState = (next: WardrobeEntryState) => {
    if (next !== entryState) haptics.selection();
    setEntryState(next);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.head}>
        <TourTarget activate={onDismiss} id="sheet-close" label={messages.today.dailyStyle.close}>
          <GlassButton kind="close" label={messages.today.dailyStyle.close} onPress={onDismiss}
            testID="piece-edit-close" />
        </TourTarget>
        <AppText accessibilityRole="header" style={styles.title} variant="bodyStrong">
          {record ? copy.pieceSheetEditTitle : copy.pieceSheetAddTitle}
        </AppText>
        <Button disabled={!entryState} label={copy.pieceSheetDone} loading={busy} onPress={save}
          size="small" testID="piece-edit-done" />
      </View>

      {saveErrorCopy ? (
        <AppText accessibilityRole="alert" colorRole="dangerInk" testID="piece-edit-error">
          {saveErrorCopy}
        </AppText>
      ) : null}

      <View style={styles.piece}>
        <PlateView color={theme.colors.garmentTile} style={styles.hero}>
          <GarmentTileArtwork category={target.category} colorChoice={colorChoice} colorFamily={colorFamily}
            garmentTypeId={target.garmentTypeId} glyphSize={HERO_SIZE * 0.6} height={HERO_SIZE}
            photoTestID="piece-edit-photo" photoUri={photoUri}
            placeholderTestID="piece-edit-placeholder" silhouetteTestID="piece-edit-silhouette"
            width={HERO_SIZE} />
        </PlateView>
        <View style={styles.pieceText}>
          <AppText variant="title">{target.name}</AppText>
          <AppText colorRole="textSecondary">{target.slot}</AppText>
          <AppText testID="piece-edit-color-name" variant="bodyStrong">
            {closetColorName(messages, colorChoice, colorFamily)}
          </AppText>
          {wornCount > 0 ? (
            <AppText colorRole="textSecondary" tabularNumbers testID="piece-edit-worn" variant="caption">
              {copy.wornCount(wornCount)}
            </AppText>
          ) : null}
        </View>
      </View>

      {match.kind === 'similar' ? (
        <Surface style={styles.similar} testID="piece-edit-similar" variant="muted">
          <View style={styles.status}>
            <Icon color={theme.colors.textPrimary} name="hanger" size={20} />
            <AppText variant="bodyStrong">{messages.today.ownershipSimilarLabel}</AppText>
          </View>
          {[
            { key: 'suggested', label: copy.pieceSheetSuggested, family: target.suggestedColorFamily,
              choice: null, uri: null },
            // O8: the user's own piece is drawn in its saved palette colour or pattern.
            { key: 'yours', label: copy.pieceSheetYours, family: match.item.colorFamily,
              choice: match.item.colorChoice ?? null, uri: resolvePhotoUri(match.item.photoRelativePath) },
          ].map(({ key, label, family, choice, uri }) => (
            <View accessible key={key} style={styles.compareRow} testID={`piece-edit-similar-${key}`}>
              <View style={[styles.cardTile, { backgroundColor: theme.colors.surface }]}>
                <GarmentTileArtwork category={target.category} colorChoice={choice} colorFamily={family}
                  garmentTypeId={target.garmentTypeId} glyphSize={CARD_TILE_SIZE * 0.6}
                  height={CARD_TILE_SIZE} photoTestID={`piece-edit-similar-${key}-photo`} photoUri={uri}
                  placeholderTestID={`piece-edit-similar-${key}-placeholder`}
                  silhouetteTestID={`piece-edit-similar-${key}-silhouette`} width={CARD_TILE_SIZE} />
              </View>
              <View style={styles.pieceText}>
                <AppText colorRole="textSecondary" variant="caption">{label}</AppText>
                <AppText variant="bodyStrong">{closetColorName(messages, choice, family)}</AppText>
              </View>
            </View>
          ))}
        </Surface>
      ) : null}

      <View accessibilityRole="radiogroup" style={styles.section}>
        <AppText accessibilityRole="header" variant="bodyStrong">{copy.pieceSheetOwnershipTitle}</AppText>
        <WardrobeOption disabled={busy} label={messages.today.ownershipOwnedAction}
          onPress={() => chooseEntryState('owned')} selected={entryState === 'owned'}
          testID="piece-edit-owned" />
        <WardrobeOption disabled={busy} label={messages.today.ownershipWantedAction}
          onPress={() => chooseEntryState('wanted')} selected={entryState === 'wanted'}
          testID="piece-edit-wanted" />
      </View>

      <View style={styles.section}>
        <AppText accessibilityRole="header" variant="bodyStrong">{copy.colorTitle}</AppText>
        <ClosetColorPalette choice={colorChoice} disabled={busy} onChange={chooseColor} />
      </View>

      <View style={styles.section}>
        <AppText accessibilityRole="header" variant="bodyStrong">{copy.photoTitle}</AppText>
        {photoUri && photoUri !== unreadablePhotoUri ? (
          <Image accessibilityLabel={copy.photoAccessibilityLabel(target.name)} accessible onError={() => setUnreadablePhotoUri(photoUri)} resizeMode="cover"
            source={{ uri: photoUri }} style={[styles.photo, { backgroundColor: theme.colors.surfaceMuted }]}
            testID="piece-edit-photo-preview" />
        ) : null}
        <Button disabled={busy} icon="photo"
          label={photoUri ? copy.changePhotoAction : copy.selectPhotoAction}
          onPress={selectPhoto} testID="piece-edit-photo-select" variant="tonal" />
        {photoUri ? (
          <Button disabled={busy} label={copy.removePhotoAction}
            onPress={() => replacePhoto(record?.photoRelativePath ? { kind: 'remove' } : unchangedWardrobePhoto)}
            testID="piece-edit-photo-remove" variant="plain" />
        ) : null}
        {photoError ? (
          <AppText accessibilityRole="alert" colorRole="dangerInk" variant="caption">{copy.photoError}</AppText>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  head: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  title: { flex: 1, textAlign: 'center' },
  piece: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  hero: { alignItems: 'center', borderRadius: radii.card, height: HERO_SIZE, justifyContent: 'center',
    overflow: 'hidden', width: HERO_SIZE },
  pieceText: { flex: 1, flexShrink: 1, gap: spacing.xs },
  similar: { borderRadius: radii.card, gap: spacing.md, padding: spacing.lg },
  status: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  compareRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  cardTile: { alignItems: 'center', borderRadius: radii.control, height: CARD_TILE_SIZE,
    justifyContent: 'center', overflow: 'hidden', width: CARD_TILE_SIZE },
  section: { gap: spacing.sm },
  photo: { borderRadius: radii.card, height: 180, width: '100%' },
});
