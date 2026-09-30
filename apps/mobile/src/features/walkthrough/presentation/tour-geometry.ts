import type { TourRect } from '@/features/walkthrough/application/tour-target-registry';
import type { TourRadius } from '@/features/walkthrough/domain/walkthrough-steps';

export type TourHole = TourRect & Readonly<{ radius: number }>;

// The lit area reaches this far past its controls, so the ring sits inside it.
export const HOLE_PADDING = 10;
// The bubble's side margin, the screen's own `lg` inset.
export const BUBBLE_MARGIN = 16;
// The gap between the lit area and the bubble; the tightened bubble keeps 8.
const BUBBLE_GAP = 12;
const TIGHT_BUBBLE_GAP = 8;
// Skip's row: 44 points tall at the top safe area, and the bubble stays 8 below it.
export const SKIP_HEIGHT = 44;
const BELOW_SKIP = 8;
const ABOVE_SAFE_AREA = 4;
// The tail is 18 points wide and keeps 18 from the bubble's corners.
const TAIL_WIDTH = 18;
const TAIL_CORNER_CLEARANCE = 18;

export function unionRects(rects: readonly (TourRect | null)[]): TourRect | null {
  const present = rects.filter((rect): rect is TourRect => rect !== null);
  if (present.length === 0) return null;
  const left = Math.min(...present.map((rect) => rect.x));
  const top = Math.min(...present.map((rect) => rect.y));
  const right = Math.max(...present.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...present.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function cornerRadius(rect: TourRect, radius: TourRadius, padding: number): number {
  const half = Math.min(rect.width, rect.height) / 2;
  return radius === 'pill' ? half : Math.min(radius + padding, half);
}

/** The spotlight: the lit area padded by 10 points, its corners following the controls. */
export function holeFor(lit: TourRect, radius: TourRadius): TourHole {
  const padded = {
    x: lit.x - HOLE_PADDING,
    y: lit.y - HOLE_PADDING,
    width: lit.width + HOLE_PADDING * 2,
    height: lit.height + HOLE_PADDING * 2,
  };
  return { ...padded, radius: cornerRadius(padded, radius, HOLE_PADDING) };
}

/** The ring's control: the live control's own frame and corner. */
export function ringFor(live: TourRect, radius: TourRadius): TourHole {
  return { ...live, radius: cornerRadius(live, radius, 0) };
}

export type BubbleBounds = Readonly<{ top: number; bottom: number }>;

/** The bubble never sits under Skip's row and never passes the bottom safe area. */
export function bubbleBounds(windowHeight: number, safeTop: number, safeBottom: number): BubbleBounds {
  return { top: safeTop + SKIP_HEIGHT + BELOW_SKIP, bottom: windowHeight - safeBottom - ABOVE_SAFE_AREA };
}

export type BubblePlacement = Readonly<{ top: number; side: 'below' | 'above'; tight: boolean }>;

/**
 * Below the lit area when it fits, else above. When it fits on neither side (the largest
 * standard text size), it tightens once (12 points of padding instead of 16, 8 before the
 * counter instead of 12, 8 from the spotlight instead of 12) and tries again; failing that it
 * takes the larger side and slides into the bounds over the lit area, so no line of it is cut
 * off by the window's edge. Without a lit area it centres.
 */
export function placeBubble(
  hole: TourRect | null,
  heights: Readonly<{ normal: number; tight: number }>,
  bounds: BubbleBounds,
): BubblePlacement {
  if (!hole) {
    return {
      top: Math.max(bounds.top, (bounds.top + bounds.bottom - heights.normal) / 2),
      side: 'below',
      tight: false,
    };
  }
  const attempt = (height: number, gap: number, tight: boolean): BubblePlacement | null => {
    const below = hole.y + hole.height + gap;
    if (below + height <= bounds.bottom) return { top: below, side: 'below', tight };
    const above = hole.y - gap - height;
    if (above >= bounds.top) return { top: above, side: 'above', tight };
    return null;
  };
  const placed = attempt(heights.normal, BUBBLE_GAP, false)
    ?? attempt(heights.tight, TIGHT_BUBBLE_GAP, true);
  if (placed) return placed;
  const below = hole.y + hole.height + TIGHT_BUBBLE_GAP;
  const roomBelow = bounds.bottom - below;
  const roomAbove = hole.y - TIGHT_BUBBLE_GAP - bounds.top;
  return roomBelow >= roomAbove
    ? { top: Math.max(bounds.top, Math.min(below, bounds.bottom - heights.tight)), side: 'below', tight: true }
    : { top: Math.max(bounds.top, hole.y - TIGHT_BUBBLE_GAP - heights.tight), side: 'above', tight: true };
}

/** The tail points at the control's centre, clear of the bubble's rounded corners. */
export function tailOffset(anchorCenterX: number, bubbleWidth: number): number {
  return Math.min(
    Math.max(anchorCenterX - BUBBLE_MARGIN - TAIL_WIDTH / 2, TAIL_CORNER_CLEARANCE),
    bubbleWidth - TAIL_CORNER_CLEARANCE - TAIL_WIDTH,
  );
}

/** A rect is in view when it sits between the bounds the bubble keeps to. */
export function isInView(rect: TourRect, bounds: BubbleBounds): boolean {
  return rect.y >= bounds.top && rect.y + rect.height <= bounds.bottom;
}

/*
 * Native chrome is not a React view, so its frame is derived from the system geometry,
 * measured on the iOS Simulator (iPhone 18 Pro): the floating tab bar is centred, its three
 * items 94 points wide at an 86-point stride and 54 tall, their bottom 25 points above the
 * window's (8 on a phone without a home indicator); the back capsule sits 16 in at the top
 * safe area, 44 tall, 12 before its 19-point chevron, 4 before the title and 16 after it.
 * Android follows Material 3's 80-point navigation bar and 64-point top app bar. Skip stays
 * the way on if a device draws them elsewhere.
 */
export type ChromeGeometry = Readonly<{
  platform: 'ios' | 'android';
  windowWidth: number;
  windowHeight: number;
  safeTop: number;
  safeBottom: number;
  /** The back capsule's title grows with the text size; the tab bar's labels do not. */
  fontScale: number;
}>;

export function tabItemRect(geometry: ChromeGeometry, index: number, count: number): TourRect {
  if (geometry.platform === 'android') {
    const width = geometry.windowWidth / count;
    return { x: width * index, y: geometry.windowHeight - geometry.safeBottom - 80, width, height: 80 };
  }
  const itemBottom = geometry.windowHeight - (geometry.safeBottom > 0 ? 25 : 8);
  const left = (geometry.windowWidth - (94 + 86 * (count - 1))) / 2;
  return { x: left + 86 * index, y: itemBottom - 54, width: 94, height: 54 };
}

/**
 * How far down a lit control may sit: above the floating tab bar (every tour screen has it),
 * with 12 points to spare. A scroll view's programmatic end does not account for the bar.
 */
export function chromeBottom(geometry: ChromeGeometry): number {
  const barTop = geometry.platform === 'android'
    ? geometry.windowHeight - geometry.safeBottom - 80
    : tabItemRect(geometry, 0, 3).y - 4;
  return barTop - 12;
}

// A body-sized title averages about 9.5 points a character in the system font.
const TITLE_CHARACTER_WIDTH = 9.5;

export function backButtonRect(geometry: ChromeGeometry, title: string): TourRect {
  if (geometry.platform === 'android') {
    return { x: 4, y: geometry.safeTop + 8, width: 48, height: 48 };
  }
  return {
    x: 16,
    y: geometry.safeTop,
    width: 12 + 19 + 4 + Math.ceil(title.length * TITLE_CHARACTER_WIDTH * geometry.fontScale) + 16,
    height: 44,
  };
}
