import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ClosetRack,
  Crossfade,
  Entrance,
  GarmentDrawing,
  GarmentPreviewBoard,
  Icon,
  measureGarmentBoardHeight,
  RACK_ASPECT,
  RollingText,
  type GarmentBoardPiece,
  type GarmentOutfitPalette,
  type RackPiece,
} from '@/components/ui';
import type { AccountIntroPageId } from '@/features/account/application/account-intro-pages';
import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';
import { useEasierToSee } from '@/theme/easier-to-see';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/**
 * The sign-in page's scenes: each benefit drawn with the app's own pictures (the Profile
 * rack, Today's board, the Closet's tiles and garment drawings) on fixed sample pieces, no
 * mascot, body, storage symbol or new metaphor. A scene is decorative and hidden from the
 * screen reader: its page's words carry the benefit. It plays from the start each time its
 * page becomes the shown one (the pager remounts it) and rests on its last frame.
 */
export type IntroSceneProps = Readonly<{ active: boolean; width: number; height: number }>;

/** Counts up to `limit`, one step per `step` milliseconds, while `active`. */
function useBeats(active: boolean, step: number, limit: number) {
  const [beats, setBeats] = useState(0);
  useEffect(() => {
    if (!active || beats >= limit) return;
    const timer = setTimeout(() => setBeats((value) => value + 1), step);
    return () => clearTimeout(timer);
  }, [active, beats, limit, step]);
  return beats;
}

type Piece = GarmentBoardPiece;
const outfit = (
  outer: Piece['garmentTypeId'] | null,
  top: Piece['garmentTypeId'],
  bottom: Piece['garmentTypeId'],
  footwear: Piece['garmentTypeId'],
): readonly Piece[] => [
  ...(outer ? [{ slot: 'outer_layer', garmentTypeId: outer, category: 'outerwear' } as const] : []),
  { slot: 'primary_top', garmentTypeId: top, category: 'top' },
  { slot: 'bottom', garmentTypeId: bottom, category: 'bottom' },
  { slot: 'footwear', garmentTypeId: footwear, category: 'footwear' },
];
const paletteOf = (id: string, pieces: readonly Piece[]): GarmentOutfitPalette => ({
  optionId: `account-intro-${id}`,
  pieces: pieces.map(({ garmentTypeId, slot }) => ({ garmentTypeId, slot })),
  temperatureC: 14,
  condition: 'cloudy',
  isNight: false,
  formality: 'casual',
});

/** The widest board of `pieces` that fits `room` high, at most `maxWidth` wide. */
function fittedBoardWidth(pieces: readonly (readonly Piece[])[], maxWidth: number, room: number, large: boolean) {
  const tallest = Math.max(...pieces.map((outfitPieces) => measureGarmentBoardHeight(outfitPieces, maxWidth, 'today', false, large)));
  return tallest > room ? (maxWidth * room) / tallest : maxWidth;
}

const rackPieces: readonly RackPiece[] = ([
  ['light_jacket', 'outerwear', 'blue'],
  ['trench_coat', 'outerwear', 'beige'],
  ['shirt', 'top', 'white'],
  ['sweater', 'top', 'green'],
  ['t_shirt', 'top', 'red'],
  ['jeans', 'bottom', 'blue'],
  ['skirt', 'bottom', 'black'],
  ['sneakers', 'footwear', 'white'],
  ['loafers', 'footwear', 'brown'],
] as const).map(([garmentTypeId, category, colorFamily], index) => ({
  id: `account-intro-rack-${index}`,
  garmentTypeId,
  category,
  colorFamily,
  wanted: false,
  addedAt: index,
}));

/** "Your Closet comes back": the bare rack, then its pieces are back on their hooks. */
function ClosetScene({ active, width, height }: IntroSceneProps) {
  const theme = useKuyaraTheme();
  const filled = useBeats(active, theme.motion.ambient.calm, 1) > 0;
  return (
    <View style={[styles.centre, { height }]}>
      <Crossfade contentKey={filled ? 'filled' : 'empty'} style={{ width: Math.min(width, height * RACK_ASPECT) }}>
        <ClosetRack pieces={filled ? rackPieces : null} />
      </Crossfade>
    </View>
  );
}

