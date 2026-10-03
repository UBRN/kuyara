import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';
import { AppState, type AppStateStatus } from 'react-native';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  RecommendationApplicationController,
  expiredCoverageNeedsSelection,
  localDayKey,
  localDayKind,
  localDayVariant,
  recommendationRefreshTrigger,
  type RecommendationApplicationInput,
  type RecommendationSignals,
} from '@/features/recommendation/application/recommendation-application-controller';
import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
} from '@/features/recommendation/application/recommendation-application-context';
import { usePerformanceTelemetry } from '@/features/analytics/application/use-performance-telemetry';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { garmentCatalogVersion } from '@/features/catalog/domain/garment-catalog';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { orderStyleAesthetics } from '@/features/profile/domain/profile';
import { ExpoFileAiRegenerationBudget } from '@/features/recommendation/data/expo-file-ai-regeneration-budget';
import { LocalRecommendationRepository } from '@/features/recommendation/data/recommendation-repository';
import { SqliteRecommendationLocalDataSource } from '@/features/recommendation/data/sqlite-recommendation-local-data-source';
import { SqliteDressingDayChoiceRepository } from '@/features/recommendation/data/sqlite-dressing-day-choice-repository';
import { SqliteDressingDayDepartureRepository } from '@/features/recommendation/data/sqlite-dressing-day-departure-repository';
import {
  departureDressingDayKey,
  type DressingDayDeparture,
} from '@/features/recommendation/domain/dressing-day-departure';
import { reaskForDressingDay } from '@/features/recommendation/application/reask-for-dressing-day';
import {
  TomorrowPreviewController,
  forecastCoversWindow,
  previewAnswersQuestion,
  type TomorrowPreviewInput,
  type TomorrowPreviewStore,
} from '@/features/recommendation/application/tomorrow-preview';
import {
  aiRequestFromContext,
  createRecommendationContextWithPool,
} from '@/features/recommendation/data/worker-ai-recommendation-mapper';
import { ExpoFileRecommendationPreviewDataSource } from '@/features/recommendation/data/expo-file-recommendation-preview-data-source';
import { isSetupDressingDay, nextMorningAfterEvening, previewDepartureAt } from '@/features/recommendation/domain/local-day';
import { resolvedFormality, resolvedStyleAesthetics, type DressingDayChoice, type DressingDayChoiceSource } from '@/features/recommendation/domain/dressing-day-choice';
import { SqliteOutfitHistoryRepository } from '@/features/recommendation/data/sqlite-outfit-history-repository';
import { ExpoHistoryPhotoStorage } from '@/features/recommendation/data/expo-history-photo-storage';
import type { WornOutfit, WornPieceColors } from '@/features/recommendation/domain/outfit-history';
import {
  OnDeviceAiClient,
  type OnDeviceAiModule,
} from '@/features/recommendation/data/on-device-ai-client';
import { RoutedAiClient } from '@/features/recommendation/data/routed-ai-client';
import {
  WorkerAiClient,
  WorkerAiClientError,
} from '@/features/recommendation/data/worker-ai-client';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';
import { onDeviceAiModule } from '@/features/recommendation/data/on-device-ai-module';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { dressingDayDateKey, isEveningDressingDayKey } from '@/features/weather/domain/wardrobe-day';
import { resolveAppWorkerBaseUrl } from '@/config/app-worker-base-url';
import { WorkerBaseUrlConfigurationError } from '@/config/worker-base-url';
import { openMigratedDatabase } from '@/infrastructure/sqlite/open-migrated-database';
import { newUuid } from '@/infrastructure/new-uuid';
import { systemNow as now } from '@/infrastructure/system-clock';
import { useLocalization } from '@/localization/use-messages';

function approvedSignals(input: RecommendationApplicationInput): RecommendationSignals {
  return {
    weatherSnapshotId: input.snapshot.id,
    locationKey: input.snapshot.locationKey,
    clothingPreference: input.clothingPreference,
    dressStyle: input.dressStyle ?? 'smart',
    styleAesthetics: input.styleAesthetics,
    catalogVersion: garmentCatalogVersion,
    localDayKey: input.localDayKey,
  };
}

function deviceLocalDay() {
  const date = new Date();
  return {
    key: localDayKey(date),
    variant: localDayVariant(date),
    kind: localDayKind(date),
  };
}

