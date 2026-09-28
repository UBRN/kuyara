import { router, usePathname } from 'expo-router';
import {
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { BackHandler } from 'react-native';

import { sessionMayAskForConsent } from '@/features/analytics/domain/analytics-session';
import { NotificationApplicationContext } from '@/features/notifications/application/notification-context';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { TourTargetRegistry } from '@/features/walkthrough/application/tour-target-registry';
import { WalkthroughController } from '@/features/walkthrough/application/walkthrough-controller';
import {
  TourTargetsContext,
  WalkthroughContext,
  type WalkthroughTodayFacts,
  type WalkthroughValue,
} from '@/features/walkthrough/application/walkthrough-context';
import {
  classifyTourRoute,
  isDeepLinkLaunch,
  isProfileHostedPath,
  isWalkthroughDue,
  walkthroughOpening,
  type LaunchClaim,
} from '@/features/walkthrough/domain/walkthrough-rules';
import { planTour, tourSteps, type TourTargetId } from '@/features/walkthrough/domain/walkthrough-steps';
import { WalkthroughOverlay } from '@/features/walkthrough/presentation/walkthrough-overlay';

// "Only on Today over a settled outfit": the conditions must hold this long before the tour
// opens, the settle the analytics consent sheet also waits for.
export const WALKTHROUGH_OPEN_DELAY_MS = 1_500;

/**
 * VoiceOver's activation of the tour's stand-in: the live control's own action. A screen's
 * control runs its registered action; native chrome maps to the system back and the Profile
 * tab. The tour then advances only when that navigation lands, as for a finger.
 */
export function activateTourControl(
  id: TourTargetId,
  registry: TourTargetRegistry,
  navigation: Readonly<{ back: () => void; navigate: (href: '/profile') => void }>,
): void {
  if (id === 'nav-back') navigation.back();
  else if (id === 'tab-profile') navigation.navigate('/profile');
  else registry.get(id)?.activate?.();
}

const sameFacts = (a: WalkthroughTodayFacts | null, b: WalkthroughTodayFacts) =>
  a !== null && a.settled === b.settled && a.overlayOpen === b.overlayOpen
    && a.dayQuestion === b.dayQuestion && a.namePrompt === b.namePrompt;

/**
 * Composition for the Phase 8 tour: the launch's claims, Today's facts and the router's
 * pathname decide when it opens (README "When it opens"); the controller moves it; the
 * overlay draws it above the navigator. One overlay per launch: any tour, offered or asked
 * for, spends this launch's chance for the offered one.
 */
export function WalkthroughProvider({
  children,
  sessionIndex,
}: PropsWithChildren<{ sessionIndex: number }>) {
  const { state: profileState, markWalkthroughSeen } = useProfileApplication();
  const profile = profileState.status === 'ready' ? profileState.profile : null;
  const openedNotifications = use(NotificationApplicationContext)?.openedNotifications ?? 0;
  const [controller] = useState(() => new WalkthroughController());
  useEffect(() => {
    controller.setGateWriter(markWalkthroughSeen ?? null);
  }, [controller, markWalkthroughSeen]);
  const [registry] = useState(() => new TourTargetRegistry());
  useEffect(() => {
    controller.setActivator((id) => activateTourControl(id, registry, router));
  }, [controller, registry]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const running = state.status === 'running';
  const pathname = usePathname();
  // A process is a launch. A new user finishes onboarding in it; a deep link starts it away
  // from Today.
  const [newUserSession] = useState(() => profile?.onboardingCompleted !== true);
  const [claims, setClaims] = useState<ReadonlySet<LaunchClaim>>(
    () => new Set<LaunchClaim>(isDeepLinkLaunch(pathname) ? ['deep-link'] : []),
  );
  const [today, setToday] = useState<WalkthroughTodayFacts | null>(null);
  const [manualPending, setManualPending] = useState(false);
  // The Help row's request means "start the tour now over Today": it lapses when the person
  // leaves Today after the request has reached it, so it cannot open the tour unprompted
  // hours later. Settings calls restart() before navigating, so the pathname at that moment
  // says nothing; only "was on Today since the request, then left" ends it.
  const manualReachedToday = useRef(false);
  useEffect(() => {
    if (!manualPending) manualReachedToday.current = false;
    else if (pathname === '/') manualReachedToday.current = true;
    else if (manualReachedToday.current) {
      manualReachedToday.current = false;
      setManualPending(false);
    }
  }, [manualPending, pathname]);
  const [openedThisLaunch, setOpenedThisLaunch] = useState(false);

  // Claims latch for the launch: a sheet that has been answered still claimed it.
  const consentWillAsk = profile !== null && profile.onboardingCompleted
    && profile.analyticsConsent === 'undecided' && sessionMayAskForConsent(sessionIndex);
  const raised: readonly (LaunchClaim | false)[] = [
    consentWillAsk && 'analytics-consent',
    openedNotifications > 0 && 'notification',
    today?.dayQuestion === true && 'day-question',
    today?.namePrompt === true && 'name-prompt',
  ];
  const unlatched = raised.filter((next): next is LaunchClaim => next !== false && !claims.has(next));
  if (unlatched.length > 0) setClaims(new Set([...claims, ...unlatched]));

  // A notification opened mid-tour ends it without storing the gate (owner answer 3): it
  // starts over at the next quiet launch.
  const handledNotifications = useRef(openedNotifications);
  useEffect(() => {
    if (openedNotifications === handledNotifications.current) return;
    handledNotifications.current = openedNotifications;
    controller.interrupt();
  }, [controller, openedNotifications]);

  useEffect(() => {
    // Profile keeps its own stack, so the tab can restore Settings, the Closet or History.
    // Step 7 is about the tab, not that screen: pop Profile to its root, where the pathname
    // becomes `/profile` and the step advances, rather than reading it as a foreign route.
    const snapshot = controller.getSnapshot();
    if (
      snapshot.status === 'running'
      && tourSteps[snapshot.stepIndex].advanceOn === 'tab'
      && isProfileHostedPath(pathname)
    ) {
      router.dismissAll();
      return;
    }
    controller.observeRoute(classifyTourRoute(pathname));
  }, [controller, pathname]);
  useEffect(() => registry.subscribe((id) => {
    if (id === 'sheet-close') controller.observeSheet(registry.has('sheet-close'));
  }), [controller, registry]);

  const opening = profile ? walkthroughOpening({
    running,
    due: isWalkthroughDue(profile.walkthroughVersion),
    autoOpenedThisLaunch: openedThisLaunch,
    newUserSession,
    claims,
    manualPending,
    onToday: pathname === '/',
    todaySettled: today?.settled === true,
    overlayOpen: today?.overlayOpen === true,
  }) : null;
  useEffect(() => {
    if (!opening) return undefined;
    const timer = setTimeout(() => {
      if (opening === 'manual') setManualPending(false);
      setOpenedThisLaunch(true);
      controller.start(opening, planTour((id) => registry.has(id)));
    }, WALKTHROUGH_OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [controller, opening, registry]);

  // Android back is the tour's escape, as the two-finger scrub is on iOS: it acts as Skip.
  useEffect(() => {
    if (!running) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      controller.skip();
      return true;
    });
    return () => subscription.remove();
  }, [controller, running]);

  const reportToday = useCallback((facts: WalkthroughTodayFacts) => {
    setToday((current) => (sameFacts(current, facts) ? current : facts));
  }, []);
  const restart = useCallback(() => setManualPending(true), []);
  const sheetStep = state.status === 'running' && tourSteps[state.stepIndex].inSheet === true;
  const value = useMemo<WalkthroughValue>(
    () => ({ active: running, sheetStep, restart, reportToday }),
    [reportToday, restart, running, sheetStep],
  );

  return (
    <WalkthroughContext value={value}>
      <TourTargetsContext value={registry}>
        {children}
        <WalkthroughOverlay
          onActivateLive={() => controller.activateLive()}
          onContinue={() => controller.continue()}
          onSkip={() => controller.skip()}
          registry={registry}
          state={state}
        />
      </TourTargetsContext>
    </WalkthroughContext>
  );
}
