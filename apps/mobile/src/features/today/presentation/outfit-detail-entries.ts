import { garmentColorFamiliesBySlot, type GarmentOutfitPalette } from '@/garment-art';
import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';
import type { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { matchPieceOwnership } from '@/features/wardrobe/domain/garment-type-ownership';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { PieceSheetTarget } from '@/features/wardrobe/presentation/piece-edit-sheet';
import type { getMessages } from '@/localization/messages';

// A piece row's thumbnail, and the smaller drawing of the user's own similar piece.
export const ROW_TILE_SIZE = 56;
export const OWN_TILE_SIZE = 32;

export type TodayCopy = ReturnType<typeof getMessages>['today'];
export type DetailPresentation = Extract<ReturnType<typeof createTodayPresentation>, { kind: 'loaded' }>;
export type DetailSuggestion = DetailPresentation['suggestions'][number];
export type PieceEntry = ReturnType<typeof pieceEntries>[number];

/**
 * O7: each piece against the Closet, by type and the colour family the outfit draws it in.
 * The board, the captions and the rows all read this one list.
 */
export function pieceEntries(
  suggestion: DetailSuggestion,
  palette: GarmentOutfitPalette,
  wardrobeItems: readonly WardrobeItem[],
  copy: TodayCopy,
) {
  const colorFamilies = garmentColorFamiliesBySlot(palette);
  return suggestion.pieces.flatMap((piece) => {
    const boardPiece = suggestion.boardPieces.find(
      ({ garmentTypeId }) => garmentTypeId === piece.garmentTypeId,
    );
    if (!boardPiece) return [];
    const colorFamily: ColorFamily | null = colorFamilies.get(boardPiece.slot) ?? null;
    const match = matchPieceOwnership(piece.garmentTypeId, colorFamily, wardrobeItems);
    const status = match.kind === 'owned'
      ? copy.ownershipOwnedAction
      : match.kind === 'similar'
        ? copy.ownershipSimilarLabel
        : match.kind === 'wanted' ? copy.ownershipWantedAction : null;
    const target: PieceSheetTarget = {
      garmentTypeId: piece.garmentTypeId,
      category: piece.category,
      name: piece.item,
      slot: piece.slot,
      suggestedColorFamily: colorFamily,
      match,
    };
    return [{
      piece,
      slot: boardPiece.slot,
      match,
      status,
      target,
      // Assistive tech hears the state of every piece, the untracked default included.
      spokenLabel: `${piece.item}, ${piece.slot}, ${status ?? copy.ownershipUntrackedLabel}`,
    }];
  });
}
