import { render } from '@testing-library/react-native';

import WeatherLocationRoute from '@/app/(tabs)/weather/location';
import { messages } from '@/localization/messages';

const mockStackScreen = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: (props: unknown) => { mockStackScreen(props); return null; } },
}));
jest.mock('@/features/analytics/application/use-screen-viewed', () => ({ useScreenViewed: jest.fn() }));
jest.mock('@/features/weather/presentation/weather-location-screen', () => ({ WeatherLocationScreen: () => null }));
jest.mock('@/localization/use-messages', () => ({
  useMessages: () => jest.requireActual('@/localization/messages').messages.tr,
}));

test('place search names its way back in the current language', async () => {
  // The Weather root sits under this screen while the language changes in Profile, and
  // react-native-screens refreshes a screen's native title only while it is on top, so an
  // inherited back title would keep the old language.
  await render(<WeatherLocationRoute />);
  expect(mockStackScreen).toHaveBeenLastCalledWith({
    options: expect.objectContaining({ headerBackTitle: messages.tr.weather.title }),
  });
});
