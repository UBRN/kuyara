// The one home of the `YYYY-MM-DD` calendar-date key: how it is read into parts or a Date and
// how parts or a Date are written back. A calendar date carries no time zone and no offset.

export type CalendarDateParts = Readonly<{ year: number; month: number; day: number }>;

/** Reads a well-formed `YYYY-MM-DD` key into its numeric parts. */
export function calendarDateParts(value: string): CalendarDateParts {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

/** Writes parts as `YYYY-MM-DD`; the month and day are zero-padded, the year is not. */
export function formatCalendarDateParts({ year, month, day }: CalendarDateParts): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The device-local Date for a calendar key, at noon so a DST shift cannot move the day. */
export function parseCalendarDate(value: string): Date {
  const { year, month, day } = calendarDateParts(value);
  return new Date(year, month - 1, day, 12);
}

/** The device-local calendar key of a Date. */
export function formatCalendarDate(value: Date): string {
  return formatCalendarDateParts({
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
  });
}
