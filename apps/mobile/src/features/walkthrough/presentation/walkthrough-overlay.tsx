import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Keyboard,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  CoachMarkArrival,
  CoachMarkLayer,
} from '@/components/ui';
import type { TourRect, TourTargetRegistry } from '@/features/walkthrough/application/tour-target-registry';
import type { WalkthroughState } from '@/features/walkthrough/application/walkthrough-controller';
import {
  tourSteps,
  type TourStep,
  type TourTargetId,
} from '@/features/walkthrough/domain/walkthrough-steps';
import {
  backButtonRect,
  BUBBLE_MARGIN,
  bubbleBounds,
  chromeBottom,
  HOLE_PADDING,
  holeFor,
  isInView,
  placeBubble,
  ringFor,
  tabItemRect,
  tailOffset,
  unionRects,
  type ChromeGeometry,
} from '@/features/walkthrough/presentation/tour-geometry';
import type { AppMessages } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The platform's own push, pop, sheet and tab transitions take about this long; the tour
// measures the next screen once they have landed, then waits 60 ms more (the prototype).
const NAVIGATION_SETTLE_MS = 500;
const LANDED_PAUSE_MS = 60;
// The bubble arrives this long after the spotlight starts to move.
const BUBBLE_DELAY_MS = { start: 160, continue: 220, navigation: 200 } as const;
// A scroll the tour asks for is the platform's animated scroll.
const REVEAL_SETTLE_MS = 400;
// How long a step waits for its screen to register the control it needs.
const TARGET_WAIT_MS = 1_500;
const SHEET_STEP = tourSteps.findIndex(({ key }) => key === 'sheet');
const PROFILE_TAB_INDEX = 2;
const TAB_COUNT = 3;

type Frame = Readonly<{
  key: string;
  stepIndex: number;
  /** Where this step sits among the steps the run shows, and how many there are. */
  position: number;
  total: number;
  lit: TourRect | null;
  live: TourRect | null;
  liveLabel: string | undefined;
  pieceName: string | undefined;
  hasBadge: boolean;
  bubbleVisible: boolean;
}>;

type Heights = Readonly<{ key: string; normal: number; tight: number }>;

export type WalkthroughOverlayProps = Readonly<{
  state: WalkthroughState;
  registry: TourTargetRegistry;
  onContinue: () => void;
  onSkip: () => void;
  /** VoiceOver activated the live control's stand-in. */
  onActivateLive: () => void;
}>;

function bubbleCopy(step: TourStep, messages: AppMessages, frame: Frame) {
  const steps = messages.walkthrough.steps;
  switch (step.key) {
    case 'outfit':
      return { title: steps.outfit.title, body: frame.hasBadge ? steps.outfit.body : steps.outfit.bodyNoBadge };
    case 'piece':
      return { title: steps.piece.title, body: steps.piece.body(frame.pieceName ?? '') };
    case 'history':
      return { title: messages.profile.historyLabel, body: steps.history.body };
    default:
      return steps[step.key];
  }
}

