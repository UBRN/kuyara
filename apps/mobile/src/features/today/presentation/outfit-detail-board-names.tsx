import type { Dispatch, SetStateAction } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Entrance, garmentBoardDressingOrder, Icon } from '@/components/ui';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import type { DetailSuggestion, PieceEntry } from '@/features/today/presentation/outfit-detail-entries';
import { pieceOwnershipMarkers } from '@/features/today/presentation/piece-ownership-marker';
import { borderWidths, layout, type plateTheme, radii, spacing } from '@/theme/theme';

// A name button's Closet marker, at Law 6's caption step.
const NAME_MARK_SIZE = 16;

export type NameRect = Readonly<{ x: number; y: number; w: number; h: number }>;
type NameRects = Readonly<Partial<Record<OutfitSlot, NameRect>>>;
type BoardColors = ReturnType<typeof plateTheme>['colors'];

/**
 * The hint names the gesture until the first change; the strip takes its place while a
 * piece is enlarged. It rises in once, with the screen; after a change it only returns
 * with the board's own fade.
 */
export function OutfitDetailBoardHint({ everChanged, onBoard, plateShown, text }: Readonly<{
  everChanged: boolean;
  onBoard: BoardColors;
  plateShown: boolean;
  text: string;
}>) {
  const boardHintLine = (
    <View style={styles.boardLine}>
      <Icon color={onBoard.iconSecondary} name="info" size={16} />
      <AppText colorRole="textSecondary" style={styles.flexText} variant="caption">
        {text}
      </AppText>
    </View>
  );
  return (
    <View style={plateShown && styles.hintOnPlate} testID="outfit-detail-edit-hint">
      {everChanged ? boardHintLine : <Entrance>{boardHintLine}</Entrance>}
    </View>
  );
}

/**
 * Drawn for the eye: each piece's adjustable element on the board speaks its name and its
 * Closet state, and the board's own tap reads the buttons' rectangles.
 */
export function OutfitDetailNameRow({
  boardPieces,
  entries,
  nameRects,
  nameRowHeight,
  onBoard,
  plateShown,
  setNameRects,
  setNameRowHeight,
  top,
}: Readonly<{
  boardPieces: DetailSuggestion['boardPieces'];
  entries: readonly PieceEntry[];
  nameRects: NameRects;
  nameRowHeight: number | null;
  onBoard: BoardColors;
  plateShown: boolean;
  setNameRects: Dispatch<SetStateAction<NameRects>>;
  setNameRowHeight: Dispatch<SetStateAction<number | null>>;
  top: number;
}>) {
  // The names read in the order the outfit is put on, the order the board stacks its pieces.
  const namedPieces = [...boardPieces].sort((a, b) =>
    garmentBoardDressingOrder.indexOf(a.slot) - garmentBoardDressingOrder.indexOf(b.slot));
  const renderName = ({ slot, garmentTypeId }: DetailSuggestion['boardPieces'][number]) => {
    const entry = entries.find(({ piece }) => piece.garmentTypeId === garmentTypeId);
    if (!entry) return null;
    const marker = pieceOwnershipMarkers[entry.match.kind];
    return (
      <View
        key={`name-${slot}`}
        onLayout={({ nativeEvent: { layout: box } }) => {
          const rect = nameRects[slot];
          if (rect && rect.x === box.x && rect.y === box.y && rect.w === box.width && rect.h === box.height) return;
          setNameRects((current) => ({ ...current, [slot]: { x: box.x, y: box.y, w: box.width, h: box.height } }));
        }}
        style={[styles.nameButton, { borderColor: onBoard.borderDefined }]}
        testID={`outfit-detail-name-${garmentTypeId}`}>
        <AppText style={styles.nameLabel} variant="label">{entry.piece.item}</AppText>
        {/* One marker per Closet state; the piece's board element and its row say it in words. */}
        <View testID={`outfit-detail-name-marker-${garmentTypeId}-${entry.match.kind}`}>
          <Icon color={onBoard[marker.ink]} name={marker.icon} size={NAME_MARK_SIZE} />
        </View>
      </View>
    );
  };
  return (
    <View
      onLayout={({ nativeEvent }) => {
        if (nativeEvent.layout.height !== nameRowHeight) setNameRowHeight(nativeEvent.layout.height);
      }}
      style={[styles.nameRow, plateShown && styles.nameRowOnPlate, { top }]}
      testID="outfit-detail-names">
      {namedPieces.map(renderName)}
    </View>
  );
}

const styles = StyleSheet.create({
  nameRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  // The row stretches its buttons to one height per line; a button centres its label and marker.
  nameButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  nameLabel: {
    flexShrink: 1,
    textAlign: 'center',
  },
  nameRowOnPlate: {
    paddingHorizontal: spacing.md,
  },
  hintOnPlate: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  boardLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  flexText: {
    flex: 1,
    flexShrink: 1,
  },
});
