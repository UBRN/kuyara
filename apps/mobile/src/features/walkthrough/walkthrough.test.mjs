import assert from 'node:assert/strict';
import test from 'node:test';

import { WalkthroughController } from './application/walkthrough-controller.ts';
import {
  classifyTourRoute,
  isDeepLinkLaunch,
  isProfileHostedPath,
  isWalkthroughDue,
  routeOutcome,
  sheetOutcome,
  walkthroughOpening,
} from './domain/walkthrough-rules.ts';
import { fullTourPlan, planTour, tourSteps } from './domain/walkthrough-steps.ts';
import {
  backButtonRect,
  bubbleBounds,
  holeFor,
  isInView,
  placeBubble,
  ringFor,
  tabItemRect,
  tailOffset,
  unionRects,
} from './presentation/tour-geometry.ts';
import { walkthroughVersion } from '../profile/domain/profile.ts';
import { messages } from '../../localization/messages.ts';

// --- The steps (README "The steps") ---------------------------------------------------

test('the tour has the nine approved steps in order, with their kinds and live controls', () => {
  assert.equal(tourSteps.length, 9);
  assert.deepEqual(tourSteps.map(({ key, screen, kind, live, advanceOn }) =>
    [key, screen, kind, live ?? null, advanceOn ?? null]), [
    ['outfit', 'today', 'tap', 'outfit', 'push'],
    ['piece', 'detail', 'tap', 'piece', 'sheet-open'],
    ['sheet', 'detail', 'back', 'sheet-close', 'sheet-close'],
    ['worn', 'detail', 'look', null, null],
    ['back', 'detail', 'back', 'nav-back', 'pop'],
    ['again', 'today', 'look', null, null],
    ['profileTab', 'today', 'tap', 'tab-profile', 'tab'],
    ['closet', 'profile', 'look', null, null],
    ['history', 'profile', 'look', null, null],
  ]);
  assert.deepEqual(tourSteps[0].lit, ['badge', 'outfit']);
  assert.deepEqual(tourSteps[2].lit, ['sheet-area']);
  assert.deepEqual(tourSteps[7].lit, ['closet-head', 'rack']);
  assert.deepEqual(tourSteps.filter(({ optional }) => optional).map(({ key }) => key), ['again']);
});

test('saving controls are lit and explained but never live', () => {
  const live = tourSteps.map(({ live: id }) => id).filter(Boolean);
  for (const saving of ['sheet-area', 'worn', 'again']) {
    assert.equal(live.includes(saving), false, saving);
  }
  for (const step of tourSteps) {
    assert.equal(step.kind === 'look', step.live === undefined, step.key);
    assert.equal(step.kind === 'look', step.advanceOn === undefined, step.key);
  }
});

// --- The gate (ADR 0036) ----------------------------------------------------------------

test('the tour is due while the stored gate is below the code version 1', () => {
  assert.equal(walkthroughVersion, 1);
  assert.equal(isWalkthroughDue(0), true);
  assert.equal(isWalkthroughDue(undefined), true);
  assert.equal(isWalkthroughDue(1), false);
  assert.equal(isWalkthroughDue(2), false);
});

// --- When it opens (README "When it opens") --------------------------------------------

const quiet = Object.freeze({
  running: false,
  due: true,
  autoOpenedThisLaunch: false,
  newUserSession: false,
  claims: new Set(),
  manualPending: false,
  onToday: true,
  todaySettled: true,
  overlayOpen: false,
});

test('an existing user gets the tour on a quiet launch, over a settled outfit on Today', () => {
  assert.equal(walkthroughOpening(quiet), 'auto');
});

test('a new user gets it in the onboarding session once the first outfit has arrived', () => {
  const newUser = { ...quiet, newUserSession: true };
  // The first day-type question gates the first outfit; it does not claim that session.
  assert.equal(walkthroughOpening({ ...newUser, claims: new Set(['day-question']) }), 'auto');
  // Never over the runway: Today reports no settled outfit until the runway has gone.
  assert.equal(walkthroughOpening({ ...newUser, todaySettled: false }), null);
  // Any other claim still waits for the next quiet launch.
  assert.equal(walkthroughOpening({ ...newUser, claims: new Set(['analytics-consent']) }), null);
});

