import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Icon, NativeList, NativeListSection, NativeListRow, NativeListContentRow, type IconName } from '@/components/ui';
import { ProbeLoadingOverlay } from '@/features/profile/presentation/probe-loading-overlay';
import type { AiProbeUiState } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';
import { useLocalization } from '@/localization/use-messages';
import { useKuyaraTheme } from '@/theme/theme-context';

export type ServiceProvidersScreenProps = Readonly<{
  aiStatus: AiProbeUiState;
  isProbeSupported: boolean;
  lastGenerationMode: RecommendationGenerationMode | null;
  onDeviceAvailability: OnDeviceAiAvailability | null;
  onCheckAiStatus: () => void;
  weatherAttribution: ReactNode;
}>;

export function ServiceProvidersScreen({
  aiStatus,
  isProbeSupported,
  lastGenerationMode,
  onDeviceAvailability,
  onCheckAiStatus,
  weatherAttribution,
}: ServiceProvidersScreenProps) {
  const { hour12, language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const copy = messages.settings;

  // Reading availability calls nothing, so this row is never a probe. Until the answer
  // arrives, and for every reason other than the switch being off or the model still
  // downloading, the device reads as one that is not compatible.
  const onDeviceCopy = onDeviceAvailability?.status === 'available'
    ? copy.aiStatusOnDeviceRunning
    : onDeviceAvailability?.reason === 'apple_intelligence_not_enabled'
      ? copy.aiStatusOnDeviceOff
      : onDeviceAvailability?.reason === 'model_not_ready'
        ? copy.aiStatusOnDeviceGettingReady
        : copy.aiStatusOnDeviceIncompatible;
  const statusSymbol: IconName = onDeviceAvailability?.status === 'available' ||
    onDeviceAvailability?.reason === 'model_not_ready'
    ? 'statusRunning'
    : onDeviceAvailability?.reason === 'apple_intelligence_not_enabled'
      ? 'statusOff'
      : 'statusUnavailable';
  const statusColor = statusSymbol === 'statusRunning'
    ? theme.colors.successInk
    : statusSymbol === 'statusOff' ? theme.colors.warningInk : theme.colors.textSecondary;

  // Only the last successful check names anything, and the name is never stored.
  const assistant = aiStatus.kind === 'ok' ? aiStatus.assistant : undefined;

  const lastGenerationModeCopy = lastGenerationMode === 'on-device-ai'
    ? copy.aiStatusLastOnDeviceAi
    : lastGenerationMode === 'ai-assisted'
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
              new Intl.DateTimeFormat(language, {
                hour: hour12 ? 'numeric' : '2-digit',
                minute: '2-digit',
                hour12,
              }).format(new Date(aiStatus.checkedAt)),
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
      <NativeList testID="settings-service-providers-screen">
        <NativeListSection
          footer={copy.aiStatusProvenanceFooter}
          heading={copy.artificialIntelligenceHeading}
          testID="settings-service-providers-ai-group">
          <NativeListRow
            glyph={({ color, size }) => <Icon color={color} name="appleIntelligence" size={size} />}
            label={onDeviceCopy}
            testID="settings-service-providers-on-device"
            trailingSymbol={{ name: statusSymbol, color: statusColor }}
          />
          <NativeListRow label={lastGenerationModeCopy} testID="settings-service-providers-last-mode" />
          {assistant ? (
            <NativeListRow
              label={copy.aiStatusAssistant(assistant.providerId, assistant.model)}
              testID="settings-service-providers-assistant-identity"
            />
          ) : null}
        </NativeListSection>

        <NativeListSection
          footer={copy.aiStatusIntro}
          testID="settings-service-providers-check-group">
          <NativeListRow
            label={copy.aiStatusCheckAction}
            onPress={canCheck ? onCheckAiStatus : undefined}
            testID="settings-service-providers-check"
            tinted={canCheck}
          />
          {resultRow ? (
            <NativeListRow
              glyph={({ color, size }) => <Icon color={color} name={resultRow.icon} size={size} />}
              label={resultRow.text}
              secondary
              testID="settings-service-providers-result"
            />
          ) : null}
        </NativeListSection>
        <NativeListSection
          footer={copy.weatherFooter}
          heading={copy.weatherDataHeading}
          testID="settings-service-providers-weather-group">
          <NativeListContentRow testID="settings-service-providers-weather-source">
            {weatherAttribution ?? <AppText variant="body">{copy.weatherNoSnapshot}</AppText>}
          </NativeListContentRow>
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
