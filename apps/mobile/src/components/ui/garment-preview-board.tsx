import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { fadeTo } from './fade';

import {
  composePieces,
  PieceArtwork,
  useGarmentRoles,
  type ComposedPiece,
  type GarmentBoardPiece,
} from './garment-board/garment-board';
import type { GarmentOutfitPalette } from './index';
import { easierToSee as easierToSeeValues, useEasierToSee } from '@/theme/easier-to-see';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 7: a changed piece slides one rhythm step across while it fades, the old one out to
// the leading side and the new one in from the trailing side. The distance lives here so no
// feature file authors a motion value.
export const PREVIEW_SLIDE = spacing.lg;

// The roles type stays the board renderer's; this board reads it through the hook it calls.
type GarmentRoles = ReturnType<typeof useGarmentRoles> extends ReadonlyMap<string, infer Roles> ? Roles : never;

type Box = Readonly<{ x: number; y: number; w: number; h: number }>;
type Placed = Readonly<{ key: string; piece: ComposedPiece; box: Box; roles: GarmentRoles }>;
type Leaving = Placed & Readonly<{ id: string }>;

// A piece is its drawing in its colours: the roles keep their instance while their colours
// hold, so a recoloured piece is a new piece and slides in rather than repainting in place.
const roleIds = new WeakMap<GarmentRoles, number>();
let nextRoleId = 0;
function roleId(roles: GarmentRoles) {
  let id = roleIds.get(roles);
  if (id === undefined) {
    id = nextRoleId++;
    roleIds.set(roles, id);
  }
  return id;
}

function place(
  pieces: readonly GarmentBoardPiece[],
  width: number,
  large: boolean,
  roles: ReadonlyMap<string, GarmentRoles>,
): readonly Placed[] {
  const result = composePieces(pieces, 'today', large);
  return result.order.flatMap((piece) => {
    const box = result.boxes.get(piece)!;
    const pieceRoles = roles.get(piece.slot);
    if (!pieceRoles) return [];
    return [{
      key: `${piece.slot}:${piece.garmentTypeId}:${roleId(pieceRoles)}`,
      piece,
      roles: pieceRoles,
      box: { x: box.x * width, y: box.y * width, w: box.w * width, h: box.h * width },
    }];
  });
}

type PieceMotion =
  | Readonly<{ kind: 'rest' }>
  | Readonly<{ kind: 'enter'; index: number }>
  | Readonly<{ kind: 'glide'; from: Box }>
  | Readonly<{ kind: 'leave'; onDone: () => void }>;

/**
 * One piece on its own native view. Every motion starts from the value the piece mounts
 * with, so its first frame is already where the motion begins: a change remounts the piece.
 */
function PreviewPiece({ placed, ink, outline, motion }: Readonly<{
  placed: Placed;
  ink: string;
  outline?: number;
  motion: PieceMotion;
}>) {
  const theme = useKuyaraTheme();
  const { box } = placed;
  const from = motion.kind === 'glide' ? motion.from : box;
  const opacity = useSharedValue(motion.kind === 'enter' ? 0 : 1);
  const slide = useSharedValue(motion.kind === 'enter' ? PREVIEW_SLIDE : 0);
  // A glide carries the piece from its last box to this one, centre to centre.
  const glide = useSharedValue(motion.kind === 'glide' ? 1 : 0);
  const dx = from.x + from.w / 2 - (box.x + box.w / 2);
  const dy = from.y + from.h / 2 - (box.y + box.h / 2);
  const scale = from.w / box.w;

  // Once landed, React holds the resting style itself, as `Entrance` does: a re-render after
  // Reanimated dropped its settled props must not commit the start again.
  const [landed, setLanded] = useState(motion.kind === 'rest');
  // The motion is fixed for the life of the piece (a later change mounts a new one), so the
  // effect below runs once; were it re-run (a remount in development), its cleanup cancels
  // and its setup plays the motion again from where the piece is, instead of holding it.
  const [fixed] = useState(motion);

  useEffect(() => {
    const { fast, stagger } = theme.motion;
    const spatial = theme.springs.spatial;
    const land = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(setLanded, true);
    };
    if (fixed.kind === 'enter') {
      const delay = fixed.index * stagger;
      opacity.set(withDelay(delay, fadeTo(1, fast, theme.motion)));
      slide.set(withDelay(delay, withSpring(0, spatial, land)));
    } else if (fixed.kind === 'glide') {
      glide.set(withSpring(0, spatial, land));
    } else if (fixed.kind === 'leave') {
      const { onDone } = fixed;
      slide.set(withSpring(-PREVIEW_SLIDE, spatial));
      opacity.set(fadeTo(0, fast, theme.motion, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(onDone);
      }));
    }
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(slide);
      cancelAnimation(glide);
    };
  }, [fixed, glide, opacity, slide, theme.motion, theme.springs.spatial]);

  const style = useAnimatedStyle(() => {
    const at = glide.get();
    return {
      opacity: opacity.get(),
      transform: [
        { translateX: slide.get() + dx * at },
        { translateY: dy * at },
        { scale: 1 + (scale - 1) * at },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.piece, { height: box.h, left: box.x, top: box.y, width: box.w }, landed ? undefined : style]}>
      <PieceArtwork height={box.h} ink={ink} outline={outline} piece={placed.piece} roles={placed.roles} width={box.w} />
    </Animated.View>
  );
}

