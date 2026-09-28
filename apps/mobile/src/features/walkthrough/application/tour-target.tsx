import { use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { CoachMarkRing } from '@/components/ui';
import type { TourRect } from '@/features/walkthrough/application/tour-target-registry';
import {
  TourSheetContext,
  TourTargetsContext,
  WalkthroughContext,
  type TourSheetGeometry,
} from '@/features/walkthrough/application/walkthrough-context';
import type { TourTargetId } from '@/features/walkthrough/domain/walkthrough-steps';

// A view that is being unmounted never calls back; the tour must not wait on it forever.
const MEASURE_TIMEOUT_MS = 500;

function measureInWindow(view: View | null): Promise<TourRect | null> {
  return new Promise((resolve) => {
    if (!view) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    view.measureInWindow((x, y, width, height) => {
      clearTimeout(timer);
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}

type TourTargetProps = Readonly<{
  /** Null wraps without registering: a list renders every row the same way. */
  id: TourTargetId | null;
  children: ReactNode;
  /** The wrapped control's own spoken name; the tour's stand-in speaks it on a live step. */
  label?: string;
  /** The word the bubble names the control by. */
  name?: string;
  /** Scrolls the screen so the control is in view. */
  reveal?: () => void;
  /**
   * Scrolls the screen further by a number of points. A scroll view's programmatic end
   * leaves its last control under the floating tab bar, so the tour lifts it clear.
   */
  scrollBy?: (dy: number) => void;
  /** The control's own press action, which VoiceOver reaches through the tour's stand-in. */
  activate?: () => void;
  /** Layout the wrapped control carried on its outside (its margin), moved onto the wrapper. */
  style?: StyleProp<ViewStyle>;
  /** The wrapper's own layout, for a screen that scrolls the control into view. */
  onLayout?: (event: LayoutChangeEvent) => void;
}>;

/**
 * Wraps one existing control so the tour can find it. It adds a plain view and changes
 * nothing about the control: no props, no touch handling, no accessibility. Outside the tour
 * provider it registers nothing.
 */
export function TourTarget({
  activate, children, id, label, name, onLayout, reveal, scrollBy, style,
}: TourTargetProps) {
  const registry = use(TourTargetsContext);
  const sheet = use(TourSheetContext);
  const view = useRef<View>(null);
  const latest = useRef({ activate, label, name, reveal, scrollBy, sheet });
  useEffect(() => {
    latest.current = { activate, label, name, reveal, scrollBy, sheet };
  });

  const revealable = reveal !== undefined;
  const activatable = activate !== undefined;
  const scrollable = scrollBy !== undefined;
  useEffect(() => {
    if (!registry || !id) return undefined;
    return registry.register(id, {
      measure: async () => {
        const rect = await measureInWindow(view.current);
        const geometry = latest.current.sheet;
        return rect && geometry ? geometry.toWindow(rect) : rect;
      },
      local: () => measureInWindow(view.current),
      label: () => latest.current.label,
      name: () => latest.current.name,
      reveal: revealable ? () => latest.current.reveal?.() : undefined,
      activate: activatable ? () => latest.current.activate?.() : undefined,
      scrollBy: scrollable ? (dy) => latest.current.scrollBy?.(dy) : undefined,
    });
  }, [activatable, id, registry, revealable, scrollable]);

  return (
    <View
      collapsable={false}
      onLayout={registry && id ? (event) => {
        onLayout?.(event);
        registry.notifyLayout(id);
      } : onLayout}
      ref={view}
      style={style}>
      {children}
    </View>
  );
}

// iOS floats a medium-detent sheet up to 8 points above the window's bottom edge.
const SHEET_EDGE = 8;
// The sheet's Close is a 44-point circle.
const CLOSE_RADIUS = 22;

/**
 * The content of the piece sheet, which the tour's step 3 lights whole. A presented sheet
 * lays its content out in its own space (measured from the sheet, drawn inset and scaled at
 * the medium detent), so the ring around Close and the views that block the sheet's other
 * controls are drawn here, in that space, where they match the controls exactly. The window
 * layer only needs where the sheet starts: this registers the window below the highest point
 * the sheet can start at (its content, its bottom safe area and the 8-point edge, unscaled),
 * so the bubble and the window's blocking views stay above the sheet and never cover it.
 */
export function TourSheetScope({ children }: Readonly<{ children: ReactNode }>) {
  const registry = use(TourTargetsContext);
  const sheetStep = use(WalkthroughContext)?.sheetStep === true;
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // Read without requiring a provider, so the sheet renders alone as it did before the tour.
  const bottom = use(SafeAreaInsetsContext)?.bottom ?? 0;
  const view = useRef<View>(null);
  const [frame, setFrame] = useState<TourRect | null>(null);
  const [close, setClose] = useState<TourRect | null>(null);
  const top = frame ? Math.max(0, windowHeight - SHEET_EDGE - bottom - (frame.y + frame.height)) : null;
  const geometry = useMemo<TourSheetGeometry>(() => ({
    toWindow: (rect) => ({ ...rect, y: (top ?? 0) + rect.y }),
  }), [top]);
  const latestTop = useRef(top);
  useEffect(() => {
    latestTop.current = top;
  }, [top]);

  const measureFrame = useCallback(() => {
    void measureInWindow(view.current).then(setFrame);
  }, []);
  useEffect(() => {
    if (!registry) return undefined;
    return registry.register('sheet-area', {
      measure: async () => (latestTop.current === null ? null : {
        x: 0, y: latestTop.current, width: windowWidth, height: windowHeight - latestTop.current,
      }),
      label: () => undefined,
      name: () => undefined,
    });
  }, [registry, windowHeight, windowWidth]);
  // On the sheet step, Close is found in the sheet's own space, relative to this view.
  useEffect(() => {
    if (!registry || !sheetStep || !frame) return undefined;
    let live = true;
    void registry.get('sheet-close')?.local?.().then((rect) => {
      if (live) setClose(rect ? { ...rect, x: rect.x - frame.x, y: rect.y - frame.y } : null);
    });
    return () => { live = false; };
  }, [frame, registry, sheetStep]);

  const blockers = sheetStep && close && frame ? [
    { left: 0, top: 0, width: frame.width, height: Math.max(0, close.y) },
    { left: 0, top: close.y + close.height, width: frame.width, height: Math.max(0, frame.height - close.y - close.height) },
    { left: 0, top: close.y, width: Math.max(0, close.x), height: close.height },
    { left: close.x + close.width, top: close.y, width: Math.max(0, frame.width - close.x - close.width), height: close.height },
  ] : null;

  return (
    <TourSheetContext value={registry ? geometry : null}>
      <View
        collapsable={false}
        onLayout={registry ? measureFrame : undefined}
        ref={view}
        style={styles.sheet}>
        {children}
        {blockers && close ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="walkthrough-sheet-layer">
            {blockers.map((rect, index) => (
              <View
                key={index}
                onStartShouldSetResponder={() => true}
                style={[styles.blocker, rect]}
                testID="walkthrough-sheet-blocker"
              />
            ))}
            <CoachMarkRing rect={{ ...close, radius: Math.min(CLOSE_RADIUS, close.height / 2) }} />
          </View>
        ) : null}
      </View>
    </TourSheetContext>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  blocker: { position: 'absolute' },
});
