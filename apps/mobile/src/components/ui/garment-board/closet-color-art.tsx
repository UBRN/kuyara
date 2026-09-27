import { useId, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';

import {
  findClosetColorOption,
  type ClosetColorChoice,
} from '@/features/wardrobe/domain/closet-color-options';
import type { ThemeColorScheme } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { Icon } from '../icon';
import { garmentFillForAppearance, garmentPaletteContrast } from './garment-palette';

// A Closet piece's own colour as art: one of the 33 palette solids, a custom colour from the
// system picker, or one of the 14 fixed two-colour and pattern options, drawn the way the
// Phase 5 revision 2 mockup draws them. Content colour, never a theme role. It is
// drawn only on the piece edit surfaces and the outfit detail's "Yours" preview; the Closet
// grid, the Profile rack and the outfit board keep the family fill (O8).

type PatternKind =
  | 'split'
  | 'block'
  | 'stripes'
  | 'gingham'
  | 'tartan'
  | 'houndstooth'
  | 'dots'
  | 'floral'
  | 'leopard';

export type ClosetColorPaint =
  | Readonly<{ kind: 'solid'; hex: string }>
  | Readonly<{ kind: PatternKind; hexes: readonly string[]; weight: number }>;

// How each fixed option is drawn; the colours are the domain's. A stripe's weight is the
// share of its repeat the coloured band takes.
const optionArt: Readonly<Record<string, Readonly<{ kind: PatternKind; weight?: number }>>> = {
  white_and_black: { kind: 'split' },
  white_and_blue: { kind: 'split' },
  navy_and_camel: { kind: 'block' },
  blue_stripes: { kind: 'stripes' },
  navy_stripes: { kind: 'stripes', weight: 0.42 },
  black_stripes: { kind: 'stripes', weight: 0.3 },
  red_stripes: { kind: 'stripes' },
  blue_gingham: { kind: 'gingham' },
  red_gingham: { kind: 'gingham' },
  tartan: { kind: 'tartan' },
  houndstooth: { kind: 'houndstooth' },
  polka_dots: { kind: 'dots' },
  floral: { kind: 'floral' },
  leopard: { kind: 'leopard' },
};
const DEFAULT_STRIPE_WEIGHT = 0.38;

/**
 * The art for a stored colour choice in the given appearance, or `null` when there is none
 * or the stored option is unknown to this build: the caller then draws the family fill.
 */
export function closetColorPaint(
  choice: ClosetColorChoice | null | undefined,
  colorScheme: ThemeColorScheme,
): ClosetColorPaint | null {
  if (!choice) return null;
  const dark = colorScheme === 'dark';
  if (choice.kind === 'custom') return { kind: 'solid', hex: garmentFillForAppearance(choice.hex, dark) };
  const option = findClosetColorOption(choice.id);
  if (!option) return null;
  if (option.kind === 'solid') return { kind: 'solid', hex: garmentFillForAppearance(option.hex, dark) };
  const art = optionArt[option.id];
  if (!art) return null;
  return {
    kind: art.kind,
    hexes: option.hexes.map((hex) => garmentFillForAppearance(hex, dark)),
    weight: art.weight ?? DEFAULT_STRIPE_WEIGHT,
  };
}

/** The colour a paint's drawing tones derive from: the solid, or a pattern's base. */
export function closetPaintBase(paint: ClosetColorPaint): string {
  return paint.kind === 'solid' ? paint.hex : paint.hexes[0];
}

/**
 * One option's repeat as an SVG pattern in the referencing drawing's own units: `unit` is the
 * repeat and `box` the drawing's extent. The split and block options cover it once and divide
 * `frame`, the drawn garment's own bounds, so both colours land on the garment whatever its
 * shape or size (O8).
 */
export function ClosetPatternDef({
  id,
  paint,
  unit,
  box,
  frame = { x: 0, y: 0, width: box, height: box },
}: Readonly<{
  id: string;
  paint: Exclude<ClosetColorPaint, { kind: 'solid' }>;
  unit: number;
  box: number;
  frame?: Readonly<{ x: number; y: number; width: number; height: number }>;
}>) {
  const [a, b, c = b, d = c] = paint.hexes;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const open = (size: number, children: ReactNode) => (
    <Pattern height={size} id={id} patternUnits="userSpaceOnUse" width={size} x={0} y={0}>
      {children}
    </Pattern>
  );
  const u = unit;
  switch (paint.kind) {
    case 'split':
      return open(box, <>
        <Rect fill={a} height={box} width={box} />
        <Path d={`M${right} ${frame.y} L${right} ${bottom} L${frame.x} ${bottom} Z`} fill={b} />
      </>);
    case 'block':
      return open(box, <>
        <Rect fill={a} height={box} width={box} />
        <Rect fill={b} height={box} width={box} y={frame.y + frame.height * 0.56} />
      </>);
    case 'stripes':
      return open(u, <>
        <Rect fill={a} height={u} width={u} />
        <Rect fill={b} height={u * paint.weight} width={u} />
      </>);
    case 'gingham':
      return open(u, <>
        <Rect fill={a} height={u} width={u} />
        <Rect fill={b} fillOpacity={0.45} height={u / 2} width={u} />
        <Rect fill={b} fillOpacity={0.45} height={u} width={u / 2} />
        <Rect fill={b} fillOpacity={0.6} height={u / 2} width={u / 2} />
      </>);
    case 'tartan': {
      const v = u * 2;
      return open(v, <>
        <Rect fill={a} height={v} width={v} />
        <Rect fill={b} fillOpacity={0.75} height={v * 0.38} width={v} y={v * 0.1} />
        <Rect fill={b} fillOpacity={0.6} height={v} width={v * 0.38} x={v * 0.1} />
        <Rect fill={c} height={v * 0.06} width={v} y={v * 0.72} />
        <Rect fill={c} height={v} width={v * 0.06} x={v * 0.72} />
      </>);
    }
    case 'houndstooth':
      return open(u, <>
        <Rect fill={a} height={u} width={u} />
        <Path
          d={`M0 0 H${u / 2} V${u / 2} H0 Z M${u / 2} ${u / 2} L${u} 0 V${u / 4} L${u * 0.75} ${u / 2} Z `
            + `M0 ${u / 2} L${u / 4} ${u / 2} L0 ${u * 0.75} Z M${u / 2} ${u / 2} L${u / 2} ${u} L${u * 0.25} ${u} Z`}
          fill={b}
        />
      </>);
    case 'dots':
      return open(u, <>
        <Rect fill={a} height={u} width={u} />
        <Circle cx={u / 4} cy={u / 4} fill={b} r={u * 0.13} />
        <Circle cx={u * 0.75} cy={u * 0.75} fill={b} r={u * 0.13} />
      </>);
    case 'floral': {
      // Blush ground, tomato petals, mustard centres, sage leaves.
      const v = u * 1.6;
      const flower = (x: number, y: number, r: number, key: string) => (
        <>
          {[0, 1, 2, 3, 4].map((index) => {
            const angle = (index * 72 * Math.PI) / 180;
            return (
              <Circle cx={x + Math.cos(angle) * r} cy={y + Math.sin(angle) * r} fill={b}
                key={`${key}-${index}`} r={r * 0.62} />
            );
          })}
          <Circle cx={x} cy={y} fill={c} key={`${key}-centre`} r={r * 0.45} />
        </>
      );
      return open(v, <>
        <Rect fill={a} height={v} width={v} />
        {flower(v * 0.28, v * 0.3, v * 0.1, 'first')}
        {flower(v * 0.78, v * 0.76, v * 0.08, 'second')}
        <Ellipse cx={v * 0.62} cy={v * 0.22} fill={d} rx={v * 0.09} ry={v * 0.04}
          transform={`rotate(-30 ${v * 0.62} ${v * 0.22})`} />
        <Ellipse cx={v * 0.2} cy={v * 0.78} fill={d} rx={v * 0.09} ry={v * 0.04}
          transform={`rotate(35 ${v * 0.2} ${v * 0.78})`} />
      </>);
    }
    case 'leopard': {
      // Sand ground, chocolate rosettes, camel centres.
      const v = u * 1.6;
      const spot = (x: number, y: number, r: number, key: string) => (
        <>
          <Ellipse cx={x} cy={y} fill="none" key={`${key}-ring`} rx={r} ry={r * 0.75} stroke={b}
            strokeDasharray={[r * 1.2, r * 0.5]} strokeWidth={r * 0.5} />
          <Ellipse cx={x} cy={y} fill={c} key={`${key}-centre`} rx={r * 0.4} ry={r * 0.3} />
        </>
      );
      return open(v, <>
        <Rect fill={a} height={v} width={v} />
        {spot(v * 0.27, v * 0.28, v * 0.13, 'a')}
        {spot(v * 0.75, v * 0.7, v * 0.12, 'b')}
        {spot(v * 0.78, v * 0.18, v * 0.08, 'c')}
        {spot(v * 0.2, v * 0.8, v * 0.08, 'd')}
      </>);
    }
  }
}

// The disc is drawn in a 16-unit box, as the mockup's swatch is.
const DISC_BOX = 16;
const DISC_REPEAT = 5.2;

/**
 * A colour choice as a round swatch, for the palette grids and the small "Yours" dot. It is
 * decorative: the control or the row around it carries the name. A selected disc carries a
 * check in whichever of the ink and the ground reads better on it, so selection is not
 * carried by the ring's colour alone.
 */
export function ClosetColorDisc({
  choice,
  selected = false,
  size,
  testID,
}: Readonly<{
  choice: ClosetColorChoice;
  selected?: boolean;
  size: number;
  testID?: string;
}>) {
  const { colors, colorScheme } = useKuyaraTheme();
  const patternId = `closet-color-${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const paint = closetColorPaint(choice, colorScheme);
  if (!paint) return null;
  const base = closetPaintBase(paint);
  const checkInk = garmentPaletteContrast(colors.textPrimary, base) >= garmentPaletteContrast(colors.background, base)
    ? colors.textPrimary
    : colors.background;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.disc, { height: size, width: size }]}
      testID={testID}>
      <Svg height={size} viewBox={`0 0 ${DISC_BOX} ${DISC_BOX}`} width={size}>
        {paint.kind === 'solid' ? null : (
          <Defs>
            <ClosetPatternDef box={DISC_BOX} id={patternId} paint={paint} unit={DISC_REPEAT} />
          </Defs>
        )}
        <Circle
          cx={DISC_BOX / 2}
          cy={DISC_BOX / 2}
          fill={paint.kind === 'solid' ? paint.hex : `url(#${patternId})`}
          r={7.6}
          stroke={colors.borderDefined}
          strokeWidth={0.5}
        />
      </Svg>
      {selected ? (
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.check} testID={testID ? `${testID}-check` : undefined}>
            <Icon color={checkInk} name="check" size={16} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// The system colour well's own mark in the mockup: a multicolour ring around the
// stage colour with a plus. Its hues depict the system picker; they are not a palette or a
// theme role.
const WELL_RING_STOPS = ['#E5484D', '#F5A524', '#F5D90A', '#46A758', '#3E9BD6', '#6E56CF', '#E5484D'] as const;

/** The empty colour well ("More colors"), drawn at a swatch disc's size. Decorative. */
export function ColorWellMark({ size, testID }: Readonly<{ size: number; testID?: string }>) {
  const { colors } = useKuyaraTheme();
  const gradientId = `color-well-${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.disc, { height: size, width: size }]}
      testID={testID}>
      <Svg height={size} viewBox={`0 0 ${DISC_BOX} ${DISC_BOX}`} width={size}>
        <Defs>
          <LinearGradient id={gradientId} x1={0} x2={1} y1={0} y2={1}>
            {WELL_RING_STOPS.map((stop, index) => (
              <Stop key={index} offset={index / (WELL_RING_STOPS.length - 1)} stopColor={stop} />
            ))}
          </LinearGradient>
        </Defs>
        <Circle cx={8} cy={8} fill="none" r={7.2} stroke={`url(#${gradientId})`} strokeWidth={1.6} />
        <Circle cx={8} cy={8} fill={colors.stage} r={4.8} />
        <Path d="M8 5.8 V10.2 M5.8 8 H10.2" stroke={colors.textPrimary} strokeLinecap="round" strokeWidth={1.1} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
