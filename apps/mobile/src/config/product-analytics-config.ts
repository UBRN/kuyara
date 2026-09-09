// The rule for the PostHog environment variables. It never throws and never logs:
// a missing or malformed key leaves analytics disabled, which is the fail-closed side of the
// consent gate in ADR 0033 section 3. The project key is a publishable client key, not a
// secret, but it still stays out of logs and error messages.
type ProductAnalyticsOptions = Readonly<{
  apiKey?: string;
  host?: string;
  privacyPolicyUrl?: string;
  isDevelopment: boolean;
}>;

type Provider =
  | Readonly<{ kind: 'disabled' }>
  | Readonly<{ kind: 'enabled'; apiKey: string; host: string }>;

export type ProductAnalyticsConfiguration = Provider &
  Readonly<{ privacyPolicyUrl: string | null }>;

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

// The policy link Apple's guideline 5.1.1 (i) requires inside the app. It is opened in a
// browser, so it keeps its path and must always be https, development included.
function resolvePrivacyPolicyUrl(configuredUrl: string): string | null {
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveProductAnalyticsConfiguration(
  options: ProductAnalyticsOptions,
): ProductAnalyticsConfiguration {
  const privacyPolicyUrl = options.privacyPolicyUrl?.trim()
    ? resolvePrivacyPolicyUrl(options.privacyPolicyUrl.trim())
    : null;
  const apiKey = options.apiKey?.trim() ?? '';
  const configuredHost = options.host?.trim() ?? '';

  // The region is a deliberate choice (ADR 0033 section 5), so there is no default host: a
  // key without one stays disabled rather than silently reaching the wrong PostHog cloud.
  if (!apiKey || !configuredHost) return { kind: 'disabled', privacyPolicyUrl };

  const host = resolveHost(configuredHost, options.isDevelopment);
  if (!host) return { kind: 'disabled', privacyPolicyUrl };

  return { kind: 'enabled', apiKey, host, privacyPolicyUrl };
}
