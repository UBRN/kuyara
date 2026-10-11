import { Tabs, router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { act, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import * as profileStackLayout from '@/app/(tabs)/(profile)/_layout';
import * as todayStackLayout from '@/app/(tabs)/(today)/_layout';
import * as weatherStackLayout from '@/app/(tabs)/weather/_layout';
import { type TabRootHref, useOpenTabRoot } from '@/navigation/open-tab-root';

// The real tab-stack layouts over stub leaves, as in the anchor test. A notification tap, the
// empty History's "Go to Today" and the restarted tour return to Today's root; the tour's
// stand-in for the Profile tab returns to Profile's root. Neither leaves a second root on top
// of a screen the stack still holds.
function leaf(label: string) {
  return function Leaf() {
    return <Text>{label}</Text>;
  };
}

const probe: { openTabRoot: (href: TabRootHref) => void } = { openTabRoot: () => undefined };
function ProbedTabs() {
  const openTabRoot = useOpenTabRoot();
  useEffect(() => {
    probe.openTabRoot = openTabRoot;
  }, [openTabRoot]);
  return <Tabs />;
}

type RouteState = Readonly<{ name: string; state?: { routes: readonly RouteState[] } }>;

function stackRoutes(state: { routes: readonly RouteState[] } | undefined, name: string): string[] | null {
  for (const route of state?.routes ?? []) {
    if (route.name === name) return route.state?.routes.map((child) => child.name) ?? [];
    const found = stackRoutes(route.state, name);
    if (found) return found;
  }
  return null;
}

async function renderApp(initialUrl: string) {
  const result = renderRouter(
    {
      '(tabs)/_layout': ProbedTabs,
      '(tabs)/(today)/_layout': todayStackLayout,
      '(tabs)/(today)/index': leaf('Today root'),
      '(tabs)/(today)/[id]': leaf('Outfit detail'),
      '(tabs)/weather/_layout': weatherStackLayout,
      '(tabs)/weather/index': leaf('Weather root'),
      '(tabs)/(profile)/_layout': profileStackLayout,
      '(tabs)/(profile)/history': leaf('History'),
      '(tabs)/(profile)/profile': leaf('Profile root'),
      '(tabs)/(profile)/settings/index': leaf('Settings'),
      '(tabs)/(profile)/wardrobe/index': leaf('Closet'),
    },
    { initialUrl },
  );
  // The render result is itself awaitable, so it is wrapped rather than returned.
  await result;
  return {
    stack: (name: string) => stackRoutes(result.getRouterState(), name),
    pathname: () => result.getPathname(),
  };
}

async function openOutfitDetail() {
  await act(() => router.push({ pathname: '/[id]', params: { id: 'outfit-1' } }));
  expect(screen.getByText('Outfit detail')).toBeOnTheScreen();
}

describe('opening a tab at its root', () => {
  it('returns from an open outfit detail to Today root', async () => {
    const app = await renderApp('/');
    await openOutfitDetail();

    await act(() => probe.openTabRoot('/'));

    expect(app.stack('(today)')).toEqual(['index']);
    expect(screen.queryByText('Outfit detail')).toBeNull();
    expect(app.pathname()).toBe('/');
  });

  it.each([
    ['Profile', [], ['profile']],
    ['History', ['/history'], ['profile', 'history']],
    ['Closet', ['/wardrobe'], ['profile', 'wardrobe/index']],
  ] as const)('opens Today root from %s while Today holds an outfit detail', async (_, pushed, profile) => {
    const app = await renderApp('/');
    await openOutfitDetail();
    await act(() => router.navigate('/profile'));
    for (const href of pushed) await act(() => router.push(href));

    await act(() => probe.openTabRoot('/'));

    expect(app.stack('(today)')).toEqual(['index']);
    expect(screen.queryByText('Outfit detail')).toBeNull();
    expect(app.pathname()).toBe('/');
    // Only Today's stack is popped; Profile keeps the screen it was left on.
    expect(app.stack('(profile)')).toEqual(profile);
  });

  it('restarts the tour from Settings over Today root with Profile at its root', async () => {
    const app = await renderApp('/');
    await openOutfitDetail();
    await act(() => router.navigate('/profile'));
    await act(() => router.push('/settings'));

    await act(() => {
      router.dismissAll();
      probe.openTabRoot('/');
    });

    expect(app.stack('(today)')).toEqual(['index']);
    expect(app.stack('(profile)')).toEqual(['profile']);
    expect(app.pathname()).toBe('/');
  });

  it.each(['/', '/profile'])('opens a bare Today root from %s without an error', async (start) => {
    const app = await renderApp(start);

    await act(() => probe.openTabRoot('/'));

    expect(app.stack('(today)')).toEqual(['index']);
    expect(app.pathname()).toBe('/');
  });

  it('opens Profile root from Today while Profile holds History', async () => {
    const app = await renderApp('/profile');
    await act(() => router.push('/history'));
    await act(() => router.navigate('/'));

    await act(() => probe.openTabRoot('/profile'));

    expect(app.stack('(profile)')).toEqual(['profile']);
    expect(app.pathname()).toBe('/profile');
  });

  it('opens a bare Profile root from Today without an error', async () => {
    const app = await renderApp('/');

    await act(() => probe.openTabRoot('/profile'));

    expect(app.stack('(profile)')).toEqual(['profile']);
    expect(app.pathname()).toBe('/profile');
  });
});