for (const claim of ['day-question', 'name-prompt', 'analytics-consent', 'notification', 'deep-link']) {
  test(`one overlay per launch: a launch claimed by ${claim} waits for the next quiet launch`, () => {
    assert.equal(walkthroughOpening({ ...quiet, claims: new Set([claim]) }), null);
  });
}

test('only on Today, only over a settled outfit, never over another sheet or prompt', () => {
  assert.equal(walkthroughOpening({ ...quiet, onToday: false }), null);
  assert.equal(walkthroughOpening({ ...quiet, todaySettled: false }), null);
  assert.equal(walkthroughOpening({ ...quiet, overlayOpen: true }), null);
  assert.equal(walkthroughOpening({ ...quiet, running: true }), null);
});

test('the offered tour opens once per launch and not at all once the gate is stored', () => {
  // An interrupted tour stored nothing, so it is still due, and waits for the next launch.
  assert.equal(walkthroughOpening({ ...quiet, autoOpenedThisLaunch: true }), null);
  assert.equal(walkthroughOpening({ ...quiet, due: false }), null);
});

test('the Help row tour ignores the gate and the launch claims, but still waits for Today', () => {
  const asked = { ...quiet, manualPending: true, due: false, autoOpenedThisLaunch: true,
    claims: new Set(['deep-link', 'notification']) };
  assert.equal(walkthroughOpening(asked), 'manual');
  assert.equal(walkthroughOpening({ ...asked, onToday: false }), null);
  assert.equal(walkthroughOpening({ ...asked, todaySettled: false }), null);
  assert.equal(walkthroughOpening({ ...asked, overlayOpen: true }), null);
});

test('a deep link starts the router away from Today; a notification tap does not', () => {
  assert.equal(isDeepLinkLaunch('/'), false);
  assert.equal(isDeepLinkLaunch('/onboarding'), false);
  assert.equal(isDeepLinkLaunch('/settings'), true);
  assert.equal(isDeepLinkLaunch('/weather'), true);
  assert.equal(isDeepLinkLaunch('/opt-1'), true);
});

// --- Observing navigation ---------------------------------------------------------------

test('routes classify into Today, an outfit detail, Profile, or elsewhere', () => {
  assert.equal(classifyTourRoute('/'), 'today');
  assert.equal(classifyTourRoute('/opt-3f2a'), 'detail');
  assert.equal(classifyTourRoute('/profile'), 'profile');
  for (const pathname of ['/weather', '/history', '/settings', '/wardrobe', '/onboarding',
    '/analytics-consent', '/settings/privacy', '/wardrobe/item-1', '/weather/location']) {
    assert.equal(classifyTourRoute(pathname), 'other', pathname);
  }
});

test('the Profile tab hosts Settings, the Closet and History below its root, and nothing else', () => {
  for (const pathname of ['/settings', '/settings/privacy', '/wardrobe', '/wardrobe/item-1', '/history']) {
    assert.equal(isProfileHostedPath(pathname), true, pathname);
  }
  for (const pathname of ['/', '/profile', '/weather', '/weather/location', '/opt-3f2a', '/settingsx']) {
    assert.equal(isProfileHostedPath(pathname), false, pathname);
  }
});

test('only the live control\'s own navigation advances a step; any other change interrupts', () => {
  const [outfit, piece, sheet, worn, back, again, profileTab, closet] = tourSteps;
  assert.equal(routeOutcome(outfit, 'today'), 'stay');
  assert.equal(routeOutcome(outfit, 'detail'), 'advance');
  assert.equal(routeOutcome(outfit, 'profile'), 'interrupt');
  assert.equal(routeOutcome(piece, 'detail'), 'stay');
  assert.equal(routeOutcome(piece, 'today'), 'interrupt');
  assert.equal(routeOutcome(worn, 'today'), 'interrupt');
  assert.equal(routeOutcome(back, 'today'), 'advance');
  assert.equal(routeOutcome(again, 'other'), 'interrupt');
  assert.equal(routeOutcome(profileTab, 'profile'), 'advance');
  assert.equal(routeOutcome(profileTab, 'other'), 'interrupt');
  assert.equal(routeOutcome(closet, 'profile'), 'stay');
  assert.equal(sheetOutcome(piece, true), 'advance');
  assert.equal(sheetOutcome(piece, false), 'stay');
  assert.equal(sheetOutcome(sheet, false), 'advance');
  assert.equal(sheetOutcome(sheet, true), 'stay');
  assert.equal(sheetOutcome(worn, true), 'stay');
});

