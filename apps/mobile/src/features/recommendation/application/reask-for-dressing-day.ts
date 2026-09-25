import type { DressStyle } from '@kuyara/contracts';

import type { RecommendationApplicationInput } from '@/features/recommendation/application/recommendation-application-controller';
import type {
  DressingDayChoice,
  DressingDayChoiceRepository,
} from '@/features/recommendation/domain/dressing-day-choice';
import type {
  DressingDayDeparture,
  DressingDayDepartureRepository,
} from '@/features/recommendation/domain/dressing-day-departure';
import { wardrobeDayWindow } from '@/features/weather/domain/wardrobe-day';

type ReaskRequest = Readonly<{
  formality: DressStyle;
  departureAt: string | null;
  timeZone: string;
}>;

type ReaskDependencies = Readonly<{
  localProfileId: string;
  currentDayKey: string;
  resolvedDressStyle: DressStyle;
  hasCurrentDayChoice: boolean;
  choiceRepository: Pick<DressingDayChoiceRepository, 'upsert'>;
  departureRepository: Pick<DressingDayDepartureRepository, 'upsert' | 'clear'>;
  currentInput: () => RecommendationApplicationInput | null;
  refresh: (input: RecommendationApplicationInput) => Promise<unknown>;
  now: () => string;
}>;

export async function reaskForDressingDay(
  request: ReaskRequest,
  dependencies: ReaskDependencies,
): Promise<Readonly<{
  choice: DressingDayChoice | null;
  departure: DressingDayDeparture | null;
  settled: Promise<void>;
}>> {
  const { localProfileId, currentDayKey } = dependencies;
  const departureKey = request.departureAt
    ? wardrobeDayWindow(request.departureAt, request.timeZone)?.key : null;
  if (request.departureAt && !departureKey) {
    throw new Error('Invalid departure time or time zone.');
  }
  const key = departureKey ?? currentDayKey;
  const writeChoice = key !== currentDayKey ||
    request.formality !== dependencies.resolvedDressStyle ||
    !dependencies.hasCurrentDayChoice;
  const choice = writeChoice
    ? await dependencies.choiceRepository.upsert(localProfileId, key, request.formality, 'chip')
    : null;
  const departure = request.departureAt && departureKey
    ? await dependencies.departureRepository.upsert(
      localProfileId, departureKey, request.departureAt, request.timeZone)
    : null;
  if (!departure || departureKey !== currentDayKey) {
    await dependencies.departureRepository.clear(localProfileId, currentDayKey);
  }

  // The single recommendation row remains Today's until this departure day becomes current.
  const generationInput = key === currentDayKey ? dependencies.currentInput() : null;
  let refresh: Promise<unknown> = Promise.resolve(null);
  if (generationInput && key === currentDayKey) {
    const { departureAt: _previousDeparture, ...base } = generationInput;
    refresh = dependencies.refresh({
      ...base,
      now: dependencies.now(),
      dressStyle: request.formality,
      ...(request.departureAt ? { departureAt: request.departureAt } : {}),
    });
  }
  return {
    choice: key === currentDayKey ? choice : null,
    departure: departureKey === currentDayKey ? departure : null,
    settled: refresh.then(() => undefined, () => undefined),
  };
}
