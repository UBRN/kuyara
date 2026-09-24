import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import { GarmentBoardSkeleton } from '@/features/today/presentation/garment-board-skeleton';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const ROTATION_MS = 2_000;
const SKIP_MS = 10_000;
const SUCCESS_MS = 800;
const PIECE_COUNTS = [1, 3, 5] as const;

export function FirstGenerationOverlay({ active, completed, language, phase, insight, onSkip }: Readonly<{
  active: boolean;
  completed: boolean;
  language: SupportedLanguage;
  phase: RecommendationPhase | null;
  insight: string | null;
  onSkip: () => void;
}>) {
  const theme = useKuyaraTheme();
  const copy = getMessages(language).today;
  const [visible, setVisible] = useState(active);
  const [success, setSuccess] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [width, setWidth] = useState(0);
  const hadActive = useRef(active);

  useEffect(() => {
    if (active) {
      hadActive.current = true;
      const timer = setTimeout(() => {
        setVisible(true);
        setSuccess(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (!hadActive.current) return undefined;
    hadActive.current = false;
    if (!completed) {
      const timer = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(timer);
    }
    const start = setTimeout(() => setSuccess(true), 0);
    const timer = setTimeout(() => setVisible(false), SUCCESS_MS);
    return () => { clearTimeout(start); clearTimeout(timer); };
  }, [active, completed]);

  useEffect(() => {
    if (!active) return undefined;
    const reset = setTimeout(() => setElapsed(0), 0);
    const timer = setInterval(() => setElapsed((value) => value + 1), ROTATION_MS);
    return () => { clearTimeout(reset); clearInterval(timer); };
  }, [active]);

  if (!visible) return null;
  const lines = [
    ...(insight ? [insight] : []),
    phase ? copy.phase[phase] : copy.loading.phase,
    copy.loading.tips[Math.floor(elapsed / 3) % copy.loading.tips.length],
  ];
  const line = lines[elapsed % lines.length];
  const visibleCount = PIECE_COUNTS[Math.min(elapsed, 2)];
  const showSkip = active && elapsed * ROTATION_MS >= SKIP_MS;

  return (
    <View
      accessibilityViewIsModal
      style={[styles.overlay, { backgroundColor: theme.colors.background }]}
      testID="first-generation-overlay">
      <ScrollView contentContainerStyle={styles.content}>
        <AppText accessibilityRole="header" variant="title" style={styles.heading}>
          {copy.loading.heading}
        </AppText>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
          style={[styles.stage, { backgroundColor: theme.colors.stage }]}
          testID="first-generation-stage">
          <GarmentBoardSkeleton
            testID="first-generation-board"
            visibleCount={success ? 5 : visibleCount}
            width={width}
          />
        </View>
        {success ? (
          <View style={[styles.success, {
            backgroundColor: theme.colors.successContainer,
            borderColor: theme.colors.successInk,
          }]} testID="first-generation-success">
            <AppText colorRole="successInk" variant="bodyStrong">{copy.loading.allSet}</AppText>
          </View>
        ) : (
          <>
            <AppText
              accessibilityLabel={phase ? copy.phase[phase] : copy.loading.phase}
              accessibilityLiveRegion="polite"
              style={styles.line}
              testID="first-generation-line">
              {line}
            </AppText>
            {showSkip ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => Alert.alert(copy.loading.heading, undefined, [
                  { text: copy.loading.keepWaiting, isPreferred: true, style: 'cancel' },
                  { text: copy.loading.skipWait, style: 'destructive', onPress: onSkip },
                ])}
                style={styles.skip}
                testID="first-generation-skip">
                <AppText colorRole="brandAccent" variant="bodyStrong">
                  {copy.loading.skipWait}
                </AppText>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10 },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: 42, paddingBottom: spacing['2xl'] },
  heading: { marginBottom: spacing.xl, flexShrink: 0 },
  stage: { borderRadius: 26, overflow: 'hidden' },
  line: { marginTop: spacing.xl, minHeight: 50 },
  skip: { alignItems: 'center', justifyContent: 'center', minHeight: layout.minimumTouchTarget, marginTop: 'auto' },
  success: { alignItems: 'center', borderRadius: 12, borderWidth: 1, marginTop: 'auto', padding: spacing.md },
});
