import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PreferenceOption } from '@/features/profile/presentation/preference-option';
import { darkTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

async function optionStyle(selected: boolean) {
  const result = await render(
    <KuyaraThemeContext.Provider value={darkTheme}>
      <PreferenceOption
        label="Formal"
        onPress={() => undefined}
        selected={selected}
        testID="option"
      />
    </KuyaraThemeContext.Provider>,
  );

  return StyleSheet.flatten(result.getByTestId('option').props.style);
}

// In dark `brandPrimary` and `brandAccent` are the same hex, so a filled selected option
// put three fills of one hue into onboarding step 2 where Law 1 allows one. Selection is a
// ring plus a filled glyph, leaving the viewport's single accent fill to Continue.
test('marks a selected option with a brandAccent ring rather than an accent fill', async () => {
  const selected = await optionStyle(true);
  const unselected = await optionStyle(false);

  expect(selected.backgroundColor).toBe(darkTheme.colors.surface);
  expect(selected.borderColor).toBe(darkTheme.colors.brandAccent);
  expect(unselected.backgroundColor).toBe(darkTheme.colors.surface);
  expect(unselected.borderColor).toBe(darkTheme.colors.borderDefined);
  // The ring is drawn in both states, so selecting one never reflows the step.
  expect(selected.borderWidth).toBe(unselected.borderWidth);
});
