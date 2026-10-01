import { dateTimeFormat } from '@/domain/intl-format';
import type { AccountSession } from '@/features/account/application/account-screens';
import { localeTag } from '@/localization/locale-tag';
import type { AccountMessages, SupportedLanguage } from '@/localization/messages';

type SignedIn = Extract<AccountSession, { kind: 'signedIn' }>;

/** Law 4: every sync status is ink, glyph and words together; `tone` picks the ink and glyph. */
export type SyncTone = 'success' | 'progress' | 'warning' | 'danger';

export type SyncView = Readonly<{
  tone: SyncTone;
  label: string;
  /** The count beside the status: waiting, syncing or restored so far. */
  value?: string;
  footer: string;
  /** The Settings row's line under "Signed in with Apple". */
  settingsLine: string;
  /** "Sync now" turns into "Try again" after a failure; it is inactive while nothing can run. */
  action: Readonly<{ label: string; enabled: boolean }>;
}>;

export function formatSyncTime(iso: string, language: SupportedLanguage, hour12: boolean): string {
  return dateTimeFormat(localeTag(language), {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  }).format(new Date(iso));
}

/** One owner for what the Account screen and the Settings row say about sync (frames 06-08, 21, 22, 34-36). */
export function describeSync(session: SignedIn, online: boolean, copy: AccountMessages, time: string): SyncView {
  const sync = copy.sync;
  const pending = session.pendingChanges;
  const waiting = pending > 0 ? sync.waiting(pending) : undefined;
  const inactive = { label: sync.syncNow, enabled: false };

  if (session.sync.kind === 'restoring') {
    const { counts } = session.sync;
    const value = sync.restoringCount(counts.piecesDone, counts.piecesTotal);
    return online
      ? { tone: 'progress', label: sync.restoring, value, footer: sync.restoringFooter(counts), settingsLine: sync.restoring, action: inactive }
      : { tone: 'warning', label: sync.offline, value, footer: sync.pausedFooter(counts), settingsLine: sync.offlineWaiting(0), action: inactive };
  }
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
