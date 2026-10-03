import { act, renderHook } from '@testing-library/react-native';

import { useStagedWardrobePhoto } from '@/features/wardrobe/presentation/use-staged-wardrobe-photo';

const first = { id: 'a3b1d6a4-3d1c-4b36-9a11-2f4f7c1d0e01', previewUri: 'file:///cache/first.jpg' };
const second = { id: 'a3b1d6a4-3d1c-4b36-9a11-2f4f7c1d0e02', previewUri: 'file:///cache/second.jpg' };
const stored = 'file:///documents/stored.jpg';

async function setup() {
  const discard = jest.fn(async () => undefined);
  const hook = await renderHook(() => useStagedWardrobePhoto(discard, stored));
  return { discard, hook };
}

test('the preview is the staged file, nothing once removed, else the stored photo', async () => {
  const { hook } = await setup();
  expect(hook.result.current.previewUri).toBe(stored);
  await act(async () => { hook.result.current.changePhoto({ kind: 'replace', stagedPhoto: first }); });
  expect(hook.result.current.previewUri).toBe(first.previewUri);
  await act(async () => { hook.result.current.changePhoto({ kind: 'remove' }); });
  expect(hook.result.current.previewUri).toBeNull();
});

test('a replaced or removed staged file is discarded', async () => {
  const { discard, hook } = await setup();
  await act(async () => { hook.result.current.changePhoto({ kind: 'replace', stagedPhoto: first }); });
  await act(async () => { hook.result.current.changePhoto({ kind: 'replace', stagedPhoto: second }); });
  expect(discard).toHaveBeenCalledWith(first);
  await act(async () => { hook.result.current.changePhoto({ kind: 'remove' }); });
  expect(discard.mock.calls).toEqual([[first], [second]]);
});

test('an unsaved staged file is discarded when the form leaves', async () => {
  const { discard, hook } = await setup();
  await act(async () => { hook.result.current.changePhoto({ kind: 'replace', stagedPhoto: first }); });
  await hook.unmount();
  expect(discard.mock.calls).toEqual([[first]]);
});

test('a file picked after the form left is discarded and not applied', async () => {
  const { discard, hook } = await setup();
  const { changePhoto } = hook.result.current;
  await hook.unmount();
  expect(changePhoto({ kind: 'replace', stagedPhoto: first })).toBe(false);
  expect(discard.mock.calls).toEqual([[first]]);
});

test('a committed file is never discarded', async () => {
  const { discard, hook } = await setup();
  await act(async () => { hook.result.current.changePhoto({ kind: 'replace', stagedPhoto: first }); });
  hook.result.current.commitPhoto();
  await hook.unmount();
  expect(discard).not.toHaveBeenCalled();
});
