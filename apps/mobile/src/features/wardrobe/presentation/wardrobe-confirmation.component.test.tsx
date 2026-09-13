import { Alert } from 'react-native';

import { showWardrobeConfirmation } from '@/features/wardrobe/presentation/wardrobe-confirmation';

jest.mock('@/components/ui', () => ({
  haptics: { warning: jest.fn() },
}));

test('passes the resolved scheme as the alert userInterfaceStyle so the native alert does not inherit the alert window appearance', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const onConfirm = jest.fn();

  showWardrobeConfirmation(
    {
      title: 'Discard changes?',
      message: 'Your edits will be lost.',
      cancelLabel: 'Keep editing',
      confirmLabel: 'Discard',
      destructive: true,
      colorScheme: 'dark',
    },
    onConfirm,
  );

  expect(alertSpy).toHaveBeenCalledWith(
    'Discard changes?',
    'Your edits will be lost.',
    expect.any(Array),
    { userInterfaceStyle: 'dark' },
  );

  alertSpy.mockRestore();
});
