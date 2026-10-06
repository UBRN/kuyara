import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';
import { AppState } from 'react-native';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  RecommendationApplicationController,
  localDayKey,
  localDayKind,
  localDayVariant,
} from '@/features/recommendation/application/recommendation-application-controller';
import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
} from '@/features/recommendation/application/recommendation-application-context';
import { usePerformanceTelemetry } from '@/features/analytics/application/use-performance-telemetry';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { defaultDressStyle, isMorningSheetEnabled, orderStyleAesthetics } from '@/features/profile/domain/profile';
import { ExpoFileAiRegenerationBudget } from '@/features/recommendation/data/expo-file-ai-regeneration-budget';
import { LocalRecommendationRepository } from '@/features/recommendation/data/recommendation-repository';
import { SqliteRecommendationLocalDataSource } from '@/features/recommendation/data/sqlite-recommendation-local-data-source';
import { SqliteDressingDayChoiceRepository } from '@/features/recommendation/data/sqlite-dressing-day-choice-repository';
import { SqliteDressingDayDepartureRepository } from '@/features/recommendation/data/sqlite-dressing-day-departure-repository';
import {
  departureDressingDayKey,
  departureIsAhead,
  type DressingDayDeparture,
} from '@/features/recommendation/domain/dressing-day-departure';
import { memberAccessToken } from '@/features/account/application/account-membership';
import { followWritesWhileAccountsOpen } from '@/features/account/application/account-pulled-writes';
import {
  createApprovedTriggerEvaluation,
  firstOutfitAwaitsWeatherRefresh,
} from '@/features/recommendation/application/approved-trigger-evaluation';
import { refreshAfterPull } from '@/features/recommendation/application/pull-refresh';
import { createOutfitHistoryAccess } from '@/features/recommendation/application/outfit-history-access';
import { createMemberReask } from '@/features/recommendation/application/member-reask';
import { createDressingDayRollover, dayInForce } from '@/features/recommendation/application/dressing-day-rollover';
import {
  answeredChoice,
  currentDayChoiceRead,
  dayChoiceRead,
  failedDayChoiceRead,
  writtenDayChoice,
  type DayChoiceRead,
} from '@/features/recommendation/application/dressing-day-choice-read';
import { reaskForDressingDay } from '@/features/recommendation/application/reask-for-dressing-day';
import {
  TomorrowPreviewController,
  type TomorrowPreviewInput,
  type TomorrowPreviewStore,
} from '@/features/recommendation/application/tomorrow-preview';
import {
  shownTomorrowPreview,
  tomorrowOfEvening,
  tomorrowPreviewRequest,
} from '@/features/recommendation/application/tomorrow-preview-request';
import {
  aiRequestFromContext,
  createRecommendationContextWithPool,
} from '@/features/recommendation/application/recommendation-context';
import { ExpoFileRecommendationPreviewDataSource } from '@/features/recommendation/data/expo-file-recommendation-preview-data-source';
import { isDayQuestionOpen } from '@/features/recommendation/domain/local-day';
import { resolvedFormality, resolvedStyleAesthetics, type DressingDayChoice, type DressingDayChoiceSource } from '@/features/recommendation/domain/dressing-day-choice';
import { SqliteOutfitHistoryRepository } from '@/features/recommendation/data/sqlite-outfit-history-repository';
import { ExpoHistoryPhotoStorage } from '@/features/recommendation/data/expo-history-photo-storage';
import { OnDeviceAiClient } from '@/features/recommendation/data/on-device-ai-client';
import { RoutedAiClient } from '@/features/recommendation/data/routed-ai-client';
import { WorkerAiClient } from '@/features/recommendation/data/worker-ai-client';
import { WorkerAiClientError } from '@/features/recommendation/domain/worker-ai-client-error';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';
import { onDeviceAiModule } from '@/features/recommendation/data/on-device-ai-module';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { isEveningDressingDayKey } from '@/features/weather/domain/wardrobe-day';
import { resolveAppWorkerBaseUrl } from '@/config/app-worker-base-url';
import { WorkerBaseUrlConfigurationError } from '@/config/worker-base-url';
import { openMigratedDatabase } from '@/infrastructure/sqlite/open-migrated-database';
import { newUuid } from '@/infrastructure/new-uuid';
import { systemNow as now } from '@/infrastructure/system-clock';
import { useLocalization } from '@/localization/use-messages';

