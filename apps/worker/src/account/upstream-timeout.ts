/**
 * The budget of each upstream call on the account deletion route. The route makes at most five
 * in a row (the JWKS, the account lookup, Apple's token and revoke calls, the delete), so
 * 5 x 3 s = 15 s stays under the phone's 20 s wait (`deletionTimeoutMs` in the mobile
 * `worker-account-deletion.ts`) with room for signing and the phone's network.
 *
 * It lives outside `index.ts` because workerd reads every named export of the main module as
 * an entrypoint and refuses to start the Worker when one is not a function or class.
 */
export const accountUpstreamTimeoutMs = 3000;