// --- The controller -----------------------------------------------------------------------

function controllerWithGate() {
  const writes = [];
  const controller = new WalkthroughController();
  controller.setGateWriter(async () => { writes.push('write'); });
  return { controller, writes };
}

const position = (controller) => {
  const state = controller.getSnapshot();
  return state.status === 'running' ? [state.stepIndex, state.entry] : state.status;
};

test('the offered tour walks all nine steps and Done stores the gate once', async () => {
  const { controller, writes } = controllerWithGate();
  controller.start('auto');
  assert.deepEqual(position(controller), [0, 'start']);
  controller.continue(); // a tap step has no Continue
  assert.deepEqual(position(controller), [0, 'start']);
  controller.observeRoute('detail');
  assert.deepEqual(position(controller), [1, 'navigation']);
  controller.observeSheet(true);
  assert.deepEqual(position(controller), [2, 'navigation']);
  controller.observeSheet(false);
  assert.deepEqual(position(controller), [3, 'navigation']);
  controller.continue();
  assert.deepEqual(position(controller), [4, 'continue']);
  controller.observeRoute('today');
  assert.deepEqual(position(controller), [5, 'navigation']);
  controller.continue();
  assert.deepEqual(position(controller), [6, 'continue']);
  controller.observeRoute('profile');
  assert.deepEqual(position(controller), [7, 'navigation']);
  controller.continue();
  assert.deepEqual(position(controller), [8, 'continue']);
  assert.deepEqual(writes, []);
  controller.continue();
  assert.equal(position(controller), 'idle');
  await Promise.resolve();
  assert.deepEqual(writes, ['write']);
  controller.skip();
  controller.continue();
  await Promise.resolve();
  assert.deepEqual(writes, ['write']);
});

for (let stepIndex = 0; stepIndex < 9; stepIndex += 1) {
  test(`Skip on step ${stepIndex + 1} stores the gate once for the offered tour`, async () => {
    const { controller, writes } = controllerWithGate();
    controller.start('auto');
    const moves = [
      () => controller.observeRoute('detail'),
      () => controller.observeSheet(true),
      () => controller.observeSheet(false),
      () => controller.continue(),
      () => controller.observeRoute('today'),
      () => controller.continue(),
      () => controller.observeRoute('profile'),
      () => controller.continue(),
    ];
    moves.slice(0, stepIndex).forEach((move) => move());
    assert.deepEqual(position(controller)[0], stepIndex);
    controller.skip();
    controller.skip();
    await Promise.resolve();
    assert.equal(position(controller), 'idle');
    assert.deepEqual(writes, ['write']);
  });
}

test('the Help row tour never touches the gate, whatever closes it', async () => {
  const { controller, writes } = controllerWithGate();
  controller.start('manual');
  controller.skip();
  controller.start('manual');
  for (const move of [
    () => controller.observeRoute('detail'), () => controller.observeSheet(true),
    () => controller.observeSheet(false), () => controller.continue(),
    () => controller.observeRoute('today'), () => controller.continue(),
    () => controller.observeRoute('profile'), () => controller.continue(), () => controller.continue(),
  ]) move();
  assert.equal(position(controller), 'idle');
  await Promise.resolve();
  assert.deepEqual(writes, []);
});

test('an interrupted tour stores nothing and a later run starts over at step 1', async () => {
  const { controller, writes } = controllerWithGate();
  controller.start('auto');
  controller.observeRoute('detail');
  controller.observeRoute('other'); // a deep link or notification mid-tour
  assert.equal(position(controller), 'idle');
  await Promise.resolve();
  assert.deepEqual(writes, []);
  // No step is kept anywhere: the next launch's controller begins at the start.
  const next = new WalkthroughController();
  next.start('auto');
  assert.deepEqual(position(next), [0, 'start']);
  controller.start('auto');
  assert.deepEqual(position(controller), [0, 'start']);
  assert.equal(controller.getSnapshot().run, 2);
});

test('a failed gate write is swallowed and the tour still closes', async () => {
  const controller = new WalkthroughController();
  controller.setGateWriter(async () => { throw new Error('SQLITE_BUSY'); });
  controller.start('auto');
  controller.skip();
  await Promise.resolve();
  assert.equal(position(controller), 'idle');
});

