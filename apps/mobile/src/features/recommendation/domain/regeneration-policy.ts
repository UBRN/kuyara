/**
 * The one place the "show another outfit" allowance lives. Nothing here knows about a
 * provider, a model, the Worker or its quota: the policy answers one question, whether this
 * regeneration may spend an AI attempt, and the button stays enabled either way because the
 * pool path always has a valid three to offer.
 *
 * The daily number is a first-release default, not a derived limit. It keeps a single
 * install from spending the whole shared Worker ceiling in one sitting without making that
 * ceiling an architectural dependency of the device.
 */
export const regenerationPolicy = { dailyAiRegenerations: 5 } as const;

export function regenerationMode(
  used: number,
  policy: Readonly<{ dailyAiRegenerations: number }> = regenerationPolicy,
): 'ai' | 'pool' {
  return used < policy.dailyAiRegenerations ? 'ai' : 'pool';
}

/**
 * How many AI regenerations the local day has already spent. The day key is the controller's
 * own `localDayKey`, so there is no second clock: a key that is not today's reads as zero and
 * nothing has to be swept.
 */
export interface AiRegenerationBudget {
  usedToday(dayKey: string): Promise<number>;
  record(dayKey: string): Promise<void>;
}
