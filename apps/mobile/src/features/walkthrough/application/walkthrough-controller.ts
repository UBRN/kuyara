import {
  routeOutcome,
  sheetOutcome,
  type TourOutcome,
  type TourRoute,
} from '@/features/walkthrough/domain/walkthrough-rules';
import {
  fullTourPlan,
  tourSteps,
  type TourPlan,
  type TourTargetId,
} from '@/features/walkthrough/domain/walkthrough-steps';

/** `auto`: the tour the gate offered. `manual`: Settings, Help asked for it. */
export type WalkthroughSource = 'auto' | 'manual';

/** How the current step was reached, which sets how long the overlay waits before it. */
export type WalkthroughStepEntry = 'start' | 'continue' | 'navigation';

export type WalkthroughState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{
      status: 'running';
      run: number;
      source: WalkthroughSource;
      stepIndex: number;
      entry: WalkthroughStepEntry;
      /** The steps this run shows; the counter counts these. */
      plan: TourPlan;
    }>;

type Listener = () => void;

/**
 * The tour's one state owner. It never navigates, presses a control or writes anything
 * but the gate: it moves between steps when Continue is pressed or when the live control's
 * own navigation is observed, and ends on Skip, Done or an interruption. Only the offered
 * tour's close stores the gate; the Help row's tour and an interruption store nothing.
 */
export class WalkthroughController {
  private state: WalkthroughState = { status: 'idle' };
  private runs = 0;
  private readonly listeners = new Set<Listener>();
  private writeGate: (() => Promise<void>) | null = null;
  private activator: ((id: TourTargetId) => void) | null = null;

  /** The profile's gate write; the offered tour's close calls it. */
  setGateWriter(writeGate: (() => Promise<void>) | null): void {
    this.writeGate = writeGate;
  }

  /**
   * Performs a live control's own action for VoiceOver, whose activation cannot reach the
   * control under the overlay; the tour still advances only when that navigation lands.
   */
  setActivator(activator: ((id: TourTargetId) => void) | null): void {
    this.activator = activator;
  }

  getSnapshot = (): WalkthroughState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(source: WalkthroughSource, plan: TourPlan = fullTourPlan): void {
    if (this.state.status === 'running' || plan.length === 0) return;
    this.runs += 1;
    this.setState({ status: 'running', run: this.runs, source, stepIndex: plan[0], entry: 'start', plan });
  }

  /** Continue on a look step, or Done on the last one. */
  continue(): void {
    if (this.state.status !== 'running') return;
    if (tourSteps[this.state.stepIndex].kind !== 'look') return;
    if (this.state.stepIndex === this.state.plan[this.state.plan.length - 1]) {
      this.close();
      return;
    }
    this.advance('continue');
  }

  /** The stand-in over the live control was activated by VoiceOver. */
  activateLive(): void {
    if (this.state.status !== 'running') return;
    const live = tourSteps[this.state.stepIndex].live;
    if (live) this.activator?.(live);
  }

  /** Something outside the tour took over (a notification opened); nothing is stored. */
  interrupt(): void {
    if (this.state.status === 'running') this.setState({ status: 'idle' });
  }

  /** Skip, the escape gesture and Android back: every close the person makes. */
  skip(): void {
    if (this.state.status === 'running') this.close();
  }

  observeRoute(route: TourRoute): void {
    if (this.state.status !== 'running') return;
    this.apply(routeOutcome(tourSteps[this.state.stepIndex], route));
  }

  observeSheet(open: boolean): void {
    if (this.state.status !== 'running') return;
    this.apply(sheetOutcome(tourSteps[this.state.stepIndex], open));
  }

  private apply(outcome: TourOutcome): void {
    if (outcome === 'advance') this.advance('navigation');
    else if (outcome === 'interrupt') this.interrupt();
  }

  private advance(entry: WalkthroughStepEntry): void {
    if (this.state.status !== 'running') return;
    const next = this.state.plan[this.state.plan.indexOf(this.state.stepIndex) + 1];
    if (next === undefined) this.close();
    else this.setState({ ...this.state, stepIndex: next, entry });
  }

  private close(): void {
    if (this.state.status !== 'running') return;
    const offered = this.state.source === 'auto';
    this.setState({ status: 'idle' });
    // A failed write leaves the gate due; the tour then waits for the next quiet launch.
    if (offered) void this.writeGate?.().catch(() => undefined);
  }

  private setState(state: WalkthroughState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
