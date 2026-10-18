import { Tabs, useLocalSearchParams } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';

import * as profileStackLayout from '@/app/(tabs)/(profile)/_layout';
import WardrobeNewRoute from '@/app/(tabs)/(profile)/wardrobe/new';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@/features/wardrobe/application/use-visible-closet-categories', () => ({
  useVisibleClosetCategories: () =>
    jest.requireActual('@/features/catalog/domain/garment-taxonomy').structuralCategories,
}));

// The real add route under the real router, with a stand-in form that shows the phrase it
// was handed and the phrase still left in the route.
jest.mock('@/features/wardrobe/presentation/wardrobe-item-routes', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  const { useLocalSearchParams: useParams } = jest.requireActual<typeof import('expo-router')>('expo-router');
  return {
    WardrobeNewItemRoute: ({ initialPhrase }: { initialPhrase?: string }) => {
      const { phrase } = useParams<{ phrase?: string }>();
      return <MockText>{`Form ${initialPhrase ?? '-'} route ${phrase ?? '-'}`}</MockText>;
    },
  };
});

function Providers({ children }: PropsWithChildren) {
  return (
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
}

function Closet() {
  const { category } = useLocalSearchParams<{ category?: string }>();
  return <Text>{`Closet ${category ?? '-'}`}</Text>;
}

async function renderNew(initialUrl: string) {
  await renderRouter(
    {
      '(tabs)/_layout': () => <Tabs />,
      '(tabs)/(profile)/_layout': profileStackLayout,
      '(tabs)/(profile)/profile': () => <Text>Profile root</Text>,
      '(tabs)/(profile)/wardrobe/index': Closet,
      '(tabs)/(profile)/wardrobe/new': WardrobeNewRoute,
      '(tabs)/(profile)/wardrobe/[id]': Closet,
    },
    { initialUrl, wrapper: Providers },
  );
}

it('the add route hands its phrase to the form once and drops it from the route', async () => {
  await renderNew('/wardrobe/new?phrase=lacivert%20keten%20g%C3%B6mlek');

  expect(await screen.findByText('Form lacivert keten gömlek route -')).toBeOnTheScreen();
});

it('the add route without a phrase hands the form none', async () => {
  await renderNew('/wardrobe/new?category=top');

  expect(screen.getByText('Form - route -')).toBeOnTheScreen();
});

it('the add route hands the form no phrase when the link repeats it', async () => {
  await renderNew('/wardrobe/new?phrase=gomlek&phrase=kazak');

  expect(await screen.findByText('Form - route -')).toBeOnTheScreen();
});
