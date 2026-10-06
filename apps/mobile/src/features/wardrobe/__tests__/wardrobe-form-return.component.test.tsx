import { Tabs, router, useLocalSearchParams } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Pressable, Text } from 'react-native';

import * as profileStackLayout from '@/app/(tabs)/(profile)/_layout';
import WardrobeRoute from '@/app/(tabs)/(profile)/wardrobe/index';
import type { WardrobeConfirmation } from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { useWardrobeExitGuard } from '@/features/wardrobe/presentation/wardrobe-item-routes';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('@/features/wardrobe/application/use-visible-closet-categories', () => ({
  useVisibleClosetCategories: () =>
    jest.requireActual('@/features/catalog/domain/garment-taxonomy').structuralCategories,
}));

// The real Closet route renders this stand-in for its list, which counts its own mounts:
// a mount is the list starting afresh, its tiles entering again.
let mockListMounts = 0;
jest.mock('@/features/wardrobe/presentation/wardrobe-list-route', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WardrobeListRoute: ({ savedItemId }: { savedItemId: string | null }) => {
      useEffect(() => {
        mockListMounts += 1;
      }, []);
      return <MockText>{`Closet list ${savedItemId ?? '-'}`}</MockText>;
    },
  };
});

const savedId = '5f0c6a4e-2b1d-4c3e-9f8a-7b6c5d4e3f2a';

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

function SaveExit() {
  const guard = useWardrobeExitGuard(false, confirmation);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => guard.returnToList({ added: savedId, category: 'top', filter: 'owned' })}>
      <Text>Add</Text>
    </Pressable>
  );
}

function EditExit() {
  const guard = useWardrobeExitGuard(false, confirmation);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => guard.returnToList({ category: 'top', filter: 'owned' })}>
      <Text>Update</Text>
    </Pressable>
  );
}

function Providers({ children }: PropsWithChildren) {
  return (
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
}

function Form() {
  return (
    <Providers>
      <FormExits />
    </Providers>
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
  mockListMounts = 0;
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

it('an edit after an add returns to the same Closet list, and the add is no longer news', async () => {
  await renderRouter(
    {
      '(tabs)/_layout': () => <Tabs />,
      '(tabs)/(profile)/_layout': profileStackLayout,
      '(tabs)/(profile)/profile': () => <Text>Profile root</Text>,
      '(tabs)/(profile)/wardrobe/index': WardrobeRoute,
      '(tabs)/(profile)/wardrobe/new': SaveExit,
      '(tabs)/(profile)/wardrobe/[id]': EditExit,
    },
    { initialUrl: '/wardrobe?category=top', wrapper: Providers },
  );
  expect(screen.getByText('Closet list -')).toBeOnTheScreen();

  await act(() => router.push('/wardrobe/new'));
  await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
  // The saved tile is news: the list starts afresh so that tile alone arrives.
  expect(screen.getByText(`Closet list ${savedId}`)).toBeOnTheScreen();
  const mountsAfterAdd = mockListMounts;

  // A tab switch only swaps the category, so the add is still the one announced.
  await act(() => router.setParams({ category: 'bottom' }));
  expect(screen.getByText(`Closet list ${savedId}`)).toBeOnTheScreen();

  // Editing another piece returns to the same list, and its Undo no longer belongs there.
  await act(() => router.push('/wardrobe/another-piece'));
  await fireEvent.press(screen.getByRole('button', { name: 'Update' }));
  expect(screen.getByText('Closet list -')).toBeOnTheScreen();
  expect(mockListMounts).toBe(mountsAfterAdd);
});