type DrawnPiece = readonly [Piece['garmentTypeId'], Piece['category'], ColorFamily];
const historyDays: readonly (readonly DrawnPiece[])[] = [
  [['light_jacket', 'outerwear', 'blue'], ['jeans', 'bottom', 'blue'], ['sneakers', 'footwear', 'white']],
  [['blouse', 'top', 'white'], ['skirt', 'bottom', 'black'], ['ballet_flats', 'footwear', 'black']],
  [['sweater', 'top', 'green'], ['trousers', 'bottom', 'beige'], ['loafers', 'footwear', 'brown']],
];
// Each worn day lands a little across the one before it, like cards dealt onto a pile.
const historyCardPose = [
  { rotate: '-8deg', across: -0.36, down: spacing.sm },
  { rotate: '6deg', across: 0.36, down: spacing.xs },
  { rotate: '-2deg', across: 0, down: 0 },
] as const;

/** "Your History stays with you": three worn days are dealt onto a pile, one after another. */
function HistoryScene({ active, width, height }: IntroSceneProps) {
  const theme = useKuyaraTheme();
  const dealt = useBeats(active, theme.motion.ambient.intense, historyDays.length);
  const cardHeight = height - spacing.lg;
  const cardWidth = Math.min(width * 0.4, cardHeight * 0.7);
  const drawing = (cardHeight - spacing.md * 2 - spacing.xs * 2 - 16) / 2.6;
  return (
    <View style={[styles.centre, { height }]}>
      {historyDays.map((pieces, index) => {
        const pose = historyCardPose[index];
        return (
          <Entrance key={index} style={styles.cardSlot} waiting={dealt <= index}>
            <View
              style={[
                styles.card,
                theme.elevation.raised,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  height: cardHeight,
                  transform: [{ translateX: pose.across * cardWidth }, { translateY: pose.down }, { rotate: pose.rotate }],
                  width: cardWidth,
                },
              ]}>
              <Icon color={theme.colors.iconSecondary} name="calendarCheck" size={16} />
              {pieces.map(([garmentTypeId, category, colorFamily]) => (
                <GarmentDrawing
                  category={category}
                  colorFamily={colorFamily}
                  garmentTypeId={garmentTypeId}
                  key={garmentTypeId}
                  size={category === 'footwear' ? drawing * 0.6 : drawing}
                  testID={`account-intro-day-${index}-${garmentTypeId}`}
                />
              ))}
            </View>
          </Entrance>
        );
      })}
    </View>
  );
}

const stylistOutfits = [
  outfit('light_jacket', 't_shirt', 'jeans', 'sneakers'),
  outfit('trench_coat', 'shirt', 'trousers', 'loafers'),
  outfit('blazer', 'blouse', 'skirt', 'ballet_flats'),
  outfit(null, 'sweater', 'jeans', 'ankle_boots'),
  outfit('coat', 'turtleneck', 'trousers', 'closed_shoes'),
  outfit('rain_jacket', 'long_sleeve_t_shirt', 'jeans', 'sneakers'),
] as const;
const EVERYONE_ASKS = 5;
const MEMBER_ASKS = 10;

/**
 * "More stylist asks": Today's board answers again and again, and with each answer one more
 * of the member's ten marks fills and the count rolls past the five everyone has.
 */
