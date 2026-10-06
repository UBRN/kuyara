import type { AccountSheetHost } from '@/features/account/application/account-screens';
import { composePieceLimit } from '@/features/recommendation/application/compose-around-pieces';
import { regenerationPolicy } from '@/features/recommendation/domain/regeneration-policy';

/**
 * The sign-in page's benefits (ADR 0041 section 5), one swipeable page each, in reading
 * order from the leftmost. A new benefit is one id here, its copy in both languages and its
 * scene in `account-intro-scenes.tsx`; the types make each of them required.
 */
export const accountIntroPageIds = ['closet', 'history', 'askAgain', 'devices', 'photos', 'compose'] as const;

export type AccountIntroPageId = (typeof accountIntroPageIds)[number];

/** The limits the benefit pages name, each read from the rule that owns it. */
export type AccountIntroLimits = Readonly<{
  askAgainRegular: number;
  askAgainMember: number;
  composePieces: number;
}>;

export const accountIntroLimits: AccountIntroLimits = {
  askAgainRegular: regenerationPolicy.dailyAiRegenerations,
  askAgainMember: regenerationPolicy.memberDailyAiRegenerations,
  composePieces: composePieceLimit,
};

/**
 * The page the benefits open on: outfit detail's members-only row opens on the benefit it
 * stands for, every other host on the leftmost page.
 */
export function accountIntroFirstPage(host: AccountSheetHost): AccountIntroPageId {
  return host === 'detail' ? 'compose' : 'closet';
}

/** How long a page stays before the next one arrives on its own (ADR 0041 section 5). */
export const ACCOUNT_INTRO_PAGE_DWELL_MS = 6000;
