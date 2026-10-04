import type { RefObject } from 'react';
import { Link, type Href } from 'expo-router';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText, Crossfade, GarmentBoard, measureGarmentBoardHeight, PressScale, useScreenGutters } from '@/components/ui';
import { ArrivesAfterHandoff, Dimmed } from '@/features/today/presentation/today-motion';
import type { LoadedOutfitPresentation } from '@/features/today/presentation/today-presentation';
import { TourTarget } from '@/features/walkthrough/application/tour-target';
import { spacing } from '@/theme/theme';
import { useEasierToSee } from '@/theme/easier-to-see';
import { OnPlate } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type StageOutfit = Pick<LoadedOutfitPresentation, 'id' | 'boardPieces' | 'palette'> & Readonly<{ replaced: boolean }>;

export type OutfitDetailLink = Readonly<{
  href: (id: string) => Href;
  onPress: (event: Readonly<{ preventDefault: () => void }>) => void;
}>;

/**
 * Today's hero: the outfit's name over its stage, one target that opens its detail. The stage
 * is a cornerless band reaching both screen edges, past the page's gutters, and the board on
 * it is the flat lay (garment-board.md section 10).
 */
export function TodayOutfit({
  carriedOutfitId,
  contentWidth,
  holdRise,
  leavingOutfit,
  onLeavingLeft,
  onOpenOutfitDetail,
  onStageLayout,
  outfitDetailLink,
  primary,
  replaces,
  scrollBy,
  stageAccessibilityLabel,
  stageColor,
  stageRef,
  updating,
}: Readonly<{
  carriedOutfitId: string | null;
  contentWidth: number;
  holdRise: boolean;
  leavingOutfit: StageOutfit | null;
  onLeavingLeft: () => void;
  onOpenOutfitDetail: (id: string) => void;
  onStageLayout: (() => void) | undefined;
  outfitDetailLink: OutfitDetailLink | undefined;
  primary: LoadedOutfitPresentation;
  replaces: boolean;
  scrollBy: (dy: number) => void;
  stageAccessibilityLabel: string;
  stageColor: string;
  stageRef: RefObject<View | null>;
  updating: boolean;
}>) {
  const theme = useKuyaraTheme();
  const easierToSee = useEasierToSee();
  const gutters = useScreenGutters();
  const bandWidth = contentWidth + gutters.left + gutters.right;
  const stageHeight = measureGarmentBoardHeight(primary.boardPieces, bandWidth, 'today', true, easierToSee);

  const primaryStage = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // A zoom source keeps only an object style, as the link below does.
      style={StyleSheet.flatten<ViewStyle>([
        styles.stage,
        {
          backgroundColor: stageColor,
          width: bandWidth,
          // P2: the stage is as tall as its fitted board, never the free space.
          height: stageHeight,
        },
      ])}
      onLayout={onStageLayout}
      ref={stageRef}
      testID="today-stage">
      <OnPlate color={stageColor}>
        {leavingOutfit ? (
          // The leaving board is centred in the new stage's frame, whatever height its
          // own fitted board has.
          <View style={[styles.leavingBoard, { height: stageHeight, width: bandWidth }]}>
            <GarmentBoard
              accessibilityLabel=""
              decorative
              fit
              key={leavingOutfit.id}
              onLeft={onLeavingLeft}
              palette={leavingOutfit.palette}
              pieces={leavingOutfit.boardPieces}
              preset="today"
              stageColor={stageColor}
              testID="today-leaving-board"
              width={bandWidth}
            />
          </View>
        ) : null}
        <GarmentBoard
          accessibilityLabel={stageAccessibilityLabel}
          // ADR 0021 section 10's transition between suggestions: the key is the
          // option identity, so a new recommendation re-mounts the board: the old
          // pieces drop and fade, then the new ones rise, while a refresh that
          // returns the same outfit leaves it still. The rise is never the only
          // signal; the archetype and freshness line also change with it.
          key={primary.id}
          fit
          holdRise={holdRise}
          replaces={replaces}
          palette={primary.palette}
          pieces={primary.boardPieces}
          preset="today"
          // The outfit the runway carried onto the stage has already arrived.
          rise={primary.id !== carriedOutfitId}
          stageColor={stageColor}
          testID={`today-primary-board-${primary.id}`}
          width={bandWidth}
        />
      </OnPlate>
    </View>
  );
  const primaryCard = (
    <PressScale
      accessible
      accessibilityLabel={stageAccessibilityLabel}
      onPress={outfitDetailLink ? undefined : () => onOpenOutfitDetail(primary.id)}
      pressedStyle={{ opacity: theme.interaction.pressedOpacity }}
      // `role` outranks the link's own, so the outfit still reads as a button.
      role="button">
      {/* A re-ask replaces the title with a crossfade rather than a snap. */}
      <ArrivesAfterHandoff index={3}>
        <Crossfade contentKey={primary.title}>
          <AppText
            style={[styles.archetypeName, { marginLeft: gutters.left, marginRight: gutters.right }]}
            testID="today-archetype"
            variant="label">
            {primary.title}
          </AppText>
        </Crossfade>
      </ArrivesAfterHandoff>
      {outfitDetailLink ? <Link.AppleZoom>{primaryStage}</Link.AppleZoom> : primaryStage}
    </PressScale>
  );

  return (
    <Dimmed dimmed={updating} revealKey={primary.id}>
      <TourTarget
        activate={() => onOpenOutfitDetail(primary.id)}
        id="outfit"
        label={stageAccessibilityLabel}
        scrollBy={scrollBy}
        style={[styles.outfitTarget, { marginLeft: -gutters.left, marginRight: -gutters.right }]}>
        {outfitDetailLink ? (
          // S21: on iOS the outfit's detail zooms out of the stage, as an alternative's does.
          <Link asChild href={outfitDetailLink.href(primary.id)} onPress={outfitDetailLink.onPress} push>
            {primaryCard}
          </Link>
        ) : primaryCard}
      </TourTarget>
    </Dimmed>
  );
}

const styles = StyleSheet.create({
  // The gap above the outfit sits outside its tour target, so the tour's ring clears the badge.
  outfitTarget: { marginTop: spacing.md },
  archetypeName: { marginBottom: spacing.sm },
  stage: { overflow: 'hidden' },
  leavingBoard: { justifyContent: 'center', left: 0, position: 'absolute', top: 0 },
});
