// The one place formatters are built. Constructing an Intl formatter costs about a tenth of
// a millisecond of native ICU work, formatting with a built one about a microsecond, and a
// Weather render formats every hour of the rail several ways, so building one per value cost
// Today and Weather over a hundred milliseconds per weather update. A formatter is kept per
// locale and options, which the call sites keep to a small fixed set.

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * A date formatter for `locale` and `options`. Only one with an explicit time zone is kept:
 * one without resolves the device's zone when built, so a kept one would go on reading the
 * old zone after the person travels. An invalid zone throws here, as the constructor does.
 */
export function dateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  if (typeof options.timeZone !== 'string') return new Intl.DateTimeFormat(locale, options);
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateTimeFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateTimeFormats.set(key, format);
  }
  return format;
}

/** Whether `value` names a time zone Intl accepts: UTC, CET and Europe/Istanbul, and also a numeric offset. */
export function isValidTimeZone(value: string): boolean {
  try {
    dateTimeFormat('en', { timeZone: value }).format(0);
    return value.length > 0;
  } catch {
    return false;
  }
}

/** A number formatter for `locale` and `options`. */
export function numberFormat(
  locale: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}

/** A zone's wall clock at one instant: the calendar date and the time on its clock. */
export type ZonedClock = Readonly<{
  year: number;
  month: number;
  day: number;
  /** 0-23. */
  hour: number;
  minute: number;
  second: number;
}>;

/**
 * What a zone's wall clock reads at `instant`. The fixed 'en' locale and h23 cycle are the
 * point: the numbers are arithmetic, never copy, so the device's 12/24-hour setting must not
 * fold the evening onto the morning or read midnight as 24. Daylight-saving changes show as
 * the clock itself shows them: a skipped hour never appears and a repeated one appears twice.
 * An invalid zone throws, as `dateTimeFormat` does.
 */
export function zonedClock(instant: number, timeZone: string): ZonedClock {
  const parts = dateTimeFormat('en', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/** The 0-23 hour on a zone's wall clock at `instant`. */
export function zonedHour(instant: number, timeZone: string): number {
  return zonedClock(instant, timeZone).hour;
}

/** The `YYYY-MM-DD` calendar date a zone's wall clock reads at `instant`. */
export function zonedDateKey(instant: number, timeZone: string): string {
  return dateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(instant));
}
