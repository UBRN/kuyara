// The shared failure classification the analytics taxonomy (docs/analytics-taxonomy.md,
// section 5.10) names as a milestone 10 prerequisite. Its first version is exactly the four
// values today's code can distinguish; widening it is a domain change and an analytics
// schema change in the same commit. Features map their own error kinds onto it in their
// application layer; presentation never sees a raw error.
export const failureCategories = ['offline', 'unavailable', 'rate-limited', 'unknown'] as const;

export type FailureCategory = (typeof failureCategories)[number];
