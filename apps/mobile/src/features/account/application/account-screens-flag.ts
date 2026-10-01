/**
 * The one switch for the account screens (ADR 0041 section 5): the Profile card, the Settings
 * Account group and the Account and Delete account routes. Accounts stay closed until the
 * transfer contract is signed, so it is off in every build; `account-screens-flag.test.mjs`
 * fails while it is on.
 */
export const ACCOUNT_SCREENS_ENABLED: boolean = false;
