import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ProgressFill } from '@/components/ui/progress-fill';
import { createKuyaraTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const reducedMotionTheme = createKuyaraTheme('light', true);

async function renderFill(progress: number, reduceMotion = false) {
  const result = await render(
    <KuyaraThemeContext.Provider value={reduceMotion ? reducedMotionTheme : lightTheme}>
      <ProgressFill progress={progress} />
    </KuyaraThemeContext.Provider>,
  );
  const track = result.toJSON();
  const fill = track === null || Array.isArray(track) ? undefined : track.children?.[0];
  if (track === null || Array.isArray(track) || fill === undefined || typeof fill === 'string') {
    throw new Error('Expected the track to render one fill');
  }

  return {
    track: StyleSheet.flatten(track.props.style),
    fill: StyleSheet.flatten(fill.props.style),
  };
}

// Law 7's first hard rule: the fill reaches the same width whether or not it travels
// there, so the resting width is asserted in both modes. The Reanimated test mock rebuilds
// shared values on every render, so the travel itself is not observable here.
test.each([
  ['standard motion', false],
  ['Reduce Motion', true],
])('fills the track to its progress under %s', async (_name, reduceMotion) => {
  const { track, fill } = await renderFill(0.4, reduceMotion);

  expect(track.backgroundColor).toBe(lightTheme.colors.borderSubtle);
  expect(fill.backgroundColor).toBe(lightTheme.colors.brandPrimary);
  expect(fill.width).toBe('40%');
});

test('clamps progress to the track', async () => {
  expect((await renderFill(-1)).fill.width).toBe('0%');
  expect((await renderFill(4)).fill.width).toBe('100%');
});
