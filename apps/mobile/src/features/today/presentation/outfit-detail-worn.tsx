import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, useButtonBox } from '@/components/ui';
import type { WornPieceColors } from '@/features/recommendation/domain/outfit-history';
import type { TodayCopy } from '@/features/today/presentation/outfit-detail-entries';
import { FadeOnChange, FadeOut } from '@/features/today/presentation/outfit-detail-fades';
import { TourTarget } from '@/features/walkthrough/application/tour-target';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type WornControl = 'state' | 'action';
export type WornSwap = Readonly<{
  current: WornControl | null; previous: WornControl | null; previousBusy: boolean; changes: number;
}>;

/** ADR 0038: "Wore this today" records the look beside the day's earlier ones; only this action writes it. */
export function OutfitDetailWorn({
  copy, drawn, onPreviousDone, onWoreThis, saved, scrollBy, wornBusy, wornShown, wornSwap,
}: Readonly<{
  copy: TodayCopy;
  /** The swatch each piece is drawn in on the board, which the look is recorded in. */
  drawn: WornPieceColors;
  onPreviousDone: () => void;
  onWoreThis: ((pieceColors: WornPieceColors) => void) | undefined;
  /** A save landed on this visit: the worn state says how long the look leads Today. */
  saved: boolean;
  /** The tour scrolls the screen by this many points to bring the action back into view. */
  scrollBy: (dy: number) => void;
  wornBusy: boolean;
  wornShown: WornControl | null;
  wornSwap: WornSwap;
}>) {
  const theme = useKuyaraTheme();
  // The worn state takes the large button's box, so the swap moves nothing below it.
  const wornBox = useButtonBox('large');
  if (wornShown === null && wornSwap.previous === null) return null;
  const wornStateContent = (
    <>
      <Icon color={theme.colors.successInk} name="checkCircle" size={20} />
      <AppText variant="bodyStrong">{copy.wornToday}</AppText>
    </>
  );
  return (
    <TourTarget id="worn" scrollBy={scrollBy} style={styles.wornAction}>
      {wornShown !== null ? (
        <FadeOnChange animate={wornSwap.changes > 0} key={`worn-in-${wornSwap.changes}`}>
          {wornShown === 'action' && onWoreThis ? (
            <Button
              icon="calendarCheck"
              label={copy.wornAction}
              loading={wornBusy}
              onPress={() => onWoreThis(drawn)}
              pressHaptic={false}
              size="large"
              testID="outfit-detail-wore-this"
            />
          ) : (
            <View
              accessible
              accessibilityLabel={copy.wornToday}
              style={[styles.wornState, wornBox, { borderColor: theme.colors.borderDefined }]}
              testID="outfit-detail-worn">
              {wornStateContent}
            </View>
          )}
        </FadeOnChange>
      ) : null}
      {wornSwap.previous !== null ? (
        <FadeOut key={`worn-out-${wornSwap.changes}`} onDone={onPreviousDone}>
          {wornSwap.previous === 'state' ? (
            <View style={[styles.wornState, wornBox, { borderColor: theme.colors.borderDefined }]}>
              {wornStateContent}
            </View>
          ) : (
            <Button
              icon="calendarCheck"
              label={copy.wornAction}
              loading={wornSwap.previousBusy}
              onPress={() => undefined}
              size="large"
            />
          )}
        </FadeOut>
      ) : null}
      {saved && wornShown === 'state' ? (
        <AppText accessibilityLiveRegion="polite" colorRole="textSecondary" style={styles.stays}
          testID="outfit-detail-worn-stays" variant="caption">
          {copy.wornLook.staysUntilTomorrow}
        </AppText>
      ) : null}
    </TourTarget>
  );
}

const styles = StyleSheet.create({
  wornAction: {
    marginTop: spacing.md,
  },
  stays: {
    marginTop: spacing.sm,
  },
  wornState: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