test('a second start while running is ignored', () => {
  const { controller } = controllerWithGate();
  controller.start('auto');
  controller.observeRoute('detail');
  controller.start('manual');
  assert.deepEqual(position(controller), [1, 'navigation']);
  assert.equal(controller.getSnapshot().source, 'auto');
});

// --- Geometry (README "Interaction rules" and "Motion") ----------------------------------

const bounds = bubbleBounds(852, 59, 34);

test('the bubble keeps below Skip\'s row and above the bottom safe area', () => {
  assert.deepEqual(bounds, { top: 59 + 44 + 8, bottom: 852 - 34 - 4 });
  assert.equal(isInView({ x: 0, y: 120, width: 10, height: 10 }, bounds), true);
  assert.equal(isInView({ x: 0, y: 80, width: 10, height: 10 }, bounds), false);
  assert.equal(isInView({ x: 0, y: 800, width: 10, height: 30 }, bounds), false);
});

test('the bubble sits below the lit area when it fits, else above, else tightens once', () => {
  const heights = { normal: 180, tight: 168 };
  assert.deepEqual(placeBubble({ x: 0, y: 150, width: 300, height: 200 }, heights, bounds),
    { top: 362, side: 'below', tight: false });
  assert.deepEqual(placeBubble({ x: 0, y: 500, width: 300, height: 200 }, heights, bounds),
    { top: 308, side: 'above', tight: false });
  // Room for the tightened bubble (8 from the spotlight) but not the normal one.
  const fitsTight = { x: 0, y: 300, width: 300, height: 324 };
  assert.deepEqual(placeBubble(fitsTight, { normal: 190, tight: 180 }, bounds),
    { top: 632, side: 'below', tight: true });
  // Room on neither side (the largest standard text size): the tightened bubble takes the
  // larger side and slides up over the lit area until its last line clears the bottom bound.
  assert.deepEqual(placeBubble({ x: 0, y: 200, width: 300, height: 480 }, heights, bounds),
    { top: 814 - 168, side: 'below', tight: true });
  assert.deepEqual(placeBubble({ x: 0, y: 250, width: 300, height: 480 }, heights, bounds),
    { top: 111, side: 'above', tight: true });
  // No lit area: centred.
  assert.deepEqual(placeBubble(null, heights, bounds), { top: (111 + 814 - 180) / 2, side: 'below', tight: false });
});

test('the spotlight pads the lit area by 10 and follows the controls\' corners', () => {
  const lit = { x: 16, y: 200, width: 361, height: 44 };
  assert.deepEqual(holeFor(lit, 'pill'), { x: 6, y: 190, width: 381, height: 64, radius: 32 });
  assert.deepEqual(holeFor(lit, 26), { x: 6, y: 190, width: 381, height: 64, radius: 32 });
  assert.deepEqual(holeFor({ x: 0, y: 0, width: 300, height: 300 }, 14), {
    x: -10, y: -10, width: 320, height: 320, radius: 24,
  });
  assert.deepEqual(ringFor(lit, 'pill'), { ...lit, radius: 22 });
  assert.deepEqual(ringFor(lit, 14), { ...lit, radius: 14 });
  assert.deepEqual(unionRects([{ x: 10, y: 10, width: 10, height: 10 }, null, { x: 30, y: 0, width: 5, height: 5 }]),
    { x: 10, y: 0, width: 25, height: 20 });
  assert.equal(unionRects([null]), null);
});

test('the tail points at the control and stays clear of the bubble corners', () => {
  assert.equal(tailOffset(196, 361), 196 - 16 - 9);
  assert.equal(tailOffset(0, 361), 18);
  assert.equal(tailOffset(393, 361), 361 - 18 - 18);
});

test('native chrome frames follow the system geometry the prototype drew', () => {
  const iphone = { platform: 'ios', windowWidth: 393, windowHeight: 852, safeTop: 59, safeBottom: 34, fontScale: 1 };
  const tab = tabItemRect(iphone, 2, 3);
  assert.deepEqual(tab, { x: (393 - (94 + 86 * 2)) / 2 + 86 * 2, y: 852 - 25 - 54, width: 94, height: 54 });
  assert.equal(tabItemRect({ ...iphone, safeBottom: 0 }, 2, 3).y, 852 - 8 - 54);
  assert.deepEqual(backButtonRect(iphone, 'Today'), { x: 16, y: 59, width: 12 + 19 + 4 + 48 + 16, height: 44 });
  assert.deepEqual(tabItemRect({ ...iphone, platform: 'android', safeBottom: 24 }, 2, 3),
    { x: 262, y: 852 - 24 - 80, width: 131, height: 80 });
});

