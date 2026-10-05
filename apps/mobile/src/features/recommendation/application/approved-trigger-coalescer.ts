import {
  recommendationRefreshTrigger,
  type RecommendationApplicationInput,
} from '@/features/recommendation/application/recommendation-application-controller';
import { signalsOfInput } from '@/features/recommendation/application/recommendation-signals';

type Evaluate = (input: RecommendationApplicationInput) => Promise<boolean>;

type InFlight = Readonly<{
  input: RecommendationApplicationInput;
  promise: Promise<boolean>;
}>;

// The input queued behind the evaluation in flight. `input` is null once the settings
// changed back to what the evaluation in flight already reads, so nothing is left to run.
type Trailing = {
  input: RecommendationApplicationInput | null;
  evaluate: Evaluate;
  promise: Promise<boolean>;
};

function changesApprovedSignals(
  from: RecommendationApplicationInput,
  to: RecommendationApplicationInput,
): boolean {
  return recommendationRefreshTrigger(signalsOfInput(from), signalsOfInput(to)) !== null;
}

export type ApprovedTriggerCoalescer = Readonly<{
  /**
   * The input the latest render reads. When it asks for what the evaluation in flight already
   * evaluates, an input queued behind it (from settings that have since changed back) is
   * withdrawn.
   */
  followRender: (input: RecommendationApplicationInput, evaluate: Evaluate) => Promise<boolean>;
  /**
   * A caller's own read of the input (a pull to refresh), which may be older than what is
   * queued, so it never withdraws a queued input.
   */
  request: (input: RecommendationApplicationInput, evaluate: Evaluate) => Promise<boolean>;
}>;

/**
 * Runs one approved-trigger evaluation at a time. An input that changes no approved signal
 * (the weather or forecast hour moving `now`) joins the evaluation in flight. One that changes
 * a signal waits for it and then runs alone: only the latest such input is kept, and it is
 * evaluated against the persisted state the first evaluation left, not the state it was read
 * with.
 */
export function createApprovedTriggerCoalescer(): ApprovedTriggerCoalescer {
  let inFlight: InFlight | null = null;
  let trailing: Trailing | null = null;

  function submit(
    input: RecommendationApplicationInput,
    evaluate: Evaluate,
    withdrawsQueued: boolean,
  ): Promise<boolean> {
    if (!inFlight) return start(input, evaluate);
    const running = inFlight;
    if (!changesApprovedSignals(running.input, input)) {
      if (withdrawsQueued && trailing) trailing.input = null;
      return running.promise;
    }
    if (trailing) {
      trailing.input = input;
      trailing.evaluate = evaluate;
      return trailing.promise;
    }
    let queued: Trailing;
    const runLatest = (): Promise<boolean> => {
      const { input: latest, evaluate: latestEvaluate } = queued;
      trailing = null;
      return latest ? submit(latest, latestEvaluate, false) : running.promise;
    };
    queued = { input, evaluate, promise: running.promise.then(runLatest, runLatest) };
    trailing = queued;
    return queued.promise;
  }

  function start(input: RecommendationApplicationInput, evaluate: Evaluate): Promise<boolean> {
    const promise = evaluate(input);
    inFlight = { input, promise };
    const clear = () => {
      if (inFlight?.promise === promise) inFlight = null;
    };
    void promise.then(clear, clear);
    return promise;
  }

  return {
    followRender: (input, evaluate) => submit(input, evaluate, true),
    request: (input, evaluate) => submit(input, evaluate, false),
  };
}
