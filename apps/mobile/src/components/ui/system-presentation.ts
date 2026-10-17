import {
  Alert,
  type AlertButton,
  type AlertOptions,
  Share,
  type ShareContent,
} from 'react-native';

import { holdPresentation, usePresentationHold, whilePresented } from '@/components/ui/presentation-hold';
import { useKeyboardVisible } from '@/components/ui/use-keyboard-visible';

// The app's system presentations, each holding the screen while it is up so that what must
// never appear over one (the App Store rating request) waits for it. The only caller of
// `Alert.alert` and `Share.share`, guarded by architecture-invariants.test.mjs; a picker or
// browser the app waits for is wrapped in `whilePresented` where it is called.

/** An alert's button: no alert here asks for typed text, so a press carries no value. */
type SystemAlertButton = Readonly<Pick<AlertButton, 'isPreferred' | 'style' | 'text'> & {
  onPress?: () => void;
}>;

/**
 * `Alert.alert`, holding the screen until the alert closes. iOS closes an alert only through
 * one of its buttons, so every button releases it; Android can also dismiss a cancelable one.
 */
export function showAlert(
  title: string,
  message: string | undefined,
  buttons: readonly SystemAlertButton[],
  options?: AlertOptions,
): void {
  const release = holdPresentation();
  Alert.alert(
    title,
    message,
    buttons.map((button) => ({
      ...button,
      onPress: () => {
        release();
        button.onPress?.();
      },
    })),
    {
      ...options,
      onDismiss: () => {
        release();
        options?.onDismiss?.();
      },
    },
  );
}

/** The system share sheet, holding the screen until it closes, shared or not. */
export function shareContent(content: ShareContent) {
  return whilePresented(() => Share.share(content));
}

/** The software keyboard holds the screen while it is up, whichever field raised it. */
export function useKeyboardPresentationHold(): void {
  usePresentationHold(useKeyboardVisible());
}
