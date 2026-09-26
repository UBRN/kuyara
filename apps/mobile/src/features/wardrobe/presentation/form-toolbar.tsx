import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { IconButton } from '@/components/ui';
import { useKuyaraTheme } from '@/theme/theme-context';

// The O5 form save: the iOS 26 toolbar pair (design language, "Approved button roles").
// Cancel is the system `xmark` on the left and Save the prominent `checkmark` on the right,
// both native bar items the header frames in Liquid Glass, so Save is never scrolled under
// the tab bar. Android's toolbar items take image sources only, so it keeps Material icon
// buttons in the same two header slots.
export type FormToolbarProps = Readonly<{
  cancelLabel: string;
  saveLabel: string;
  cancelDisabled: boolean;
  saveDisabled: boolean;
  onCancel: () => void;
  onSave: () => void;
}>;

export function FormToolbar({
  cancelDisabled,
  cancelLabel,
  onCancel,
  onSave,
  saveDisabled,
  saveLabel,
}: FormToolbarProps) {
  const theme = useKuyaraTheme();

  if (Platform.OS !== 'ios') {
    return (
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              accessibilityLabel={cancelLabel}
              disabled={cancelDisabled}
              icon="close"
              onPress={onCancel}
            />
          ),
          headerRight: () => (
            <IconButton
              accessibilityLabel={saveLabel}
              disabled={saveDisabled}
              icon="check"
              onPress={onSave}
            />
          ),
        }}
      />
    );
  }

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={cancelLabel}
          disabled={cancelDisabled}
          icon="xmark"
          onPress={onCancel}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={saveLabel}
          disabled={saveDisabled}
          icon="checkmark"
          onPress={onSave}
          tintColor={theme.colors.brandPrimary}
          variant="prominent"
        />
      </Stack.Toolbar>
    </>
  );
}
