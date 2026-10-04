import { dailyAiRegenerationsFor } from '@/features/recommendation/domain/regeneration-policy';

/**
 * Ties a re-ask's daily allowance to the token its request carries (ADR 0041 section 13): the
 * reservation reads the member's token once, a member's ten apply only when one was read, and
 * the Worker client sends that same token with the re-ask that follows. A failed read is no
 * token (the reader answers null), so that re-ask counts against everyone's five.
 */
export function createMemberReask({ readToken, reserve }: Readonly<{
  readToken: () => Promise<string | null>;
  reserve: (dayKey: string, dailyLimit: number) => Promise<boolean>;
}>) {
  let token: string | null = null;
  return {
    async reserve(dayKey: string): Promise<boolean> {
      token = await readToken();
      return reserve(dayKey, dailyAiRegenerationsFor(token !== null));
    },
    /** The token the last reserved re-ask was granted under, for its request. */
    token: async (): Promise<string | null> => token,
  };
}
