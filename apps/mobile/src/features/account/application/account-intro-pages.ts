/**
 * The sign-in page's benefits (ADR 0041 section 5), one swipeable page each, in reading
 * order from the leftmost. A new benefit is one id here, its copy in both languages and its
 * scene in `account-intro-scenes.tsx`; the types make each of them required.
 */
export const accountIntroPageIds = ['closet', 'history', 'askAgain', 'devices', 'photos'] as const;

export type AccountIntroPageId = (typeof accountIntroPageIds)[number];

/** How long a page stays before the next one arrives on its own (ADR 0041 section 5). */
export const ACCOUNT_INTRO_PAGE_DWELL_MS = 6000;
