import { StyleSheet, View } from 'react-native';

import { Icon, NativeList, NativeListSection, NativeListRow, type IconName } from '@/components/ui';
import { ProbeLoadingOverlay } from '@/features/profile/presentation/probe-loading-overlay';
import type { AiProbeUiState } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import { useLocalization } from '@/localization/use-messages';

// ADR 0030 section 5: a first group with the last recommendation's coarse generation
// mode, then a second group with the tinted "Check AI status" row, a result row when
// there is a result (a monochrome status glyph in the shared tile, words beside it in
// the system's secondary ink, never a status colour), and a footer. Provider and model
// never appear here or anywhere in this surface.
export type AiStatusSettingsScreenProps = Readonly<{
  aiStatus: AiProbeUiState;
  isProbeSupported: boolean;
  lastGenerationMode: RecommendationGenerationMode | null;
  onCheckAiStatus: () => void;
}>;

export function AiStatusSettingsScreen({
  aiStatus,
  isProbeSupported,
  lastGenerationMode,
  onCheckAiStatus,
}: AiStatusSettingsScreenProps) {
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
          ? copy.aiStatusResultOk(
              new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(
                new Date(aiStatus.checkedAt),
              ),
            )
          : aiStatus.kind === 'unavailable'
            ? copy.aiStatusResultUnavailable
            : aiStatus.kind === 'rate-limited'
              ? copy.aiStatusResultRateLimited
              : copy.aiStatusResultError;

  const resultIcon: IconName | null = !isProbeSupported
    ? 'info'
    : aiStatus.kind === 'idle'
      ? null
      : aiStatus.kind === 'checking'
        ? 'clock'
        : aiStatus.kind === 'ok'
          ? 'checkCircle'
          : aiStatus.kind === 'unavailable' || aiStatus.kind === 'rate-limited'
            ? 'warning'
            : 'error';

  const resultRow = result !== null && resultIcon !== null ? { icon: resultIcon, text: result } : null;
  const canCheck = isProbeSupported && aiStatus.kind !== 'checking';

  return (
    <View style={styles.root}>
      <NativeList testID="settings-ai-status-screen">
        <NativeListSection testID="settings-ai-status-last-mode-group">
          <NativeListRow label={lastGenerationModeCopy} testID="settings-ai-status-last-mode" />
        </NativeListSection>

        <NativeListSection
          footer={copy.aiStatusIntro}
          testID="settings-ai-status-check-group">
          <NativeListRow
            label={copy.aiStatusCheckAction}
            onPress={canCheck ? onCheckAiStatus : undefined}
            testID="settings-ai-status-check"
            tinted={canCheck}
          />
          {resultRow ? (
            <NativeListRow
              glyph={({ color, size }) => <Icon color={color} name={resultRow.icon} size={size} />}
              label={resultRow.text}
              secondary
              testID="settings-ai-status-result"
            />
          ) : null}
        </NativeListSection>
      </NativeList>
      {aiStatus.kind === 'checking' ? (
        <ProbeLoadingOverlay label={copy.aiStatusChecking} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
