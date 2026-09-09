// The shared failure classification the analytics taxonomy (docs/analytics-taxonomy.md,
// section 5.10) names as a milestone 10 prerequisite. Its first version is exactly the four
// values today's code can distinguish; widening it is a domain change and an analytics
// schema change in the same commit. Features map their own error kinds onto it in their
// application layer; presentation never sees a raw error.
export const failureCategories = ['offline', 'unavailable', 'rate-limited', 'unknown'] as const;

export type FailureCategory = (typeof failureCategories)[number];

// Weather, recommendation and the Closet each throw a typed error carrying a string kind,
// and only these two kind names are shared vocabulary; every other kind is an unavailable
// upstream. 'unknown' stays the caller's to decide: it means the thrown value was not the
// feature's own error type at all, which this cannot see. A switch rather than an object
// lookup, because the kind comes off a thrown value and 'constructor' is a valid string.
export function failureCategoryFromErrorKind(kind: string): FailureCategory {
  switch (kind) {
    case 'network':
      return 'offline';
    case 'rate-limited':
      return 'rate-limited';
    default:
      return 'unavailable';
  }
}
