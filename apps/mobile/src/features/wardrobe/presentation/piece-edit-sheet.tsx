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
import {
  colorFamilies,
  type ColorFamily,
  type GarmentTypeId,
  type StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  unchangedWardrobePhoto,
  type WardrobePhotoChange,
} from '@/features/wardrobe/application/wardrobe-photo-manager';
import type { StagedWardrobePhoto } from '@/features/wardrobe/data/wardrobe-photo-adapters';
import type { PieceOwnershipMatch } from '@/features/wardrobe/domain/garment-type-ownership';
import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';
import { ColorSwatch } from '@/features/wardrobe/presentation/wardrobe-item-form-screen';
import { WardrobeOption } from '@/features/wardrobe/presentation/wardrobe-option';
import { useMessages } from '@/localization/use-messages';
import { radii, spacing } from '@/theme/theme';
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
        <PieceEditForm
          key={`${target.garmentTypeId}:${target.match.kind === 'none' ? '' : target.match.item.id}`}
          onDismiss={onDismiss}
          target={target}
          {...rest}
        />
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
  const [entryState, setEntryState] = useState<WardrobeEntryState | null>(record?.entryState ?? null);
  const [colorFamily, setColorFamily] = useState<ColorFamily | null>(
    record ? record.colorFamily : target.suggestedColorFamily,
  );
  const [photoChange, setPhotoChange] = useState<WardrobePhotoChange>(unchangedWardrobePhoto);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [photoError, setPhotoError] = useState(false);
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
  const colorLabel = (family: ColorFamily | null) => family
    ? messages.catalog[`catalog.color_family.${family}`] : copy.colorUnspecified;

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
    void onSave({ entryState, colorFamily, photoChange })
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
        <GlassButton kind="close" label={messages.today.dailyStyle.close} onPress={onDismiss}
          testID="piece-edit-close" />
        <AppText accessibilityRole="header" style={styles.title} variant="bodyStrong">
          {record ? copy.pieceSheetEditTitle : copy.pieceSheetAddTitle}
        </AppText>
        <Button disabled={!entryState} label={copy.pieceSheetDone} loading={busy} onPress={save}
          size="small" testID="piece-edit-done" />
      </View>

      <View style={styles.piece}>
        <View style={[styles.hero, { backgroundColor: theme.colors.surfaceMuted }]}>
          <GarmentTileArtwork category={target.category} colorFamily={colorFamily}
            garmentTypeId={target.garmentTypeId} glyphSize={HERO_SIZE * 0.6} height={HERO_SIZE}
            photoTestID="piece-edit-photo" photoUri={photoUri}
            placeholderTestID="piece-edit-placeholder" silhouetteTestID="piece-edit-silhouette"
            width={HERO_SIZE} />
        </View>
        <View style={styles.pieceText}>
          <AppText variant="title">{target.name}</AppText>
          <AppText colorRole="textSecondary">{target.slot}</AppText>
          <AppText testID="piece-edit-color-name" variant="bodyStrong">{colorLabel(colorFamily)}</AppText>
        </View>
      </View>

      {match.kind === 'similar' ? (
        <Surface style={styles.similar} testID="piece-edit-similar" variant="muted">
          <View style={styles.status}>
            <Icon color={theme.colors.textPrimary} name="hanger" size={20} />
            <AppText variant="bodyStrong">{messages.today.ownershipSimilarLabel}</AppText>
          </View>
          {[
            { key: 'suggested', label: copy.pieceSheetSuggested, family: target.suggestedColorFamily, uri: null },
            { key: 'yours', label: copy.pieceSheetYours, family: match.item.colorFamily,
              uri: resolvePhotoUri(match.item.photoRelativePath) },
          ].map(({ key, label, family, uri }) => (
            <View accessible key={key} style={styles.compareRow} testID={`piece-edit-similar-${key}`}>
              <View style={[styles.cardTile, { backgroundColor: theme.colors.surface }]}>
                <GarmentTileArtwork category={target.category} colorFamily={family}
                  garmentTypeId={target.garmentTypeId} glyphSize={CARD_TILE_SIZE * 0.6}
                  height={CARD_TILE_SIZE} photoTestID={`piece-edit-similar-${key}-photo`} photoUri={uri}
                  placeholderTestID={`piece-edit-similar-${key}-placeholder`}
                  silhouetteTestID={`piece-edit-similar-${key}-silhouette`} width={CARD_TILE_SIZE} />
              </View>
              <View style={styles.pieceText}>
                <AppText colorRole="textSecondary" variant="caption">{label}</AppText>
                <AppText variant="bodyStrong">{colorLabel(family)}</AppText>
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
        <View accessibilityRole="radiogroup" style={styles.swatches}>
          {colorFamilies.map((family) => (
            <ColorSwatch colorFamily={family} disabled={busy} key={family} label={colorLabel(family)}
              onPress={() => setColorFamily(family)} selected={colorFamily === family} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText accessibilityRole="header" variant="bodyStrong">{copy.photoTitle}</AppText>
        {photoUri ? (
          <Image accessibilityLabel={copy.photoAccessibilityLabel(target.name)} resizeMode="cover"
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

      {saveError ? (
        <AppText accessibilityRole="alert" colorRole="dangerInk" testID="piece-edit-error">
          {record ? copy.updateError : copy.createError}
        </AppText>
      ) : null}
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
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { borderRadius: radii.card, height: 180, width: '100%' },
});