type Layers = Readonly<{
  signature: string;
  current: readonly Placed[];
  /** The boxes the pieces rested in before the last change, by key. */
  before: ReadonlyMap<string, Box>;
  leaving: readonly Leaving[];
  changes: number;
}>;

export type GarmentPreviewBoardProps = Readonly<{
  pieces: readonly GarmentBoardPiece[];
  palette: GarmentOutfitPalette;
  width: number;
  /** The stage's height, held while the pieces change so nothing under the board moves. */
  height: number;
  stageColor: string;
  testID?: string;
}>;

/**
 * A decorative board whose pieces answer a choice (Law 7, a state change on something
 * already on screen): a piece the change replaces or recolours slides out as its successor
 * slides in, in reading order a stagger step apart, and a piece the change keeps glides to
 * its new place on the spatial spring. Drawn at rest on mount. It is hidden from the screen
 * reader, so the choice it illustrates is announced by the control that made it, never by
 * the motion.
 */
export function GarmentPreviewBoard({ pieces, palette, width, height, stageColor, testID }: GarmentPreviewBoardProps) {
  const { colors } = useKuyaraTheme();
  const large = useEasierToSee();
  const outline = large ? easierToSeeValues.boardOutline : undefined;
  const placed = place(pieces, width, large, useGarmentRoles(palette, stageColor));
  const signature = `${width}|${large}|${placed.map((entry) => entry.key).join(',')}`;

  const [layers, setLayers] = useState<Layers>({ signature, current: placed, before: new Map(), leaving: [], changes: 0 });
  if (layers.signature !== signature) {
    const kept = new Set(placed.map((entry) => entry.key));
    const changes = layers.changes + 1;
    setLayers({
      signature,
      current: placed,
      before: new Map(layers.current.map((entry) => [entry.key, entry.box])),
      leaving: [
        ...layers.leaving.filter((entry) => !kept.has(entry.key)),
        ...layers.current
          .filter((entry) => !kept.has(entry.key))
          .map((entry) => ({ ...entry, id: `${entry.key}#${changes}` })),
      ],
      changes,
    });
  }

  const removeLeaving = (id: string) =>
    setLayers((value) => ({ ...value, leaving: value.leaving.filter((entry) => entry.id !== id) }));

  // Entering pieces follow one another in reading order.
  const entering = layers.changes === 0 ? [] : layers.current.filter((entry) => !layers.before.has(entry.key));

  const motionOf = (entry: Placed): PieceMotion => {
    const from = layers.before.get(entry.key);
    if (layers.changes === 0) return { kind: 'rest' };
    if (from === undefined) return { kind: 'enter', index: entering.indexOf(entry) };
    const moved = from.x !== entry.box.x || from.y !== entry.box.y || from.w !== entry.box.w;
    return moved ? { kind: 'glide', from } : { kind: 'rest' };
  };

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ height, width }}
      testID={testID}>
      {layers.leaving.map((entry) => (
        <PreviewPiece
          ink={colors.textPrimary}
          key={entry.id}
          motion={{ kind: 'leave', onDone: () => removeLeaving(entry.id) }}
          outline={outline}
          placed={entry}
        />
      ))}
      {layers.current.map((entry) => (
        <PreviewPiece
          ink={colors.textPrimary}
          key={`${entry.key}#${layers.changes}`}
          motion={motionOf(entry)}
          outline={outline}
          placed={entry}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
  },
});
