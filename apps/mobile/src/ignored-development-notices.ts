import { LogBox } from 'react-native';

// Reanimated prints two development-only notices about the system motion setting: one while
// it is imported, whenever that setting is on, and one each time the root layout turns the
// setting's default off. Every animation plays in full (ADR 0020), so neither carries
// anything to act on. The patterns have to be registered before the app tree imports
// Reanimated, because React Native checks the ignore list when the warning is emitted, so
// this module is imported first from the entry.
LogBox.ignoreLogs([
  '[Reanimated] Reduced motion setting is enabled on this device.',
  '[Reanimated] Reduced motion setting is overwritten with mode',
]);
