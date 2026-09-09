import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  GarmentBoard,
  Icon,
  layoutGarmentBoard,
  Pill,
  Screen,
  haptics,
  useTextScaling,
} from '@/components/ui';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  createDetailCaptionLayout,
  createTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import type { TodayScreenState } from '@/features/today/model';
import type { GarmentOwnershipState } from '@/features/wardrobe/domain/garment-type-ownership';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type OutfitDetailScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  suggestionId: string | undefined;
  onBack: () => void;
  backLabel: string;
  ownershipByGarmentType: Readonly<Record<string, GarmentOwnershipState>>;
  onSetOwnership: (garmentTypeId: GarmentTypeId, next: 'owned' | 'wanted') => void;
}>;

export function OutfitDetailScreen({
  state,
  language,
  suggestionId,
  onBack,
  backLabel,
  ownershipByGarmentType,
  onSetOwnership,
}: OutfitDetailScreenProps) {
  const theme = useKuyaraTheme();
  const { fontScale, usesStackedLayout } = useTextScaling();
  const [contentWidth, setContentWidth] = useState(0);
  const [captionHeights, setCaptionHeights] = useState<Readonly<Record<string, number>>>({});
  const copy = getMessages(language).today;
  const presentation = createTodayPresentation(state, language);
  const suggestion =
    presentation.kind === 'loaded'
      ? presentation.suggestions.find(({ id }) => id === suggestionId)
      : undefined;
  const boardLayout = suggestion
    ? layoutGarmentBoard(suggestion.boardPieces, contentWidth, 'detail')
    : { height: 0, boxes: [] };
  const initialCaptionHeight = theme.typography.body.lineHeight * fontScale * 2;
  const plateHeight = Math.max(
    boardLayout.height,
    ...boardLayout.boxes.map((box) => {
      const caption = createDetailCaptionLayout(box, contentWidth);
      return caption.top + (captionHeights[box.slot] ?? initialCaptionHeight);
    }),
  );

  if (presentation.kind !== 'loaded' || !suggestion) {
    return (
      <Screen testID="outfit-detail-screen">
        <Button label={backLabel} onPress={onBack} variant="quiet" />
        <AppText accessibilityRole="header" variant="titleLarge">
          {presentation.kind === 'loaded' ? presentation.copy.title : presentation.title}
        </AppText>
      </Screen>
    );
  }

  // Law 8: the owned/wanted pair mirrors the wardrobe toggle, a selection change under the finger.
  const setOwnership = (garmentTypeId: GarmentTypeId, next: 'owned' | 'wanted') => {
    haptics.selection();
    onSetOwnership(garmentTypeId, next);
  };

  const ownedCount = suggestion.pieces.filter(
    ({ garmentTypeId }) => ownershipByGarmentType[garmentTypeId] === 'owned',
  ).length;

  return (
    <Screen testID="outfit-detail-screen">
      <View
        onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width)}
        testID="outfit-detail-content">
        <Button label={backLabel} onPress={onBack} style={styles.backButton} variant="quiet" />

        <View
          style={[styles.headingGroup, usesStackedLayout && styles.stackedHeadingGroup]}
          testID="outfit-detail-heading-group">
          <AppText accessibilityRole="header" variant="title">
            {suggestion.title}
          </AppText>
          {suggestion.emphasis ? <Pill label={suggestion.emphasis} tone="accent-filled" /> : null}
        </View>

        <View
          style={[styles.boardPlate, { height: plateHeight, width: contentWidth }]}
          testID="outfit-detail-board-plate">
          <GarmentBoard
            accessibilityLabel={suggestion.boardAccessibilityLabel}
            decorative
            pieces={suggestion.boardPieces}
            preset="detail"
            testID="outfit-detail-board"
            width={contentWidth}
          />
          {boardLayout.boxes.map((box) => {
            const piece = suggestion.pieces.find(
              ({ garmentTypeId }) => garmentTypeId === box.garmentTypeId,
            );
            if (!piece) return null;

            const ownership = ownershipByGarmentType[piece.garmentTypeId] ?? 'none';
            // Owned and wanted are the exceptions worth a mark; an untracked garment is the
            // default and stays visually quiet so the two tracked states keep their weight.
            // Assistive tech still hears the state, so the silence is never ambiguous.
            const ownershipLabel = ownership === 'owned'
              ? copy.ownershipOwnedLabel
              : ownership === 'wanted'
                ? copy.ownershipWantedLabel
                : null;
            const spokenOwnership = ownershipLabel ?? copy.ownershipUntrackedLabel;
            const captionLayout = createDetailCaptionLayout(box, contentWidth);

            return (
              <View
                accessible
                accessibilityLabel={`${piece.item}, ${piece.slot}, ${spokenOwnership}`}
                key={box.slot}
                onLayout={({ nativeEvent }) => {
                  const height = nativeEvent.layout.height;
                  if (captionHeights[box.slot] === height) return;
                  setCaptionHeights((current) => ({ ...current, [box.slot]: height }));
                }}
                style={[styles.caption, captionLayout]}
                testID={`outfit-detail-caption-${piece.garmentTypeId}`}>
                <AppText style={styles.captionText} variant="bodyStrong">
                  {piece.item}
                </AppText>
                <View style={styles.captionMeta}>
                  <AppText colorRole="textSecondary" style={styles.captionText} variant="caption">
                    {piece.slot}
                  </AppText>
                  {ownershipLabel ? (
                    <View style={styles.ownershipState}>
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={[
                          styles.ownershipMarker,
                          ownership === 'owned'
                            ? {
                                backgroundColor: theme.colors.brandAccent,
                                borderColor: theme.colors.brandAccent,
                              }
                            : { borderColor: theme.colors.brandAccent },
                        ]}
                        testID={`outfit-detail-ownership-marker-${piece.garmentTypeId}`}
                      />
                      <AppText colorRole="textSecondary" variant="caption">
                        {ownershipLabel}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.ownershipSummary} testID="outfit-detail-ownership-summary">
          <Icon color={theme.colors.brandAccent} name="info" size={16} />
          <AppText colorRole="textSecondary" style={styles.ownershipSummaryText} variant="caption">
            {copy.ownershipSummary({ owned: ownedCount, total: suggestion.pieces.length })}
          </AppText>
        </View>

        <View style={styles.ownershipControlList}>
          {suggestion.pieces.map(({ garmentTypeId, item }) => {
            const owned = ownershipByGarmentType[garmentTypeId] === 'owned';
            const wanted = ownershipByGarmentType[garmentTypeId] === 'wanted';

            return (
              <View key={garmentTypeId} style={styles.ownershipControlGroup}>
                <AppText colorRole="textSecondary" variant="caption">{item}</AppText>
                <View
                  style={[styles.ownershipActions, usesStackedLayout && styles.stackedOwnershipActions]}
                  testID={`outfit-detail-ownership-actions-${garmentTypeId}`}>
                  <Button
                    accessibilityLabel={`${item}, ${copy.ownershipOwnedAction}`}
                    accessibilityState={{ selected: owned }}
                    label={copy.ownershipOwnedAction}
                    onPress={owned ? undefined : () => setOwnership(garmentTypeId, 'owned')}
                    style={styles.ownershipAction}
                    testID={`outfit-detail-ownership-${garmentTypeId}-owned`}
                    variant={owned ? 'primary' : 'secondary'}
                  />
                  <Button
                    accessibilityLabel={`${item}, ${copy.ownershipWantedAction}`}
                    accessibilityState={{ selected: wanted }}
                    label={copy.ownershipWantedAction}
                    onPress={wanted ? undefined : () => setOwnership(garmentTypeId, 'wanted')}
                    style={styles.ownershipAction}
                    testID={`outfit-detail-ownership-${garmentTypeId}-wanted`}
                    variant={wanted ? 'primary' : 'secondary'}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {suggestion.requirementRows.length > 0 ? (
          <View style={styles.section}>
            <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
              {presentation.copy.reasonsHeading}
            </AppText>
            <View style={styles.reasonList}>
              {suggestion.requirementRows.map((row) => (
                <View key={row.id} style={styles.reasonRow}>
                  <Icon
                    color={row.kind === 'tradeoff' ? theme.colors.warningInk : theme.colors.brandAccent}
                    name={row.kind === 'tradeoff' ? 'warning' : 'checkCircle'}
                    size={20}
                  />
                  <AppText colorRole="textSecondary" style={styles.reasonText} variant="body">
                    {row.text}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View
          accessible
          accessibilityLabel={[
            presentation.weather.temperature,
            presentation.weather.condition,
            presentation.weather.rainProbability,
          ].join(', ')}
          style={[styles.weatherRecap, { backgroundColor: theme.colors.stage }]}
          testID="outfit-detail-weather-recap">
          <AppText tabularNumbers variant="caption">{presentation.weather.temperature}</AppText>
          <AppText colorRole="textSecondary" variant="caption">{presentation.weather.condition}</AppText>
          <AppText colorRole="textSecondary" tabularNumbers variant="caption">
            {presentation.weather.rainProbability}
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
  },
  headingGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  // Above fontScale 1.5 the emphasis pill sits under the title instead of leaving the screen.
  stackedHeadingGroup: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  boardPlate: {
    marginTop: spacing.xl,
    position: 'relative',
  },
  caption: {
    alignItems: 'center',
    position: 'absolute',
  },
  captionText: {
    textAlign: 'center',
  },
  captionMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  ownershipState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  ownershipMarker: {
    borderRadius: radii.pill,
    borderWidth: borderWidths.strong,
    height: spacing.sm,
    width: spacing.sm,
  },
  ownershipSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  ownershipSummaryText: {
    flex: 1,
    flexShrink: 1,
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  ownershipControlList: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  ownershipControlGroup: {
    gap: spacing.sm,
  },
  ownershipActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // Interim until ADR 0026 decision 5's ownership control lands: the pair stacks above 1.5
  // so Turkish labels wrap at the word instead of mid-word.
  stackedOwnershipActions: {
    flexDirection: 'column',
  },
  ownershipAction: {
    flex: 1,
  },
  reasonList: {
    gap: spacing.sm,
  },
  reasonRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reasonText: {
    flex: 1,
    flexShrink: 1,
  },
  weatherRecap: {
    alignItems: 'center',
    borderRadius: radii.card,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.md,
    padding: spacing.lg,
  },
});
