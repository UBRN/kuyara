import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';

import { Presence } from '@/components/ui';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function Providers({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

const block = (visible: boolean) => (
  <Providers>
    <Presence testID="presence" visible={visible}>
      <Text>Rain at 15:00</Text>
    </Presence>
  </Providers>
);
const hidden = { includeHiddenElements: true };

test('a block hidden before it was ever measured leaves the tree, and returns with the block', async () => {
  const result = await render(block(true));
  expect(result.getByText('Rain at 15:00', hidden)).toBeTruthy();

  await result.rerender(block(false));
  expect(result.queryByText('Rain at 15:00', hidden)).toBeNull();

  await result.rerender(block(true));
  expect(result.getByText('Rain at 15:00', hidden)).toBeTruthy();
});
