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
// The shared copy is a file in the cache directory named for the day; the stand-in records it.
const mockFiles = new Set<string>();
const mockCopies: [string, string][] = [];
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: string[]) { this.uri = parts.join('/'); }
    get exists() { return mockFiles.has(this.uri); }
    delete() { mockFiles.delete(this.uri); }
    async copy(target: File) { mockCopies.push([this.uri, target.uri]); mockFiles.add(target.uri); }
  }
  return { File, Paths: { cache: 'file:///cache' } };
});
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
  mockFiles.clear();
  mockCopies.length = 0;
  mockCapture.mockReset();
  mockRelease.mockReset();
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
});
afterEach(() => jest.restoreAllMocks());

describe.each(['en', 'tr'] as const)('%s outfit share', (language) => {
  test('the system share glyph draws the card, shares it as a dated file with the store link, and deletes it', async () => {
    mockCapture.mockResolvedValue(CAPTURE_PATH);
    const { presentation, suggestion } = await renderAction(language);
    const button = screen.getByLabelText(messages[language].today.share.action);
    expect(button.props.testID).toBe('toolbar-square.and.arrow.up');
    expect(screen.queryByTestId('outfit-share-card', hidden)).toBeNull();

    await fireEvent.press(button);
    const card = screen.getByTestId('outfit-share-card', hidden);
    expect(isHiddenFromAccessibility(card)).toBe(true);
    // The card is the outfit drawn large, the place it was dressed for, and the kuyara name.
    expect(card).toHaveTextContent(presentation.header.location, { exact: false });
    expect(card).toHaveTextContent('kuyara', { exact: false });
    expect(card).not.toHaveTextContent(suggestion.title, { exact: false });
    expect(card).not.toHaveTextContent(presentation.date, { exact: false });

    await fireEvent(card, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 640 } } });
    await waitFor(() => expect(mockRelease).toHaveBeenCalledWith(CAPTURE_PATH));
    expect(mockCapture).toHaveBeenCalledWith(expect.anything(), { format: 'png', result: 'tmpfile' });
    const named = `file:///cache/kuyara-${presentation.dateKey}.png`;
    expect(presentation.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mockCopies).toEqual([[`file://${CAPTURE_PATH}`, named]]);
    expect(Share.share).toHaveBeenCalledWith({
      message: messages[language].today.share.message('https://apps.apple.com/app/kuyara/id6806664440'),
      url: named,
    });
    // The named copy goes once the sheet closes, with the capture.
    expect(mockFiles.has(named)).toBe(false);
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
