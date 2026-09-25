/** The outfit's useful forecast horizon, independent of the dressing-day key. */
export type OutfitCoverage = Readonly<{ start: string; end: string }>;

function localParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { year: Number(values.year), month: Number(values.month),
    day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute) };
}

export function outfitCoverage(startIso: string, timeZone: string): OutfitCoverage | null {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  try {
    const local = localParts(start, timeZone);
    const endHour = local.hour >= 18 || local.hour < 1 ? 1
      : local.hour < 4 ? 4
        : local.hour < 11 ? 19
          : local.hour < 16 ? 20 : 22;
    const endDate = new Date(Date.UTC(local.year, local.month - 1,
      local.day + (local.hour >= 18 ? 1 : 0)));
    // Search actual instants, not a fixed UTC offset. This also chooses the first 01:00
    // on a fall-back night and handles a changed offset before the end of the window.
    const first = Math.ceil((start + 1) / 900000) * 900000;
    for (let at = first; at <= start + 30 * 3600000; at += 900000) {
      const candidate = localParts(at, timeZone);
      if (candidate.year === endDate.getUTCFullYear() &&
          candidate.month === endDate.getUTCMonth() + 1 &&
          candidate.day === endDate.getUTCDate() &&
          candidate.hour === endHour && candidate.minute === 0) {
        return { start: new Date(start).toISOString(), end: new Date(at).toISOString() };
      }
    }
    return null;
  } catch {
    return null;
  }
}
