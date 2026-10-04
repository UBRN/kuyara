import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { AccountApplicationProvider } from '@/features/account/application/account-application-provider';
import { useAccountScreens } from '@/features/account/application/account-screens-context';

let mockEnabled = true;
jest.mock('@/features/account/application/account-screens-flag', () => ({
  get ACCOUNT_SCREENS_ENABLED() {
    return mockEnabled;
  },
}));
// The settings are missing or invalid in this build.
jest.mock('@/config/supabase-settings', () => ({ resolveSupabaseSettings: () => null }));
jest.mock('@/infrastructure/sqlite/open-migrated-database', () => ({
  openMigratedDatabase: () => Promise.reject(new Error('never opened without settings')),
}));
jest.mock('@/infrastructure/sqlite/expo-sqlite-database', () => ({ subscribeDatabaseWrites: () => () => undefined }));

function Probe() {
  const { port, snapshot } = useAccountScreens();
  return (
    <Pressable onPress={() => port.signIn('apple')} testID="sign-in">
      <Text testID="probe">{`${snapshot.session.kind} ${snapshot.signIn.kind}`}</Text>
    </Pressable>
  );
}

describe('accounts switched on without valid Supabase settings', () => {
  afterEach(() => {
    mockEnabled = true;
  });

  test('the screens get the closed port: a sign-in fails and nobody is signed in', async () => {
    const screen = await render(<AccountApplicationProvider localProfileId="profile"><Probe /></AccountApplicationProvider>);
    expect(screen.getByTestId('probe')).toHaveTextContent('signedOut idle');
    await fireEvent.press(screen.getByTestId('sign-in'));
    expect(screen.getByTestId('probe')).toHaveTextContent('signedOut failed');
  });

  test('with the screens off the provider leaves the context default, the in-memory port the closed one replaces', async () => {
    mockEnabled = false;
    const screen = await render(<AccountApplicationProvider localProfileId="profile"><Probe /></AccountApplicationProvider>);
    expect(screen.getByTestId('probe')).toHaveTextContent('signedOut idle');
    // The in-memory port pretends a sign-in works; it is why it must never serve live screens.
    await fireEvent.press(screen.getByTestId('sign-in'));
    expect(screen.getByTestId('probe')).toHaveTextContent('signedIn idle');
  });
});
