import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  garmentSwatchesBySlot,
  type GarmentOutfitPalette,
  Icon,
  useButtonBox,
} from '@/components/ui';
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

/** ADR 0038: one worn record per dressing day, written only by this action. */
export function OutfitDetailWorn({ copy, onPreviousDone, onWoreThis, palette, wornBusy, wornShown, wornSwap }: Readonly<{
  copy: TodayCopy;
  onPreviousDone: () => void;
  onWoreThis: ((pieceColors: WornPieceColors) => void) | undefined;
  palette: GarmentOutfitPalette;
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
    <TourTarget id="worn" style={styles.wornAction}>
      {wornShown !== null ? (
        <FadeOnChange animate={wornSwap.changes > 0} key={`worn-in-${wornSwap.changes}`}>
          {wornShown === 'action' && onWoreThis ? (
            <Button
              icon="calendarCheck"
              label={copy.wornAction}
              loading={wornBusy}
              onPress={() => onWoreThis(garmentSwatchesBySlot(palette))}
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
    </TourTarget>
  );
}

const styles = StyleSheet.create({
  wornAction: {
    marginTop: spacing.md,
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
