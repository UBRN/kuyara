import type { TourTargetId } from '@/features/walkthrough/domain/walkthrough-steps';

export type TourRect = Readonly<{ x: number; y: number; width: number; height: number }>;

/**
 * One control a screen offers the tour. The screen keeps the control and its behaviour; the
 * tour only reads where it is, what it is called, and asks the screen to scroll it into view.
 */
export type TourTargetHandle = Readonly<{
  /** The control's frame in window coordinates, or null when it is not laid out. */
  measure: () => Promise<TourRect | null>;
  /** The frame in the space its content lays out in: a presented sheet's own space in a sheet. */
  local?: () => Promise<TourRect | null>;
  /** The control's own spoken name, for the tour's stand-in over a live control. */
  label: () => string | undefined;
  /** A word the bubble names the control by (the first piece's catalog name). */
  name: () => string | undefined;
  /** Scrolls the screen so the control is in view; absent when the screen offers none. */
  reveal?: () => void;
  /** Scrolls the screen further by this many points, past its end if the chrome needs it. */
  scrollBy?: (dy: number) => void;
  /** The control's own action, for VoiceOver's activation of the tour's stand-in. */
  activate?: () => void;
}>;

type Listener = (id: TourTargetId) => void;

/**
 * The narrow registry screens write into (`registerTarget(id, handle)` in the prototype's
 * notes). It holds no tour state; the overlay reads it and the provider watches it.
 */
export class TourTargetRegistry {
  private readonly targets = new Map<TourTargetId, TourTargetHandle>();
  private readonly listeners = new Set<Listener>();

  register(id: TourTargetId, handle: TourTargetHandle): () => void {
    this.targets.set(id, handle);
    this.emit(id);
    return () => {
      if (this.targets.get(id) !== handle) return;
      this.targets.delete(id);
      this.emit(id);
    };
  }

  get(id: TourTargetId): TourTargetHandle | undefined {
    return this.targets.get(id);
  }

  has(id: TourTargetId): boolean {
    return this.targets.has(id);
  }

  /** A registered control moved or resized; the overlay measures again. */
  notifyLayout(id: TourTargetId): void {
    if (this.targets.has(id)) this.emit(id);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(id: TourTargetId): void {
    for (const listener of this.listeners) listener(id);
  }
}
