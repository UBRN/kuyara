import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Surface } from '@/components/ui';
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
  const resultIcon = !isProbeSupported
    ? { ios: 'info.circle.fill', android: 'info', web: 'info' } as const
    : aiStatus.kind === 'ok'
      ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' } as const
      : aiStatus.kind === 'checking'
        ? { ios: 'clock.fill', android: 'schedule', web: 'schedule' } as const
        : { ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' } as const;

  return (
    <Surface style={styles.section} testID="settings-ai-status" variant="elevated">
      <AppText colorRole="brandAccent" variant="eyebrow">
        {copy.aiStatusHeading}
      </AppText>
      <AppText colorRole="textSecondary">{copy.aiStatusIntro}</AppText>
      <AppText>{lastGenerationModeCopy}</AppText>
      <Button
        disabled={!isProbeSupported || aiStatus.kind === 'checking'}
        label={copy.aiStatusCheckAction}
        loading={aiStatus.kind === 'checking'}
        onPress={onCheckAiStatus}
        testID="settings-ai-status-check"
      />
      {result ? (
        <View style={styles.resultRow}>
          <SymbolView
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            name={resultIcon}
            size={20}
            testID="settings-ai-status-result-icon"
            tintColor={theme.colors.iconSecondary}
          />
          <AppText
            accessibilityLiveRegion="polite"
            colorRole="textSecondary"
            style={styles.resultCopy}
            testID="settings-ai-status-result">
            {result}
          </AppText>
        </View>
      ) : null}
      {aiStatus.kind === 'checking' ? (
        <ProbeLoadingOverlay label={copy.aiStatusChecking} />
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.lg,
    padding: spacing.xl,
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