function createWorkerClient(): Pick<WorkerAiClient, 'recommend'> {
  try {
    return new WorkerAiClient({
      baseUrl: resolveAppWorkerBaseUrl(),
    });
  } catch (error) {
    if (!(error instanceof WorkerBaseUrlConfigurationError)) throw error;
    return {
      recommend: () => Promise.reject(new WorkerAiClientError('service')),
    };
  }
}

// ADR 0034 section 1: the composition boundary that builds the AI chain, on-device ahead of
// the Worker. The native module arrives through the data layer, which is its only importer;
// it is null on Android, on web and on any build without the native surface, and the routed
// client then reads the on-device tier as unavailable and goes straight to the Worker with
// the whole budget. The parameter stays so tests can inject a fake module.
function createRecommendationClient(
  module: OnDeviceAiModule | null = onDeviceAiModule,
): RoutedAiClient {
  return new RoutedAiClient({
    onDevice: new OnDeviceAiClient({ module }),
    worker: createWorkerClient(),
  });
}

async function loadRepository() {
  const database = await openMigratedDatabase();
  return new LocalRecommendationRepository(
    new SqliteRecommendationLocalDataSource(database),
    { createId: newUuid, now },
  );
}

function createPreviewStore(): TomorrowPreviewStore {
  const source = new ExpoFileRecommendationPreviewDataSource();
  const repository = new LocalRecommendationRepository(source,
    { createId: newUuid, now });
  return {
    claim: (profileId, dayKey) => source.claim(profileId, dayKey),
    // A preview for another day, or one that no longer validates, is no preview.
    get: (profileId, dayKey) => repository.getSnapshot(profileId, dayKey).catch(() => null),
    save: (profileId, input) => repository.saveSnapshot(profileId, input),
  };
}

function composePreview(input: TomorrowPreviewInput) {
  const { context } = createRecommendationContextWithPool(input, input.localDayKey);
  return { context, request: aiRequestFromContext(context) };
}

async function loadChoiceRepository() {
  const database = await openMigratedDatabase();
  return new SqliteDressingDayChoiceRepository(database, newUuid, now);
}

async function loadDepartureRepository() {
  const database = await openMigratedDatabase();
  return new SqliteDressingDayDepartureRepository(database, newUuid, now);
}

async function loadHistoryRepository() {
  const database = await openMigratedDatabase();
  return new SqliteOutfitHistoryRepository(database, newUuid, now,
    new ExpoHistoryPhotoStorage(newUuid));
}

type DayChoiceReadState = Readonly<{ profileId: string; key: string }> & (
  | Readonly<{ status: 'unknown'; previousChoice: DressingDayChoice | null }>
  | Readonly<{ status: 'none' }>
  | Readonly<{ status: 'row'; choice: DressingDayChoice }>
);