// --- Copy (copy.js, TR and EN) ------------------------------------------------------------

test('every bubble is localized whole in both languages, with no exclamation mark or em dash', () => {
  for (const language of ['en', 'tr']) {
    const copy = messages[language].walkthrough;
    const strings = [copy.name, copy.skip, copy.targetHint, copy.counter(1, 9)];
    for (const [key, step] of Object.entries(copy.steps)) {
      if ('title' in step) strings.push(step.title);
      strings.push(typeof step.body === 'function' ? step.body('X') : step.body);
      if ('bodyNoBadge' in step) strings.push(step.bodyNoBadge);
      assert.ok(tourSteps.some((tourStep) => tourStep.key === key), key);
    }
    assert.equal(Object.keys(copy.steps).length, 9);
    for (const value of strings) {
      assert.equal(/[!\u2014]/.test(value), false, value);
      assert.ok(value.length > 0);
    }
  }
  assert.equal(messages.en.walkthrough.counter(3, 9), 'Step 3 of 9');
  assert.equal(messages.tr.walkthrough.counter(3, 9), 'Adım 3/9');
  assert.equal(messages.en.walkthrough.steps.piece.body('Sweater'),
    'Each piece has its name beside it. Tap Sweater to see it on its own.');
  assert.equal(messages.tr.walkthrough.steps.piece.body('Kazak'),
    'Her parçanın adı yanında yazar. Tek başına görmek için Kazak parçasına dokun.');
  assert.equal(messages.en.walkthrough.name, 'Get to know kuyara step by step');
  assert.equal(messages.tr.walkthrough.name, 'kuyara’yı adım adım tanı');
});

// --- Review findings: the plan, VoiceOver activation, a notification mid-tour ----------------

test('a run shows step 6 only while Ask the stylist again is on Today', () => {
  assert.deepEqual(planTour(() => true), fullTourPlan);
  assert.deepEqual(planTour((id) => id !== 'again'), [0, 1, 2, 3, 4, 6, 7, 8]);
});

test('without step 6 the back step\'s pop lands on the Profile tab step and Done still ends it', async () => {
  const { controller, writes } = controllerWithGate();
  controller.start('auto', planTour((id) => id !== 'again'));
  controller.observeRoute('detail');
  controller.observeSheet(true);
  controller.observeSheet(false);
  controller.continue();
  assert.deepEqual(position(controller), [4, 'continue']);
  controller.observeRoute('today');
  assert.deepEqual(position(controller), [6, 'navigation']);
  controller.observeRoute('profile');
  controller.continue();
  assert.deepEqual(position(controller), [8, 'continue']);
  controller.continue();
  await Promise.resolve();
  assert.equal(position(controller), 'idle');
  assert.deepEqual(writes, ['write']);
});

test('VoiceOver activation performs only a tap or back step\'s live control', () => {
  const { controller } = controllerWithGate();
  const performed = [];
  controller.setActivator((id) => performed.push(id));
  controller.activateLive();
  controller.start('auto');
  controller.activateLive();
  controller.observeRoute('detail');
  controller.activateLive();
  controller.observeSheet(true);
  controller.activateLive();
  controller.observeSheet(false);
  controller.activateLive(); // step 4 is a look step
  controller.continue();
  controller.activateLive();
  assert.deepEqual(performed, ['outfit', 'piece', 'sheet-close', 'nav-back']);
  // The activation itself never advances: only the landed navigation does.
  assert.deepEqual(position(controller), [4, 'continue']);
});

test('an interruption from outside the tour stores nothing', async () => {
  for (const source of ['auto', 'manual']) {
    const { controller, writes } = controllerWithGate();
    controller.start(source);
    controller.observeRoute('detail');
    controller.interrupt();
    controller.interrupt();
    await Promise.resolve();
    assert.equal(position(controller), 'idle');
    assert.deepEqual(writes, []);
  }
});
