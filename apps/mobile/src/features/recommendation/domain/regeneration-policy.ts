/**
 * The one place the "ask again" allowance lives. Nothing here knows about a
 * provider, a model, the Worker or its quota.
 *
 * The daily number is a first-release default, not a derived limit. It keeps a single
 * install from spending the whole shared Worker ceiling in one sitting without making that
 * ceiling an architectural dependency of the device.
 */
export const regenerationPolicy = { dailyAiRegenerations: 5 } as const;

/**
 * Reserve an AI re-ask before entering the chain. The day key is the calendar date of
 * the controller's own dressing-day key, so there is no second clock and the evening shares
 * the allowance of the date it began on. A failed read or write denies the reservation.
 */
export interface AiRegenerationBudget {
  reserve(dayKey: string): Promise<boolean>;
}
