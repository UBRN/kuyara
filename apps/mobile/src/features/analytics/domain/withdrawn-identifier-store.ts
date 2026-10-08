// Device-only copy of the last analytics identifier, kept after sharing is turned off so the
// person can still quote it in a deletion request (ADR 0033 section 4). It is never read by
// analytics, never sent, and not part of the profile row. A new grant clears it before the
// answer is stored (a file that cannot be deleted then waits for the next withdrawal, which
// replaces it), and the person can remove it from Privacy.
export interface WithdrawnIdentifierStore {
  read(): string | null;
  // Replaces any earlier identifier.
  keep(identifier: string): void;
  clear(): void;
}
