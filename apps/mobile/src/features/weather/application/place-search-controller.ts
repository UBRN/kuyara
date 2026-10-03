import {
  placeSearchMaxResults,
  placeSearchQueryMaxLength,
  placeSearchQueryMinLength,
  type PlaceSearchResult,
  type PlaceSearchV1Data,
  type PlaceSearchV1Request,
} from '@kuyara/contracts';

import { PlaceSearchError } from '@/features/weather/domain/place-search-error';

export type SearchPlaces = (request: PlaceSearchV1Request) => Promise<PlaceSearchV1Data>;
export type PlaceSearchState =
  | Readonly<{ status: 'idle' | 'loading' }>
  | Readonly<{ status: 'ready'; places: readonly PlaceSearchResult[] }>
  | Readonly<{ status: 'error'; code: PlaceSearchError['code'] }>;

export class PlaceSearchController {
  private state: PlaceSearchState = { status: 'idle' };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  private readonly searchPlaces: SearchPlaces;

  constructor(searchPlaces: SearchPlaces) {
    this.searchPlaces = searchPlaces;
  }

  getSnapshot = (): PlaceSearchState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  cancel(): void {
    clearTimeout(this.timer);
    this.generation += 1;
  }

  search(rawQuery: string, language: PlaceSearchV1Request['language']): void {
    this.cancel();
    const query = rawQuery.trim();
    if (query.length < placeSearchQueryMinLength) {
      this.setState({ status: 'idle' });
      return;
    }
    if (query.length > placeSearchQueryMaxLength) {
      this.setState({ status: 'error', code: 'invalid-input' });
      return;
    }
    const generation = this.generation;
    this.setState({ status: 'loading' });
    this.timer = setTimeout(() => void this.run({ query, language, limit: placeSearchMaxResults }, generation), 300);
  }

  private async run(request: PlaceSearchV1Request, generation: number): Promise<void> {
    try {
      const data = await this.searchPlaces(request);
      if (generation !== this.generation) return;
      this.setState({ status: 'ready', places: data.places.filter((place) => place.timeZone !== null) });
    } catch (error) {
      if (generation !== this.generation) return;
      this.setState({ status: 'error', code: error instanceof PlaceSearchError ? error.code : 'unavailable' });
    }
  }

  private setState(state: PlaceSearchState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
