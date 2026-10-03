import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { feedbackV1MessageMaxLength } from '@kuyara/contracts';

import { AppText, Button, Screen } from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { useLocalization } from '@/localization/use-messages';
import { borderWidths, radii, spacing, typography } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export function FeedbackScreen({
  onSend, onCancel, createSubmissionId,
}: Readonly<{
  onSend: (message: string, submissionId: string) => Promise<void>;
  onCancel: () => void;
  createSubmissionId: () => string;
}>) {
  const { messages } = useLocalization();
  const copy = messages.settings.feedback;
  const theme = useKuyaraTheme();
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const inFlight = useRef(false);
  // One id per submission: a retry of the same text reuses it, so a message the Worker stored
  // before the reply was lost is not stored twice; editing the text starts a new submission.
  const submissionId = useRef<string | null>(null);
  useErrorAnnouncement(
    state === 'sent' ? `${copy.sentTitle}. ${copy.sentBody}` : state === 'failed' ? copy.failed : null,
  );

  const send = async () => {
    const text = message.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setState('sending');
    try {
      submissionId.current ??= createSubmissionId();
      await onSend(text, submissionId.current);
      setState('sent');
    } catch {
      setState('failed');
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <Screen contentContainerStyle={styles.content} testID="feedback-screen">
      {state === 'sent' ? (
        <>
          <AppText accessibilityRole="header" variant="titleLarge">{copy.sentTitle}</AppText>
          <AppText accessibilityLiveRegion="polite" colorRole="textSecondary">{copy.sentBody}</AppText>
          <Button label={copy.done} onPress={onCancel} size="large" testID="feedback-done" />
        </>
      ) : (
        <>
          <AppText accessibilityRole="header" variant="titleLarge">{copy.title}</AppText>
          <AppText colorRole="textSecondary">{copy.body}</AppText>
          <AppText nativeID="feedback-label" variant="bodyStrong">{copy.messageLabel}</AppText>
          <TextInput
            accessibilityLabel={copy.messageLabel}
            editable={state !== 'sending'}
            maxLength={feedbackV1MessageMaxLength}
            multiline
            onChangeText={(value) => {
              setMessage(value);
              submissionId.current = null;
              if (state === 'failed') setState('idle');
            }}
            placeholder={copy.placeholder}
            placeholderTextColor={theme.colors.textSecondary}
            style={[styles.input, {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderDefined,
              color: theme.colors.textPrimary,
            }]}
            testID="feedback-message"
            textAlignVertical="top"
            value={message}
          />
          <AppText colorRole="textSecondary" style={styles.count} variant="caption">
            {copy.characterCount(message.length, feedbackV1MessageMaxLength)}
          </AppText>
          {state === 'failed' ? (
            <AppText accessibilityLiveRegion="assertive" accessibilityRole="alert" colorRole="dangerInk"
              testID="feedback-error">
              {copy.failed}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <Button disabled={!message.trim()} label={copy.send} loading={state === 'sending'}
              onPress={() => { void send(); }} size="large" testID="feedback-send" />
            <Button disabled={state === 'sending'} label={copy.cancel} onPress={onCancel}
              size="large" testID="feedback-cancel" variant="plain" />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingTop: spacing.lg },
  input: {
    borderRadius: radii.control, borderWidth: borderWidths.subtle,
    fontSize: typography.body.fontSize, lineHeight: typography.body.lineHeight,
    minHeight: 168, padding: spacing.md,
  },
  count: { alignSelf: 'flex-end' },
  actions: { gap: spacing.sm },
});
