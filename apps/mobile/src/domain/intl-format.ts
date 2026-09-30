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
