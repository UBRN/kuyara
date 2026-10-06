import { AccessibilityInfo, Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FeedbackScreen } from '@/features/feedback/presentation/feedback-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

async function mount(onSend: jest.Mock = jest.fn(async () => undefined)) {
  let counter = 0;
  const createSubmissionId = jest.fn(() => `id-${++counter}`);
  const onCancel = jest.fn();
  const screen = await render(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={metrics}>
          <FeedbackScreen createSubmissionId={createSubmissionId} onSend={onSend} onCancel={onCancel} />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );
  return { ...screen, onSend, onCancel, createSubmissionId };
}

test('send requires nonblank text and shows confirmation', async () => {
  const screen = await mount();
  expect(screen.getByTestId('feedback-send').props.accessibilityState.disabled).toBe(true);
  await fireEvent.changeText(screen.getByTestId('feedback-message'), '  Good forecast  ');
  await fireEvent.press(screen.getByTestId('feedback-send'));
  await waitFor(() => expect(screen.onSend).toHaveBeenCalledWith('Good forecast', 'id-1'));
  expect(screen.getByText('Your feedback was sent.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('feedback-done'));
  expect(screen.onCancel).toHaveBeenCalledTimes(1);
});

test('failed submission keeps the draft and offers retry', async () => {
  const onSend = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  const screen = await mount(onSend);
  await fireEvent.changeText(screen.getByTestId('feedback-message'), 'Please fix this');
  await fireEvent.press(screen.getByTestId('feedback-send'));
  expect(screen.getByTestId('feedback-message').props.value).toBe('Please fix this');
  expect(screen.getByTestId('feedback-error')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('feedback-send'));
  expect(onSend).toHaveBeenCalledTimes(2);
  expect(onSend).toHaveBeenNthCalledWith(1, 'Please fix this', 'id-1');
  expect(onSend).toHaveBeenNthCalledWith(2, 'Please fix this', 'id-1');
  expect(screen.createSubmissionId).toHaveBeenCalledTimes(1);
});

test('editing the text after a failure starts a new submission', async () => {
  const onSend = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  const screen = await mount(onSend);
  await fireEvent.changeText(screen.getByTestId('feedback-message'), 'First');
  await fireEvent.press(screen.getByTestId('feedback-send'));
  await fireEvent.changeText(screen.getByTestId('feedback-message'), 'Second');
  await fireEvent.press(screen.getByTestId('feedback-send'));
  expect(onSend).toHaveBeenNthCalledWith(2, 'Second', 'id-2');
});

describe('announcements on iOS', () => {
  const originalOs = Platform.OS;
  beforeEach(() => { Platform.OS = 'ios'; jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {}); });
  afterEach(() => { Platform.OS = originalOs; jest.restoreAllMocks(); });

  test('the failed state and the sent state are spoken', async () => {
    const onSend = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const screen = await mount(onSend);
    await fireEvent.changeText(screen.getByTestId('feedback-message'), 'Please fix this');
    await fireEvent.press(screen.getByTestId('feedback-send'));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(messages.en.settings.feedback.failed);
    await fireEvent.press(screen.getByTestId('feedback-send'));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      `${messages.en.settings.feedback.sentTitle}. ${messages.en.settings.feedback.sentBody}`,
    );
  });
});