function StylistScene({ active, width, height }: IntroSceneProps) {
  const theme = useKuyaraTheme();
  const large = useEasierToSee();
  const asked = useBeats(active, theme.motion.ambient.moderate, MEMBER_ASKS - EVERYONE_ASKS);
  const count = EVERYONE_ASKS + asked;
  const counterHeight = theme.layout.minimumTouchTarget;
  const stageHeight = height - counterHeight - spacing.md;
  const boardWidth = fittedBoardWidth(stylistOutfits, width - spacing.lg * 2, stageHeight - spacing.md * 2, large);
  const tallest = Math.max(...stylistOutfits.map((pieces) => measureGarmentBoardHeight(pieces, boardWidth, 'today', false, large)));
  const pieces = stylistOutfits[asked % stylistOutfits.length];
  const stage = theme.atmosphere.veiledDay;

  return (
    <View style={[styles.stack, { height }]}>
      <View style={[styles.centre, styles.stage, { backgroundColor: stage, height: stageHeight }]}>
        <GarmentPreviewBoard
          height={tallest}
          palette={paletteOf(`stylist-${asked % stylistOutfits.length}`, pieces)}
          pieces={pieces}
          stageColor={stage}
          width={boardWidth}
        />
      </View>
      <View style={[styles.counter, { height: counterHeight }]}>
        <RollingText style={styles.count} variant="title">{String(count)}</RollingText>
        <View style={styles.marks}>
          {Array.from({ length: MEMBER_ASKS }, (_, index) => (
            <View
              key={index}
              style={[
                styles.mark,
                {
                  backgroundColor: index >= count
                    ? theme.colors.borderSubtle
                    : index < EVERYONE_ASKS ? theme.colors.iconSecondary : theme.colors.brandAccent,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const closetTiles: readonly DrawnPiece[] = [
  ['trench_coat', 'outerwear', 'beige'],
  ['shirt', 'top', 'white'],
  ['jeans', 'bottom', 'blue'],
  ['sneakers', 'footwear', 'white'],
];

/** "Same Closet on two phones": the second phone's Closet fills with the first one's pieces. */
function DevicesScene({ active, width, height }: IntroSceneProps) {
  const theme = useKuyaraTheme();
  const synced = useBeats(active, theme.motion.ambient.intense, closetTiles.length);
  const glyph = 24;
  const phoneHeight = height - spacing.sm;
  const phoneWidth = Math.min(phoneHeight * 0.52, (width - glyph - spacing.md * 2) / 2);
  const tile = (phoneWidth - spacing.sm * 3 - borderWidths.strong * 2) / 2;
  const phone = (shown: number) => (
    <View style={[styles.phone, { borderColor: theme.colors.iconSecondary, height: phoneHeight, width: phoneWidth }]}>
      {closetTiles.map(([garmentTypeId, category, colorFamily], index) => (
        <Entrance index={index} key={garmentTypeId} waiting={shown <= index}>
          <View style={[styles.tile, styles.centre, { backgroundColor: theme.colors.surfaceMuted, height: tile, width: tile }]}>
            <GarmentDrawing
              category={category}
              colorFamily={colorFamily}
              garmentTypeId={garmentTypeId}
              size={tile - spacing.md}
              testID={`account-intro-phone-${garmentTypeId}`}
            />
          </View>
        </Entrance>
      ))}
    </View>
  );
  return (
    <View style={[styles.row, { height }]}>
      {phone(closetTiles.length)}
      <Icon color={theme.colors.iconSecondary} name="sync" size={glyph} />
      {phone(synced)}
    </View>
  );
}

const photoPieces = [
  ['sweater', 'top', 'pink'],
  ['jeans', 'bottom', 'blue'],
  ['ankle_boots', 'footwear', 'brown'],
] as const;

/** "Photo backup, coming soon": the Closet's photo tiles arrive one by one. */
function PhotosScene({ active, width, height }: IntroSceneProps) {
  const theme = useKuyaraTheme();
  const shown = useBeats(active, theme.motion.ambient.intense, photoPieces.length);
  const tile = Math.min(height - spacing.lg, (width - spacing.md * (photoPieces.length - 1)) / photoPieces.length);
  return (
    <View style={[styles.row, { height }]}>
      {photoPieces.map(([garmentTypeId, category, colorFamily], index) => (
        <Entrance index={index} key={garmentTypeId} waiting={shown <= index}>
          <View style={[styles.tile, styles.centre, { backgroundColor: theme.colors.surfaceMuted, height: tile, width: tile }]}>
            <GarmentDrawing
              category={category}
              colorFamily={colorFamily}
              garmentTypeId={garmentTypeId}
              size={tile - spacing.xl}
              testID={`account-intro-photo-${garmentTypeId}`}
            />
            <View style={styles.photoMark}>
              <Icon color={theme.colors.iconSecondary} name="photo" size={16} />
            </View>
          </View>
        </Entrance>
      ))}
    </View>
  );
}

export const accountIntroScenes: Readonly<Record<AccountIntroPageId, (props: IntroSceneProps) => React.ReactElement>> = {
  closet: ClosetScene,
  history: HistoryScene,
  askAgain: StylistScene,
  devices: DevicesScene,
  photos: PhotosScene,
};

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  stack: { gap: spacing.md },
  cardSlot: { position: 'absolute' },
  card: {
    alignItems: 'center',
    borderRadius: radii.card,
    gap: spacing.xs,
    justifyContent: 'center',
    padding: spacing.md,
  },
  stage: { borderRadius: radii.card, overflow: 'hidden' },
  counter: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  count: { fontVariant: ['tabular-nums'], minWidth: spacing.xl, textAlign: 'right' },
  marks: { flexDirection: 'row', gap: spacing.xs },
  mark: { borderRadius: radii.pill, height: spacing.sm, width: spacing.sm },
  phone: {
    alignContent: 'flex-start',
    borderRadius: radii.card,
    borderWidth: borderWidths.strong,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.sm,
    paddingTop: spacing.lg,
  },
  tile: { borderRadius: radii.control, overflow: 'hidden' },
  photoMark: { position: 'absolute', right: spacing.xs, top: spacing.xs },
});