type LocalDay = ReturnType<typeof deviceLocalDay>;

function deviceLocalDay() {
  const date = new Date();
  return {
    key: localDayKey(date),
    variant: localDayVariant(date),
    kind: localDayKind(date),
  };
}

function createWorkerClient(memberAccessToken: () => Promise<string | null>): Pick<WorkerAiClient, 'recommend'> {
  try {
    return new WorkerAiClient({
      baseUrl: resolveAppWorkerBaseUrl(),
      memberAccessToken,
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
// it is null on Android and on any build without the native surface, and the routed client
// then reads the on-device tier as unavailable and goes straight to the Worker with the
// whole budget.
function createRecommendationClient(memberAccessToken: () => Promise<string | null>): RoutedAiClient {
  return new RoutedAiClient({
    onDevice: new OnDeviceAiClient({ module: onDeviceAiModule }),
    worker: createWorkerClient(memberAccessToken),
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

export function RecommendationApplicationProvider({
  children,
  localProfileId,
}: PropsWithChildren<{ localProfileId: string }>) {
  // The clock is read on every render below (`activeDeparture`): a departure that has passed
  // stops shaping the day at the next render. React Compiler would memoize that read, and
  // reading it from a clock state instead is a timing change, so the provider opts out.
  'use no memo';
  const { state: profileState } = useProfileApplication();
  const { language } = useLocalization();
  const weatherApplication = useWeatherApplication();
  const weatherState = weatherApplication.state;
  const { analytics } = useProductAnalytics();
  const telemetry = usePerformanceTelemetry();
  const [localDay, setLocalDay] = useState(deviceLocalDay);
  const [dayChoiceState, setDayChoiceState] = useState<DayChoiceRead | null>(null);
  const [choiceReadAttempt, setChoiceReadAttempt] = useState(0);
  const [departureState, setDepartureState] = useState<{
    key: string; value: DressingDayDeparture | null;
  } | null>(null);
  const dayRollover = useMemo(() => createDressingDayRollover({
    initialAppState: AppState.currentState,
    readDay: deviceLocalDay,
    adoptDay: (day) => setLocalDay((current) => dayInForce(current, day)),
    retryChoiceRead: () => setChoiceReadAttempt((attempt) => attempt + 1),
  }), []);
  useEffect(() => {
    let live = true;
    void loadDepartureRepository().then((repository) => repository.get(localProfileId, localDay.key))
      .then((value) => { if (live) setDepartureState({ key: localDay.key, value }); })
      .catch(() => { if (live) setDepartureState({ key: localDay.key, value: null }); });
    return () => { live = false; };
  }, [localDay.key, localProfileId]);
  const departureReady = departureState?.key === localDay.key;
  const activeDeparture = departureState?.key === localDay.key &&
    // eslint-disable-next-line react-hooks/purity -- read on every render on purpose, see 'use no memo'
    departureState.value && departureIsAhead(departureState.value, Date.now())
    ? departureState.value : null;
  useEffect(() => {
    let live = true;
    dayRollover.choiceReadFailed(false);
    void loadChoiceRepository().then((repository) => repository.get(localProfileId, localDay.key))
      .then((choice) => {
        if (!live) return;
        dayRollover.choiceReadFailed(false);
        setDayChoiceState(dayChoiceRead(localProfileId, localDay.key, choice));
      })
      .catch(() => {
        if (!live) return;
        dayRollover.choiceReadFailed(true);
        setDayChoiceState((previous) => failedDayChoiceRead(previous, localProfileId, localDay.key));
      });
    return () => { live = false; };
  }, [choiceReadAttempt, dayRollover, localDay.key, localProfileId]);
  const currentDayChoice = currentDayChoiceRead(dayChoiceState, localProfileId, localDay.key);
  const choiceReady = currentDayChoice?.status === 'row' || currentDayChoice?.status === 'none';
  const choiceFailed = currentDayChoice?.status === 'unknown';
  const dayChoice = answeredChoice(currentDayChoice);
  const profileDefault = profileState.status === 'ready'
    ? profileState.profile.dressStyle ?? defaultDressStyle : defaultDressStyle;
  const resolvedDressStyle = resolvedFormality(dayChoice, profileDefault);
  const settingsStyles = profileState.status === 'ready' ? profileState.profile.styleAesthetics ?? null : null;
  const resolvedStyles = resolvedStyleAesthetics(dayChoice, settingsStyles ?? []);
  // The day setup finished on is answered by setup (a choice row written as it completes, or
  // the day itself for a profile an earlier build set up), so neither question is asked then. The one Settings switch turns off both questions; an
  // unasked day resolves to the profile dress style, as a dismissed question does.
  const dayQuestionOpen = currentDayChoice?.status === 'none' && profileState.status === 'ready' &&
    isDayQuestionOpen({
      morningSheetEnabled: isMorningSheetEnabled(profileState.profile),
      profileCreatedAt: profileState.profile.createdAt,
      dressingDayKey: localDay.key,
    });
  const morningChoicePending = dayQuestionOpen && !isEveningDressingDayKey(localDay.key);
  const eveningChoicePending = dayQuestionOpen && isEveningDressingDayKey(localDay.key);
  const reevaluateLocalDay = dayRollover.reevaluate;
  // Re-asks reserve a daily slot before the controller enters the AI chain; a member's ten apply
  // only to a re-ask whose token was read, and its request carries that token.
  const budget = useMemo(() => new ExpoFileAiRegenerationBudget(), []);
  const memberReask = useMemo(() => createMemberReask({
    readToken: memberAccessToken,
    reserve: (dateKey, dailyLimit) => budget.reserve(dateKey, dailyLimit),
    release: (dateKey) => budget.release(dateKey),
  }), [budget]);
  const client = useMemo(() => createRecommendationClient(memberReask.token), [memberReask]);
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
  const previewStore = useMemo(() => createPreviewStore(), []);
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
      reserveAiReask: (dayKey) => memberReask.reserve(dayKey),
      releaseAiReask: (dayKey) => memberReask.release(dayKey),
    }),
    [analytics, client, memberReask, latestOnDeviceAvailability, loadRecentWorn, localProfileId, previewStore,
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
    const subscription = AppState.addEventListener('change', dayRollover.appStateChanged);
    return () => subscription?.remove();
  }, [dayRollover]);

  const approvedTriggers = useMemo(() => createApprovedTriggerEvaluation(), []);
  const awaitsWeatherRefresh = useCallback((dayKey: string) => firstOutfitAwaitsWeatherRefresh(
    weatherApplication.getSnapshot?.() ?? weatherState, controller.getSnapshot(), dayKey,
  ), [controller, weatherApplication, weatherState]);
  const approvedTriggerReading = useMemo(() => ({
    recommendation: controller,
    dayQuestionPending: morningChoicePending || eveningChoicePending,
    awaitsWeatherRefresh,
  }), [awaitsWeatherRefresh, controller, eveningChoicePending, morningChoicePending]);

  useEffect(() => {
    if (state.status !== 'ready' || !input) return;
    void approvedTriggers.followRender(input, approvedTriggerReading);
  }, [approvedTriggerReading, approvedTriggers, input, state.status]);

  // The generation input as of this moment, re-read from the live weather and profile rather
  // than from the render that bound the handler. `null` when there is nothing to compose for,
  // and when the dressing day has flipped since that render: its answer, departure and pending
  // question are not read yet, so the render that reads them generates instead.
  // `answered` names a day whose answer the caller has just written itself: a re-ask confirmed
  // after the 04:00 or 18:00 flip, before any render read the new key, regenerates for that key
  // with the row it wrote.
  const currentInput = useCallback((
    answered?: Readonly<{ day: LocalDay; choice: DressingDayChoice | null }>,
  ) => {
    const currentDay = answered?.day ?? deviceLocalDay();
    const renderedDay = currentDay.key === localDay.key;
    if (!answered) {
      setLocalDay((previous) => dayInForce(previous, currentDay));
      if (!renderedDay) return null;
    }
    const currentWeather = weatherApplication.getSnapshot?.() ?? weatherState;
    const clothingPreference = profileState.status === 'ready'
      ? profileState.profile.clothingPreference
      : null;
    if (
      currentWeather.status !== 'ready' ||
      !currentWeather.snapshot ||
      profileState.status !== 'ready' ||
      !clothingPreference || (renderedDay && (!choiceReady || !departureReady))
    ) return null;
    const answer = answered?.choice ?? null;
    return {
      snapshot: currentWeather.snapshot,
      now: now(),
      ...(renderedDay && activeDeparture ? { departureAt: activeDeparture.departureAt } : {}),
      clothingPreference,
      dressStyle: renderedDay ? resolvedDressStyle : resolvedFormality(answer, profileDefault),
      styleAesthetics: renderedDay ? resolvedStyles : resolvedStyleAesthetics(answer, settingsStyles ?? []),
      dayVariant: currentDay.variant,
      dayKind: currentDay.kind,
      localDayKey: currentDay.key,
      locale: language,
    };
  }, [activeDeparture, choiceReady, departureReady, language, localDay.key, profileDefault, profileState,
    resolvedDressStyle, resolvedStyles, settingsStyles, weatherApplication, weatherState]);

  // Tomorrow's preview is chosen only after a foreground open of Today has asked for it, and the
  // ask belongs to the dressing day it was made in: an open in the afternoon does not carry into
  // the evening, whose own first foreground open of Today must ask again.
  const [previewWantedKey, setPreviewWantedKey] = useState<string | null>(null);
  const previewWanted = previewWantedKey === localDay.key;
  const evaluateApprovedTriggers = useCallback(async (foreground = false) => {
    if (foreground) {
      setPreviewWantedKey(deviceLocalDay().key);
    }
    await approvedTriggers.evaluate(currentInput, approvedTriggerReading, foreground);
  }, [approvedTriggerReading, approvedTriggers, currentInput]);

  const chooseFormality = useCallback(async (
    key: string, formality: DressStyle, source: DressingDayChoiceSource,
    styleAesthetics?: readonly StyleAesthetic[],
  ) => {
    const repository = await loadChoiceRepository();
    const choice = await repository.upsert(localProfileId, key, formality, source, styleAesthetics);
    if (key !== localDay.key) return;
    setDayChoiceState(writtenDayChoice(localProfileId, key, choice));
    // Both answers ride one generation, with the styles the next render resolves too, so
    // the approved triggers see nothing new and join this request instead of adding one.
    const generationInput = currentInput();
    if (generationInput && !awaitsWeatherRefresh(key)) void controller.refresh('dress-style-changed', {
      ...generationInput, dressStyle: formality,
      styleAesthetics: resolvedStyleAesthetics(choice, settingsStyles ?? []),
    });
  }, [awaitsWeatherRefresh, controller, currentInput, localDay.key, localProfileId, settingsStyles]);

  const answerSetupDay = useCallback(async (formality: DressStyle) => {
    const key = deviceLocalDay().key;
    const choice = await (await loadChoiceRepository()).upsert(localProfileId, key, formality, 'morning');
    if (key === localDay.key) setDayChoiceState(writtenDayChoice(localProfileId, key, choice));
  }, [localDay.key, localProfileId]);

  // The evening preview of tomorrow: one selection per dressing day, through the same chain, once
  // today's outfit has settled, and only when the forecast covers tomorrow's whole window.
  const tomorrowKey = tomorrowOfEvening(localDay.key, input)?.key ?? null;
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
  const tomorrowQuestion = useMemo(() => ({
    dressStyle: profileDefault,
    styleAesthetics: orderStyleAesthetics(settingsStyles ?? []),
  }), [profileDefault, settingsStyles]);
  useEffect(() => {
    const request = tomorrowPreviewRequest({
      dressingDayKey: localDay.key,
      wanted: previewWanted,
      eveningChoicePending,
      today: input,
      // What the morning will exclude too, unless today's outfit changes before then.
      settledOutfits: settledRecommendation?.outfits ?? null,
      question: tomorrowQuestion,
      locale: language,
      now,
    });
    if (request) void previewController.ensure(request);
  }, [eveningChoicePending, input, language, localDay.key, previewController, previewWanted,
    settledRecommendation, tomorrowQuestion]);
  const tomorrowPreview = shownTomorrowPreview(preview, localDay.key, input, tomorrowQuestion);

  const [historyRevision, setHistoryRevision] = useState(0);
  const historyAccess = useMemo(() => createOutfitHistoryAccess({
    localProfileId,
    loadRepository: loadHistoryRepository,
    changed: () => setHistoryRevision((revision) => revision + 1),
  }), [localProfileId]);
  // A new object after every recorded look, so whoever reads History through it (the Closet's
  // worn counts) reads it again instead of keeping the answer from before the write.
  const outfitHistory = useMemo(() => ({
    revision: historyRevision,
    list: historyAccess.list,
    day: historyAccess.day,
    log: historyAccess.log,
  }), [historyAccess, historyRevision]);
  // Looks a sync pull lands or deletes read again, and a deleted look's photo is removed.
  useEffect(() => followWritesWhileAccountsOpen(historyAccess.writeWatch()), [historyAccess]);

  const value = useMemo<RecommendationApplicationValue>(() => ({
    state,
    getSnapshot: controller.getSnapshot,
    evaluateApprovedTriggers,
    refreshAfterPull: () => refreshAfterPull({
      getSnapshot: controller.getSnapshot,
      refresh: async () => {
        const generationInput = currentInput();
        if (generationInput) await controller.refresh('explicit', generationInput);
      },
      evaluateApprovedTriggers: () => evaluateApprovedTriggers(),
    }),
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
    profileDressStyle: profileDefault,
    resolvedStyleAesthetics: resolvedStyles,
    chooseFormality,
    answerSetupDay,
    outfitHistory,
    reask: async ({ formality, departureAt, timeZone }) => {
      // Read at the confirmation: Today may have stayed in front across 04:00 or 18:00, and the
      // re-ask then answers the key now in force.
      const day = deviceLocalDay();
      const result = await reaskForDressingDay({ formality, departureAt, timeZone }, {
        localProfileId,
        currentDayKey: day.key,
        resolvedDressStyle,
        hasCurrentDayChoice: day.key === localDay.key && currentDayChoice?.status === 'row',
        choiceRepository: await loadChoiceRepository(),
        departureRepository: await loadDepartureRepository(),
        currentInput: (choice) => currentInput({ day, choice }),
        refresh: (input) => controller.refresh('regenerate', input),
        now,
      });
      const settled = approvedTriggers.trackReask(result.settled);
      if (result.choice) {
        setDayChoiceState(writtenDayChoice(localProfileId, day.key, result.choice));
      }
      setDepartureState({ key: day.key, value: result.departure });
      setLocalDay((previous) => dayInForce(previous, day));
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
    approvedTriggers,
    controller,
    currentInput,
    localProfileId,
    evaluateApprovedTriggers,
    chooseFormality,
    answerSetupDay,
    choiceReady,
    choiceFailed,
    currentDayChoice,
    localDay.key,
    morningChoicePending,
    eveningChoicePending,
    activeDeparture,
    onDeviceAvailability,
    reevaluateLocalDay,
    profileDefault,
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
