import { StyleSheet, View } from 'react-native';

import {
  AppText,
  GarmentDrawing,
  GarmentTileArtwork,
  Icon,
  PressScale,
  useTextScaling,
} from '@/components/ui';
import type {
  ColorFamily,
  GarmentTypeId,
  StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, interaction, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// O10: "I own it" and "I want it" as two illustrated choices that draw the piece being
// added, so they fill in as the user chooses. Owned hangs it on a closet rail between two
// other hangers; wanted carries a wish tag. The label glyph is the hanger or the heart,
// which fills when wanted is chosen. Selection is a 2 point `brandAccent` ring and a check,
// never a fill (Law 1): the category chip below may hold the viewport's one accent fill.
// Before a type is chosen the piece is a dashed placeholder.
const SCENE_HEIGHT = 76;
const PIECE_SIZE = 52;
const SIDE_PIECE_WIDTH = 22;
const SIDE_PIECE_HEIGHT = 34;
const HANGER_SIZE = 16;
const TAG_WIDTH = 22;
const TAG_HEIGHT = 30;
// Law 6: 20 beside the `bodyStrong` label.
const LABEL_GLYPH_SIZE = 20;
const PLACEHOLDER_TYPE: GarmentTypeId = 't_shirt';

type Piece = Readonly<{
  garmentTypeId: GarmentTypeId | null;
  category: StructuralCategory;
  colorFamily: ColorFamily | null;
}>;

function PieceDrawing({ category, colorFamily, garmentTypeId }: Piece) {
  return garmentTypeId ? (
    <GarmentDrawing
      category={category}
      colorFamily={colorFamily}
      garmentTypeId={garmentTypeId}
      size={PIECE_SIZE}
      testID="wardrobe-ownership-piece"
    />
  ) : (
    <GarmentTileArtwork
      category="top"
      colorFamily={null}
      garmentTypeId={PLACEHOLDER_TYPE}
      glyphSize={PIECE_SIZE}
      height={PIECE_SIZE}
      photoTestID="wardrobe-ownership-placeholder-photo"
      photoUri={null}
      placeholderTestID="wardrobe-ownership-placeholder-glyph"
      silhouetteTestID="wardrobe-ownership-placeholder"
      wanted
      width={PIECE_SIZE}
    />
  );
}

function RailScene(piece: Piece) {
  const theme = useKuyaraTheme();
  const side = (
    <View style={styles.hung}>
      <Icon color={theme.colors.iconSecondary} name="hanger" size={HANGER_SIZE} />
      <View
        style={[
          styles.sidePiece,
          { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.borderSubtle },
        ]}
      />
    </View>
  );
  return (
    <View style={styles.scene}>
      <View style={[styles.rail, { backgroundColor: theme.colors.iconSecondary }]} />
      {side}
      <View style={styles.hung}>
        <Icon color={theme.colors.iconPrimary} name="hanger" size={HANGER_SIZE} />
        <PieceDrawing {...piece} />
      </View>
      {side}
    </View>
  );
}

function WishScene(piece: Piece) {
  const theme = useKuyaraTheme();
  return (
    <View style={styles.scene}>
      <PieceDrawing {...piece} />
      <View
        style={[
          styles.tag,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.textPrimary },
        ]}>
        <Icon color={theme.colors.textPrimary} name="heartFilled" size={14} />
      </View>
    </View>
  );
}

export function OwnershipChoice({
  disabled,
  entryState,
  onChange,
  piece,
}: Readonly<{
  disabled: boolean;
  entryState: WardrobeEntryState;
  onChange: (next: WardrobeEntryState) => void;
  piece: Piece;
}>) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const { usesStackedLayout } = useTextScaling();
  const options = [
    { state: 'owned', label: messages.today.ownershipOwnedAction },
    { state: 'wanted', label: messages.today.ownershipWantedAction },
  ] as const;

  return (
    <View
      accessibilityLabel={messages.wardrobe.entryStateTitle}
      accessibilityRole="radiogroup"
      style={[styles.options, usesStackedLayout && styles.stacked]}>
      {options.map(({ label, state }) => {
        const selected = entryState === state;
        const glyph = state === 'owned' ? 'hanger' : selected ? 'heartFilled' : 'heart';
        return (
          <PressScale
            accessibilityLabel={label}
            accessibilityRole="radio"
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
            key={state}
            onPress={() => onChange(state)}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: selected ? theme.colors.brandAccent : theme.colors.borderDefined,
              },
              // The ring thickens inward, so selecting never moves the content.
              selected ? styles.selectedCard : styles.restingCard,
              disabled && styles.disabled,
            ]}
            testID={`wardrobe-entry-state-${state}`}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {state === 'owned' ? <RailScene {...piece} /> : <WishScene {...piece} />}
            </View>
            <View style={styles.label}>
              <Icon color={theme.colors.iconPrimary} name={glyph} size={LABEL_GLYPH_SIZE} />
              <AppText style={styles.labelText} variant="bodyStrong">
                {label}
              </AppText>
            </View>
            {selected ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.mark}
                testID={`wardrobe-entry-state-${state}-mark`}>
                <Icon color={theme.colors.brandAccent} name="checkCircle" size={LABEL_GLYPH_SIZE} />
              </View>
            ) : null}
          </PressScale>
        );
      })}
    </View>
  );
}

// Law 3: a card confirms with radius 20, a 16 inset and the fill step together.
const CARD_INSET = spacing.lg;

const styles = StyleSheet.create({
  options: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stacked: {
    flexDirection: 'column',
  },
  card: {
    borderRadius: radii.card,
    flex: 1,
    gap: spacing.sm,
  },
  restingCard: {
    borderWidth: borderWidths.subtle,
    padding: CARD_INSET + borderWidths.strong - borderWidths.subtle,
  },
  selectedCard: {
    borderWidth: borderWidths.strong,
    padding: CARD_INSET,
  },
  scene: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    height: SCENE_HEIGHT,
    justifyContent: 'center',
  },
  rail: {
    height: borderWidths.strong,
    left: spacing.sm,
    position: 'absolute',
    right: spacing.sm,
    top: HANGER_SIZE / 4,
  },
  hung: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  sidePiece: {
    borderRadius: radii.compact,
    borderWidth: borderWidths.subtle,
    height: SIDE_PIECE_HEIGHT,
    width: SIDE_PIECE_WIDTH,
  },
  tag: {
    alignItems: 'center',
    borderRadius: radii.compact / 2,
    borderWidth: 1.5,
    height: TAG_HEIGHT,
    justifyContent: 'center',
    marginBottom: PIECE_SIZE / 2,
    transform: [{ rotate: '12deg' }],
    width: TAG_WIDTH,
  },
  label: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  labelText: {
    flexShrink: 1,
  },
  mark: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
  },
  disabled: {
    opacity: interaction.disabledOpacity,
  },
});
