import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, GlassButton, NativeSheet } from '@/components/ui';
import { displayNameIssue } from '@/features/profile/domain/profile';
import { NameInput } from '@/features/profile/presentation/name-input';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

type NameSheetProps = Readonly<{
  mode: 'prompt' | 'edit';
  visible: boolean;
  initialName: string | null;
  onSave: (name: string | null) => Promise<void>;
  onDismiss: () => Promise<void> | void;
}>;

export function NameSheet({ mode, visible, initialName, onSave, onDismiss }: NameSheetProps) {
  const [dismissed, setDismissed] = useState(false);
  const open = visible && !dismissed;

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

  // The sheet stays mounted so the platform animates it out. Its close callback also fires
  // after a close the host asked for (a save); only a close while still open is the person
  // dismissing it, so only that one reaches `onDismiss`.
  return (
    <NativeSheet onDismiss={() => { if (open) dismiss(); }} size="fit" testID="name-sheet" visible={open}>
      {open ? (
        <NameSheetContent initialName={initialName} mode={mode} onDismiss={dismiss} onSave={onSave} />
      ) : null}
    </NativeSheet>
  );
}

/**
 * O14 name editor A: one field deserves one glance, not a page. A sheet sized to its
 * content sits on the keyboard with the field focused; the bar carries Cancel (glass xmark)
 * and Done (prominent glass checkmark). Removing a saved name is an action, not an
 * instruction to empty the field.
 */
function NameSheetContent({
  mode,
  initialName,
  onSave,
  onDismiss,
}: Omit<NameSheetProps, 'visible'> & { onDismiss: () => void }) {
  const messages = useMessages();
  const [value, setValue] = useState(initialName ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const commit = async (name: string | null) => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(false);
    try {
      await onSave(name);
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };
  const doneDisabled = isSaving || Boolean(displayNameIssue(value)) || (mode === 'prompt' && !value.trim());
  const save = () => {
    if (doneDisabled) return;
    void commit(value.trim() || null);
  };

  return (
    <View style={styles.content}>
      <View style={styles.bar}>
        <GlassButton
          kind="close"
          label={mode === 'prompt' ? messages.onboarding.nameNotNow : messages.profile.nameCancel}
          onPress={onDismiss}
          testID="name-sheet-dismiss"
        />
        <AppText accessibilityRole="header" style={styles.title} variant="bodyStrong">
          {mode === 'prompt' ? messages.onboarding.nameTitle : messages.profile.nameLabel}
        </AppText>
        <GlassButton
          disabled={doneDisabled}
          kind="confirm"
          label={messages.profile.nameDone}
          onPress={save}
          testID="name-sheet-done"
        />
      </View>
      {mode === 'prompt' ? (
        <AppText colorRole="textSecondary">{messages.onboarding.nameBody}</AppText>
      ) : null}
      <NameInput
        autoFocus
        onChangeText={setValue}
        onClear={mode === 'edit' ? () => setValue('') : undefined}
        testID={mode === 'prompt' ? 'name-prompt-input' : 'name-edit-input'}
        value={value}
      />
      {mode === 'edit' && initialName ? (
        <Button
          disabled={isSaving}
          icon="trash"
          label={messages.profile.nameRemove}
          onPress={() => { void commit(null); }}
          size="medium"
          testID="name-sheet-remove"
          variant="destructive"
        />
      ) : null}
      {saveError ? (
        <AppText accessibilityRole="alert" colorRole="textSecondary" testID="name-save-error">
          {mode === 'prompt' ? messages.onboarding.saveError : messages.profile.nameSaveError}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
  bar: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  title: { flex: 1, textAlign: 'center' },
});