function waitForTarget(
  registry: TourTargetRegistry,
  id: TourTargetId | null,
  track: (cleanup: () => void) => void,
): Promise<void> {
  return new Promise((resolve) => {
    if (!id || registry.has(id)) {
      resolve();
      return;
    }
    const timer = setTimeout(done, TARGET_WAIT_MS);
    const unsubscribe = registry.subscribe(() => {
      if (registry.has(id)) done();
    });
    function done() {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
    track(done);
  });
}

/**
 * The coach-mark tour over the real screens: the dim with its cut-out, the ring, the bubble,
 * Skip, and the blocking views that leave only the live control reachable. It reads where
 * the screens' controls are and draws; it never presses one. Everything outside the bubble,
 * Skip and the live control's stand-in is hidden from assistive technologies.
 */
export function WalkthroughOverlay({
  onActivateLive, onContinue, onSkip, registry, state,
}: WalkthroughOverlayProps) {
  const theme = useKuyaraTheme();
  const { messages } = useLocalization();
  const copy = messages.walkthrough;
  const insets = useSafeAreaInsets();
  const { fontScale, height, width } = useWindowDimensions();
  const running = state.status === 'running' ? state : null;
  const [layerOn, setLayerOn] = useState(false);
  if (running && !layerOn) setLayerOn(true);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [heights, setHeights] = useState<Heights | null>(null);
  const liveProxy = useRef<View>(null);
  const continueButton = useRef<View>(null);

  const chrome: ChromeGeometry = {
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    windowWidth: width,
    windowHeight: height,
    safeTop: insets.top,
    safeBottom: insets.bottom,
    fontScale,
  };
  const bounds = bubbleBounds(height, insets.top, insets.bottom);
  // Read by the measuring sequence without restarting it.
  const latest = useRef({ chrome, bounds, messages });
  useEffect(() => {
    latest.current = { chrome, bounds, messages };
  });

  const measureTarget = useCallback(async (id: TourTargetId): Promise<TourRect | null> => {
    const { chrome: geometry, messages: current } = latest.current;
    if (id === 'nav-back') return backButtonRect(geometry, current.navigation.today);
    if (id === 'tab-profile') return tabItemRect(geometry, PROFILE_TAB_INDEX, TAB_COUNT);
    return (await registry.get(id)?.measure()) ?? null;
  }, [registry]);
  const measureStep = useCallback(async (step: TourStep) => ({
    lit: unionRects(await Promise.all(step.lit.map(measureTarget))),
    live: step.live ? await measureTarget(step.live) : null,
  }), [measureTarget]);
  const labelOf = useCallback((id: TourTargetId | undefined) => {
    const current = latest.current.messages;
    if (id === 'nav-back') return current.navigation.today;
    if (id === 'tab-profile') return current.navigation.profile;
    return id ? registry.get(id)?.label() : undefined;
  }, [registry]);

  // One sequence per step: hide the bubble and close the gap at once, let a navigation land,
  // bring the lit area into view, move the spotlight there, then let the bubble arrive.
  const stepKey = running ? `${running.run}:${running.stepIndex}` : null;
  const entry = running?.entry ?? 'start';
  useEffect(() => {
    if (!stepKey || !running) return undefined;
    const stepIndex = running.stepIndex;
    const step = tourSteps[stepIndex];
    const position = running.plan.indexOf(stepIndex) + 1;
    const total = running.plan.length;
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    const track = (cleanup: () => void) => cleanups.push(cleanup);
    const wait = (ms: number) => new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      track(() => clearTimeout(timer));
    });
    void (async () => {
      if (entry === 'navigation') await wait(NAVIGATION_SETTLE_MS + LANDED_PAUSE_MS);
      const required = [step.live, ...step.lit]
        .find((id) => id !== undefined && id !== 'nav-back' && id !== 'tab-profile' && id !== 'badge') ?? null;
      await waitForTarget(registry, required, track);
      if (cancelled) return;
      const visible = { ...latest.current.bounds, bottom: chromeBottom(latest.current.chrome) };
      if (step.reveal) {
        const before = unionRects(await Promise.all(step.lit.map(measureTarget)));
        if (cancelled) return;
        if (step.reveal === 'always' || !before || !isInView(before, visible)) {
          step.lit.map((id) => registry.get(id)?.reveal).find(Boolean)?.();
          await wait(REVEAL_SETTLE_MS);
        }
      }
      // Bring the lit area between Skip's row and the tab bar: a scroll view's end leaves its
      // last control under the bar, and a screen left scrolled hides its top under Skip.
      const scrollBy = step.lit.map((id) => registry.get(id)?.scrollBy).find(Boolean);
      if (scrollBy && !cancelled) {
        const after = unionRects(await Promise.all(step.lit.map(measureTarget)));
        const below = after ? after.y + after.height + HOLE_PADDING - visible.bottom : 0;
        const above = after ? after.y - HOLE_PADDING - visible.top : 0;
        const by = below > 0 ? below : above < 0 ? above : 0;
        if (by !== 0 && !cancelled) {
          scrollBy(by);
          await wait(REVEAL_SETTLE_MS);
        }
      }
      if (cancelled) return;
      const { lit, live } = await measureStep(step);
      if (cancelled) return;
      setFrame({
        key: stepKey,
        stepIndex,
        position,
        total,
        lit,
        live,
        liveLabel: labelOf(step.live),
        pieceName: step.key === 'piece' ? registry.get('piece')?.name() : undefined,
        hasBadge: registry.has('badge'),
        bubbleVisible: false,
      });
      await wait(BUBBLE_DELAY_MS[entry]);
      if (cancelled) return;
      setFrame((current) => (current?.key === stepKey ? { ...current, bubbleVisible: true } : current));
    })();

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
    };
    // `running` is read through `stepKey` and `entry`; the rest is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  // A frame belongs to its step: the moment the step changes, its bubble, ring and gap go,
  // while the spotlight keeps its place until the next step has measured. While the layer
  // fades out, the last bubble fades with it and nothing is live.
  const bubbleShown = frame?.bubbleVisible === true && (stepKey === null || frame.key === stepKey);
  // A shown step measures again when its controls move, the text size or window changes, or
  // the keyboard comes or goes.
  const shownKey = bubbleShown && frame ? frame.key : null;
  const remeasure = useCallback(async () => {
    if (!frame || !shownKey) return;
    const { lit, live } = await measureStep(tourSteps[frame.stepIndex]);
    setFrame((current) => (current?.key === shownKey ? { ...current, lit, live } : current));
  }, [frame, measureStep, shownKey]);
  const remeasureLatest = useRef(remeasure);
  useEffect(() => {
    remeasureLatest.current = remeasure;
  }, [remeasure]);
  const shownStep = frame ? tourSteps[frame.stepIndex] : null;
  useEffect(() => {
    if (!shownKey || !shownStep) return undefined;
    const ids = new Set<TourTargetId>([...shownStep.lit, ...(shownStep.live ? [shownStep.live] : [])]);
    let pending: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => void remeasureLatest.current(), theme.motion.fast);
    };
    const unsubscribe = registry.subscribe((id) => {
      if (ids.has(id)) schedule();
    });
    const shown = Keyboard.addListener('keyboardDidShow', schedule);
    const hidden = Keyboard.addListener('keyboardDidHide', schedule);
    return () => {
      if (pending) clearTimeout(pending);
      unsubscribe();
      shown.remove();
      hidden.remove();
    };
  }, [registry, shownKey, shownStep, theme.motion.fast]);
  const windowKey = `${width}x${height}@${fontScale}`;
  const measuredWindow = useRef(windowKey);
  useEffect(() => {
    if (measuredWindow.current === windowKey) return;
    measuredWindow.current = windowKey;
    void remeasureLatest.current();
  }, [windowKey]);

  const content = frame && shownStep ? bubbleCopy(shownStep, messages, frame) : null;
  const counter = frame ? copy.counter(frame.position, frame.total) : '';
  const lastStep = frame !== null && frame.position === frame.total;
  const announcement = content && shownKey ? `${content.title}. ${content.body} ${counter}` : null;
  // Announced on arrival; after `fast`, focus moves to the live control's stand-in on a tap
  // or back step and to Continue on a look step.
  useEffect(() => {
    if (!announcement || !shownStep) return undefined;
    AccessibilityInfo.announceForAccessibility(announcement);
    const target: RefObject<View | null> = shownStep.live ? liveProxy : continueButton;
    const timer = setTimeout(() => {
      const node = findNodeHandle(target.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, theme.motion.fast);
    return () => clearTimeout(timer);
  }, [announcement, shownStep, theme.motion.fast]);

  if (!layerOn) return null;

  // The piece-sheet step: the sheet dims the app itself, rings its own Close and blocks its
  // own controls, so this layer draws no dim or ring and blocks only the window above the
  // sheet, leaving the whole sheet, Close included, to its own touch handling.
  const sheetMode = shownStep?.inSheet === true && frame?.key === stepKey;
  const lit = frame?.lit ?? null;
  const hole = lit && shownStep ? holeFor(lit, shownStep.litRadius) : null;
  const gap = running && shownKey ? frame?.live ?? null : null;
  const ring = !sheetMode && gap && shownStep?.ringRadius !== undefined ? ringFor(gap, shownStep.ringRadius) : null;
  // Keyed by step alone: a text size change lays the unseen bubbles out again before this
  // component re-renders, so a key naming the size would drop the new heights.
  const heightsKey = frame?.key ?? '';
  const placement = bubbleShown && heights?.key === heightsKey && heights.normal > 0 && heights.tight > 0
    ? placeBubble(hole, heights, bounds)
    : null;
  const anchor = frame?.live ?? frame?.lit ?? null;
  const bubbleWidth = width - BUBBLE_MARGIN * 2;
  const buttonLabel = frame && shownStep?.kind === 'look'
    ? lastStep ? messages.preferences.stylePreferencesDone : messages.common.continue
    : null;
  const recordHeight = (variant: 'normal' | 'tight') => ({ nativeEvent }: LayoutChangeEvent) => {
    const measured = nativeEvent.layout.height;
    setHeights((current) => {
      const base = current?.key === heightsKey ? current : { key: heightsKey, normal: 0, tight: 0 };
      return base[variant] === measured ? base : { ...base, [variant]: measured };
    });
  };

  return (
    <CoachMarkLayer
      accessibilityLabel={copy.name}
      dimmed={!sheetMode}
      hole={sheetMode ? null : hole}
      // The piece sheet presents after the layer mounted, so step 3 restacks it above the sheet.
      layer={frame?.stepIndex === SHEET_STEP ? 1 : 0}
      onAccessibilityEscape={onSkip}
      onHidden={() => {
        setLayerOn(false);
        setFrame(null);
      }}
      ring={ring}
      visible={running !== null}>
      <Blockers
        above={sheetMode && lit ? lit.y : null}
        gap={gap}
        height={height}
        width={width}
      />
      {content && frame ? (
        <>
          {(['normal', 'tight'] as const).map((variant) => (
            // Both bubble sizes are laid out unseen first, so the placement can choose.
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              key={variant}
              onLayout={recordHeight(variant)}
              pointerEvents="none"
              style={[styles.measurer, { width: bubbleWidth }]}
              testID={`walkthrough-bubble-measure-${variant}`}>
              <BubbleCard
                body={content.body}
                buttonLabel={buttonLabel}
                counter={counter}
                measuring
                tight={variant === 'tight'}
                title={content.title}
              />
            </View>
          ))}
          {placement ? (
            <View pointerEvents="box-none" style={[styles.bubblePosition, { top: placement.top }]}>
              <CoachMarkArrival from={placement.side} key={frame.key}>
                <BubbleCard
                  body={content.body}
                  buttonLabel={buttonLabel}
                  buttonRef={continueButton}
                  counter={counter}
                  onButton={onContinue}
                  prominent={lastStep}
                  tail={anchor ? {
                    side: placement.side === 'below' ? 'up' : 'down',
                    left: tailOffset(anchor.x + anchor.width / 2, bubbleWidth),
                  } : undefined}
                  tight={placement.tight}
                  title={content.title}
                />
              </CoachMarkArrival>
            </View>
          ) : null}
        </>
      ) : null}
      {gap ? (
        // VoiceOver's stand-in for the live control: its own name plus the tour's hint. It
        // takes no touches, so a finger reaches the real control underneath; VoiceOver's
        // activation cannot, so it performs the control's own action through the controller.
        <View
          accessibilityActions={[{ name: 'activate' }]}
          accessibilityHint={copy.targetHint}
          accessibilityLabel={frame?.liveLabel}
          accessibilityRole="button"
          accessible
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'activate') onActivateLive();
          }}
          pointerEvents="none"
          ref={liveProxy}
          style={[styles.proxy, { height: gap.height, left: gap.x, top: gap.y, width: gap.width }]}
          testID="walkthrough-live-target"
        />
      ) : null}
      {/* Skip is a kuyara capsule: a SwiftUI glass button collapses to zero width inside the
          full-window layer (measured on the Simulator), and Skip must always be there. */}
      <View pointerEvents="box-none" style={[styles.skip, { top: insets.top }]}>
        <Button label={copy.skip} onPress={onSkip} size="medium" testID="walkthrough-skip" variant="tonal" />
      </View>
    </CoachMarkLayer>
  );
}

