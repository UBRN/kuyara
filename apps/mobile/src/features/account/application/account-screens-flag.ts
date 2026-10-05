/**
 * The one switch for the account screens (ADR 0041 section 5): the Profile card, the Settings
 * Account group and the Account and Delete account routes. It is off until the release that
 * opens accounts; `account-screens-flag.test.mjs` fails while it is on.
 */
export const ACCOUNT_SCREENS_ENABLED: boolean = false;
