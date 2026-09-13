const path = require('node:path');
const { createRequire, Module } = require('node:module');

// PostHog loads Metro internals but publishes Metro only as a dev dependency. Expose the
// Metro version already installed through Expo so strict pnpm resolution can load the helper.
const expoRequire = createRequire(require.resolve('expo/metro-config'));
const expoMetroConfigRequire = createRequire(expoRequire.resolve('@expo/metro-config'));
const expoMetroPackage = expoMetroConfigRequire.resolve('@expo/metro/package.json');
const metroPackage = createRequire(expoMetroPackage).resolve('metro/package.json');
const metroNodeModules = path.dirname(path.dirname(metroPackage));
process.env.NODE_PATH = [metroNodeModules, process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

const { getPostHogExpoConfig } = require('posthog-react-native/metro');

module.exports = getPostHogExpoConfig(__dirname);
