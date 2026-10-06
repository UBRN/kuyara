import type { DressingDayChoice } from '@/features/recommendation/domain/dressing-day-choice';

/**
 * What the provider knows of a profile's answer for one dressing day. `unknown` is a read that
 * failed; it keeps the answer an earlier read of the same day found, so the day keeps dressing
 * for it until a read succeeds.
 */
export type DayChoiceRead = Readonly<{ profileId: string; key: string }> & (
  | Readonly<{ status: 'unknown'; previousChoice: DressingDayChoice | null }>
  | Readonly<{ status: 'none' }>
  | Readonly<{ status: 'row'; choice: DressingDayChoice }>
);

/** A read that found the day's answer or found none. */
export function dayChoiceRead(
  profileId: string,
  key: string,
  choice: DressingDayChoice | null,
): DayChoiceRead {
  return choice ? writtenDayChoice(profileId, key, choice) : { profileId, key, status: 'none' };
}

/** The answer just written for the day, which the next read would find. */
export function writtenDayChoice(profileId: string, key: string, choice: DressingDayChoice): DayChoiceRead {
  return { profileId, key, status: 'row', choice };
}

/** A read that failed, keeping what an earlier read of the same profile and day found. */
export function failedDayChoiceRead(
  previous: DayChoiceRead | null,
  profileId: string,
  key: string,
): DayChoiceRead {
  const sameDay = previous?.profileId === profileId && previous.key === key;
  return { profileId, key, status: 'unknown', previousChoice: sameDay ? answeredChoice(previous) : null };
}

/** The read of the rendered profile and day, or null while that day has not been read yet. */
export function currentDayChoiceRead(
  read: DayChoiceRead | null,
  profileId: string,
  key: string,
): DayChoiceRead | null {
  return read?.profileId === profileId && read.key === key ? read : null;
}

/** The answer the day dresses for: the row read, or the one kept from before a failed read. */
export function answeredChoice(read: DayChoiceRead | null): DressingDayChoice | null {
  if (read?.status === 'row') return read.choice;
  return read?.status === 'unknown' ? read.previousChoice : null;
}
