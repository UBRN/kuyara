import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { DrawReveal } from '@/components/ui/draw-in';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function Providers({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

// Reanimated does not undo what an animated style last wrote when the style is detached, so
// the frame a reveal lands on stays on the view after React swaps in the resting style. A
// landing that still clipped at the span hid everything past the first screen of a wider
// series for good: a scrolled hourly rail showed its temperatures with no line under them.
test('the frame a reveal lands on uncovers its whole width, as its resting style does', async () => {
  // Hold the spring's completion so the animated style stays attached, and read the frame
  // it writes once progress has reached its end.
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation((toValue) => toValue);
  const landed = Reanimated.useSharedValue<unknown>(1);
  const useSharedValue = jest.spyOn(Reanimated, 'useSharedValue').mockImplementation(() => landed);
  const result = await render(
    <Providers>
      <DrawReveal play span={200} testID="reveal" width={600}>
        <Text>Series</Text>
      </DrawReveal>
    </Providers>,
  );

  const clip = result.getByTestId('reveal', { includeHiddenElements: true });
  const counter = clip.children[0] as typeof clip;
  expect([clip, counter].map((view) => StyleSheet.flatten(view.props.style).transform))
    .toEqual([[{ translateX: 0 }], [{ translateX: 0 }]]);
  useSharedValue.mockRestore();
  withSpring.mockRestore();
});
