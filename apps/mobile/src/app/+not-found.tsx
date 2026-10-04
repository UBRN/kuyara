import { Redirect } from 'expo-router';

// A kuyara:// link to a path the app does not have opens Today instead of the router's own
// untranslated page.
export default function NotFoundRoute() {
  return <Redirect href="/" />;
}
