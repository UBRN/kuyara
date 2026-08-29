import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import type { AiProbeUiState } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import { ProbeLoadingOverlay } from '@/features/profile/presentation/probe-loading-overlay';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

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

  return (
    <View style={styles.section} testID="settings-ai-status">
      <AppText colorRole="brandAccent" variant="eyebrow">
        {copy.aiStatusHeading}
      </AppText>
      <AppText colorRole="textSecondary">{copy.aiStatusIntro}</AppText>
      <AppText>{lastGenerationModeCopy}</AppText>
      <Button
        disabled={!isProbeSupported || aiStatus.kind === 'checking'}
        label={copy.aiStatusCheckAction}
        onPress={onCheckAiStatus}
        testID="settings-ai-status-check"
      />
      {result ? (
        <AppText
          accessibilityLiveRegion="polite"
          colorRole="textSecondary"
          testID="settings-ai-status-result">
          {result}
        </AppText>
      ) : null}
      {aiStatus.kind === 'checking' ? (
        <ProbeLoadingOverlay label={copy.aiStatusChecking} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.lg,
    position: 'relative',
  },
});
