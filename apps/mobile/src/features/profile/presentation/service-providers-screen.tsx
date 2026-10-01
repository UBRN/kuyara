import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { AppText, Icon, NativeList, NativeListSection, NativeListRow, NativeListContentRow, type IconName } from '@/components/ui';
import { ProbeLoadingOverlay } from '@/features/profile/presentation/probe-loading-overlay';
import type { AiProbeUiState } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';
import { useLocalization } from '@/localization/use-messages';
import { localeTag } from '@/localization/locale-tag';
import { useKuyaraTheme } from '@/theme/theme-context';

type StatusSymbol = Extract<IconName, 'statusRunning' | 'statusOff' | 'statusUnavailable'>;

export type ServiceProvidersScreenProps = Readonly<{
  aiStatus: AiProbeUiState;
  isProbeSupported: boolean;
  lastGenerationMode: RecommendationGenerationMode | null;
  onDeviceAvailability: OnDeviceAiAvailability | null;
  onCheckAiStatus: () => void;
  weatherAttribution: ReactNode;
  /** The attribution page the whole weather source row opens, when a provider is named. */
  weatherSourceLink: Readonly<{ label: string; hint: string; open: () => void }> | null;
}>;

export function ServiceProvidersScreen({
  aiStatus,
  isProbeSupported,
  lastGenerationMode,
  onDeviceAvailability,
  onCheckAiStatus,
  weatherAttribution,
  weatherSourceLink,
}: ServiceProvidersScreenProps) {
  const { hour12, language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const copy = messages.settings;

  // Reading availability calls nothing, so this row is never a probe. Until the answer
  // arrives, and for every reason other than the switch being off or the model still
  // downloading, the device reads as one that is not compatible.
  const onDeviceCopy = (
    onDeviceAvailability?.status === 'available'
      ? copy.aiStatusOnDeviceRunning
      : onDeviceAvailability?.reason === 'apple_intelligence_not_enabled'
        ? copy.aiStatusOnDeviceOff
        : onDeviceAvailability?.reason === 'model_not_ready'
          ? copy.aiStatusOnDeviceGettingReady
          : copy.aiStatusOnDeviceIncompatible
  ).replace('Apple Intelligence', 'Apple\u00A0Intelligence');
  const statusSymbol: StatusSymbol = onDeviceAvailability?.status === 'available' ||
    onDeviceAvailability?.reason === 'model_not_ready'
    ? 'statusRunning'
    : onDeviceAvailability?.reason === 'apple_intelligence_not_enabled'
      ? 'statusOff'
      : 'statusUnavailable';
  // One status symbol keeps one ink wherever it appears on this screen (Law 4).
  const statusInk = (symbol: StatusSymbol) => symbol === 'statusRunning'
    ? theme.colors.successInk
    : symbol === 'statusOff' ? theme.colors.warningInk : theme.colors.textSecondary;

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
              new Intl.DateTimeFormat(localeTag(language), {
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

  // A verdict carries the device row's outline status symbol; a pending check (the overlay
  // shows its progress) and the unsupported note stay secondary text with none.
  const resultSymbol: StatusSymbol | null = !isProbeSupported
    ? null
    : aiStatus.kind === 'ok'
      ? 'statusRunning'
      : aiStatus.kind === 'unavailable' || aiStatus.kind === 'rate-limited'
        ? 'statusOff'
        : aiStatus.kind === 'error'
          ? 'statusUnavailable'
          : null;

  // VoiceOver ignores the overlay's live region and the result row has none, so the start
  // of a check and its outcome are spoken here, once per change of state and never on mount.
  const announcedKind = useRef(aiStatus.kind);
  useEffect(() => {
    if (announcedKind.current === aiStatus.kind) return;
    announcedKind.current = aiStatus.kind;
    if (Platform.OS === 'ios' && isProbeSupported && result !== null) {
      AccessibilityInfo.announceForAccessibility(result);
    }
  }, [aiStatus.kind, isProbeSupported, result]);

  const canCheck = isProbeSupported && aiStatus.kind !== 'checking';

  return (
    <View style={styles.root}>
      <NativeList testID="settings-service-providers-screen">
        <NativeListSection
          footer={copy.aiStatusProvenanceFooter}
          heading={copy.artificialIntelligenceHeading}
          testID="settings-service-providers-ai-group">
          <NativeListRow
            glyph={({ color, size }) => (
              <Icon color={color} name="appleIntelligence" rendering="multicolor" size={size} />
            )}
            label={onDeviceCopy}
            testID="settings-service-providers-on-device"
            trailingSymbol={{ name: statusSymbol, color: statusInk(statusSymbol) }}
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
          {result !== null ? (
            <NativeListRow
              label={result}
              secondary={resultSymbol === null}
              testID="settings-service-providers-result"
              trailingSymbol={resultSymbol ? { name: resultSymbol, color: statusInk(resultSymbol) } : undefined}
            />
          ) : null}
        </NativeListSection>
        <NativeListSection
          footer={copy.weatherFooter}
          heading={copy.weatherDataHeading}
          testID="settings-service-providers-weather-group">
          <NativeListContentRow
            link={weatherSourceLink ? {
              hint: weatherSourceLink.hint,
              label: weatherSourceLink.label,
              onPress: weatherSourceLink.open,
            } : undefined}
            testID="settings-service-providers-weather-source">
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
