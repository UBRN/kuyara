import { openBrowserAsync } from 'expo-web-browser';

/**
 * Opens a web page over the app in the system's in-app browser (Safari View Controller on
 * iOS, a Custom Tab on Android), so closing it returns to the screen that opened it. The only
 * importer of the browser package outside sign-in. Store pages and mail links are not web
 * pages: they open in their own app through `Linking`.
 */
export function openWebPage(url: string): void {
  void openBrowserAsync(url).catch(() => {
    // A page the system cannot show leaves the screen as it was; nothing is lost.
  });
}
