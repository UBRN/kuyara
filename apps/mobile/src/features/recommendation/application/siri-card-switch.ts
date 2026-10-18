import type { AppConfigV1SiriCard } from '@kuyara/contracts';

/** ADR 0042 section 7: whether the Siri outfit card shows outfits. */
export type SiriCardSwitch = AppConfigV1SiriCard;
export type StoredSiriCardSwitch = Readonly<{ siriCard: SiriCardSwitch; checkedAt: string }>;

/** The last answer on the device; `read` gives null when there is none it can use, neither method throws. */
export type SiriCardSwitchStore = Readonly<{
  read(): Promise<StoredSiriCardSwitch | null>;
  write(stored: StoredSiriCardSwitch): Promise<void>;
}>;
/** The Worker's answer, or null when it gave no usable one; never throws. */
export type SiriCardSwitchClient = Readonly<{ siriCard(): Promise<SiriCardSwitch | null> }>;

/** At most six checks a day, each only while the app is opened. */
export const siriCardCheckIntervalMs = 4 * 60 * 60 * 1000;

/**
 * Publishes the stored switch at once, then, when the last check is older than the interval,
 * asks the Worker and publishes a changed answer. No usable answer keeps the last value, and
 * on when there never was one; a failed check still counts, so an outage costs no extra requests.
 */
export async function syncSiriCardSwitch({ store, client, now, publish }: Readonly<{
  store: SiriCardSwitchStore;
  client: SiriCardSwitchClient;
  now: () => string;
  publish: (siriCard: SiriCardSwitch) => void;
}>): Promise<void> {
  const stored = await store.read();
  const last = stored?.siriCard ?? 'on';
  publish(last);
  const checkedAt = now();
  const sinceCheck = stored ? Date.parse(checkedAt) - Date.parse(stored.checkedAt) : Infinity;
  if (sinceCheck >= 0 && sinceCheck < siriCardCheckIntervalMs) return;
  const siriCard = (await client.siriCard()) ?? last;
  await store.write({ siriCard, checkedAt });
  if (siriCard !== last) publish(siriCard);
}
