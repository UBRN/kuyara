/**
 * The one place the "ask again" allowance lives. Nothing here knows about a
 * provider, a model, the Worker or its quota.
 *
 * The daily number is a first-release default, not a derived limit. It keeps a single
 * install from spending the whole shared Worker ceiling in one sitting without making that
 * ceiling an architectural dependency of the device.
 */
export const regenerationPolicy = { dailyAiRegenerations: 5, memberDailyAiRegenerations: 10 } as const;

/**
 * The day's re-asks on this device: five for everyone, ten for a signed-in member (ADR 0041
 * section 13). The Worker counts a member's ten on the UTC day and does not trust this count;
 * the device count only keeps a member from being stopped at five.
 */
export function dailyAiRegenerationsFor(member: boolean): number {
  return member ? regenerationPolicy.memberDailyAiRegenerations : regenerationPolicy.dailyAiRegenerations;
}

/**
 * Reserve an AI re-ask before entering the chain. The day key is the calendar date of
 * the controller's own dressing-day key, so there is no second clock and the evening shares
 * the allowance of the date it began on. A failed read or write denies the reservation.
 */
export interface AiRegenerationBudget {
  /** `dailyLimit` defaults to everyone's allowance; a member's comes from `dailyAiRegenerationsFor`. */
  reserve(dayKey: string, dailyLimit?: number): Promise<boolean>;
  /** Gives back one slot of the day, never below zero; a store it cannot use changes nothing. */
  release(dayKey: string): Promise<void>;
}
