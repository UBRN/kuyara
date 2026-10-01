import { fireEvent, isHiddenFromAccessibility, render, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';

import { todayScreenState } from '@/features/today/__tests__/fixtures';
import { OutfitShareAction } from '@/features/today/presentation/outfit-share';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const CAPTURE_PATH = '/tmp/ReactNative/card.png';
const mockCapture = jest.fn<Promise<string>, unknown[]>();
const mockRelease = jest.fn();
jest.mock('react-native-view-shot', () => ({
  captureRef: (...args: unknown[]) => mockCapture(...args),
  releaseCapture: (...args: unknown[]) => mockRelease(...args),
}));
jest.mock('expo-symbols', () => ({ SymbolView: jest.fn(() => null) }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable, View } = jest.requireActual('react-native') as typeof import('react-native');
  const Toolbar = ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children);
  Toolbar.Button = function ToolbarButton({ accessibilityLabel, disabled, icon, onPress }: {
    accessibilityLabel: string; disabled?: boolean; icon: string; onPress: () => void;
  }) {
    return React.createElement(Pressable, {
      accessibilityLabel, accessibilityRole: 'button', accessibilityState: { disabled: Boolean(disabled) },
      disabled, onPress, testID: `toolbar-${icon}`,
    });
  };
  return { Stack: { Toolbar } };
});

// The card is drawn for the capture only, so it is hidden from assistive technologies.
const hidden = { includeHiddenElements: true } as const;
const fixtureNow = Date.parse('2026-08-13T06:30:00.000Z');

async function renderAction(language: SupportedLanguage) {
  const presentation = createTodayPresentation(todayScreenState, language, false, 'celsius', fixtureNow);
  if (presentation.kind !== 'loaded') throw new Error('Expected a loaded presentation.');
  const [suggestion] = presentation.suggestions;
  await render(
    <LocalizationContext value={{ language, messages: messages[language], hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <OutfitShareAction palette={suggestion.palette} presentation={presentation} suggestion={suggestion} />
      </KuyaraThemeContext.Provider>
    </LocalizationContext>,
  );
  return { presentation, suggestion };
}

beforeEach(() => {
  mockCapture.mockReset();
  mockRelease.mockReset();
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
});
afterEach(() => jest.restoreAllMocks());

describe.each(['en', 'tr'] as const)('%s outfit share', (language) => {
  test('the system share glyph draws the card, shares it as a file, and deletes it', async () => {
    mockCapture.mockResolvedValue(CAPTURE_PATH);
    const { presentation, suggestion } = await renderAction(language);
    const button = screen.getByLabelText(messages[language].today.share.action);
    expect(button.props.testID).toBe('toolbar-square.and.arrow.up');
    expect(screen.queryByTestId('outfit-share-card', hidden)).toBeNull();

    await fireEvent.press(button);
    const card = screen.getByTestId('outfit-share-card', hidden);
    expect(isHiddenFromAccessibility(card)).toBe(true);
    // The card shows what detail already shows: the day, the outfit and its weather, and no place.
    expect(card).toHaveTextContent(presentation.date, { exact: false });
    expect(card).toHaveTextContent(suggestion.title, { exact: false });
    expect(card).toHaveTextContent(presentation.titleParts.beforeSymbol, { exact: false });
    expect(card).toHaveTextContent(presentation.weather.condition, { exact: false });
    expect(card).toHaveTextContent('kuyara', { exact: false });
    expect(card).not.toHaveTextContent(presentation.header.location, { exact: false });

    await fireEvent(card, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 640 } } });
    await waitFor(() => expect(mockRelease).toHaveBeenCalledWith(CAPTURE_PATH));
    expect(mockCapture).toHaveBeenCalledWith(expect.anything(), { format: 'png', result: 'tmpfile' });
    expect(Share.share).toHaveBeenCalledWith({ url: `file://${CAPTURE_PATH}` });
    await waitFor(() => expect(screen.queryByTestId('outfit-share-card', hidden)).toBeNull());
  });

  test('a failed capture shares nothing and leaves the button ready', async () => {
    mockCapture.mockRejectedValue(new Error('capture'));
    await renderAction(language);
    await fireEvent.press(screen.getByLabelText(messages[language].today.share.action));
    await fireEvent(screen.getByTestId('outfit-share-card', hidden), 'layout',
      { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 640 } } });

    await waitFor(() => expect(screen.queryByTestId('outfit-share-card', hidden)).toBeNull());
    expect(Share.share).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
    expect(screen.getByLabelText(messages[language].today.share.action))
      .not.toBeDisabled();
  });
});
