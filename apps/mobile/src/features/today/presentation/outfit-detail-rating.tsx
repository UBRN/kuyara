import { StyleSheet, View } from 'react-native';

import { AppText, Crossfade, Presence, ToggleChip, type IconName } from '@/components/ui';
import { useStatusAnnouncement } from '@/components/ui/use-status-announcement';
import type { OutfitRatingControl } from '@/features/today/application/use-outfit-rating';
import { outfitRatingReasons, type OutfitVerdict } from '@/features/today/domain/outfit-rating';
import type { TodayCopy } from '@/features/today/presentation/outfit-detail-entries';
import { spacing } from '@/theme/theme';

/**
 * "Do you like this outfit?" and the two thumbs under "Wore this today"; a dislike opens four
 * optional reasons. The line says "Thanks, noted." once a verdict is chosen, spoken politely.
 * No haptic: the buttons and chips are not a primary action (Law 8).
 */
export function OutfitDetailRating({ control, copy }: Readonly<{
  control: OutfitRatingControl;
  copy: TodayCopy;
}>) {
  const { rating, rate } = control;
  const line = rating ? copy.rating.thanks : copy.rating.question;
  // VoiceOver ignores the live region, so iOS hears the changed line spoken once.
  useStatusAnnouncement(line);
  const verdictButton = (verdict: OutfitVerdict, label: string, icon: IconName, selectedIcon: IconName) => (
    <ToggleChip
      accessibilityLabel={label}
      icon={icon}
      onPress={() => rate({ kind: 'verdict', verdict })}
      selected={rating?.verdict === verdict}
      selectedIcon={selectedIcon}
      testID={`outfit-detail-rating-${verdict}`}
    />
  );
  return (
    <View style={styles.rating} testID="outfit-detail-rating">
      <View style={styles.row}>
        <Crossfade contentKey={line} style={styles.line}>
          <AppText
            accessibilityLiveRegion="polite"
            colorRole={rating ? 'textSecondary' : 'textPrimary'}
            variant="body">
            {line}
          </AppText>
        </Crossfade>
        <View style={styles.verdicts}>
          {verdictButton('like', copy.rating.like, 'thumbsUp', 'thumbsUpFilled')}
          {verdictButton('dislike', copy.rating.dislike, 'thumbsDown', 'thumbsDownFilled')}
        </View>
      </View>
      <Presence testID="outfit-detail-rating-reasons" visible={rating?.verdict === 'dislike'}>
        <AppText colorRole="textSecondary" style={styles.reasonsHeading} variant="caption">
          {copy.rating.reasonsHeading}
        </AppText>
        <View style={styles.reasons}>
          {outfitRatingReasons.map((reason) => (
            <ToggleChip
              key={reason}
              label={copy.rating.reasons[reason]}
              onPress={() => rate({ kind: 'reason', reason })}
              selected={rating?.verdict === 'dislike' && rating.reason === reason}
              testID={`outfit-detail-rating-reason-${reason}`}
            />
          ))}
        </View>
      </Presence>
    </View>
  );
}

const styles = StyleSheet.create({
  rating: {
    marginTop: spacing.md,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  line: {
    flex: 1,
  },
  verdicts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reasonsHeading: {
    paddingTop: spacing.md,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
});
