import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, Surface, type IconName } from '@/components/ui';
import type { AiProbeUiState } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import { ProbeLoadingOverlay } from '@/features/profile/presentation/probe-loading-overlay';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type AiStatusSectionProps = Readonly<{
  aiStatus: AiProbeUiState;
  isProbeSupported: boolean;
  lastGenerationMode: RecommendationGenerationMode | null;
  onCheckAiStatus: () => void;
}>;

export function AiStatusSection({
  aiStatus,
  isProbeSupported,
  lastGenerationMode,
  onCheckAiStatus,
}: AiStatusSectionProps) {
  const { language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const copy = messages.settings;
  const lastGenerationModeCopy = lastGenerationMode === 'ai-assisted'
    ? copy.aiStatusLastAiAssisted
    : lastGenerationMode === 'deterministic-fallback'
      ? copy.aiStatusLastStandard
      : copy.aiStatusLastUnknown;
  const result = !isProbeSupported
    ? copy.aiStatusUnsupported
    : aiStatus.kind === 'idle'
      ? null
      : aiStatus.kind === 'checking'
        ? copy.aiStatusChecking
        : aiStatus.kind === 'ok'
          ? copy.aiStatusResultOk(new Intl.DateTimeFormat(language, {
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(aiStatus.checkedAt)))
          : aiStatus.kind === 'unavailable'
            ? copy.aiStatusResultUnavailable
            : aiStatus.kind === 'rate-limited'
              ? copy.aiStatusResultRateLimited
              : copy.aiStatusResultError;
  const resultTone: { icon: IconName; color: string } | null = !isProbeSupported
    ? { icon: 'info', color: theme.colors.brandAccent }
    : aiStatus.kind === 'idle'
      ? null
      : aiStatus.kind === 'checking'
        ? { icon: 'clock', color: theme.colors.iconSecondary }
        : aiStatus.kind === 'ok'
          ? { icon: 'checkCircle', color: theme.colors.successInk }
          : aiStatus.kind === 'unavailable' || aiStatus.kind === 'rate-limited'
            ? { icon: 'warning', color: theme.colors.warningInk }
            : { icon: 'error', color: theme.colors.dangerInk };

  return (
    <View style={styles.group} testID="settings-ai-status">
      <AppText accessibilityRole="header" variant="bodyStrong">
        {copy.aiStatusHeading}
      </AppText>
      <Surface style={[styles.section, theme.elevation.raised]}>
        <AppText colorRole="textSecondary">{copy.aiStatusIntro}</AppText>
        <AppText>{lastGenerationModeCopy}</AppText>
        <Button
          disabled={!isProbeSupported || aiStatus.kind === 'checking'}
          label={copy.aiStatusCheckAction}
          loading={aiStatus.kind === 'checking'}
          onPress={onCheckAiStatus}
          testID="settings-ai-status-check"
        />
        {result && resultTone ? (
          <View style={styles.resultRow}>
            <View testID="settings-ai-status-result-icon">
              <Icon color={resultTone.color} name={resultTone.icon} size={20} />
            </View>
            <AppText
              accessibilityLiveRegion="polite"
              colorRole="textSecondary"
              style={styles.resultCopy}
              tabularNumbers
              testID="settings-ai-status-result">
              {result}
            </AppText>
          </View>
        ) : null}
        {aiStatus.kind === 'checking' ? (
          <ProbeLoadingOverlay label={copy.aiStatusChecking} />
        ) : null}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.lg,
    padding: spacing.lg,
    position: 'relative',
  },
  resultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  resultCopy: {
    flex: 1,
  },
});
