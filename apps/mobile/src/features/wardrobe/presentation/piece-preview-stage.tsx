import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  AppText,
  Button,
  GarmentDrawing,
  GarmentTileArtwork,
  useTextScaling,
} from '@/components/ui';
import type {
  ColorFamily,
  GarmentTypeId,
  StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// O10's preview stage: one surface shows the piece. Before a type it holds a viewfinder
// frame around a dashed garment; after a type, the drawing in the chosen colour, updating
// live; after a photo, the photo with a badge naming the type. The photo actions sit on
// the stage and move under it once the label no longer fits beside the other one (the
// largest standard sizes). In-app camera capture is build 16 (P5): only the library.
const STAGE_HEIGHT = 232;
// The drawing keeps the band above the actions free.
const ARTWORK_HEIGHT = 156;
const CORNER_SIZE = 24;
const BADGE_DRAWING_SIZE = 24;
const PLACEHOLDER_TYPE: GarmentTypeId = 't_shirt';

export type PiecePreviewStageProps = Readonly<{
  /** The readable photo to show, or `null` to draw the piece. */
  photoUri: string | null;
  /** Whether the record has a photo, readable or not; it decides Change and Remove. */
  hasPhoto: boolean;
  garmentTypeId: GarmentTypeId | null;
  category: StructuralCategory;
  colorFamily: ColorFamily | null;
  typeLabel: string | null;
  isProcessing: boolean;
  disabled: boolean;
  removeDisabled: boolean;
  onPhotoError: () => void;
  onSelectPhoto: () => void;
  onRemovePhoto: () => void;
}>;

export function PiecePreviewStage({
  category,
  colorFamily,
  disabled,
  garmentTypeId,
  hasPhoto,
  isProcessing,
  onPhotoError,
  onRemovePhoto,
  onSelectPhoto,
  photoUri,
  removeDisabled,
  typeLabel,
}: PiecePreviewStageProps) {
  const copy = useMessages().wardrobe;
  const theme = useKuyaraTheme();
  const { width } = useWindowDimensions();
  const { stacksButtonPair } = useTextScaling();
  const stageWidth = Math.min(width, layout.maxContentWidth) - spacing.lg * 2;
  const cornerColor = theme.colors.iconSecondary;

  const actions = (
    <View style={[styles.actions, stacksButtonPair ? styles.actionsBelow : styles.actionsOnStage]}>
      <Button
        accessibilityLabel={
          isProcessing
            ? copy.photoProcessingLabel
            : hasPhoto
              ? copy.changePhotoAction
              : copy.selectPhotoAction
        }
        disabled={disabled}
        icon="photo"
        label={hasPhoto ? copy.photoChangeLabel : copy.selectPhotoAction}
        loading={isProcessing}
        onPress={onSelectPhoto}
        testID="wardrobe-photo-select-button"
        variant="tonal"
      />
      {hasPhoto ? (
        <Button
          accessibilityLabel={copy.removePhotoAction}
          disabled={removeDisabled}
          icon="trash"
          label={copy.photoRemoveLabel}
          onPress={onRemovePhoto}
          testID="wardrobe-photo-remove-button"
          variant="tonal"
        />
      ) : null}
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <View
        style={[styles.stage, { backgroundColor: theme.colors.surfaceMuted }]}
        testID="wardrobe-preview-stage">
        {photoUri ? (
          <>
            <Image
              accessible
              accessibilityLabel={copy.photoAccessibilityLabel(typeLabel ?? copy.unclassifiedType)}
              onError={onPhotoError}
              resizeMode="cover"
              source={{ uri: photoUri }}
              style={StyleSheet.absoluteFill}
              testID="wardrobe-photo-preview"
            />
            {garmentTypeId && typeLabel ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.badge, { backgroundColor: theme.colors.surface }]}
                testID="wardrobe-photo-type-badge">
                <GarmentDrawing
                  category={category}
                  colorFamily={colorFamily}
                  garmentTypeId={garmentTypeId}
                  size={BADGE_DRAWING_SIZE}
                  testID="wardrobe-photo-type-badge-drawing"
                />
                <AppText variant="label">{typeLabel}</AppText>
              </View>
            ) : null}
          </>
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.artwork, stacksButtonPair && styles.artworkAlone]}>
            <GarmentTileArtwork
              category={garmentTypeId ? category : 'top'}
              colorFamily={garmentTypeId ? colorFamily : null}
              garmentTypeId={garmentTypeId ?? PLACEHOLDER_TYPE}
              glyphSize={ARTWORK_HEIGHT / 2}
              height={stacksButtonPair ? STAGE_HEIGHT : ARTWORK_HEIGHT}
              photoTestID="wardrobe-preview-photo"
              photoUri={null}
              placeholderTestID="wardrobe-preview-glyph"
              silhouetteTestID={garmentTypeId ? 'wardrobe-preview-drawing' : 'wardrobe-preview-placeholder'}
              wanted={garmentTypeId === null}
              width={stageWidth}
            />
            {/* The viewfinder: four corners, the camera visual without a camera. */}
            <View style={[styles.corner, styles.topLeft, { borderColor: cornerColor }]} />
            <View style={[styles.corner, styles.topRight, { borderColor: cornerColor }]} />
            <View style={[styles.corner, styles.bottomLeft, { borderColor: cornerColor }]} />
            <View style={[styles.corner, styles.bottomRight, { borderColor: cornerColor }]} />
          </View>
        )}
        {stacksButtonPair ? null : actions}
      </View>
      {stacksButtonPair ? actions : null}
    </View>
  );
}

const CORNER_INSET = spacing.lg;

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.md,
  },
  stage: {
    borderRadius: radii.card,
    height: STAGE_HEIGHT,
    overflow: 'hidden',
  },
  artwork: {
    height: ARTWORK_HEIGHT,
  },
  artworkAlone: {
    height: STAGE_HEIGHT,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  actionsOnStage: {
    bottom: spacing.md,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  actionsBelow: {
    justifyContent: 'flex-start',
  },
  badge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.md,
  },
  corner: {
    height: CORNER_SIZE,
    position: 'absolute',
    width: CORNER_SIZE,
  },
  topLeft: {
    borderLeftWidth: borderWidths.strong,
    borderTopWidth: borderWidths.strong,
    left: CORNER_INSET,
    top: CORNER_INSET,
  },
  topRight: {
    borderRightWidth: borderWidths.strong,
    borderTopWidth: borderWidths.strong,
    right: CORNER_INSET,
    top: CORNER_INSET,
  },
  bottomLeft: {
    borderBottomWidth: borderWidths.strong,
    borderLeftWidth: borderWidths.strong,
    bottom: spacing.sm,
    left: CORNER_INSET,
  },
  bottomRight: {
    borderBottomWidth: borderWidths.strong,
    borderRightWidth: borderWidths.strong,
    bottom: spacing.sm,
    right: CORNER_INSET,
  },
});
