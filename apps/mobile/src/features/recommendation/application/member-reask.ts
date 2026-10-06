import { dailyAiRegenerationsFor } from '@/features/recommendation/domain/regeneration-policy';
import { dressingDayDateKey } from '@/features/weather/domain/wardrobe-day';

/**
 * Ties a re-ask's daily allowance to the token its request carries (ADR 0041 section 13): the
 * reservation reads the member's token once, a member's ten apply only when one was read, and
 * the Worker client sends that same token with the re-ask that follows. A failed read is no
 * token (the reader answers null), so that re-ask counts against everyone's five. The
 * allowance is per dressing day, and the evening and its small hours count against the date
 * the evening began on, so 18:00 does not hand out a second five.
 */
export function createMemberReask({ readToken, reserve, release }: Readonly<{
  readToken: () => Promise<string | null>;
  reserve: (dateKey: string, dailyLimit: number) => Promise<boolean>;
  release: (dateKey: string) => Promise<void>;
}>) {
  let token: string | null = null;
  return {
    async reserve(dressingDayKey: string): Promise<boolean> {
      token = await readToken();
      return reserve(dressingDayDateKey(dressingDayKey), dailyAiRegenerationsFor(token !== null));
    },
    /** Gives back a slot whose re-ask never reached the Worker. */
    release: (dressingDayKey: string): Promise<void> => release(dressingDayDateKey(dressingDayKey)),
    /** The token the last reserved re-ask was granted under, for its request. */
    token: async (): Promise<string | null> => token,
  };
}
