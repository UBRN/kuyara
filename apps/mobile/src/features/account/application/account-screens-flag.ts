/**
 * The one switch for the account screens (ADR 0041 section 5): the Profile card, the Settings
 * Account group and the Account and Delete account routes. It is on from build 20, where accounts
 * are optional; `account-screens-flag.test.mjs` locks it on.
 */
export const ACCOUNT_SCREENS_ENABLED: boolean = true;
