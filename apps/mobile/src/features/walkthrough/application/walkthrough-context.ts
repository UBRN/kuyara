import { createContext, use } from 'react';

import type { TourRect, TourTargetRegistry } from '@/features/walkthrough/application/tour-target-registry';

/** What Today tells the tour about itself; Today owns every one of these facts. */
export type WalkthroughTodayFacts = Readonly<{
  /** A settled outfit is on screen: no runway, refresh, regeneration or pending question. */
  settled: boolean;
  /** A sheet or prompt is over Today now. */
  overlayOpen: boolean;
  /** The morning or evening day-type question is pending or was shown in this launch. */
  dayQuestion: boolean;
  /** The name prompt is shown in this launch. */
  namePrompt: boolean;
}>;

export type WalkthroughValue = Readonly<{
  /** The tour is on screen; Today holds its own sheets back while it is. */
  active: boolean;
  /** The tour is on its piece-sheet step: the sheet rings its Close and blocks the rest. */
  sheetStep?: boolean;
  /** Settings, Help: the tour from step 1 over Today, without touching the gate. */
  restart: () => void;
  reportToday: (facts: WalkthroughTodayFacts) => void;
}>;

export const WalkthroughContext = createContext<WalkthroughValue | null>(null);

/** Null outside the provider, so a screen rendered alone (a test, a preview) is unaffected. */
export function useWalkthrough(): WalkthroughValue | null {
  return use(WalkthroughContext);
}

export const TourTargetsContext = createContext<TourTargetRegistry | null>(null);

/**
 * Content inside a native sheet measures from the sheet's own origin, not the window's (the
 * SwiftUI host's RNHostView is the layout root there), and iOS draws a medium-detent sheet
 * inset and scaled, so no exact window frame exists in JavaScript. The sheet scope moves a
 * frame to an approximate window position, used only to aim the bubble's tail and VoiceOver's
 * stand-in; the ring and the blocking happen inside the sheet, in its own space. Until the
 * sheet has laid out (`ready`), no window position exists and nothing inside it registers.
 */
export type TourSheetGeometry = Readonly<{ ready: boolean; toWindow: (rect: TourRect) => TourRect }>;

export const TourSheetContext = createContext<TourSheetGeometry | null>(null);
