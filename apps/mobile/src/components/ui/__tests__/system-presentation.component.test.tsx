import { act, render } from '@testing-library/react-native';
import { Alert, type AlertButton, type AlertOptions, Keyboard, Share, Text } from 'react-native';

import { holdPresentation, usePresentationHeld, whilePresented } from '@/components/ui/presentation-hold';
import { shareContent, showAlert, useKeyboardPresentationHold } from '@/components/ui/system-presentation';

function HeldProbe() {
  return <Text testID="held">{usePresentationHeld() ? 'held' : 'clear'}</Text>;
}
function KeyboardProbe() {
  useKeyboardPresentationHold();
  return <HeldProbe />;
}
const held = (view: Awaited<ReturnType<typeof render>>) => view.getByTestId('held').props.children as string;

afterEach(() => { jest.restoreAllMocks(); });

test('an alert holds the screen until one of its buttons closes it, and its action still runs', async () => {
  const shown: { buttons: AlertButton[]; options?: AlertOptions }[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons, options) => {
    shown.push({ buttons: buttons ?? [], options });
  });
  const confirm = jest.fn();
  const view = await render(<HeldProbe />);

  await act(() => showAlert('Title', 'Body', [{ style: 'cancel', text: 'Cancel' }, { onPress: confirm, text: 'OK' }]));
  expect(held(view)).toBe('held');
  await act(() => shown[0]!.buttons[1]!.onPress?.());
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(held(view)).toBe('clear');

  // Android closes a cancelable alert without a button.
  await act(() => showAlert('Title', undefined, [{ text: 'OK' }], { cancelable: true }));
  expect(held(view)).toBe('held');
  await act(() => shown[1]!.options?.onDismiss?.());
  expect(held(view)).toBe('clear');
});

test('an alert that fails to present releases its hold, and an alert needs a button', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => { throw new Error('no window'); });
  const view = await render(<HeldProbe />);
  await act(() => {
    expect(() => showAlert('Title', undefined, [{ text: 'OK' }])).toThrow('no window');
  });
  expect(held(view)).toBe('clear');
  // iOS closes an alert only through a button, so one with none would hold the screen for good.
  // @ts-expect-error an alert needs at least one button
  const noButton = () => showAlert('Title', undefined, []);
  expect(noButton).toBeInstanceOf(Function);
});

test('a share sheet, or any system sheet the app waits for, holds the screen until it settles', async () => {
  let close: () => void = () => undefined;
  jest.spyOn(Share, 'share').mockImplementation(() => new Promise((resolve) => {
    close = () => resolve({ action: Share.dismissedAction });
  }));
  const view = await render(<HeldProbe />);

  let shared: Promise<unknown> = Promise.resolve();
  await act(() => { shared = shareContent({ message: 'kuyara' }); });
  expect(held(view)).toBe('held');
  await act(async () => { close(); await shared; });
  expect(held(view)).toBe('clear');

  await act(async () => {
    await whilePresented(() => Promise.reject(new Error('picker failed'))).catch(() => undefined);
  });
  expect(held(view)).toBe('clear');
});

test('a hold released twice lets go once and never goes below nothing', async () => {
  const view = await render(<HeldProbe />);
  let first: () => void = () => undefined;
  let second: () => void = () => undefined;
  await act(() => { first = holdPresentation(); second = holdPresentation(); });
  await act(() => { first(); first(); });
  expect(held(view)).toBe('held');
  await act(() => second());
  expect(held(view)).toBe('clear');
});

test('the software keyboard holds the screen while it is up', async () => {
  const listeners = new Map<string, () => void>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: () => void) => {
    listeners.set(event, listener);
    return { remove: () => listeners.delete(event) };
  }) as unknown as typeof Keyboard.addListener);
  const view = await render(<KeyboardProbe />);
  expect(held(view)).toBe('clear');
  await act(() => listeners.get('keyboardWillShow')?.());
  expect(held(view)).toBe('held');
  await act(() => listeners.get('keyboardWillHide')?.());
  expect(held(view)).toBe('clear');
});
