import type { AccountDeletionCode } from '@/features/account/application/account-delete';
import type { AccountProviderError } from '@/features/account/application/account-session';
import type { AccountProvider } from '@/features/account/application/account-screens';
import type { AccountSyncFailureCode } from '@/features/account/application/account-sync';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import {
  accountDeletionFailureProperty,
  accountSignInFailureProperty,
  accountSyncFailureProperty,
  accountSyncTriggerProperty,
} from '@/features/analytics/domain/analytics-mappers';
import type { CaptureAnalyticsEvent } from '@/features/analytics/domain/product-analytics';

/** What started a sync pass: the one thing that distinguishes one pass from another here. */
export type AccountSyncTrigger =
  | 'signIn'
  | 'consentAnswered'
  | 'foreground'
  | 'localWrite'
  | 'reconnected'
  | 'manual'
  | 'signOut';

/** How a sign-in settled: it worked, the person cancelled, or it failed in the way `failure` names. */
export type AccountSignInOutcome =
  | Readonly<{ result: 'success' | 'cancelled' }>
  | Readonly<{ result: 'failed'; failure: AccountProviderError['code'] | 'offline' }>;

export type AccountDeletionOutcome =
  | Readonly<{ result: 'success' | 'cancelled' }>
  | Readonly<{ result: 'failed'; failure: AccountDeletionCode }>;

export type AccountSyncOutcome =
  | Readonly<{ result: 'success' }>
  | Readonly<{ result: 'failed'; failure: AccountSyncFailureCode }>;

/**
 * The account's analytics events (taxonomy 5.12). Each method names an outcome the session
 * manager already knows and turns it into a closed event; nothing about the account, its
 * records or the error behind a failure is read here, and PostHog is never linked to the account.
 *
 * Passes run on every foreground and after every local write, so a sync outcome is reported once
 * per trigger and outcome in a process: a repeat of the same would add volume and no information,
 * and a changed outcome (a failure after successes) is a new key and is reported.
 */
export function createAccountAnalytics(capture: CaptureAnalyticsEvent | undefined) {
  const reportedSyncs = new Set<string>();
  const send: CaptureAnalyticsEvent = (name, properties, options) => capture?.(name, properties, options);
  return {
    signInFinished(provider: AccountProvider, outcome: AccountSignInOutcome): void {
      send('account_sign_in_finished', outcome.result === 'failed'
        ? {
          schema_version: ANALYTICS_SCHEMA_VERSION, provider, result: 'failed',
          failure_category: outcome.failure === 'offline' ? 'offline' : accountSignInFailureProperty(outcome.failure),
        }
        : { schema_version: ANALYTICS_SCHEMA_VERSION, provider, result: outcome.result });
    },
    syncFinished(trigger: AccountSyncTrigger, outcome: AccountSyncOutcome): void {
      const key = `${trigger}:${outcome.result === 'failed' ? outcome.failure : 'success'}`;
      if (reportedSyncs.has(key)) return;
      reportedSyncs.add(key);
      send('account_sync_finished', outcome.result === 'failed'
        ? {
          schema_version: ANALYTICS_SCHEMA_VERSION, trigger: accountSyncTriggerProperty(trigger), result: 'failed',
          failure_category: accountSyncFailureProperty(outcome.failure),
        }
        : { schema_version: ANALYTICS_SCHEMA_VERSION, trigger: accountSyncTriggerProperty(trigger), result: 'success' });
    },
    deleted(outcome: AccountDeletionOutcome): void {
      send('account_deleted', outcome.result === 'failed'
        ? {
          schema_version: ANALYTICS_SCHEMA_VERSION, result: 'failed',
          failure_category: accountDeletionFailureProperty(outcome.failure),
        }
        : { schema_version: ANALYTICS_SCHEMA_VERSION, result: outcome.result });
    },
    signedOut(): void {
      send('account_signed_out', { schema_version: ANALYTICS_SCHEMA_VERSION });
    },
  };
}
