import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { WardrobeCategoryChip } from '@/features/wardrobe/presentation/wardrobe-category-chip';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

async function renderChip(label: string) {
  return render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <WardrobeCategoryChip
        label={label}
        onPress={() => undefined}
        selected={false}
        testID="chip"
      />
    </KuyaraThemeContext.Provider>,
  );
}

test('sets a minimum height rather than a fixed one, so a longer label is not clipped', async () => {
  const result = await renderChip('Tek parça');
  const style = StyleSheet.flatten(result.getByTestId('chip').props.style);

  expect(style.minHeight).toBe(40);
  expect(style.height).toBeUndefined();
});
