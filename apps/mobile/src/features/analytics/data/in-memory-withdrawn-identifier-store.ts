import type { WithdrawnIdentifierStore } from '@/features/analytics/domain/withdrawn-identifier-store';

export class InMemoryWithdrawnIdentifierStore implements WithdrawnIdentifierStore {
  private identifier: string | null;

  constructor(identifier: string | null = null) {
    this.identifier = identifier;
  }

  read(): string | null { return this.identifier; }
  keep(identifier: string): void { this.identifier = identifier; }
  clear(): void { this.identifier = null; }
}
