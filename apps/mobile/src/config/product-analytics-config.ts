// The rule for the PostHog environment variables. It never throws and never logs:
// a missing or malformed key leaves analytics disabled, which is the fail-closed side of the
// consent gate in ADR 0033 section 3. The project key is a publishable client key, not a
// secret, but it still stays out of logs and error messages.
type ProductAnalyticsOptions = Readonly<{
  apiKey?: string;
  host?: string;
  isDevelopment: boolean;
}>;

type Provider =
  | Readonly<{ kind: 'disabled' }>
  | Readonly<{ kind: 'enabled'; apiKey: string; host: string }>;

export type ProductAnalyticsConfiguration = Provider;

// Mirrors `resolveWorkerBaseUrl`: an origin, nothing else, and plaintext only in development.
function resolveHost(configuredHost: string, isDevelopment: boolean): string | null {
  try {
    const url = new URL(configuredHost);
    if (
      !['http:', 'https:'].includes(url.protocol)
      || (!isDevelopment && url.protocol !== 'https:')
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveProductAnalyticsConfiguration(
  options: ProductAnalyticsOptions,
): ProductAnalyticsConfiguration {
  const apiKey = options.apiKey?.trim() ?? '';
  const configuredHost = options.host?.trim() ?? '';

  // The region is a deliberate choice (ADR 0033 section 5), so there is no default host: a
  // key without one stays disabled rather than silently reaching the wrong PostHog cloud.
  if (!apiKey || !configuredHost) return { kind: 'disabled' };

  const host = resolveHost(configuredHost, options.isDevelopment);
  if (!host) return { kind: 'disabled' };

  return { kind: 'enabled', apiKey, host };
}
