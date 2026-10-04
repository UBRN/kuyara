/**
 * The one parse of the `SUPABASE_URL` setting: the project's https origin (no path and no
 * trailing slash), or undefined when the value is missing, not https or not a URL at all.
 * Every Supabase adapter receives this value and builds its addresses on it unchanged; the
 * token issuer must equal `<origin>/auth/v1` exactly.
 */
export function supabaseBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.origin : undefined;
  } catch {
    // Not a URL at all: the same answer as a missing setting.
    return undefined;
  }
}
