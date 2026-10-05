import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  CheckRow,
  ClosetSolidStrip,
  GarmentCandidateTile,
  GlassButton,
  Icon,
  ListRow,
  NativeSheet,
  useGarmentRoles,
  type GarmentOutfitPalette,
} from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import {
  canChooseComposePiece,
  isComposePieceChosen,
  type ComposeCatalogGroup,
  type ComposePiece,
  type ComposeSelection,
  type ComposeSlot,
} from '@/features/today/application/compose-selection';
import type { ClosetColorOptionId } from '@/features/wardrobe/domain/closet-color-options';
import { useMessages } from '@/localization/use-messages';
import { layout, spacing } from '@/theme/theme';

type ComposeSheetProps = Readonly<{
  visible: boolean;
  onDismiss: () => void;
  /** The open outfit's pieces, in board order. */
  pieces: readonly ComposePiece[];
  /** "Choose another piece": the catalog by slot. */
  catalog: readonly ComposeCatalogGroup[];
  /** The board's palette, so a piece the board draws, without a chosen colour, shows the board's own. */
  palette: GarmentOutfitPalette;
  selection: ComposeSelection;
  onToggle: (piece: ComposePiece) => void;
  onColor: (slot: ComposeSlot, colorId: ClosetColorOptionId | null) => void;
  onBuild: () => void;
  busy: boolean;
}>;

/**
 * "What do you want to wear today?" (ADR 0026 section 6): the outfit's pieces and any other
 * catalog piece, up to three ticked, one to a slot, each ticked piece with the Closet's 33
 * solids to colour it. "Choose another piece" turns the sheet to the catalog by slot and back.
 */
export function ComposeSheet(props: ComposeSheetProps) {
  const [page, setPage] = useState<'pieces' | 'catalog'>('pieces');
  const dismiss = () => {
    setPage('pieces');
    props.onDismiss();
  };
  return (
    <NativeSheet onDismiss={dismiss} size="large" testID="compose-sheet" visible={props.visible}>
      {page === 'pieces'
        ? <ComposePieces {...props} onChooseAnother={() => setPage('catalog')} onDismiss={dismiss} />
        : (
          <ComposeCatalogPage
            {...props}
            onBack={() => setPage('pieces')}
            onToggle={(piece) => {
              props.onToggle(piece);
              setPage('pieces');
            }}
          />
        )}
    </NativeSheet>
  );
}

function useCompose() {
  const messages = useMessages();
  const copy = messages.today.compose;
  const pieceName = (id: ComposePiece['garmentTypeId']) => messages.catalog[`catalog.garment_type.${id}.name`];
  const colorName = (id: ClosetColorOptionId) => messages.wardrobe.colorOptionNames[id];
  return { messages, copy, pieceName, colorName };
}

const categoryOf = (piece: ComposePiece) => getGarmentType(piece.garmentTypeId)?.structuralCategory ?? 'top';

