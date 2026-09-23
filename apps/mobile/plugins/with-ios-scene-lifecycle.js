// Adopts the UIKit scene-based life cycle on iOS. Apps built with the iOS 27 SDK assert at
// launch without it (Expo SDK 57 changelog, PR #46733). Expo 57 ships `ExpoAppSceneDelegate`
// but its prebuild template still starts React Native from the app delegate, so this plugin
// does what the SDK 58 template does: declare the scene manifest and let the scene delegate
// create the window. It applies only to the generated iOS project (CNG); Android is untouched.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const sceneDelegateClassName = 'EXExpoAppSceneDelegate';

function withSceneManifest(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: sceneDelegateClassName,
          },
        ],
      },
    };
    return mod;
  });
}

const templateStart = /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\(\s*\n\s*withModuleName: "main",\s*\n\s*in: window,\s*\n\s*launchOptions: launchOptions\)\s*\n#endif\n/;
const replacement =
  '    // The window is created and React Native is started by the scene delegate under the\n' +
  '    // scene-based life cycle (required by the iOS 27 SDK); see plugins/with-ios-scene-lifecycle.js.\n';

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;
    if (mod.modResults.language !== 'swift') {
      throw new Error('with-ios-scene-lifecycle expects a Swift AppDelegate.');
    }
    if (!contents.includes('ExpoReactNativeFactoryProvider')) {
      const declaration = 'class AppDelegate: ExpoAppDelegate {';
      if (!contents.includes(declaration)) {
        throw new Error('with-ios-scene-lifecycle: AppDelegate declaration not found; the template changed.');
      }
      contents = contents.replace(declaration, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    }
    if (templateStart.test(contents)) {
      contents = contents.replace(templateStart, replacement);
    } else if (contents.includes('startReactNative(') || !contents.includes('with-ios-scene-lifecycle.js')) {
      throw new Error('with-ios-scene-lifecycle: startReactNative block not found; the template changed.');
    }
    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = function withIosSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
