import type { IconName } from '@/components/ui';
import type { PieceOwnershipMatch } from '@/features/wardrobe/domain/garment-type-ownership';
import type { getMessages } from '@/localization/messages';

type TodayCopy = ReturnType<typeof getMessages>['today'];

export type PieceOwnershipMarker = Readonly<{
  icon: IconName;
  /** The board's colour role the marker is drawn in. */
  ink: 'brandAccent' | 'iconSecondary';
  /** The state the piece's board element speaks after its name. */
  spoken: (copy: TodayCopy) => string;
}>;

/**
 * ADR 0026 section 3: each name button under the detail board carries one marker for how the
 * piece meets the Closet. Only the exact match takes the accent; the rest share one quiet ink.
 */
export const pieceOwnershipMarkers: Readonly<Record<PieceOwnershipMatch['kind'], PieceOwnershipMarker>> = {
  owned: { icon: 'checkCircle', ink: 'brandAccent', spoken: (copy) => copy.ownershipOnBoard.owned },
  similar: { icon: 'hanger', ink: 'iconSecondary', spoken: (copy) => copy.ownershipOnBoard.similar },
  wanted: { icon: 'heartFilled', ink: 'iconSecondary', spoken: (copy) => copy.ownershipOnBoard.wanted },
  none: { icon: 'circle', ink: 'iconSecondary', spoken: (copy) => copy.ownershipUntrackedLabel },
};