function ComposePieces({
  busy, onBuild, onChooseAnother, onColor, onDismiss, onToggle, palette, pieces, selection,
}: ComposeSheetProps & Readonly<{ onChooseAnother: () => void }>) {
  const { messages, copy, pieceName, colorName } = useCompose();
  const roles = useGarmentRoles(palette);
  const others = selection.filter((choice) => !pieces.some((piece) => isComposePieceChosen([choice], piece)));

  // A piece keeps the board's colours only where the board draws that very piece in its slot.
  const drawn = (piece: ComposePiece) => palette.pieces.some((one) =>
    one.slot === piece.slot && one.garmentTypeId === piece.garmentTypeId);
  const row = (piece: ComposePiece) => {
    const choice = selection.find((chosen) => isComposePieceChosen([chosen], piece));
    const color = choice?.colorId ?? null;
    const slotName = messages.today.slots[piece.slot];
    const available = canChooseComposePiece(selection, piece);
    return (
      <View key={`${piece.slot}-${piece.garmentTypeId}`}>
        <CheckRow
          accessibilityHint={available ? undefined : copy.limitHint}
          checked={choice !== undefined}
          label={pieceName(piece.garmentTypeId)}
          leading={(
            <GarmentCandidateTile
              category={categoryOf(piece)}
              colorChoice={color === null ? null : { kind: 'option', id: color }}
              garmentTypeId={piece.garmentTypeId}
              roles={color === null && drawn(piece) ? roles.get(piece.slot) : undefined}
              testIDPrefix="compose"
            />
          )}
          onPress={() => onToggle(piece)}
          supportingText={color === null ? slotName : [slotName, colorName(color)]}
          testID={`compose-piece-${piece.slot}-${piece.garmentTypeId}`}
          unavailable={!available}
        />
        {choice ? (
          <View style={styles.strip}>
            <ClosetSolidStrip
              colorName={colorName}
              label={copy.colorLabel[piece.slot]}
              onSelect={(colorId) => onColor(piece.slot, colorId)}
              selectedId={color}
              testID={`compose-color-${piece.slot}`}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <GlassButton kind="close" label={messages.today.dailyStyle.close} onPress={onDismiss} testID="compose-close" />
        <AppText accessibilityRole="header" variant="title">{copy.title}</AppText>
        <AppText colorRole="textSecondary" variant="body">{copy.subtitle}</AppText>
      </View>
      <View style={styles.section}>
        <AppText accessibilityRole="header" variant="bodyStrong">{copy.fromOutfit}</AppText>
        <View>{pieces.map(row)}</View>
      </View>
      <View style={styles.section}>
        {others.length > 0 ? <AppText accessibilityRole="header" variant="bodyStrong">{copy.yourPieces}</AppText> : null}
        <View>
          {others.map(row)}
          <View style={styles.flush}>
            <ListRow
              glyph={({ color, size }) => <Icon color={color} name="plus" size={size} />}
              label={copy.chooseAnother}
              onPress={onChooseAnother}
              testID="compose-choose-another"
            />
          </View>
        </View>
      </View>
      <View style={styles.foot}>
        <Button
          disabled={selection.length === 0}
          label={copy.build}
          loading={busy}
          onPress={onBuild}
          size="large"
          testID="compose-build"
        />
        <AppText
          accessibilityLiveRegion="polite"
          colorRole="textSecondary"
          style={styles.count}
          tabularNumbers
          testID="compose-count"
          variant="caption">
          {copy.chosenCount(selection.length)}
        </AppText>
      </View>
    </ScrollView>
  );
}

function ComposeCatalogPage({
  catalog, onBack, onToggle, selection,
}: ComposeSheetProps & Readonly<{ onBack: () => void }>) {
  const { messages, copy, pieceName } = useCompose();
  return (
    <ScrollView contentContainerStyle={styles.content} testID="compose-catalog">
      <View style={styles.catalogHead}>
        <GlassButton kind="back" label={copy.back} onPress={onBack} testID="compose-catalog-back" />
        <AppText accessibilityRole="header" style={styles.catalogTitle} variant="bodyStrong">{copy.chooseAnother}</AppText>
        <View style={styles.headBalance} />
      </View>
      {catalog.map(({ slot, garmentTypeIds }) => (
        <View key={slot} style={styles.section}>
          <AppText accessibilityRole="header" variant="bodyStrong">{messages.today.slots[slot]}</AppText>
          <View>
            {garmentTypeIds.map((garmentTypeId) => {
              const piece = { slot, garmentTypeId };
              const available = canChooseComposePiece(selection, piece);
              return (
                <CheckRow
                  accessibilityHint={available ? undefined : copy.limitHint}
                  checked={isComposePieceChosen(selection, piece)}
                  key={garmentTypeId}
                  label={pieceName(garmentTypeId)}
                  leading={<GarmentCandidateTile category={categoryOf(piece)} garmentTypeId={garmentTypeId} testIDPrefix="compose-catalog" />}
                  onPress={() => onToggle(piece)}
                  testID={`compose-catalog-${slot}-${garmentTypeId}`}
                  unavailable={!available}
                />
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  head: { alignItems: 'flex-start', gap: spacing.sm },
  section: { gap: spacing.sm },
  // The solids sit under the piece's words, past its tile.
  strip: { marginBottom: spacing.sm, marginStart: layout.minimumTouchTarget + spacing.md },
  // The add row is a list row; its own inset is the sheet's, so it starts flush with the pieces.
  flush: { marginHorizontal: -spacing.lg },
  foot: { gap: spacing.sm, paddingTop: spacing.sm },
  count: { textAlign: 'center' },
  catalogHead: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  catalogTitle: { flex: 1, textAlign: 'center' },
  headBalance: { width: layout.minimumTouchTarget },
});