export function RecommendationApplicationProvider({
  children,
  localProfileId,
}: PropsWithChildren<{ localProfileId: string }>) {
  const { state: profileState } = useProfileApplication();
  const { language } = useLocalization();
  const weatherApplication = useWeatherApplication();
  const weatherState = weatherApplication.state;
  const { analytics } = useProductAnalytics();
  const telemetry = usePerformanceTelemetry();
  const [localDay, setLocalDay] = useState(deviceLocalDay);
  const [dayChoiceState, setDayChoiceState] = useState<DayChoiceReadState | null>(null);
  const [choiceReadAttempt, setChoiceReadAttempt] = useState(0);
  const [departureState, setDepartureState] = useState<{
    key: string; value: DressingDayDeparture | null;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void loadDepartureRepository().then((repository) => repository.get(localProfileId, localDay.key))
      .then((value) => { if (live) setDepartureState({ key: localDay.key, value }); })
      .catch(() => { if (live) setDepartureState({ key: localDay.key, value: null }); });
    return () => { live = false; };
  }, [localDay.key, localProfileId]);
  const departureReady = departureState?.key === localDay.key;
  const activeDeparture = departureState?.key === localDay.key &&
    departureState.value && Date.parse(departureState.value.departureAt) > Date.now()
    ? departureState.value : null;
  const choiceReadFailed = useRef(false);
  useEffect(() => {
    let live = true;
    choiceReadFailed.current = false;
    void loadChoiceRepository().then((repository) => repository.get(localProfileId, localDay.key))
      .then((choice) => {
        if (!live) return;
        choiceReadFailed.current = false;
        setDayChoiceState(choice
          ? { profileId: localProfileId, key: localDay.key, status: 'row', choice }
          : { profileId: localProfileId, key: localDay.key, status: 'none' });
      })
      .catch(() => {
        if (!live) return;
        choiceReadFailed.current = true;
        setDayChoiceState((previous) => ({
          profileId: localProfileId,
          key: localDay.key,
          status: 'unknown',
          previousChoice: previous?.profileId === localProfileId && previous.key === localDay.key
            ? previous.status === 'row'
              ? previous.choice
              : previous.status === 'unknown' ? previous.previousChoice : null
            : null,
        }));
      });
    return () => { live = false; };
  }, [choiceReadAttempt, localDay.key, localProfileId]);
  const currentDayChoice = dayChoiceState?.profileId === localProfileId &&
    dayChoiceState.key === localDay.key ? dayChoiceState : null;
  const choiceReady = currentDayChoice?.status === 'row' || currentDayChoice?.status === 'none';
  const choiceFailed = currentDayChoice?.status === 'unknown';
  const dayChoice = currentDayChoice?.status === 'row'
    ? currentDayChoice.choice
    : currentDayChoice?.status === 'unknown' ? currentDayChoice.previousChoice : null;
  const profileDefault = profileState.status === 'ready'
    ? profileState.profile.dressStyle ?? 'smart' : 'smart';
  const resolvedDressStyle = resolvedFormality(dayChoice, profileDefault);
  const resolvedStyles = resolvedStyleAesthetics(dayChoice,
    profileState.status === 'ready' ? profileState.profile.styleAesthetics ?? [] : []);
  // The day the profile was set up on is answered by setup, so neither question is asked then.
  const dayQuestionOpen = currentDayChoice?.status === 'none' && profileState.status === 'ready' &&
    !isSetupDressingDay(profileState.profile.createdAt, localDay.key);
  const morningChoicePending = Boolean(dayQuestionOpen && !isEveningDressingDayKey(localDay.key) &&
    profileState.status === 'ready' && profileState.profile.morningSheetEnabled);
  const eveningChoicePending = Boolean(dayQuestionOpen && isEveningDressingDayKey(localDay.key));
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const reevaluateLocalDay = useCallback(() => {
    const next = deviceLocalDay();
    setLocalDay((current) => current.key === next.key ? current : next);
    if (choiceReadFailed.current) setChoiceReadAttempt((current) => current + 1);
  }, []);
  const client = useMemo(() => createRecommendationClient(), []);
  const [onDeviceAvailability, setOnDeviceAvailability] =
    useState<OnDeviceAiAvailability | null>(null);
  // A stable box rather than a `useRef`, because `react-hooks/refs` rejects reading
  // `ref.current` from anything the `useMemo` factory closes over, however the read is
  // wrapped. It does the same job: a resolved availability does not rebuild the controller
  // and restart the recommendation state it owns. Written where the state is written, and
  // read only when an event is about to be recorded.
  const [latestOnDeviceAvailability] = useState<{ value: OnDeviceAiAvailability | null }>(
    () => ({ value: null }),
  );
  // Re-asks reserve a daily slot before the controller enters the AI chain.
  const budget = useMemo(() => new ExpoFileAiRegenerationBudget(), []);
  const previewStore = useMemo(createPreviewStore, []);
  const loadRecentWorn = useCallback(async () =>
    (await (await loadHistoryRepository()).lastSeven(localProfileId)).map((record) => record.outfit),
  [localProfileId]);
  const controller = useMemo(
    () => new RecommendationApplicationController(localProfileId, {
      loadRepository,
      loadRecentWorn,
      loadPreview: (dayKey) => previewStore.get(localProfileId, dayKey),
      client,
      captureAnalyticsEvent: (name, properties, options) => analytics.capture(name, properties, options),
      telemetry,
      getOnDeviceAvailability: () => latestOnDeviceAvailability.value,
      // Five regenerations per dressing day: the evening and its small hours count against the
      // date the evening began on, so 18:00 does not hand out a second five.
      reserveAiReask: (dayKey) => budget.reserve(dressingDayDateKey(dayKey)),
    }),
    [analytics, budget, client, latestOnDeviceAvailability, loadRecentWorn, localProfileId, previewStore,
      telemetry],
  );
  const controllerState = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const state = useMemo(() => controllerState.status === 'ready' && controllerState.snapshot &&
    controllerState.snapshot.localDayKey !== localDay.key
    ? { ...controllerState, snapshot: null } as const
    : controllerState, [controllerState, localDay.key]);
  const input = useMemo(() => {
    const clothingPreference = profileState.status === 'ready'
      ? profileState.profile.clothingPreference
      : null;
    if (
      weatherState.status !== 'ready' ||
      !weatherState.snapshot ||
      !clothingPreference || !choiceReady || !departureReady
    ) return null;
    return {
      snapshot: weatherState.snapshot,
      // The requirement engine reads the local day and the hours left in it from here, not
      // from the snapshot's observation time. It is re-read whenever the day, the profile
      // or the weather changes, which is every moment a recommendation is generated.
      now: now(),
      ...(activeDeparture ? { departureAt: activeDeparture.departureAt } : {}),
      clothingPreference,
      dressStyle: resolvedDressStyle,
      styleAesthetics: resolvedStyles,
      dayVariant: localDay.variant,
      dayKind: localDay.kind,
      localDayKey: localDay.key,
      locale: language,
    };
  }, [activeDeparture, choiceReady, departureReady, language, localDay, profileState,
    resolvedDressStyle, resolvedStyles, weatherState]);
  useEffect(() => {
    void controller.initialize(localDay.key);
  }, [controller, localDay.key]);

  // ADR 0034 section 5: reading availability runs no inference and consumes no quota, so it
  // happens once on mount and never on a user action. It feeds the AI status row only.
  useEffect(() => {
    let active = true;
    void client.getAvailability().then((availability) => {
      if (!active) return;
      latestOnDeviceAvailability.value = availability;
      setOnDeviceAvailability(availability);
    });
    return () => {
      active = false;
    };
  }, [client, latestOnDeviceAvailability]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const wasInactive = appState.current !== 'active';
      appState.current = next;
      if (wasInactive && next === 'active') reevaluateLocalDay();
    });
    return () => subscription?.remove();
  }, [reevaluateLocalDay]);

  const approvedTriggerInFlight = useRef<{
    input: RecommendationApplicationInput;
    promise: Promise<boolean>;
  } | null>(null);
  const trailingApprovedInput = useRef<RecommendationApplicationInput | null>(null);
  const trailingApprovedPromise = useRef<Promise<boolean> | null>(null);
  const foregroundEvaluationRequested = useRef(false);
  const lastExpiryAttempt = useRef<string | null>(null);
  // A confirmed re-ask changes the answers the approved triggers read. Evaluating them while
  // it runs would see its own new day type as a change and start a second, unreserved
  // generation, so evaluation waits for it and then reads the persisted result.
  const reaskInFlight = useRef<Promise<unknown> | null>(null);
  const evaluateApprovedTriggersOnce = useCallback(async (
    generationInput: RecommendationApplicationInput,
  ): Promise<boolean> => {
    const pendingReask = reaskInFlight.current;
    if (pendingReask) await pendingReask;
    const liveState = controller.getSnapshot();
    if (liveState.status !== 'ready') return false;
    const current = approvedSignals(generationInput);
    const persistedSnapshot = liveState.snapshot;
    const previous: RecommendationSignals | null = persistedSnapshot
      ? {
          weatherSnapshotId: persistedSnapshot.weatherSnapshotId,
          locationKey: persistedSnapshot.locationKey,
          clothingPreference: persistedSnapshot.clothingPreference,
          dressStyle: persistedSnapshot.dressStyle,
          styleAesthetics: persistedSnapshot.styleAesthetics,
          catalogVersion: persistedSnapshot.catalogVersion,
          localDayKey: persistedSnapshot.localDayKey,
        }
      : null;

    // The morning question normally holds automatic generation over the last valid look.
    // A persistent aesthetic edit made inside that sheet is already a profile-change
    // trigger, so it may refresh that look while the day's formality stays unanswered.
    if (morningChoicePending || eveningChoicePending) {
      if (previous && JSON.stringify(previous.styleAesthetics ?? []) !==
          JSON.stringify(current.styleAesthetics ?? [])) {
        await controller.refresh('dress-style-changed', generationInput);
        return true;
      }
      return false;
    }

    const trigger = recommendationRefreshTrigger(previous, current);

    if (trigger) {
      foregroundEvaluationRequested.current = false;
      await controller.refresh(trigger, generationInput);
      return true;
    }
    const coverageEnd = persistedSnapshot?.coverageEnd;
    if (coverageEnd && expiredCoverageNeedsSelection(persistedSnapshot, generationInput.now,
      foregroundEvaluationRequested.current, lastExpiryAttempt.current)) {
      foregroundEvaluationRequested.current = false;
      lastExpiryAttempt.current = coverageEnd;
      await controller.refresh('explicit', generationInput);
      return true;
    }
    foregroundEvaluationRequested.current = false;
    controller.updatePoolAvailability(generationInput);
    return false;
  }, [controller, eveningChoicePending, morningChoicePending]);

  const evaluateApprovedTriggersForInput = useCallback(function evaluateApprovedTriggersForInput(
    generationInput: RecommendationApplicationInput,
  ): Promise<boolean> {
    const inFlight = approvedTriggerInFlight.current;
    if (inFlight) {
      // The weather/forecast hour may change `now` without changing an approved trigger.
      if (!recommendationRefreshTrigger(
        approvedSignals(inFlight.input), approvedSignals(generationInput),
      )) return inFlight.promise;
      if (trailingApprovedPromise.current) {
        trailingApprovedInput.current = generationInput;
        return trailingApprovedPromise.current;
      }

      // Keep only the latest changed input. When the first request settles, evaluate it
      // against the controller's live persisted state, not the state from this render.
      trailingApprovedInput.current = generationInput;
      const runLatest = () => {
        const latest = trailingApprovedInput.current;
        trailingApprovedInput.current = null;
        trailingApprovedPromise.current = null;
        if (!latest || !recommendationRefreshTrigger(
          approvedSignals(inFlight.input), approvedSignals(latest),
        )) return inFlight.promise;
        return evaluateApprovedTriggersForInput(latest);
      };
      const trailing = inFlight.promise.then(runLatest, runLatest);
      trailingApprovedPromise.current = trailing;
      return trailing;
    }
    const evaluation = evaluateApprovedTriggersOnce(generationInput);
    approvedTriggerInFlight.current = { input: generationInput, promise: evaluation };
    const clear = () => {
      if (approvedTriggerInFlight.current?.promise === evaluation) {
        approvedTriggerInFlight.current = null;
      }
    };
    void evaluation.then(clear, clear);
    return evaluation;
  }, [evaluateApprovedTriggersOnce]);

  useEffect(() => {
    if (state.status !== 'ready' || !input) return;
    void evaluateApprovedTriggersForInput(input);
  }, [evaluateApprovedTriggersForInput, input, state.status]);

  // The generation input as of this moment, re-read from the live weather and profile rather
  // than from the render that bound the handler. `null` when there is nothing to compose for.
  const currentInput = useCallback(() => {
    const currentDay = deviceLocalDay();
    setLocalDay((previous) => previous.key === currentDay.key ? previous : currentDay);
    const currentWeather = weatherApplication.getSnapshot?.() ?? weatherState;
    const clothingPreference = profileState.status === 'ready'
      ? profileState.profile.clothingPreference
      : null;
    if (
      currentWeather.status !== 'ready' ||
      !currentWeather.snapshot ||
      profileState.status !== 'ready' ||
      !clothingPreference || !choiceReady || !departureReady
    ) return null;
    return {
      snapshot: currentWeather.snapshot,
      now: now(),
      ...(activeDeparture ? { departureAt: activeDeparture.departureAt } : {}),
      clothingPreference,
      dressStyle: resolvedDressStyle,
      styleAesthetics: resolvedStyles,
      dayVariant: currentDay.variant,
      dayKind: currentDay.kind,
      localDayKey: currentDay.key,
      locale: language,
    };
  }, [activeDeparture, choiceReady, departureReady, language, profileState, resolvedDressStyle,
    resolvedStyles, weatherApplication, weatherState]);

  // Tomorrow's preview is chosen only after a foreground open of Today has asked for it, and the
  // ask belongs to the dressing day it was made in: an open in the afternoon does not carry into
  // the evening, whose own first foreground open of Today must ask again.
  const [previewWantedKey, setPreviewWantedKey] = useState<string | null>(null);
  const [previewClock, setPreviewClock] = useState(Date.now);
  const previewWanted = previewWantedKey === localDay.key;
  const evaluateApprovedTriggers = useCallback(async (foreground = false) => {
    if (foreground) {
      setPreviewClock(Date.now());
      setPreviewWantedKey(deviceLocalDay().key);
    }
    const generationInput = currentInput();
    if (!generationInput) return;
    if (foreground) foregroundEvaluationRequested.current = true;
    let triggered = await evaluateApprovedTriggersForInput(generationInput);
    if (foreground && foregroundEvaluationRequested.current) {
      triggered = await evaluateApprovedTriggersForInput(currentInput() ?? generationInput) || triggered;
    }
    if (!triggered) controller.clearLastFailure();
  }, [controller, currentInput, evaluateApprovedTriggersForInput]);

  const settingsStyles = profileState.status === 'ready' ? profileState.profile.styleAesthetics ?? null : null;
  const chooseFormality = useCallback(async (
    key: string, formality: DressStyle, source: DressingDayChoiceSource,
    styleAesthetics?: readonly StyleAesthetic[],
  ) => {
    const repository = await loadChoiceRepository();
    const choice = await repository.upsert(localProfileId, key, formality, source, styleAesthetics);
    if (key !== localDay.key) return;
    setDayChoiceState({ profileId: localProfileId, key, status: 'row', choice });
    // Both answers ride one generation, with the styles the next render resolves too, so
    // the approved triggers see nothing new and join this request instead of adding one.
    const generationInput = currentInput();
    if (generationInput) void controller.refresh('dress-style-changed', {
      ...generationInput, dressStyle: formality,
      styleAesthetics: resolvedStyleAesthetics(choice, settingsStyles ?? []),
    });
  }, [controller, currentInput, localDay.key, localProfileId, settingsStyles]);

  // The evening preview of tomorrow: one selection per dressing day, through the same chain, once
  // today's outfit has settled, and only when the forecast covers tomorrow's whole window.
  const placeTimeZone = input?.snapshot.timeZone;
  const tomorrowMorning = useMemo(() => placeTimeZone ? nextMorningAfterEvening(
    localDay.key, placeTimeZone, new Date(previewClock).toISOString(),
  ) : null, [placeTimeZone, localDay.key, previewClock]);
  const tomorrowKey = tomorrowMorning ? localDayKey(tomorrowMorning) : null;
  const previewController = useMemo(() => new TomorrowPreviewController(localProfileId,
    { store: previewStore, client, loadRecentWorn, compose: composePreview }),
  [client, loadRecentWorn, localProfileId, previewStore]);
  const preview = useSyncExternalStore(previewController.subscribe, previewController.getSnapshot,
    previewController.getSnapshot);
  useEffect(() => {
    if (tomorrowKey) void previewController.load(tomorrowKey);
  }, [previewController, tomorrowKey]);
  const settledRecommendation = state.status === 'ready' && !state.isRefreshing &&
    state.snapshot?.recommendation.status === 'recommended' ? state.snapshot.recommendation : null;
  const tomorrowStyles = useMemo(() => orderStyleAesthetics(settingsStyles ?? []), [settingsStyles]);
  useEffect(() => {
    if (!previewWanted || !tomorrowMorning || !tomorrowKey || !input || eveningChoicePending ||
        !settledRecommendation) return;
    const departureAt = previewDepartureAt(localDay.key, input.snapshot.timeZone,
      new Date(previewClock).toISOString());
    if (!departureAt || !forecastCoversWindow(input.snapshot, departureAt)) return;
    void previewController.ensure({
      snapshot: input.snapshot,
      now: now(),
      departureAt,
      clothingPreference: input.clothingPreference,
      dressStyle: profileDefault,
      styleAesthetics: tomorrowStyles,
      dayVariant: localDayVariant(tomorrowMorning),
      dayKind: localDayKind(tomorrowMorning),
      localDayKey: tomorrowKey,
      locale: language,
      // What the morning will exclude too, unless today's outfit changes before then.
      excludedOptionIds: settledRecommendation.outfits.map(({ optionId }) => optionId),
    });
  }, [eveningChoicePending, input, language, localDay.key, previewClock, previewController, previewWanted,
    profileDefault, settledRecommendation, tomorrowKey, tomorrowMorning, tomorrowStyles]);
  // Shown only while it still answers tomorrow's question: the same place, gender, dress style
  // and styles. Otherwise it simply does not appear; the day's one selection is not spent again.
  const tomorrowPreview = preview && tomorrowKey && input && previewAnswersQuestion(preview, {
    localDayKey: tomorrowKey,
    locationKey: input.snapshot.locationKey,
    clothingPreference: input.clothingPreference,
    dressStyle: profileDefault,
    styleAesthetics: tomorrowStyles,
  }) ? preview : null;

  // A new object after every recorded day, so whoever reads History through it (the Closet's
  // worn counts) reads it again instead of keeping the answer from before the write.
  const [historyRevision, setHistoryRevision] = useState(0);
  const outfitHistory = useMemo(() => ({
    revision: historyRevision,
    list: async () => (await loadHistoryRepository()).list(localProfileId),
    get: async (dayKey: string) => (await loadHistoryRepository()).get(localProfileId, dayKey),
    log: async (dayKey: string, outfit: WornOutfit, pieceColors: WornPieceColors | null) => {
      const record = await (await loadHistoryRepository()).log(localProfileId, dayKey, outfit, { kind: 'keep' }, pieceColors);
      setHistoryRevision((revision) => revision + 1);
      return record;
    },
  }), [historyRevision, localProfileId]);

  const value = useMemo<RecommendationApplicationValue>(() => ({
    state,
    getSnapshot: controller.getSnapshot,
    evaluateApprovedTriggers,
    onDeviceAvailability,
    skipWait: () => controller.skipWait(),
    dressingDayKey: localDay.key,
    tomorrowPreview,
    dressingDayChoiceReady: choiceReady,
    dressingDayChoiceFailed: choiceFailed,
    morningChoicePending,
    eveningChoicePending,
    activeDeparture,
    readDeparture: async (dayKey) => (await loadDepartureRepository()).get(localProfileId, dayKey),
    setDeparture: async (departureAt, timeZone) => {
      const key = departureDressingDayKey(departureAt);
      if (!key) throw new Error('Invalid departure time or time zone.');
      const value = await (await loadDepartureRepository()).upsert(
        localProfileId, key, departureAt, timeZone);
      if (key === localDay.key) {
        setDepartureState({ key, value });
        const generationInput = currentInput();
        if (generationInput && !morningChoicePending && !eveningChoicePending) {
          await controller.refresh('explicit', { ...generationInput, departureAt });
        }
      }
      return value;
    },
    clearDeparture: async (dayKey) => {
      const cleared = await (await loadDepartureRepository()).clear(localProfileId, dayKey);
      if (dayKey === localDay.key) {
        setDepartureState({ key: dayKey, value: null });
        const generationInput = currentInput();
        if (generationInput && !morningChoicePending && !eveningChoicePending) {
          const { departureAt: _departureAt, ...nowInput } = generationInput;
          await controller.refresh('explicit', { ...nowInput, now: now() });
        }
      }
      return cleared;
    },
    resolvedDressStyle,
    resolvedStyleAesthetics: resolvedStyles,
    chooseFormality,
    outfitHistory,
    reask: async ({ formality, departureAt, timeZone }) => {
      const result = await reaskForDressingDay({ formality, departureAt, timeZone }, {
        localProfileId,
        currentDayKey: localDay.key,
        resolvedDressStyle,
        hasCurrentDayChoice: currentDayChoice?.status === 'row',
        choiceRepository: await loadChoiceRepository(),
        departureRepository: await loadDepartureRepository(),
        currentInput,
        refresh: (input) => controller.refresh('regenerate', input),
        now,
      });
      const settled = result.settled.finally(() => {
        if (reaskInFlight.current === settled) reaskInFlight.current = null;
      });
      reaskInFlight.current = settled;
      if (result.choice) {
        setDayChoiceState({ profileId: localProfileId, key: localDay.key,
          status: 'row', choice: result.choice });
      }
      setDepartureState({ key: localDay.key, value: result.departure });
      return { settled };
    },
    refresh: () => {
      const generationInput = currentInput();
      return generationInput
        ? controller.refresh('explicit', generationInput)
        : Promise.resolve(null);
    },
    regenerate: async () => {
      const generationInput = currentInput();
      if (!generationInput) return null;
      return controller.refresh('regenerate', generationInput);
    },
    reevaluateLocalDay,
  }), [
    controller,
    currentInput,
    localProfileId,
    evaluateApprovedTriggers,
    chooseFormality,
    choiceReady,
    choiceFailed,
    currentDayChoice,
    localDay.key,
    morningChoicePending,
    eveningChoicePending,
    activeDeparture,
    onDeviceAvailability,
    reevaluateLocalDay,
    resolvedDressStyle,
    resolvedStyles,
    outfitHistory,
    state,
    tomorrowPreview,
  ]);

  return (
    <RecommendationApplicationContext value={value}>
      {children}
    </RecommendationApplicationContext>
  );
}
