import type { AccountSession } from '@/features/account/application/account-screens';
import type { AccountMessages } from '@/localization/messages';

type SignedIn = Extract<AccountSession, { kind: 'signedIn' }>;

/** Law 4: every sync status is ink, glyph and words together; `tone` picks the ink and glyph. */
export type SyncTone = 'success' | 'progress' | 'warning' | 'danger';

export type SyncView = Readonly<{
  tone: SyncTone;
  label: string;
  /** The count beside the status: waiting or syncing. */
  value?: string;
  footer?: string;
  /** The Settings row's line under "Signed in with Apple". */
  settingsLine: string;
  /** "Sync now" turns into "Try again" after a failure; it is inactive while nothing can run. */
  action: Readonly<{ label: string; enabled: boolean }>;
}>;

/** One owner for what the Account screen and the Settings row say about sync (frames 06-08, 21, 22, 34-36). */
export function describeSync(session: SignedIn, online: boolean, copy: AccountMessages, time: string | null): SyncView {
  const sync = copy.sync;
  const pending = session.pendingChanges;
  const waiting = pending > 0 ? sync.waiting(pending) : undefined;
  const inactive = { label: sync.syncNow, enabled: false };

  if (!online) {
    return { tone: 'warning', label: sync.offline, value: waiting, footer: sync.offlineFooter(pending, time), settingsLine: sync.offlineWaiting(pending), action: inactive };
  }
  switch (session.sync.kind) {
    case 'syncing':
      return {
        tone: 'progress',
        label: sync.syncing,
        value: pending > 0 ? sync.syncingCount(pending) : undefined,
        footer: sync.syncingFooter(pending, time),
        settingsLine: sync.syncing,
        action: inactive,
      };
    case 'failed':
      return { tone: 'danger', label: sync.failed, value: waiting, footer: sync.failedFooter(pending, time), settingsLine: sync.failed, action: { label: sync.retry, enabled: true } };
    case 'upToDate':
      return { tone: 'success', label: sync.upToDate, footer: sync.upToDateFooter(time), settingsLine: sync.upToDate, action: { label: sync.syncNow, enabled: true } };
  }
}
