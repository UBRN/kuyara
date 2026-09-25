import { memo, useId, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { borderWidths, interaction, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { AppText } from '../app-text';
import {
  layoutClosetRack,
  RACK_HEIGHT,
  RACK_HOOKS,
  RACK_LOWER_RAIL_Y,
  RACK_UPPER_RAIL_Y,
  RACK_WIDTH,
  rackSilhouette,
  type RackLayoutPiece,
  type RackPiece,
} from './closet-rack-layout';
import { garmentLevelOfDetail, GarmentPainting, WANTED_OUTLINE_DASH } from './garment-painting';
import { garmentFillRoles, toGarmentOklch, type GarmentRoles } from './garment-palette';
import { resolveGarmentTileFill } from './garment-render-fills';

export type { RackPiece } from './closet-rack-layout';

// A side-on wanted piece keeps the dashed edge at slice size.
const SLICE_DASH = '2.6 2';

type PaintedPiece = Readonly<{ roles: GarmentRoles; multicolor: boolean }>;

export type ClosetRackProps = Readonly<{
  /** The Closet's pieces; `null` draws the bare rack (loading, error). */
  pieces: readonly RackPiece[] | null;
  /** The rack is one button when it can open the Closet; its label names the pieces. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}>;

/**
 * O9's open rack (ADR 0028 section 1): an open rail and shelves drawn in kuyara ink with flat
 * fills, no gradient, no alpha and no body (ADR 0021), filled with the user's own pieces in
 * their recorded colour families. The drawing is one SVG in a fixed frame scaled to the
 * content column; it is memoised on its pieces and appearance, and the fill rule caps the
 * full drawings at three face-out pieces per rail, one per hook and one row of shoes, so a
 * large Closet adds side-on slices (one path each), not garment drawings.
 */
export const ClosetRack = memo(function ClosetRack({
  accessibilityHint,
  accessibilityLabel,
  onPress,
  pieces,
  testID,
}: ClosetRackProps) {
  const { colors, colorScheme } = useKuyaraTheme();
  const gradientId = `closet-rack-multicolor-${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const ink = colors.textPrimary;

  const { layout, painted, multicolorStops } = useMemo(() => {
    const byId = new Map<string, PaintedPiece>();
    // Cast, not annotated: an annotation would narrow to `null` past the callback below.
    let stops = null as readonly [string, string] | null;
    const withLightness: RackLayoutPiece[] | null = pieces?.map((piece) => {
      // Personal records keep their colour-family fill, never an outfit palette (O9).
      const fill = resolveGarmentTileFill({ colorFamily: piece.colorFamily, plane: colors.background, colors, colorScheme });
      const main = typeof fill === 'string' ? fill : fill[0];
      if (typeof fill !== 'string') stops = fill;
      byId.set(piece.id, {
        roles: garmentFillRoles(rackSilhouette(piece).id, main, colorScheme),
        multicolor: typeof fill !== 'string',
      });
      return { ...piece, lightness: toGarmentOklch(main).L };
    }) ?? null;
    return { layout: layoutClosetRack(withLightness), painted: byId, multicolorStops: stops };
  }, [colorScheme, colors, pieces]);

  const multicolorPaint = `url(#${gradientId})`;
  const structureFill = colors.surface;

  const drawing = (
    <Svg
      accessibilityElementsHidden
      accessible={false}
      height="100%"
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${RACK_WIDTH} ${RACK_HEIGHT}`}
      width="100%">
      {multicolorStops ? (
        <Defs>
          <LinearGradient id={gradientId} x1={0} y1={0} x2={1} y2={1}>
            <Stop offset={0} stopColor={multicolorStops[0]} />
            <Stop offset={1} stopColor={multicolorStops[1]} />
          </LinearGradient>
        </Defs>
      ) : null}
      {/* The rack: two uprights carry the top bar with its hooks, the two rails and the
          bottom shelf on castors. The only filled structure is the bar, the shelf and the
          castors, carried by their ink outline rather than by a fill step (Law 3). */}
      <Path d="M14 8 L14 222 M347 8 L347 222" fill="none" stroke={ink} strokeLinecap="round" strokeWidth={1.9} />
      <Rect fill={structureFill} height={7} rx={2} stroke={ink} strokeWidth={1.9} width={345} x={8} y={3} />
      <Path d={`M10 ${RACK_UPPER_RAIL_Y} L351 ${RACK_UPPER_RAIL_Y}`} stroke={ink} strokeLinecap="round" strokeWidth={2.4} />
      <Path d={`M14 ${RACK_LOWER_RAIL_Y} L347 ${RACK_LOWER_RAIL_Y}`} stroke={ink} strokeLinecap="round" strokeWidth={2.2} />
      <Rect fill={structureFill} height={8} rx={2.5} stroke={ink} strokeWidth={1.9} width={345} x={8} y={220} />
      <Circle cx={24} cy={233} fill={structureFill} r={4.5} stroke={ink} strokeWidth={1.6} />
      <Circle cx={337} cy={233} fill={structureFill} r={4.5} stroke={ink} strokeWidth={1.6} />
      {RACK_HOOKS.map((hook) => (
        <Circle cx={hook.x} cy={hook.y} fill={ink} key={`${hook.x}`} r={1.9} />
      ))}
      {layout.marks.map((mark, index) => {
        if (mark.kind === 'hanger') {
          const stroke = mark.empty ? colors.textSecondary : ink;
          return (
            <G key={`h${index}`}>
              <Path d={mark.d} fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.1} />
              {mark.jaws.map((jaw) => (
                <Rect fill={stroke} height={5} key={`${jaw.x}`} rx={0.8} width={3} x={jaw.x} y={jaw.y} />
              ))}
            </G>
          );
        }
        const paint = painted.get(mark.piece.id);
        if (!paint) return null;
        if (mark.kind === 'slice') {
          return (
            <G key={mark.piece.id}>
              <Path d={mark.hook} fill="none" stroke={ink} strokeLinecap="round" strokeWidth={1} />
              <Path d={mark.body} fill={paint.multicolor ? multicolorPaint : paint.roles.main} />
              <Path d={mark.shade} fill={paint.roles.shade} />
              <Path
                d={mark.body}
                fill="none"
                stroke={ink}
                strokeDasharray={mark.piece.wanted ? SLICE_DASH : undefined}
                strokeLinejoin="round"
                strokeWidth={1.1}
              />
            </G>
          );
        }
        const { bounds } = mark.silhouette;
        return (
          <G key={mark.piece.id} transform={`translate(${mark.x} ${mark.y}) scale(${mark.scale})`}>
            <GarmentPainting
              ink={ink}
              lod={garmentLevelOfDetail(Math.max(bounds.width, bounds.height) * mark.scale)}
              mainPaint={paint.multicolor ? multicolorPaint : undefined}
              outline={mark.outline}
              outlineDash={mark.piece.wanted ? WANTED_OUTLINE_DASH : undefined}
              roles={paint.roles}
              scale={mark.scale}
              silhouette={mark.silhouette}
            />
          </G>
        );
      })}
    </Svg>
  );

  // "+N" is text over the drawing, not SVG text, so it takes the caption role and scales.
  const tags = layout.tags.map((tag) => (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      key={`${tag.right}-${tag.y}`}
      style={[
        styles.tag,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderDefined,
          right: `${((RACK_WIDTH - tag.right) / RACK_WIDTH) * 100}%`,
        },
        tag.fromBottom
          ? { bottom: `${((RACK_HEIGHT - tag.y) / RACK_HEIGHT) * 100}%` }
          : { top: `${(tag.y / RACK_HEIGHT) * 100}%` },
      ]}
      testID={testID ? `${testID}-overflow` : undefined}>
      <AppText tabularNumbers variant="caption">{`+${tag.count}`}</AppText>
    </View>
  ));

  if (!onPress) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.frame}
        testID={testID}>
        {drawing}
        {tags}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.frame, pressed && styles.pressed]}
      testID={testID}>
      {drawing}
      {tags}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  frame: {
    aspectRatio: RACK_WIDTH / RACK_HEIGHT,
    width: '100%',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  tag: {
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    paddingHorizontal: spacing.sm,
    position: 'absolute',
  },
});
