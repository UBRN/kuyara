import { Tabs, router, useLocalSearchParams } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import * as profileStackLayout from '@/app/(tabs)/(profile)/_layout';
import type { WardrobeConfirmation } from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { useWardrobeExitGuard } from '@/features/wardrobe/presentation/wardrobe-item-routes';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

// The real Profile stack under the real router: the form's exits against the stack they
// leave behind. A finished add, edit or delete returns to the Closet the form was pushed
// from, never a second one on top of it, so back from there is Profile.
let dirty = false;
let confirmation: jest.MockedFunction<WardrobeConfirmation>;

function Closet() {
  const { added, category, filter } = useLocalSearchParams<{ added?: string; category?: string; filter?: string }>();
  return <Text>{`Closet ${category ?? '-'} ${filter ?? '-'} ${added ?? '-'}`}</Text>;
}

function FormExits() {
  const guard = useWardrobeExitGuard(dirty, confirmation);
  return (
    <>
      <Text>Form</Text>
      <Pressable accessibilityRole="button" onPress={guard.cancel}><Text>Cancel</Text></Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => guard.returnToList({ added: 'saved-id', category: 'shoes', filter: 'wanted' })}>
        <Text>Save</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => guard.returnToList()}><Text>Return</Text></Pressable>
    </>
  );
}

function Form() {
  return (
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <FormExits />
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
}

async function renderApp(initialUrl: string) {
  await renderRouter(
    {
      '(tabs)/_layout': () => <Tabs />,
      '(tabs)/(profile)/_layout': profileStackLayout,
      '(tabs)/(profile)/profile': () => <Text>Profile root</Text>,
      '(tabs)/(profile)/wardrobe/index': Closet,
      '(tabs)/(profile)/wardrobe/new': Form,
      '(tabs)/(profile)/wardrobe/[id]': Form,
    },
    { initialUrl },
  );
}

beforeEach(() => {
  dirty = false;
  confirmation = jest.fn();
});

it.each(['/wardrobe/new', '/wardrobe/some-piece'] as const)(
  'a save pushed from the Closet pops back to it with the saved params, and back is Profile (%s)',
  async (form) => {
    await renderApp('/wardrobe?category=top');
    expect(screen.getByText('Closet top - -')).toBeOnTheScreen();
    await act(() => router.push(form));
    expect(screen.getByText('Form')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Closet shoes wanted saved-id')).toBeOnTheScreen();

    await act(() => router.back());
    expect(screen.getByText('Profile root')).toBeOnTheScreen();
  },
);

it.each(['Save', 'Return'])('a deep-linked form with no Closet beneath still ends on one (%s)', async (exit) => {
  await renderApp('/wardrobe/new');
  expect(screen.getByText('Form')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: exit }));
  expect(screen.getByText(exit === 'Save' ? 'Closet shoes wanted saved-id' : 'Closet - - -')).toBeOnTheScreen();

  await act(() => router.back());
  expect(screen.getByText('Profile root')).toBeOnTheScreen();
});

it('a dirty form confirms Cancel, and a finished save leaves without asking', async () => {
  dirty = true;
  await renderApp('/wardrobe');
  await act(() => router.push('/wardrobe/new'));

  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(confirmation).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Form')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(confirmation).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Closet shoes wanted saved-id')).toBeOnTheScreen();
  await act(() => router.back());
  expect(screen.getByText('Profile root')).toBeOnTheScreen();
});