/**
 * Four views around the live control absorb every other touch; the gap between them passes
 * the tap to the control underneath. Without a live control one view covers the window. Over
 * a presented sheet (`above`), one view covers the window above the sheet and nothing else.
 */
function Blockers({ above, gap, height, width }: Readonly<{
  above: number | null;
  gap: TourRect | null;
  height: number;
  width: number;
}>) {
  const rects = above !== null
    ? [{ left: 0, top: 0, width, height: Math.max(0, above) }]
    : gap
    ? [
      { left: 0, top: 0, width, height: Math.max(0, gap.y) },
      { left: 0, top: gap.y + gap.height, width, height: Math.max(0, height - gap.y - gap.height) },
      { left: 0, top: gap.y, width: Math.max(0, gap.x), height: gap.height },
      { left: gap.x + gap.width, top: gap.y, width: Math.max(0, width - gap.x - gap.width), height: gap.height },
    ]
    : [{ left: 0, top: 0, width, height }];
  return rects.map((rect, index) => (
    <View
      key={index}
      onStartShouldSetResponder={() => true}
      style={[styles.blocker, rect]}
      testID="walkthrough-blocker"
    />
  ));
}

type BubbleCardProps = Readonly<{
  title: string;
  body: string;
  counter: string;
  buttonLabel: string | null;
  tight: boolean;
  prominent?: boolean;
  onButton?: () => void;
  buttonRef?: RefObject<View | null>;
  /** An unseen copy laid out for its height: it carries no test IDs. */
  measuring?: boolean;
  tail?: Readonly<{ side: 'up' | 'down'; left: number }>;
}>;

