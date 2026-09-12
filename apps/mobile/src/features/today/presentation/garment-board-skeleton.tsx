import { Image } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { layoutGarmentBoard } from '@/components/ui';
import { resolveGarmentArtwork } from '@/components/ui/garment-slot-glyph';
import { useAmbientPulse } from '@/components/ui/use-ambient-pulse';
import { useKuyaraTheme } from '@/theme/theme-context';

// A board can never draw more than these five: ADR 0025's sixth slot, `one_piece`,
// replaces the top and the bottom rather than joining them. The garment type ids only
// give ADR 0025's rule the aspect ratios it measures boxes with; what is drawn in each
// box is the generic structural-category shape, because the wait knows where the pieces
// will sit and not yet which pieces they are.
const SKELETON_PIECES = [
  { slot: 'primary_top', garmentTypeId: 't_shirt', category: 'top' },
  { slot: 'bottom', garmentTypeId: 'trousers', category: 'bottom' },
  { slot: 'outer_layer', garmentTypeId: 'light_jacket', category: 'outerwear' },
  { slot: 'mid_layer', garmentTypeId: 'sweater', category: 'top' },
  { slot: 'footwear', garmentTypeId: 'sneakers', category: 'footwear' },
] as const;

// Where the still placeholders sit under Reduce Motion, and the crest of the breath
// otherwise: a placeholder stays quieter than the drawn pieces it stands in for.
export const PLACEHOLDER_REST = 0.7;

export type GarmentBoardSkeletonProps = Readonly<{
  width: number;
  testID?: string;
}>;

export function GarmentBoardSkeleton({ width, testID }: GarmentBoardSkeletonProps) {
  const theme = useKuyaraTheme();
  const { boxes, height } = layoutGarmentBoard(SKELETON_PIECES, width, 'today');
  const pulse = useAmbientPulse();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.get() * PLACEHOLDER_REST,
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ height, width }, animatedStyle]}
      testID={testID}>
      {boxes.map((box) => (
        <Image
          key={box.slot}
          resizeMode="contain"
          source={resolveGarmentArtwork(
            SKELETON_PIECES.find((piece) => piece.slot === box.slot)!.category,
            Math.max(box.width, box.height),
          )}
          style={{
            height: box.height,
            left: box.x,
            position: 'absolute',
            tintColor: theme.colors.iconSecondary,
            top: box.y,
            width: box.width,
          }}
        />
      ))}
    </Animated.View>
  );
}
