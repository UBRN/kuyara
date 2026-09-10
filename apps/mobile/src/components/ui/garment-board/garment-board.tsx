import Svg, { G, Path } from 'react-native-svg';

import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { useKuyaraTheme } from '@/theme/theme-context';

import { composeGarmentBoard, detailPreset, todayPreset } from './compose-garment-board';
import { resolveGarmentSilhouette } from './garment-silhouette-map';

export { composeGarmentBoard } from './compose-garment-board';

export type GarmentBoardPiece = Readonly<{
  slot: OutfitSlot;
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
}>;

type Preset = 'today' | 'detail';

export type GarmentBoardLayoutBox = Readonly<{
  slot: OutfitSlot;
  garmentTypeId: GarmentTypeId;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type GarmentBoardLayout = Readonly<{
  height: number;
  boxes: readonly GarmentBoardLayoutBox[];
}>;

type GarmentBoardProps = Readonly<{
  pieces: readonly GarmentBoardPiece[];
  width: number;
  preset: Preset;
  accessibilityLabel: string;
  decorative?: boolean;
  stageColor?: string;
  testID?: string;
}>;

function composePieces(pieces: readonly GarmentBoardPiece[], preset: Preset) {
  return composeGarmentBoard(pieces.map((piece) => ({
    ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category),
  })), preset === 'today' ? todayPreset : detailPreset);
}

export function layoutGarmentBoard(
  pieces: readonly GarmentBoardPiece[],
  width: number,
  preset: Preset,
): GarmentBoardLayout {
  const result = composePieces(pieces, preset);

  return {
    height: width * result.stageHeight,
    boxes: result.order.map((piece) => {
      const box = result.boxes.get(piece)!;
      return {
        slot: piece.slot,
        garmentTypeId: piece.garmentTypeId,
        x: box.x * width,
        y: box.y * width,
        width: box.w * width,
        height: box.h * width,
      };
    }),
  };
}

export function measureGarmentBoardHeight(pieces: readonly GarmentBoardPiece[], width: number, preset: Preset) {
  return width * composePieces(pieces, preset).stageHeight;
}

export function GarmentBoard({
  pieces,
  width,
  preset,
  accessibilityLabel,
  decorative = false,
  stageColor,
  testID,
}: GarmentBoardProps) {
  const { colors } = useKuyaraTheme();
  const result = composePieces(pieces, preset);
  const fillColor = stageColor ?? colors.stage;

  return (
    <Svg
      accessible={decorative ? undefined : true}
      accessibilityElementsHidden={decorative || undefined}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      importantForAccessibility={decorative ? 'no-hide-descendants' : undefined}
      testID={testID}
      width={width}
      height={width * result.stageHeight}
    >
      {result.order.map((piece) => {
        const box = result.boxes.get(piece)!;
        const kx = box.w / piece.bounds.width;
        const ky = box.h / piece.bounds.height;
        return (
          <G
            key={piece.slot}
            transform={`translate(${(box.x - piece.bounds.x * kx) * width} ${(box.y - piece.bounds.y * ky) * width}) scale(${kx * width} ${ky * width})`}
          >
            {piece.paths.map((path) => (
              <Path
                key={path.d}
                d={path.d}
                fill={path.filled ? fillColor : 'none'}
                stroke={colors.textPrimary}
                strokeWidth={1.9}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </G>
        );
      })}
    </Svg>
  );
}
