import assert from 'node:assert/strict';
import test from 'node:test';

import { createLaunchSession } from './application/launch-session.ts';
import { sessionMayAskForConsent } from './domain/analytics-session.ts';
import { createLaunchVisibility } from './domain/launch-visibility.ts';

function appStateStartingIn(initial) {
  const listeners = new Set();
  return {
    initial,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change(state) {
      for (const listener of [...listeners]) listener(state);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

test('a launch that starts in the foreground is seen at once, inactive included', () => {
  for (const initial of ['active', 'inactive', 'unknown', null]) {
    const appState = appStateStartingIn(initial);
    const visibility = createLaunchVisibility(appState);
    let seen = 0;
    visibility.onSeen(() => { seen += 1; });

    assert.equal(seen, 1, String(initial));
    assert.equal(appState.listenerCount, 0, String(initial));
  }
});

test('a background launch is seen only when the app first becomes active', () => {
  const appState = appStateStartingIn('background');
  const visibility = createLaunchVisibility(appState);
  let seen = 0;
  visibility.onSeen(() => { seen += 1; });

  appState.change('background');
  appState.change('inactive');
  assert.equal(seen, 0);

  appState.change('active');
  appState.change('background');
  appState.change('active');
  assert.equal(seen, 1);
  assert.equal(appState.listenerCount, 0);

  visibility.onSeen(() => { seen += 1; });
  assert.equal(seen, 2);
});

test('a launch first timed while seen stays timed', () => {
  const visibility = createLaunchVisibility(appStateStartingIn('active'));

  assert.equal(visibility.isTimed(), true);
  assert.equal(visibility.isTimed(), true);
});

test('a background launch first timed off screen is never timed, even once it is opened', () => {
  const appState = appStateStartingIn('background');
  const visibility = createLaunchVisibility(appState);

  assert.equal(visibility.isTimed(), false);
  appState.change('active');
  assert.equal(visibility.isTimed(), false);
});

test('a background start opened before its first metric is timed', () => {
  // A foreground launch can read `background` before its scene connects; it is corrected to
  // `active` long before Today first draws.
  const appState = appStateStartingIn('background');
  const visibility = createLaunchVisibility(appState);

  appState.change('active');
  assert.equal(visibility.isTimed(), true);
});

test('a foreground launch counts its session at once, before anything renders', () => {
  let counted = 0;
  const session = createLaunchSession(
    createLaunchVisibility(appStateStartingIn('active')),
    () => { counted += 1; return 4; },
  );

  assert.equal(counted, 1);
  assert.equal(session.current(), 4);
});

test('a background launch counts no session until it is opened, then exactly one', () => {
  const appState = appStateStartingIn('background');
  let counted = 0;
  const session = createLaunchSession(
    createLaunchVisibility(appState),
    () => { counted += 1; return 2; },
  );
  let notified = 0;
  session.subscribe(() => { notified += 1; });

  assert.equal(counted, 0);
  assert.equal(session.current(), null);

  appState.change('active');
  appState.change('background');
  appState.change('active');
  assert.equal(counted, 1);
  assert.equal(notified, 1);
  assert.equal(session.current(), 2);
});

// ADR 0033 section 6: a launch nobody has seen is no session, so it cannot ask either.
test('an uncounted launch never asks for consent', () => {
  assert.equal(sessionMayAskForConsent(null), false);
});
