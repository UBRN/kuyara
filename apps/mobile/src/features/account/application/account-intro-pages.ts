import type { AccountSheetHost } from '@/features/account/application/account-screens';

/**
 * The sign-in page's benefits (ADR 0041 section 5), one swipeable page each, in reading
 * order from the leftmost. A new benefit is one id here, its copy in both languages and its
 * scene in `account-intro-scenes.tsx`; the types make each of them required.
 */
export const accountIntroPageIds = ['closet', 'history', 'askAgain', 'devices', 'photos', 'compose'] as const;

export type AccountIntroPageId = (typeof accountIntroPageIds)[number];

/**
 * The page the benefits open on: outfit detail's members-only row opens on the benefit it
 * stands for, every other host on the leftmost page.
 */
export function accountIntroFirstPage(host: AccountSheetHost): AccountIntroPageId {
  return host === 'detail' ? 'compose' : 'closet';
}

/** How long a page stays before the next one arrives on its own (ADR 0041 section 5). */
export const ACCOUNT_INTRO_PAGE_DWELL_MS = 6000;
