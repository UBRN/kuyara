import { render } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import {
  categoryTabListRole,
  WardrobeCategoryChip,
} from '@/features/wardrobe/presentation/wardrobe-category-chip';
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

// R10-4: React Native gives `tab` and `tablist` no iOS trait, so VoiceOver heard neither a tab
// nor a button. On iOS the strip is a `tabbar` container of buttons with a selected state, the
// shape of UIKit's own tab bar; Android keeps the roles TalkBack reads.
async function renderTab(selected: boolean) {
  return render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <WardrobeCategoryChip
        category="top"
        count={3}
        label="Tops"
        onPress={() => undefined}
        role="tab"
        selected={selected}
        testID="tab"
      />
    </KuyaraThemeContext.Provider>,
  );
}

test('on iOS a category tab is a button with its selected state, inside a tab bar container', async () => {
  const selected = await renderTab(true);
  expect(selected.getByTestId('tab').props.accessibilityRole).toBe('button');
  expect(selected.getByTestId('tab').props.accessibilityState).toEqual({ selected: true });
  const other = await renderTab(false);
  expect(other.getByTestId('tab').props.accessibilityState).toEqual({ selected: false });
  expect(categoryTabListRole()).toBe('tabbar');
});

test('on Android a category tab keeps the tab and tab list roles', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const result = await renderTab(true);
    expect(result.getByTestId('tab').props.accessibilityRole).toBe('tab');
    expect(result.getByTestId('tab').props.accessibilityState).toEqual({ selected: true });
    expect(categoryTabListRole()).toBe('tablist');
  } finally {
    platform.restore();
  }
});

test('a type chip stays a radio on both platforms', async () => {
  const ios = await renderChip('Tek parça');
  expect(ios.getByTestId('chip').props.accessibilityRole).toBe('radio');
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const android = await renderChip('Tek parça');
    expect(android.getByTestId('chip').props.accessibilityRole).toBe('radio');
  } finally {
    platform.restore();
  }
});
