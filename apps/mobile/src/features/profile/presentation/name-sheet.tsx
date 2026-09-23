import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { displayNameIssue } from '@/features/profile/domain/profile';
import { NameInput } from '@/features/profile/presentation/name-input';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type NameSheetProps = Readonly<{
  mode: 'prompt' | 'edit';
  visible: boolean;
  initialName: string | null;
  onSave: (name: string | null) => Promise<void>;
  onDismiss: () => Promise<void> | void;
}>;

export function NameSheet({ mode, visible, initialName, onSave, onDismiss }: NameSheetProps) {
  const [dismissed, setDismissed] = useState(false);
  if (!visible || dismissed) return null;

  const dismiss = () => {
    if (mode !== 'prompt') {
      void (async () => {
        try {
          await onDismiss();
        } catch {
          // The edit screen's host owns its visibility; this callback currently only updates it.
        }
      })();
      return;
    }

    setDismissed(true);
    void (async () => {
      try {
        await onDismiss();
      } catch {
        // Dismissal always releases the prompt; a failed version write can prompt next launch.
      }
    })();
  };

  return <VisibleNameSheet mode={mode} initialName={initialName} onSave={onSave} onDismiss={dismiss} />;
}

function VisibleNameSheet({
  mode,
  initialName,
  onSave,
  onDismiss,
}: Omit<NameSheetProps, 'visible'> & { onDismiss: () => void }) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const [value, setValue] = useState(initialName ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const save = async () => {
    if (isSaving || displayNameIssue(value) || (mode === 'prompt' && !value.trim())) return;
    setIsSaving(true);
    setSaveError(false);
    try {
      await onSave(value.trim() || null);
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const title = mode === 'prompt' ? messages.onboarding.nameTitle : messages.profile.nameEditTitle;

  return (
    <Modal
      allowSwipeDismissal
      animationType="slide"
      onRequestClose={onDismiss}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      visible>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AppText accessibilityRole="header" variant="titleLarge">{title}</AppText>
            {mode === 'prompt' ? (
              <AppText colorRole="textSecondary">{messages.onboarding.nameBody}</AppText>
            ) : null}
            <NameInput
              onChangeText={setValue}
              onClear={mode === 'edit' ? () => setValue('') : undefined}
              testID={mode === 'prompt' ? 'name-prompt-input' : 'name-edit-input'}
              value={value}
            />
            {mode === 'edit' && value.trim() === '' ? (
              <AppText colorRole="textSecondary" variant="caption">
                {messages.profile.nameRemoveHint}
              </AppText>
            ) : null}
            {saveError ? (
              <AppText accessibilityRole="alert" colorRole="textSecondary" testID="name-save-error">
                {mode === 'prompt' ? messages.onboarding.saveError : messages.profile.nameSaveError}
              </AppText>
            ) : null}
            <View style={styles.actions}>
              <Button
                disabled={isSaving}
                label={mode === 'prompt' ? messages.onboarding.nameNotNow : messages.common.back}
                onPress={onDismiss}
                testID="name-sheet-dismiss"
                variant="quiet"
              />
              <Button
                disabled={Boolean(displayNameIssue(value)) || (mode === 'prompt' && !value.trim())}
                label={messages.profile.nameDone}
                loading={isSaving}
                onPress={() => { void save(); }}
                testID="name-sheet-done"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md, justifyContent: 'flex-end' },
});
