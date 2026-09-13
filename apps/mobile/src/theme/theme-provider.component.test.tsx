import { render, waitFor } from '@testing-library/react-native';
import { Appearance, Text } from 'react-native';

import { KuyaraThemeProvider } from '@/theme/theme-provider';

test('applies light, dark and system appearance preferences to native UI', async () => {
  const setColorScheme = jest
    .spyOn(Appearance, 'setColorScheme')
    .mockImplementation(() => undefined);
  const result = await render(
    <KuyaraThemeProvider preference="light">
      <Text>Child</Text>
    </KuyaraThemeProvider>,
  );

  await waitFor(() => expect(setColorScheme).toHaveBeenLastCalledWith('light'));

  await result.rerender(
    <KuyaraThemeProvider preference="dark">
      <Text>Child</Text>
    </KuyaraThemeProvider>,
  );
  await waitFor(() => expect(setColorScheme).toHaveBeenLastCalledWith('dark'));

  await result.rerender(
    <KuyaraThemeProvider preference="system">
      <Text>Child</Text>
    </KuyaraThemeProvider>,
  );
  await waitFor(() => expect(setColorScheme).toHaveBeenLastCalledWith('unspecified'));
});
