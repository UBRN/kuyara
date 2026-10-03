import { Dimensions } from 'react-native';

const originalWindowDimensions = Dimensions.get('window');

// `useWindowDimensions` seeds its initial state from `Dimensions.get('window')`, so setting
// it before render, the way `react-native`'s own test utilities do, is what reaches the
// hook; a jest.spyOn of the exported hook function does not. A test restores the window
// with `Dimensions.set` in its own `afterEach`.
export function mockFontScale(fontScale: number) {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
}
