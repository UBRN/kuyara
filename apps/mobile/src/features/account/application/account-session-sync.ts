import type {
  AccountSessionSyncPort,
  AccountSyncSummary,
  SyncConsentPort,
} from '@/features/account/application/account-session';
import {
  createAccountSyncFlow,
  pendingUpload,
  rowCount,
  type AccountRemotePort,
  type AccountRowsSourcePort,
  type FirstLinkOutcome,
  type LocalAccountRows,
} from '@/features/account/application/account-sync';
import { hasLinkedTo, linkAtPass, syncPassFor } from '@/features/account/domain/account-link';
import { isLiveRow, liveHistoryDays } from '@/features/account/domain/account-merge';
import {
  givenConsentRecordedAt,
  latestWithdrawnRecordedAt,
  syncConsentState,
  type SyncConsentState,
} from '@/features/account/domain/sync-consent';

/** What the Account screen counts: what the account receives from this phone under `state`. */
function summaryOf(local: LocalAccountRows, state: SyncConsentState, firstLink: FirstLinkOutcome | null): AccountSyncSummary {
  const records = state === 'given';
  return {
    pendingChanges: rowCount(pendingUpload(local, records)),
    closetPieces: records ? local.wardrobeItems.filter(({ row }) => isLiveRow(row)).length : 0,
    historyDays: records ? liveHistoryDays(local.outfitHistory.map(({ row }) => row)).size : 0,
    syncConsent: state,
    firstLink,
  };
}

/**
 * The sync behind the session manager (ADR 0041 sections 3, 4 and 10). Every pass reads the
 * account's consent first, because another phone may have given or withdrawn it, then runs a
 * first link or an ongoing sync for this phone's link. The data layer supplies only the row
 * source, the remote and the consent port.
 */
export function createAccountSessionSync({ consent, now, remote, source }: Readonly<{
  source: AccountRowsSourcePort;
  remote: AccountRemotePort;
  consent: SyncConsentPort;
  /** The clock edge, as an ISO instant, for the first upload's deletion-marker window. */
  now: () => string;
}>): AccountSessionSyncPort {
  const flow = createAccountSyncFlow(source, remote, now);
  return {
    hasLinked: async (userId) => hasLinkedTo(await source.link(), userId),
    async run(userId) {
      const records = await consent.records(userId);
      const state = syncConsentState(records);
      const syncConsent = state === 'given';
      const givenAt = givenConsentRecordedAt(records);
      const stored = await source.link();
      const link = linkAtPass(stored, userId, syncConsent);
      if (link !== stored) await source.saveLink(link);
      if (syncPassFor(link, userId, syncConsent, latestWithdrawnRecordedAt(records)) === 'sync') {
        return summaryOf(await flow.sync(userId, syncConsent), state, null);
      }
      const firstLink = await flow.firstLink(userId, syncConsent, givenAt);
      return summaryOf(await source.read(), state, firstLink);
    },
  };
}
