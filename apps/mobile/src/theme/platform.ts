import { Platform } from 'react-native';

export const platformLayout = Object.freeze({
  bottomTabInset: Platform.select({ ios: 50, android: 80, default: 0 }),
});
