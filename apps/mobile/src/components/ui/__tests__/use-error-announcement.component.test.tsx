import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';

const line = 'Could not refresh';
type Props = Readonly<{ message: string | null | undefined }>;

let announce: jest.SpyInstance;
beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});
afterEach(() => announce.mockRestore());

test('a line that appears while the screen is up is spoken once', async () => {
  const { rerender } = await renderHook(({ message }: Props) => useErrorAnnouncement(message, { skipInitial: true }),
    { initialProps: { message: null } as Props });
  await rerender({ message: line });
  await rerender({ message: line });
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith(line);
});

test('a failure persisted before the screen opened is not spoken, loaded at once or after loading', async () => {
  await renderHook(() => useErrorAnnouncement(line, { skipInitial: true }));
  expect(announce).not.toHaveBeenCalled();

  const { rerender } = await renderHook(
    ({ message }: Props) => useErrorAnnouncement(message, { skipInitial: true }),
    { initialProps: { message: undefined } as Props });
  await rerender({ message: line });
  expect(announce).not.toHaveBeenCalled();
  // It goes, and a new one raised while the screen is up is spoken.
  await rerender({ message: null });
  await rerender({ message: line });
  expect(announce).toHaveBeenCalledTimes(1);
});

test('an error line without skipInitial speaks on mount', async () => {
  await renderHook(() => useErrorAnnouncement(line));
  expect(announce).toHaveBeenCalledWith(line);
});
