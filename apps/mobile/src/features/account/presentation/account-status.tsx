import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Icon, type IconName } from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import type { SyncTone } from '@/features/account/presentation/account-sync-view';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type StatusInk = 'successInk' | 'warningInk' | 'dangerInk' | 'iconSecondary';

const toneGlyph: Readonly<Record<Exclude<SyncTone, 'progress'>, Readonly<{ name: IconName; ink: StatusInk }>>> = {
  success: { name: 'checkCircle', ink: 'successInk' },
  warning: { name: 'offline', ink: 'warningInk' },
  danger: { name: 'warning', ink: 'dangerInk' },
};

/** The status mark for a sync tone; the system spinner while something runs. */
export function syncToneSymbol(tone: Exclude<SyncTone, 'progress'>, colors: Readonly<Record<StatusInk, string>>) {
  const glyph = toneGlyph[tone];
  return { name: glyph.name, color: colors[glyph.ink] };
}

export function SyncToneGlyph({ size, tone }: Readonly<{ size: number; tone: SyncTone }>) {
  const theme = useKuyaraTheme();
  if (tone === 'progress') return <ActivityIndicator color={theme.colors.iconSecondary} size="small" />;
  const symbol = syncToneSymbol(tone, theme.colors);
  return <Icon color={symbol.color} name={symbol.name} size={size} />;
}

export type StatusLineTone = 'neutral' | 'warning' | 'danger';

const lineGlyph: Readonly<Record<StatusLineTone, IconName>> = {
  neutral: 'info',
  warning: 'offline',
  danger: 'warning',
};

/**
 * The one line kuyara draws for a sign-in or deletion outcome (frames 17-19, 37, 38): a mark
 * and a whole sentence, fact first, then the next step. Cancelling is not an error, so it is
 * neutral; offline is the warning band and a failure the danger band, each with a hairline
 * edge in its ink. The sentence stays in the primary ink. VoiceOver ignores the live region
 * and the alert role, so the line is also spoken on iOS when it appears or changes.
 */
export function StatusLine({ testID, text, tone }: Readonly<{ text: string; tone: StatusLineTone; testID?: string }>) {
  useErrorAnnouncement(text);
  const theme = useKuyaraTheme();
  const { colors } = theme;
  const band = tone === 'neutral'
    ? { fill: colors.surfaceMuted, edge: colors.surfaceMuted, ink: colors.iconSecondary }
    : tone === 'warning'
      ? { fill: colors.warningContainer, edge: colors.warningInk, ink: colors.warningInk }
      : { fill: colors.dangerContainer, edge: colors.dangerInk, ink: colors.dangerInk };

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.line, { backgroundColor: band.fill, borderColor: band.edge }]}
      testID={testID}>
      <Icon color={band.ink} name={lineGlyph[tone]} size={20} />
      <AppText style={styles.text}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    alignItems: 'flex-start',
    borderRadius: radii.control,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  text: { flex: 1 },
});
