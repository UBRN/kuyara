import { act, render } from '@testing-library/react-native';
import { AppState, View } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { useAmbientPulse } from '@/components/ui/use-ambient-pulse';
import { useConditionSymbolMotion } from '@/components/ui/use-condition-symbol-motion';
import { resolveConditionStyle } from '@/features/today/domain/condition-style';
import { RunwayParticles } from '@/features/today/presentation/runway-particles';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const mockFocusSubscribers = new Set<(focused: boolean) => void>();
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        let cleanup = callback();
        const subscriber = (focused: boolean) => {
          if (focused) cleanup = callback();
          else cleanup?.();
        };
        mockFocusSubscribers.add(subscriber);
        return () => { mockFocusSubscribers.delete(subscriber); cleanup?.(); };
      }, [callback]);
    },
  };
});

function ConditionSample() {
  useConditionSymbolMotion(resolveConditionStyle('rain', 'day'), lightTheme.motion.ambient.intense);
  return <View />;
}

function PulseSample() {
  useAmbientPulse();
  return <View />;
}

function ParticleSample() {
  return <RunwayParticles color="#ffffff" height={100} kind="rain" width={100} />;
}

afterEach(() => { jest.restoreAllMocks(); mockFocusSubscribers.clear(); });

test.each([
  ['condition symbol', ConditionSample],
  ['ambient pulse', PulseSample],
  ['runway particles', ParticleSample],
] as const)('%s stops on blur or background and resumes when visible', async (_name, Sample) => {
  const appStateSubscribers = new Set<(state: string) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, callback) => {
    const subscriber = callback as (state: string) => void;
    appStateSubscribers.add(subscriber);
    return { remove: () => appStateSubscribers.delete(subscriber) } as ReturnType<typeof AppState.addEventListener>;
  }) as typeof AppState.addEventListener);
  const repeat = jest.spyOn(Reanimated, 'withRepeat');
  const cancel = jest.spyOn(Reanimated, 'cancelAnimation');
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}><Sample /></KuyaraThemeContext.Provider>,
  );
  expect(repeat).toHaveBeenCalled();
  expect(mockFocusSubscribers.size).toBe(1);

  cancel.mockClear();
  await act(() => { mockFocusSubscribers.forEach((subscriber) => subscriber(false)); });
  expect(cancel).toHaveBeenCalled();
  repeat.mockClear();
  await act(() => {
    appStateSubscribers.forEach((subscriber) => subscriber('background'));
    mockFocusSubscribers.forEach((subscriber) => subscriber(true));
  });
  expect(repeat).not.toHaveBeenCalled();

  await act(() => { appStateSubscribers.forEach((subscriber) => subscriber('active')); });
  expect(repeat).toHaveBeenCalled();
  cancel.mockClear();
  await act(() => { appStateSubscribers.forEach((subscriber) => subscriber('background')); });
  expect(cancel).toHaveBeenCalled();
  await result.unmount();
});