/**
 * The bubble on `surface`: the title in `bodyStrong`, the body, then the counter in
 * `textSecondary` with Continue (tonal) or Done (the one prominent button) on a look step.
 */
function BubbleCard({
  body,
  buttonLabel,
  buttonRef,
  counter,
  measuring = false,
  onButton,
  prominent = false,
  tail,
  tight,
  title,
}: BubbleCardProps) {
  const theme = useKuyaraTheme();
  const parts = body.split(/(kuyara)/);

  return (
    <View
      style={[styles.bubble, {
        backgroundColor: theme.colors.surface,
        padding: tight ? spacing.md : spacing.lg,
        shadowColor: theme.elevation.chrome.shadowColor,
      }]}
      testID={measuring ? undefined : 'walkthrough-bubble'}>
      {tail ? (
        <View
          style={[styles.tail, tail.side === 'up' ? styles.tailUp : styles.tailDown, {
            backgroundColor: theme.colors.surface,
            left: tail.left + TAIL_INSET,
          }]}
        />
      ) : null}
      <AppText testID={measuring ? undefined : 'walkthrough-title'} variant="bodyStrong">{title}</AppText>
      <AppText style={styles.body} testID={measuring ? undefined : 'walkthrough-body'}>
        {parts.map((part, index) => (part === 'kuyara'
          ? <AppText colorRole="brandPrimary" key={index}>{part}</AppText>
          : part))}
      </AppText>
      <View style={[styles.footer, { marginTop: tight ? spacing.sm : spacing.md }]}>
        <AppText
          colorRole="textSecondary"
          style={styles.counter}
          tabularNumbers
          testID={measuring ? undefined : 'walkthrough-counter'}
          variant="caption">
          {counter}
        </AppText>
        {buttonLabel ? (
          // Focus moves to Continue through this view: VoiceOver lands on the button inside.
          <View ref={buttonRef}>
            <Button
              label={buttonLabel}
              onPress={onButton}
              size="medium"
              style={styles.button}
              testID={measuring ? undefined : 'walkthrough-continue'}
              variant={prominent ? 'prominent' : 'tonal'}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// The tail is a 12-point square turned 45 degrees, half inside the bubble.
const TAIL_SIZE = 12;
const TAIL_INSET = 3;
// The bubble lifts off the dim: 10 points down, a 30-point blur, 22 % of the dark ink.
const BUBBLE_SHADOW = { shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 15, elevation: 8 };
// Continue and Done keep a usable width beside the counter.
const BUTTON_MIN_WIDTH = 120;

const styles = StyleSheet.create({
  blocker: { position: 'absolute' },
  measurer: { left: BUBBLE_MARGIN, opacity: 0, position: 'absolute', top: 0 },
  bubblePosition: { left: BUBBLE_MARGIN, position: 'absolute', right: BUBBLE_MARGIN },
  bubble: { borderRadius: radii.card, ...BUBBLE_SHADOW },
  tail: { height: TAIL_SIZE, position: 'absolute', transform: [{ rotate: '45deg' }], width: TAIL_SIZE },
  tailUp: { top: -TAIL_SIZE / 2 },
  tailDown: { bottom: -TAIL_SIZE / 2 },
  body: { marginTop: spacing.xs },
  footer: { alignItems: 'center', columnGap: spacing.md, flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  counter: { flexGrow: 1, flexShrink: 1 },
  button: { minWidth: BUTTON_MIN_WIDTH },
  proxy: { position: 'absolute' },
  skip: { position: 'absolute', right: BUBBLE_MARGIN },
});
