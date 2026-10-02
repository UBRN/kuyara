import type {
  OutfitCompositionReasonCode,
  OutfitSlot,
} from '@/features/recommendation/domain/outfit-composition';
import type { SwappableSlot } from '@/features/recommendation/domain/manual-mix';
import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import type { ClothingRequirementReasonCode } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { WeatherAlertOfferReason } from '@/features/notifications/domain/weather-alert-offer';
import type {
  WeatherConditionCode as LiveWeatherConditionCode,
} from '@/features/weather/domain/weather';
import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { RestoreCounts } from '@/features/account/application/account-screens';
import {
  catalogMessages,
  type CatalogMessages,
} from '@/features/catalog/localization/catalog-messages';
import {
  recommendationMessages,
  type RecommendationMessages,
} from '@/features/recommendation/localization/recommendation-messages';

export type TodayRequirementName =
  | 'thermal'
  | 'breathability'
  | 'arm_coverage'
  | 'leg_coverage'
  | 'body_water_protection'
  | 'footwear_water_protection'
  | 'wind_protection'
  | 'traction';

/**
 * The day-insight line's states, one key per whole sentence. A sky that holds all day takes
 * its temperature modifier by selecting a different key rather than by gaining a clause, and
 * every sentence that names the day it describes has an evening twin for the dressing day
 * that begins at 18:00 and runs past midnight. The evening word is the one the person reads
 * while the sun may still be up, so no sentence says night where the sky says day. Nothing
 * here is ever assembled from translated fragments.
 */
type DayInsightSky = `${'clear' | 'cloudy' | 'foggy'}_${'day' | 'evening'}`;

export type TodayDayInsightKey =
  | DayInsightSky
  | `${DayInsightSky}_${'hot' | 'veryHot' | 'chilly' | 'freezing'}`
  | `${'rain' | 'snow'}_${'day' | 'evening'}`
  | 'windy'
  | 'veryWindy';

type DayTypeMessages = Readonly<Record<'casual' | 'smart' | 'formal', string>>;

export type TodayMessages = Readonly<{
  /**
   * Today's title as one whole template per language. `{temperature}` and `{condition}` are
   * values and `{symbol}` is where the animated condition symbol stands; the line may wrap
   * only after the separator, so the three values stay together.
   */
  titleTemplate: string;
  dailyStyle: Readonly<{
    question: string;
    /** The 18:00 evening sheet's question (N20). */
    questionEvening: string;
    casual: string;
    smart: string;
    formal: string;
    /** The line under the dimmed outfit while a day-type change regenerates it. */
    updating: DayTypeMessages;
    /** The one caption on the day onboarding finishes, over the preselected answer. */
    firstDayNote: string;
    close: string;
    saveError: string;
    /** M18 step 2: the day's styles, for this dressing day only. */
    stylesQuestion: string;
    stylesNote: string;
  }>;
  greetingNamed: (name: string) => string;
  /** The greeting on the first dressing day, the day the profile was set up. */
  greetingFirstNamed: (name: string) => string;
  // ADR 0034 section 4: the two AI modes have badges, the words final, each beside its own
  // symbol. The on-device badge carries the Apple Intelligence word mark inside a referential
  // phrase; the spoken label makes kuyara the subject the badge alone cannot show.
  generationModeOnDeviceAi: string;
  generationModeAiAssisted: string;
  generationModeOnDeviceAiAccessibilityLabel: string;
  generationModeAiAssistedAccessibilityLabel: string;
  // The recommendation detail says in one plain sentence where the outfit was chosen, in
  // all three modes. It names no provider, no model and no failure.
  generationSourceOnDeviceAi: string;
  generationSourceAiAssisted: string;
  generationSourceDeterministic: string;
  // "Ask the stylist again" (O3, O4). The control, its sheet and its sentences name no
  // provider, no quota and no remaining count. Every sentence with a clock time is one whole
  // template per language, and Turkish never puts a case suffix on a clock time.
  askAgain: Readonly<{
    action: string;
    hint: string;
    whenQuestion: string;
    now: string;
    later: string;
    chooseNow: string;
    chooseAt: (time: string) => string;
    warning: (start: string, end: string) => string;
    warningOnDay: (day: string, start: string, end: string) => string;
  }>;
  // N18: the outfit's coverage window as one sentence under the board, and its in-flight twin.
  coverage: Readonly<{
    chosen: (start: string, end: string) => string;
    chosenOnDay: (day: string, start: string, end: string) => string;
    choosing: (start: string, end: string) => string;
    choosingOnDay: (day: string, start: string, end: string) => string;
  }>;
  // N15: the rest of the window needs protection the displayed outfit was not chosen for.
  drift: Readonly<{
    rain: (time: string) => string;
    snow: (time: string) => string;
    cold: (time: string) => string;
  }>;
  // N19: a later short cool spell is a finishing touch, one line beside the cardigan.
  coolSpell: (time: string) => string;
  otherOptionsHeading: string;
  // In the evening, the outfit chosen for the next dressing day, in one strip under today's.
  tomorrow: Readonly<{
    heading: string;
    // One line: the condition, then the day's low-to-high range.
    weather: (values: { condition: string; minimum: string; maximum: string }) => string;
    // The same range alone, where the condition stands beside it (the detail's weather recap).
    range: (values: { minimum: string; maximum: string }) => string;
    weatherAccessibilityLabel: (values: {
      condition: string; minimum: string; maximum: string; unitName: string;
    }) => string;
    stripAccessibilityLabel: (values: { outfit: string; weather: string }) => string;
    stripAccessibilityHint: string;
    recapAccessibilityLabel: (values: {
      condition: string; minimum: string; maximum: string; unitName: string;
      rainProbability: number; coverageCaption: string | null;
    }) => string;
  }>;
  piecesHeading: string;
  reasonsHeading: string;
  finishingTouchesHeading: string;
  finishingTouchesAccessibilityLabel: (items: readonly string[]) => string;
  finishingTouchesRowAccessibilityLabel: (
    parts: Readonly<{ item: string; slot: string }>,
  ) => string;
  ownershipOwnedAction: string;
  ownershipWantedAction: string;
  ownershipUntrackedLabel: string;
  /** O7: owned pieces of the same type, every one in another colour. */
  ownershipSimilarLabel: string;
  /** The user's own similar piece, named by its colour family. */
  ownershipYours: (color: string) => string;
  /** Under a board piece on detail, and in its spoken value: where the Closet already has it. */
  ownershipOnBoard: Readonly<Record<'owned' | 'similar' | 'wanted', string>>;
  /** Phase 7: the one line under the board before a change, naming tap and swipe. */
  boardHint: string;
  /** O6: the piece row opens the piece's Closet sheet. */
  editPieceAccessibilityHint: string;
  // Phase 7, manual mix (ADR 0026 section 6): the row control and its picker, the board's
  // focus chrome, and the changed outfit's title, note, reset and source sentence. Every
  // spoken or visible sentence is whole per language, never assembled from fragments.
  manualMix: Readonly<{
    change: string;
    /** One whole sentence per changeable slot, never a slot name inflected in place. */
    changeAccessibilityLabel: Readonly<Record<SwappableSlot, (piece: string) => string>>;
    changed: string;
    title: string;
    changedFrom: (archetype: string) => string;
    unusual: string;
    unusualAccessibilityLabel: string;
    reset: string;
    pickerFits: string;
    pickerOther: string;
    pickerOtherHint: string;
    pickerCurrent: string;
    counter: (position: number, total: number) => string;
    pieceValue: (values: { piece: string; position: number; total: number }) => string;
    /**
     * Phase 7b: one announcement after a tile or a swipe that makes the outfit unusual: the
     * new piece and its place, then the note, as whole sentences so neither cuts the other off.
     */
    stepUnusual: (values: { piece: string; position: number; total: number }) => string;
    /** Phase 7b: ends the enlargement from the strip's header. */
    done: string;
    /** Phase 7b: spoken on one strip tile after the hairline. */
    otherPieceHint: string;
    /** Phase 7b: spoken when VoiceOver's activate enlarges a piece and the strip opens below it. */
    stripShown: string;
    /** The source sentence after one changed piece, per generation mode; no AI words in deterministic. */
    sourceOne: Readonly<{ onDeviceAi: string; aiAssisted: string; deterministic: string }>;
    /** The same after two or more changed pieces. */
    sourceMany: Readonly<{ onDeviceAi: string; aiAssisted: string; deterministic: string }>;
  }>;
  /** The outfit detail's share button, and the name on the shared outfit card. */
  share: Readonly<{ action: string; brandName: string }>;
  // ADR 0038: "Wore this today" and its saved state, directly under the board.
  wornAction: string;
  wornToday: string;
  wornSaveError: string;
  wornReplaceTitle: string;
  wornReplaceBody: string;
  wornReplaceConfirm: string;
  wornReplaceCancel: string;
  slots: Readonly<Record<OutfitSlot, string>>;
  requirementNames: Readonly<Record<TodayRequirementName, string>>;
  requirementRow: (values: { requirement: string; garments: readonly string[] }) => string;
  requirementTradeoffRow: (values: { requirement: string; garments: readonly string[] }) => string;
  requirementReasons: Readonly<Record<ClothingRequirementReasonCode, string>>;
  compositionReasons: Readonly<Record<OutfitCompositionReasonCode, string>>;
  mildWeatherRationale: string;
  /**
   * The one sentence under the rationale saying what the day itself does. The hour-carrying
   * states take an already-formatted time token, never a translated fragment.
   */
  dayInsight: Readonly<{
    sentences: Readonly<Record<TodayDayInsightKey, string>>;
    rainFromUntil: (values: { from: string; until: string }) => string;
    rainFrom: (from: string) => string;
    rainUntil: (until: string) => string;
    snowFromUntil: (values: { from: string; until: string }) => string;
    snowFrom: (from: string) => string;
    snowUntil: (until: string) => string;
    hot: (time: string) => string;
    veryHot: (time: string) => string;
    chilly: (time: string) => string;
    freezing: (time: string) => string;
  }>;
  updatedAt: (time: string) => string;
  staleAt: (time: string) => string;
  refreshingStatus: string;
  refreshFailedAt: (time: string) => string;
  refreshAction: string;
  apparentTemperature: (temperature: string) => string;
  temperatureRange: (minimum: string, maximum: string) => string;
  rainProbability: (probability: string) => string;
  optionPosition: (position: number, total: number) => string;
  loadingTitle: string;
  loadingBody: string;
  loadingAccessibilityLabel: string;
  generatingStatus: string;
  generatingLongWaitStatus: string;
  loading: Readonly<{
    heading: string;
    phase: string;
    // The runway's one tip names no control, so it never points at something off screen.
    tip: string;
    // The runway progress's spoken value. It never counts the neutral drafts, which are
    // placeholders: the wait, the dressing once the answer is in, then ready.
    progress: Readonly<{ waiting: string; dressing: string; done: string }>;
    // The line while the chosen outfit is dressed.
    chosen: string;
    keepWaiting: string;
    skipWait: string;
    allSet: string;
  }>;
  // Law 5's status tone: the fact, nothing else. No exclamation mark, no praise, and no
  // provider or model name; "AI" is a generic word, not a name.
  phase: Readonly<Record<RecommendationPhase, string>>;
  unavailableTitle: string;
  unavailableBody: string;
  noLocationTitle: string;
  noLocationBody: string;
  chooseLocationAction: string;
  noOutfitTitle: string;
  noOutfitBody: string;
  weatherAccessibilityLabel: (values: {
    condition: string;
    // The three temperatures arrive already formatted, so the spoken number is the one
    // the eye sees, separator and all, rather than a raw float read in a fixed locale.
    current: string;
    unitName: string;
    apparent: string;
    minimum: string;
    maximum: string;
    rainProbability: number;
  }) => string;
  titleAccessibilityLabel: (values: {
    temperature: string; unitName: string; condition: string;
  }) => string;
  weatherRecapAccessibilityLabel: (values: {
    temperature: string; unitName: string; condition: string;
    rainProbability: number; coverageCaption: string | null;
  }) => string;
  boardAccessibilityLabel: (values: { archetype: string; pieces: readonly string[] }) => string;
  stageAccessibilityLabel: (values: {
    temperature: string; unitName: string; condition: string; pieces: readonly string[]; archetype: string;
  }) => string;
  outfitAccessibilityLabel: (values: {
    position: number;
    total: number;
    archetype: string;
    pieces: readonly Readonly<{ slot: string; item: string }>[];
    reasons: readonly string[];
  }) => string;
}>;

export type PreferenceMessages = Readonly<{
  stylePreferencesTitle: string;
  stylePreferencesBody: string;
  stylePreferencesNone: string;
  stylePreferencesDone: string;
  stylePreferencesLimit: string;
  styleAestheticMinimal: string;
  styleAestheticClassic: string;
  styleAestheticSporty: string;
  styleAestheticStreetwear: string;
  styleAestheticRelaxed: string;
  morningQuestionTitle: string;
  genderTitle: string;
  genderWoman: string;
  genderMan: string;
  dressStyleTitle: string;
  dressStyleCasual: string;
  dressStyleSmart: string;
  dressStyleFormal: string;
  birthDateTitle: string;
  languageTitle: string;
  languageSystem: string;
  languageTurkish: string;
  languageEnglish: string;
  themeSystem: string;
  themeLight: string;
  themeDark: string;
}>;

/** A morning's low and high, already formatted; equal values read as one temperature. */

export type AppMessages = Readonly<{
  temperatureUnitNames: Readonly<Record<'celsius' | 'fahrenheit', string>>;
  catalog: CatalogMessages;
  recommendation: RecommendationMessages;
  common: Readonly<{
    back: string;
    continue: string;
    /** A whole-degree range whose ends are below zero, where a dash between them would read as a minus. */
    negativeTemperatureRange: (low: string, high: string) => string;
  }>;
  navigation: Readonly<{
    today: string;
    weather: string;
    profile: string;
  }>;
  bootstrap: Readonly<{
    loadingTitle: string;
    loadingBody: string;
    errorTitle: string;
    errorBody: string;
    errorReasonBodies: Readonly<Record<
      'database-open' | 'migration' | 'profile-load',
      string
    >>;
    retryAction: string;
    reportAction: string;
  }>;
  onboarding: Readonly<{
    stepPosition: (position: number, total: number) => string;
    nameTitle: string;
    nameBody: string;
    namePlaceholder: string;
    nameShortError: string;
    nameLongError: string;
    nameNotNow: string;
    welcomeTitle: string;
    welcomeBody: string;
    welcomePreviewTitle: (temperature: string) => string;
    welcomePreviewCaption: string;
    nameGreetingEmpty: string;
    nameGreetingCaption: string;
    genderTitle: string;
    genderBody: string;
    dressStyleTitle: string;
    dressStyleBody: string;
    dressStyleRequiredError: string;
    stylePreferencesTitle: string;
    stylePreferencesBody: string;
    birthDateTitle: string;
    birthDateBody: string;
    birthDateNotSet: string;
    birthDateClearAction: string;
    locationTitle: string;
    locationBody: string;
    completeAction: string;
    locationSkipAction: string;
    genderRequiredError: string;
    saveError: string;
  }>;
  preferences: PreferenceMessages;
  settings: Readonly<{
    title: string;
    appearanceHeading: string;
    notificationsHeading: string;
    profileHeading: string;
    helpHeading: string;
    aboutHeading: string;
    accessibilityHeading: string;
    easierToSee: Readonly<{
      title: string;
      on: string;
      off: string;
      footer: string;
      previewHeading: string;
      previewLabelOff: string;
      previewLabelOn: string;
      /** The preview card's sample outfit name; the card is illustration, never a recommendation. */
      previewOutfitName: string;
      /** The read-only group naming the iPhone settings kuyara follows (Apple's own names). */
      systemHeading: string;
      systemFooter: string;
      largerText: string;
      boldText: string;
      increaseContrast: string;
      textSizeDefault: string;
      textSizeLarger: string;
      textSizeSmaller: string;
    }>;
    themeRow: string;
    versionLine: (version: string, build?: string | null) => string;
    developmentBuild: string;
    supportRow: string;
    shareRow: string;
    shareText: string;
    rateRow: string;
    licenceRow: string;
    serviceProvidersHeading: string;
    artificialIntelligenceHeading: string;
    weatherDataHeading: string;
    weatherNoSnapshot: string;
    weatherFooter: string;
    aiStatusIntro: string;
    aiStatusProvenanceFooter: string;
    aiStatusOnDeviceRunning: string;
    aiStatusOnDeviceOff: string;
    aiStatusOnDeviceIncompatible: string;
    aiStatusOnDeviceGettingReady: string;
    aiStatusAssistant: (provider: string, model: string) => string;
    aiStatusLastOnDeviceAi: string;
    aiStatusLastAiAssisted: string;
    aiStatusLastStandard: string;
    aiStatusLastUnknown: string;
    aiStatusCheckAction: string;
    aiStatusChecking: string;
    aiStatusResultOk: (time: string) => string;
    aiStatusResultUnavailable: string;
    aiStatusResultRateLimited: string;
    aiStatusResultError: string;
    aiStatusUnsupported: string;
    saving: string;
    saveError: string;
  }>;
  analytics: Readonly<{
    consentTitle: string;
    consentBody: string;
    consentSettingsBody: string;
    acceptAction: string;
    declineAction: string;
    privacyTitle: string;
    shareUsageData: string;
    toggleFooter: string;
    withdrawFailed: string;
    withdrawIncomplete: string;
    grantFailed: string;
    grantIncomplete: string;
    retryGrant: string;
    retryWithdraw: string;
    identifierLabel: string;
    identifierFooter: string;
    privacyPolicyLabel: string;
  }>;
  profile: Readonly<{
    title: string;
    nameLabel: string;
    nameDone: string;
    nameClear: string;
    nameSaveError: string;
    nameCancel: string;
    nameRemove: string;
    settingsAction: string;
    settingsHint: string;
    wardrobeTitle: string;
    wardrobeTitleNamed: (name: string) => string;
    closetHeadingAccessibilityLabel: (values: { count: number }) => string;
    closetHeadingNamedAccessibilityLabel: (values: { name: string; count: number }) => string;
    closetHeadingHint: string;
    wantedLabel: string;
    historyLabel: string;
    historyIntro: string;
    historyEmptyTitle: string;
    historyEmptyBody: string;
    historyLoadError: string;
    wardrobeEmpty: string;
    addPieceAction: string;
    // O9: the open rack is one button; its label names the heading and the pieces by
    // category, so the drawing is never the only carrier of what the Closet holds.
    rackAccessibilityLabel: (values: {
      title: string;
      count: number;
      categories: readonly Readonly<{ label: string; count: number }>[];
    }) => string;
  }>;
  notifications: Readonly<{
    title: string;
    introduction: string;
    leadTimeHint: string;
    /** `start` and `end` arrive formatted for the device's 12 or 24-hour clock. */
    quietHoursHint: (values: { start: string; end: string }) => string;
    toggleLabel: string;
    statusOn: string;
    statusOff: string;
    permissionDeniedHint: string;
    openSettingsAction: string;
    /**
     * ADR 0004's one contextual offer on Today: one sentence per reason it can be made,
     * whether a rule would have fired or the morning briefing would have been scheduled.
     */
    offer: Readonly<{
      sentences: Readonly<Record<Exclude<WeatherAlertOfferReason, 'morning_briefing'>, string>>;
      /** `time` arrives formatted for the device's 12 or 24-hour clock. */
      morningBriefingSentence: (time: string) => string;
      acceptAction: string;
      dismissAction: string;
    }>;
    /**
     * ADR 0004's second notification kind. Range and event are complete localized sentences.
     */
    morningBriefing: Readonly<{
      toggleLabel: string;
      /** `time` arrives formatted for the device's 12 or 24-hour clock. */
      hint: (time: string) => string;
      title: string;
      /** `range` arrives formatted ("14–22°C"); the whole day is covered. */
      fullRange: (range: string) => string;
      /** The forecast stops at `through`, so only the hours up to it are described. */
      partialRange: (values: { range: string; through: string }) => string;
      /** The sky the briefing hour opens with, said only when the day has no event. */
      clearMorning: string;
      cloudyMorning: string;
      wetMorning: string;
      /** Event sentences: `time` arrives formatted for the device's 12 or 24-hour clock. */
      rainStarting: (time: string) => string;
      snowStarting: (time: string) => string;
      rainEasing: (time: string) => string;
      snowEasing: (time: string) => string;
      /** `temperature` is the apparent temperature the swing reaches. */
      temperatureDrop: (values: { time: string; temperature: string }) => string;
      temperatureRise: (values: { time: string; temperature: string }) => string;
    }>;
    alerts: Readonly<{
      rainTitle: string;
      rainBody: (time: string) => string;
      snowTitle: string;
      snowBody: (time: string) => string;
      dropTitle: string;
      dropBody: (values: { time: string; temperature: string }) => string;
      riseTitle: string;
      riseBody: (values: { time: string; temperature: string }) => string;
    }>;
  }>;
  weather: Readonly<{
    title: string;
    introduction: string;
    noLocation: string;
    currentLocation: string;
    approximateLocation: string;
    fullLocation: string;
    locationAccessOff: string;
    useCurrentLocation: string;
    changeLocationAction: string;
    locationRationaleTitle: string;
    locationRationaleBody: string;
    continuePermission: string;
    cancel: string;
    lookupFailedBody: string;
    selectionFailedBody: string;
    openSettings: string;
    sampleDisclosure: string;
    hourlyHeading: string;
    hourlyNow: string;
    noSnapshot: string;
    loadErrorTitle: string;
    loadErrorBody: string;
    retry: string;
    refresh: string;
    refreshAccessibilityLabel: string;
    refreshing: string;
    refreshFailed: string;
    loading: string;
    offlineTitle: string;
    offlineBody: string;
    offlineNotice: string;
    unavailableTitle: string;
    unavailableBody: string;
    unavailableNotice: string;
    rateLimitedTitle: string;
    rateLimitedBody: string;
    rateLimitedNotice: string;
    attributionOpenMeteo: string;
    attributionOpenWeather: string;
    attributionAppleWeather: string;
    attributionHint: (host: string) => string;
    placeSearchTitle: string;
    placeSearchLabel: string;
    placeSearchPlaceholder: string;
    placeSearchLoading: string;
    placeSearchEmpty: string;
    placeSearchAttribution: string;
    placeSearchResultLabel: (name: string, region: string) => string;
    placeSearchErrors: Readonly<Record<'invalid-input' | 'invalid-response' | 'unavailable' | 'rate-limited', string>>;
    placeDeniedBody: string;
    placePermanentDeniedBody: string;
    placeServicesUnavailableBody: string;
    fresh: string;
    stale: string;
    updatedAt: (time: string) => string;
    feelsLike: (temperature: string) => string;
    range: (minimum: string, maximum: string) => string;
    currentConditionsAccessibilityLabel: (values: {
      condition: string;
      unitName: string;
      temperature: string;
      apparentTemperature: string;
      minimumTemperature: string;
      maximumTemperature: string;
      precipitationProbability: number;
    }) => string;
    wind: (speed: string) => string;
    humidity: (humidity: number) => string;
    uvIndex: (index: string) => string;
    hourlyForecastAccessibilityLabel: (values: {
      day?: string;
      time: string;
      unitName: string;
      temperature: string;
      condition: string;
      precipitationProbability: number;
    }) => string;
    dailyHeading: string;
    /** A measured amount beside its chance, both already formatted for the locale. */
    dailyPrecipitationValue: (millimetres: string, probability: string) => string;
    /** The same amount and chance on two lines, for a day column too narrow for one. */
    dailyPrecipitationStacked: (millimetres: string, probability: string) => string;
    dailyForecastAccessibilityLabel: (values: {
      day: string;
      condition: string;
      unitName: string;
      minimumTemperature: string;
      maximumTemperature: string;
      precipitationProbability: number;
      precipitationMillimetres?: string;
      /**
       * Set on today's row only. It both names the day as today, which nothing else in
       * the row says out loud, and states the temperature the rail's mark stands for.
       */
      currentTemperature?: string;
    }) => string;
    windValue: (speed: string) => string;
    humidityValue: (humidity: number) => string;
    windLabel: string;
    humidityLabel: string;
    uvIndexLabel: string;
    /** One key per outlook state: a sentence is never built from translated fragments. */
    outlook: Readonly<{
      rainStarting: (time: string) => string;
      snowStarting: (time: string) => string;
      rainEasing: (time: string) => string;
      snowEasing: (time: string) => string;
      temperatureDrop: (values: { time: string; degrees: string }) => string;
      temperatureRise: (values: { time: string; degrees: string }) => string;
      steady: string;
      /** The same sentence for the evening window, which may begin before sunset. */
      steadyEvening: string;
    }>;
    conditions: Readonly<Record<LiveWeatherConditionCode, string>>;
  }>;
  wardrobe: Readonly<{
    title: string;
    addAction: string;
    addHint: string;
    loadingLabel: string;
    loadErrorTitle: string;
    loadErrorBody: string;
    retryAction: string;
    unclassifiedType: string;
    /** Days a Closet piece was recorded worn in History; never a streak or an absence. */
    wornCount: (count: number) => string;
    ownedLabel: string;
    wantedLabel: string;
    // ADR 0029 section 2: new plural chip strings for the Closet's category filter. The
    // catalogue's singular attribute labels (`catalog.attribute.structural_category.*`)
    // stay for the type picker and the tile subline.
    categoryFilterLabels: Readonly<Record<StructuralCategory, string>>;
    // O9: Profile's category cells and the Closet's category tabs speak the same label.
    categoryAccessibilityLabel: (values: {
      category: string;
      count: number;
      wanted: number;
    }) => string;
    // O9: an empty category page names its own category.
    categoryEmpty: Readonly<Record<StructuralCategory, string>>;
    // Spoken after a wanted tile's name, with its heart badge.
    wantedTileLabel: string;
    newTitle: string;
    editTitle: string;
    // O10: the form's toolbar pair; Save names where the piece goes.
    cancelAction: string;
    saveOwnedAction: string;
    saveWantedAction: string;
    nameLabel: string;
    namePlaceholder: string;
    optionalTag: string;
    requiredTag: string;
    photoTitle: string;
    photoHint: string;
    selectPhotoAction: string;
    takePhotoAction: string;
    changePhotoAction: string;
    retakePhotoAction: string;
    removePhotoAction: string;
    // Shown on the preview stage; the full action above is what is spoken.
    photoChangeLabel: string;
    photoRetakeLabel: string;
    photoRemoveLabel: string;
    photoProcessingLabel: string;
    photoError: string;
    // The camera could not open: access is off (with a link to the app's settings), or the
    // device has no camera. Neither is an error; the library still works.
    cameraDeniedMessage: string;
    cameraUnavailableMessage: string;
    openSettingsAction: string;
    photoAccessibilityLabel: (type: string) => string;
    entryStateTitle: string;
    typeTitle: string;
    typeChangeAction: string;
    typeChangeHint: string;
    typeRequiredError: string;
    colorTitle: string;
    // O8: the Closet palette's two groups and the system colour well.
    solidColorsLabel: string;
    patternColorsLabel: string;
    moreColorsLabel: string;
    // The 47 palette options by their stored ID (`closet-color-options.ts`): 33 solids,
    // then 14 two-colour and pattern options.
    colorOptionNames: Readonly<Record<string, string>>;
    colorUnspecified: string;
    saveAction: string;
    // O10: the Closet names the piece it has just saved, with Undo.
    savedOwnedConfirmation: (piece: string) => string;
    savedWantedConfirmation: (piece: string) => string;
    undoAction: string;
    createError: string;
    updateError: string;
    // O6: the outfit-detail piece sheet.
    pieceSheetAddTitle: string;
    pieceSheetEditTitle: string;
    pieceSheetOwnershipTitle: string;
    pieceSheetSuggested: string;
    pieceSheetYours: string;
    pieceSheetDone: string;
    typeChangeTitle: string;
    typeChangeBody: string;
    keepTypeAction: string;
    changeTypeAction: string;
    discardTitle: string;
    discardBody: string;
    keepEditingAction: string;
    discardAction: string;
    deleteSectionTitle: string;
    deleteSectionBody: string;
    deleteAction: string;
    deletingLabel: string;
    deleteConfirmTitle: string;
    deleteConfirmBody: string;
    cancelDeleteAction: string;
    confirmDeleteAction: string;
    deleteError: string;
    notFoundTitle: string;
    notFoundBody: string;
    returnToWardrobeAction: string;
  }>;
  today: TodayMessages;
  /** Phase 8's coach-mark tour: every bubble, the counter, Skip and the spoken hint. */
  walkthrough: WalkthroughMessages;
  /** Phase 9's account screens (ADR 0041 section 5), built behind the account screens switch. */
  account: AccountMessages;
}>;

type ByProvider = Readonly<Record<'apple' | 'google', string>>;

export type AccountMessages = Readonly<{
  card: Readonly<{ title: string; body: string; action: string; dismiss: string }>;
  signIn: Readonly<{
    close: string;
    title: string;
    benefits: readonly [string, string, string];
    continueWith: ByProvider;
    notNow: string;
    footer: string;
    privacy: string;
    cancelled: string;
    offline: string;
    failed: ByProvider;
  }>;
  welcome: Readonly<{
    title: string;
    summary: (pieces: number, days: number) => string;
    done: string;
  }>;
  /** "Using Sign in with Apple": the account's sign-in method under its address. */
  method: ByProvider;
  settings: Readonly<{
    group: string;
    signIn: string;
    signedOutFooter: string;
    signedIn: ByProvider;
    deleted: string;
    signedOut: string;
  }>;
  sync: Readonly<{
    heading: string;
    upToDate: string;
    offline: string;
    syncing: string;
    failed: string;
    restoring: string;
    offlineWaiting: (pending: number) => string;
    waiting: (pending: number) => string;
    syncingCount: (pending: number) => string;
    restoringCount: (done: number, total: number) => string;
    syncNow: string;
    retry: string;
    upToDateFooter: (time: string) => string;
    offlineFooter: (pending: number, time: string) => string;
    syncingFooter: (pending: number, time: string) => string;
    failedFooter: (pending: number, time: string) => string;
    restoringFooter: (counts: RestoreCounts) => string;
    pausedFooter: (counts: RestoreCounts) => string;
  }>;
  account: Readonly<{
    title: string;
    closet: string;
    pieces: (count: number) => string;
    history: string;
    days: (count: number) => string;
    preferences: string;
    included: string;
    methodsHeading: string;
    providerName: ByProvider;
    connected: string;
    add: ByProvider;
    methodsFooter: string;
    signOut: string;
    delete: string;
    deleteFooter: string;
  }>;
  signOutAlert: Readonly<{ title: string; body: string; cancel: string; confirm: string }>;
  deletion: Readonly<{
    title: string;
    goneHeading: string;
    goneAccount: ByProvider;
    goneData: string;
    stayHeading: string;
    stay: string;
    footer: ByProvider;
    action: string;
    deleting: string;
    failed: string;
    offline: string;
  }>;
  deleteAlert: Readonly<{ title: string; body: string; cancel: string; confirm: string }>;
  restore: Readonly<{
    progressTitle: string;
    progressBody: string;
    progressCount: (counts: RestoreCounts) => string;
    progressKeep: string;
    progressAction: string;
    doneTitle: string;
    doneBody: (pieces: number, days: number) => string;
    doneProfile: string;
    done: string;
  }>;
  deleted: Readonly<{ title: string; gone: ByProvider; stay: string; done: string }>;
}>;

type WalkthroughStepCopy = Readonly<{ title: string; body: string }>;

export type WalkthroughMessages = Readonly<{
  /** The overlay's accessible name and the Settings, Help row. */
  name: string;
  counter: (step: number, total: number) => string;
  skip: string;
  /** Spoken only, added to the live control's own label. */
  targetHint: string;
  steps: Readonly<{
    outfit: WalkthroughStepCopy & Readonly<{ bodyNoBadge: string }>;
    /** `piece` is the first piece's catalog name, inserted as a whole word. */
    piece: Readonly<{ title: string; body: (piece: string) => string }>;
    sheet: WalkthroughStepCopy;
    worn: WalkthroughStepCopy;
    back: WalkthroughStepCopy;
    again: WalkthroughStepCopy;
    profileTab: WalkthroughStepCopy;
    closet: WalkthroughStepCopy;
    /** The title is the shipped History label. */
    history: Readonly<{ body: string }>;
  }>;
}>;

const englishOwnershipStateLabels = Object.freeze({
  owned: 'Owned',
  wanted: 'Wanted',
});

const enPieces = (count: number) => (count === 1 ? '1 piece' : `${count} pieces`);
const enDays = (count: number) => (count === 1 ? '1 day' : `${count} days`);
const enChanges = (count: number) => (count === 1 ? '1 change' : `${count} changes`);
const enRestoreCount = (c: RestoreCounts) => `${c.piecesDone} of ${enPieces(c.piecesTotal)} and ${c.daysDone} of ${enDays(c.daysTotal)} are back.`;
// Turkish puts no case suffix on a bare numeral here: the suffix rides on the noun instead.
const trRestoreCount = (c: RestoreCounts) => `${c.piecesTotal} parçadan ${c.piecesDone} parça ve ${c.daysTotal} günden ${c.daysDone} gün geldi.`;

const en = {
  temperatureUnitNames: { celsius: 'degrees Celsius', fahrenheit: 'degrees Fahrenheit' },
  catalog: catalogMessages.en,
  recommendation: recommendationMessages.en,
  common: {
    back: 'Back',
    continue: 'Continue',
    negativeTemperatureRange: (low, high) => `${low} to ${high}`,
  },
  navigation: {
    today: 'Today',
    weather: 'Weather',
    profile: 'Profile',
  },
  bootstrap: {
    loadingTitle: 'Preparing kuyara',
    loadingBody: 'Your preferences are loading.',
    errorTitle: 'kuyara could not start',
    errorBody: 'Your data is still safe.',
    errorReasonBodies: {
      'database-open': 'The database could not be opened.',
      migration: 'Your data could not be updated to this version.',
      'profile-load': 'Your profile could not be read.',
    },
    retryAction: 'Try again',
    reportAction: 'Report a problem',
  },
  onboarding: {
    stepPosition: (position: number, total: number) => `Step ${position} of ${total}`,
    nameTitle: 'What should we call you?',
    nameBody: 'Optional. You can add or change your name later in Settings.',
    namePlaceholder: 'Your name',
    nameShortError: 'Enter at least 2 characters, or choose Not now.',
    nameLongError: 'Use 30 characters or fewer.',
    nameNotNow: 'Not now',
    welcomeTitle: 'Welcome to kuyara',
    welcomeBody: 'A calm way to make daily clothing choices with the weather in mind.',
    welcomePreviewTitle: (temperature) => `Today · ${temperature} · Cloudy`,
    welcomePreviewCaption: 'Every morning: one outfit for the day’s weather.',
    nameGreetingEmpty: 'Welcome',
    nameGreetingCaption: 'Your name appears here on Today.',
    genderTitle: 'Your gender',
    genderBody: 'kuyara uses it to choose the catalog your outfit suggestions come from. You can change it later in Settings.',
    dressStyleTitle: 'How do you usually dress?',
    dressStyleBody: 'Choose the look you wear most days. Suggestions lean that way first and exclude nothing. You can change it later in Settings.',
    dressStyleRequiredError: 'Choose how you usually dress to continue.',
    stylePreferencesTitle: 'Which styles feel like you?',
    stylePreferencesBody: 'Optional. Choose up to three styles. They shape the order of suggestions, without excluding outfits.',
    birthDateTitle: 'Your birth date',
    birthDateBody: 'Optional. It helps us understand who uses kuyara. It does not change your suggestions.',
    birthDateNotSet: 'Not set',
    birthDateClearAction: 'Remove birth date',
    locationTitle: 'Set your location',
    locationBody: 'Use your device location or search for a city so kuyara can find the weather for your outfit suggestions. You can do this later.',
    completeAction: 'Start using kuyara',
    locationSkipAction: 'Continue without a location',
    genderRequiredError: 'Choose your gender to continue.',
    saveError: 'Your choices could not be saved. Please try again.',
  },
  preferences: {
    stylePreferencesTitle: 'Style preferences',
    stylePreferencesBody: 'Choose up to three styles.',
    stylePreferencesNone: 'None selected',
    stylePreferencesDone: 'Done',
    stylePreferencesLimit: 'You can choose up to three styles.',
    styleAestheticMinimal: 'Minimal',
    styleAestheticClassic: 'Classic',
    styleAestheticSporty: 'Sporty',
    styleAestheticStreetwear: 'Streetwear',
    styleAestheticRelaxed: 'Laid-back',
    morningQuestionTitle: 'Morning question',
    genderTitle: 'Gender',
    genderWoman: 'Woman',
    genderMan: 'Man',
    dressStyleTitle: 'Dress style',
    dressStyleCasual: 'Casual',
    dressStyleSmart: 'Smart',
    dressStyleFormal: 'Formal',
    birthDateTitle: 'Birth date',
    languageTitle: 'Language',
    languageSystem: 'System',
    languageTurkish: 'Türkçe',
    languageEnglish: 'English',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
  },
  settings: {
    title: 'Settings',
    appearanceHeading: 'Appearance',
    notificationsHeading: 'Notifications',
    profileHeading: 'Profile',
    helpHeading: 'Help',
    aboutHeading: 'About',
    accessibilityHeading: 'Accessibility',
    easierToSee: {
      title: 'Easier to see',
      on: 'On',
      off: 'Off',
      footer: 'Makes text heavier, raises contrast, draws clearer edges around buttons, and makes the outfit drawings and buttons larger.',
      previewHeading: 'Preview',
      previewLabelOff: 'Preview of Today with Easier to see off.',
      previewLabelOn: 'Preview of Today with Easier to see on.',
      previewOutfitName: 'Layered Warmth',
      systemHeading: 'iPhone settings kuyara follows',
      systemFooter: 'Change these in the iPhone Settings app, under Accessibility, Display & Text Size. When Bold Text or Increase Contrast is on, kuyara follows it even with Easier to see off.',
      largerText: 'Larger Text',
      boldText: 'Bold Text',
      increaseContrast: 'Increase Contrast',
      textSizeDefault: 'Default',
      textSizeLarger: 'Larger',
      textSizeSmaller: 'Smaller',
    },
    themeRow: 'Theme',
    versionLine: (version: string, build?: string | null) => build ? `Version ${version} (${build})` : `Version ${version}`,
    developmentBuild: 'Development build',
    supportRow: 'Support',
    shareRow: 'Share kuyara',
    shareText: 'I use kuyara to decide what to wear each day. Take a look.',
    rateRow: 'Rate kuyara',
    licenceRow: 'Licence',
    serviceProvidersHeading: 'Service providers',
    artificialIntelligenceHeading: 'Artificial intelligence',
    weatherDataHeading: 'Weather data',
    weatherNoSnapshot: 'Sources appear here after the first weather update.',
    weatherFooter: 'Where your latest weather came from.',
    aiStatusIntro: 'Sends one short request. Your outfit does not change.',
    aiStatusProvenanceFooter: 'kuyara asks Apple Intelligence first. If it cannot answer in time, kuyara asks online AI, and then uses its standard suggestions. Apple Intelligence is a trademark of Apple Inc.',
    aiStatusOnDeviceRunning: 'Apple Intelligence is on and ready.',
    aiStatusOnDeviceOff: 'Apple Intelligence is turned off.',
    aiStatusOnDeviceIncompatible: 'This device does not support Apple Intelligence.',
    aiStatusOnDeviceGettingReady: 'Apple Intelligence is getting ready.',
    aiStatusAssistant: (provider: string, model: string) =>
      `Answered by ${provider} (${model})`,
    aiStatusLastOnDeviceAi: 'kuyara chose your last outfit with Apple Intelligence.',
    aiStatusLastAiAssisted: 'kuyara chose your last outfit with online AI.',
    aiStatusLastStandard: 'kuyara chose your last outfit from its standard suggestions.',
    aiStatusLastUnknown: 'No outfit has been chosen yet.',
    aiStatusCheckAction: 'Test online AI',
    aiStatusChecking: 'Testing online AI…',
    aiStatusResultOk: (time: string) => `Online AI answered at ${time}.`,
    aiStatusResultUnavailable: 'Online AI did not answer this time.',
    aiStatusResultRateLimited: 'Tested a moment ago. Try again in a few minutes.',
    aiStatusResultError: 'The test could not run. Try again later.',
    aiStatusUnsupported: 'This version cannot run the test.',
    saving: 'Saving changes…',
    saveError: 'That change could not be saved. Your previous setting is still active.',
  },
  analytics: {
    consentTitle: 'Help improve kuyara',
    consentBody: 'Sharing how you use kuyara, along with app errors and performance, helps us improve it. This includes which screens you use, whether suggestions load, the kinds of clothes you add to your closet and broad settings such as dress style and age range. Your location, photos, name and the names and colors of your closet items are never included.',
    consentSettingsBody: 'You can change this any time in Settings, under Privacy.',
    acceptAction: 'Help improve',
    declineAction: 'Not now',
    privacyTitle: 'Privacy',
    shareUsageData: 'Share usage and diagnostics',
    toggleFooter: 'Sharing usage, error and performance data helps improve kuyara. Turning this off stops the sharing controlled here and discards this device’s analytics identifier. A launch count and update check still run, as the privacy policy explains.',
    withdrawFailed: 'Sharing could not be turned off completely. Try again.',
    withdrawIncomplete: 'Your choice to stop sharing was saved, but cleanup did not finish. Try again.',
    grantFailed: 'Sharing could not be turned on. Try again.',
    grantIncomplete: 'Your choice to share was saved, but setup did not finish. Some sharing may be active. Try again.',
    retryGrant: 'Retry sharing',
    retryWithdraw: 'Retry turning off',
    identifierLabel: 'Analytics identifier',
    identifierFooter: 'You can quote this identifier in a request about your data.',
    privacyPolicyLabel: 'Privacy policy',
  },
  profile: {
    title: 'Profile',
    nameLabel: 'Name',
    nameDone: 'Done',
    nameClear: 'Clear name',
    nameSaveError: 'That change could not be saved. Your previous name is still active.',
    nameCancel: 'Cancel',
    nameRemove: 'Remove name',
    settingsAction: 'Settings',
    settingsHint: 'Opens app settings.',
    wardrobeTitle: 'Closet',
    wardrobeTitleNamed: (name) => `${name}'s Closet`,
    closetHeadingAccessibilityLabel: ({ count }) => `Closet, ${count} ${count === 1 ? 'piece' : 'pieces'}.`,
    closetHeadingNamedAccessibilityLabel: ({ name, count }) =>
      `${name}'s Closet, ${count} ${count === 1 ? 'piece' : 'pieces'}.`,
    closetHeadingHint: 'Opens your closet.',
    wantedLabel: 'Wanted',
    historyLabel: 'History',
    historyIntro: 'Looks you chose to wear.',
    historyEmptyTitle: 'No worn looks yet',
    historyEmptyBody: 'When you wear a look, open it from Today and tap “Wore this today”. It will show here under that day.',
    historyLoadError: 'History could not be loaded. Try again later.',
    wardrobeEmpty: 'Add the pieces you own or want.',
    addPieceAction: 'Add a piece',
    rackAccessibilityLabel: ({ title, count, categories }) =>
      `${title}, ${count} ${count === 1 ? 'piece' : 'pieces'}`
      + (categories.length > 0
        ? `: ${categories.map(({ label, count: n }) => `${label} ${n}`).join(', ')}.`
        : '.'),
  },
  notifications: {
    title: 'Notifications',
    introduction: 'kuyara sends weather alerts for the hours ahead on this device.',
    leadTimeHint: 'An alert arrives up to an hour before rain starts or the temperature swings sharply.',
    quietHoursHint: ({ start, end }) => `No alert is sent between ${start} and ${end}.`,
    toggleLabel: 'Allow notifications',
    statusOn: 'On',
    statusOff: 'Off',
    permissionDeniedHint: 'Notifications are turned off in system settings.',
    openSettingsAction: 'Open Settings',
    offer: {
      sentences: {
        precipitation_onset: 'kuyara could have warned you before rain or snow started today.',
        temperature_swing: 'kuyara could have warned you before today\u2019s sharp temperature change.',
      },
      morningBriefingSentence: (time) => `kuyara can send a morning briefing at ${time} and a weather alert before the weather changes during the day.`,
      acceptAction: 'Turn on notifications',
      dismissAction: 'Not now',
    },
    morningBriefing: {
      toggleLabel: 'Morning briefing',
      hint: (time) => `A single notification at ${time} with the day\u2019s temperature range and its one big weather change, when tomorrow morning is already in the forecast.`,
      title: 'Good morning',
      fullRange: (range) => `Today ${range}.`,
      partialRange: ({ range, through }) => `Until ${through}: ${range}.`,
      clearMorning: 'A clear morning.',
      cloudyMorning: 'A cloudy morning.',
      wetMorning: 'Rain or snow is likely this morning.',
      rainStarting: (time) => `Rain starts at ${time}.`,
      snowStarting: (time) => `Snow starts at ${time}.`,
      rainEasing: (time) => `Rain eases at ${time}.`,
      snowEasing: (time) => `Snow eases at ${time}.`,
      temperatureDrop: ({ time, temperature }) => `Cooler around ${time}, feeling like ${temperature}.`,
      temperatureRise: ({ time, temperature }) => `Warmer around ${time}, feeling like ${temperature}.`,
    },
    alerts: {
      rainTitle: 'Rain is on the way',
      rainBody: (time) => `Rain is expected around ${time}. Take something waterproof with you.`,
      snowTitle: 'Snow is on the way',
      snowBody: (time) => `Snow is expected around ${time}. Take a warm, waterproof layer with you.`,
      dropTitle: 'It will feel colder',
      dropBody: ({ time, temperature }) =>
        `Around ${time}, it will feel like ${temperature}. Take a warmer layer with you.`,
      riseTitle: 'It will feel warmer',
      riseBody: ({ time, temperature }) =>
        `Around ${time}, it will feel like ${temperature}. Choose a lighter layer.`,
    },
  },
  weather: {
    title: 'Weather',
    introduction: 'Choose one active location for today’s weather.',
    noLocation: 'No location selected yet.',
    currentLocation: 'Current location',
    approximateLocation: 'Approximate location',
    fullLocation: 'Precise location',
    locationAccessOff: 'Location access is off. Showing the last known place.',
    useCurrentLocation: 'Use my current location',
    changeLocationAction: 'Change',
    locationRationaleTitle: 'Use your location for weather?',
    locationRationaleBody: 'kuyara uses your approximate location to find the weather for your outfit suggestions while you use the app.',
    continuePermission: 'Continue',
    cancel: 'Not now',
    lookupFailedBody: 'Your location could not be found. Your previous location is unchanged.',
    selectionFailedBody: 'That location could not be saved. Your previous location is still active.',
    openSettings: 'Open system settings',
    sampleDisclosure: 'Sample weather data, not live weather.',
    hourlyHeading: 'Coming hours',
    hourlyNow: 'Now',
    noSnapshot: 'Weather will appear once a location is selected.',
    loadErrorTitle: 'Weather could not be prepared',
    loadErrorBody: 'Your saved data is still safe. Please try again.',
    retry: 'Try again',
    refresh: 'Refresh',
    refreshAccessibilityLabel: 'Refresh weather',
    refreshing: 'Refreshing weather…',
    refreshFailed: "Couldn't refresh",
    loading: 'Loading weather…',
    offlineTitle: 'You appear to be offline',
    offlineBody: 'Connect to the internet and try loading weather again.',
    offlineNotice: 'You are offline. The last matching weather remains visible.',
    unavailableTitle: 'Weather is temporarily unavailable',
    unavailableBody: 'The weather service could not provide valid data. Please try again.',
    unavailableNotice: 'Weather is temporarily unavailable. The last matching weather remains visible.',
    rateLimitedTitle: 'Weather updates are paused for a moment',
    rateLimitedBody: 'Too many weather requests right now. Please try again shortly.',
    rateLimitedNotice: 'Weather updates are paused for a moment. The last matching weather remains visible.',
    attributionOpenMeteo: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    attributionOpenWeather: 'Weather data provided by OpenWeather (ODbL)',
    attributionAppleWeather: 'Weather data by Apple Weather',
    attributionHint: (host) => `Opens ${host}`,
    placeSearchTitle: 'Location',
    placeSearchLabel: 'Search for a city',
    placeSearchPlaceholder: 'Search for a city',
    placeSearchLoading: 'Searching for places…',
    placeSearchEmpty: 'No matching places. Try another city name.',
    placeSearchAttribution: 'Place data by Open-Meteo and GeoNames',
    placeSearchResultLabel: (name, region) => `${name}, ${region}`,
    placeSearchErrors: {
      'invalid-input': 'Enter a city name between 2 and 100 characters.',
      'invalid-response': 'Search results could not be loaded. Try again.',
      unavailable: 'Place search is temporarily unavailable. Try again later.',
      'rate-limited': 'Too many searches. Wait a moment and try again.',
    },
    placeDeniedBody: 'Location access was not granted. Search for a city or try again later.',
    placePermanentDeniedBody: 'Location access can no longer be requested here. Open system settings or search for a city.',
    placeServicesUnavailableBody: 'Location services are unavailable or turned off. Search for a city or try again after enabling them.',
    fresh: 'Fresh',
    stale: 'May be out of date',
    updatedAt: (time) => `Last updated at ${time}`,
    feelsLike: (temperature) => `Feels like\u00a0${temperature}`,
    range: (minimum, maximum) => `Low\u00a0${minimum} · High\u00a0${maximum}`,
    currentConditionsAccessibilityLabel: ({
      condition,
      unitName,
      temperature,
      apparentTemperature,
      minimumTemperature,
      maximumTemperature,
      precipitationProbability,
    }) =>
      `${condition}. ${temperature} ${unitName}. Feels like ${apparentTemperature} ${unitName}. ` +
      `Low ${minimumTemperature} ${unitName}, high ${maximumTemperature} ${unitName}. ` +
      `${Math.round(precipitationProbability * 100)}% chance of precipitation.`,
    wind: (speed) => `Wind ${speed} m/s`,
    humidity: (humidity) => `${Math.round(humidity * 100)}% humidity`,
    uvIndex: (index) => `UV index ${index}`,
    hourlyForecastAccessibilityLabel: ({
      day,
      time,
      unitName,
      temperature,
      condition,
      precipitationProbability,
    }) =>
      `${day ? `${day}, ` : ''}${time}. ${temperature} ${unitName}. ${condition}. ` +
      `${Math.round(precipitationProbability * 100)}% chance of precipitation.`,
    dailyHeading: 'Coming days',
    // One line when it fits. When it does not, the row shows the stacked form instead, so a
    // line never begins with the dot: iOS still breaks a no-break run that is wider than the
    // day column, which is exactly what the dot's no-break space made at the largest text size.
    dailyPrecipitationValue: (millimetres, probability) => `${millimetres}\u00a0mm\u00a0· ${probability}`,
    dailyPrecipitationStacked: (millimetres, probability) => `${millimetres}\u00a0mm\n${probability}`,
    dailyForecastAccessibilityLabel: ({
      day,
      condition,
      unitName,
      minimumTemperature,
      maximumTemperature,
      precipitationProbability,
      precipitationMillimetres,
      currentTemperature,
    }) =>
      `${currentTemperature ? `Today, ${day}` : day}. ${condition}. ` +
      `Low ${minimumTemperature} ${unitName}, high ${maximumTemperature} ${unitName}. ` +
      `${currentTemperature ? `Now ${currentTemperature} ${unitName}. ` : ''}` +
      `${precipitationMillimetres ? `${precipitationMillimetres} mm of precipitation. ` : ''}` +
      `${Math.round(precipitationProbability * 100)}% chance of precipitation.`,
    windValue: (speed) => `${speed} m/s`,
    humidityValue: (humidity) => `${Math.round(humidity * 100)}%`,
    windLabel: 'Wind',
    humidityLabel: 'Humidity',
    uvIndexLabel: 'UV',
    outlook: {
      rainStarting: (time) => `Rain starts around ${time}`,
      snowStarting: (time) => `Snow starts around ${time}`,
      rainEasing: (time) => `Rain eases around ${time}`,
      snowEasing: (time) => `Snow eases around ${time}`,
      temperatureDrop: ({ time, degrees }) => `Down ${degrees} by ${time}`,
      temperatureRise: ({ time, degrees }) => `Up ${degrees} by ${time}`,
      steady: 'No notable change for the rest of today',
      steadyEvening: 'No notable change for the rest of the evening',
    },
    conditions: {
      clear: 'Clear', mostly_clear: 'Mostly clear', partly_cloudy: 'Partly cloudy',
      cloudy: 'Cloudy', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain',
      heavy_rain: 'Heavy rain', sleet: 'Sleet', snow: 'Snow', thunderstorm: 'Thunderstorm',
    },
  },
  wardrobe: {
    title: 'Closet',
    addAction: 'Add',
    addHint: 'Opens the new closet item form.',
    loadingLabel: 'Loading your closet.',
    loadErrorTitle: 'Your closet could not be loaded',
    loadErrorBody: 'Your saved items are still safe. Please try again.',
    retryAction: 'Try again',
    unclassifiedType: 'Type not selected',
    wornCount: (count: number) => (count === 1 ? 'Worn once' : `Worn ${count} times`),
    ownedLabel: englishOwnershipStateLabels.owned,
    wantedLabel: englishOwnershipStateLabels.wanted,
    categoryFilterLabels: {
      top: 'Tops',
      bottom: 'Bottoms',
      one_piece: 'One-piece',
      outerwear: 'Outerwear',
      footwear: 'Shoes',
      accessory: 'Accessories',
    },
    categoryAccessibilityLabel: ({ category, count, wanted }) =>
      `${category}, ${count} ${count === 1 ? 'piece' : 'pieces'}`
      + (wanted > 0 ? `, ${wanted} wanted.` : '.'),
    categoryEmpty: {
      top: 'You have not added any tops yet.',
      bottom: 'You have not added any bottoms yet.',
      one_piece: 'You have not added any one-piece items yet.',
      outerwear: 'You have not added any outerwear yet.',
      footwear: 'You have not added any shoes yet.',
      accessory: 'You have not added any accessories yet.',
    },
    wantedTileLabel: 'Wanted',
    newTitle: 'New piece',
    editTitle: 'Edit piece',
    cancelAction: 'Cancel',
    saveOwnedAction: 'Add to Closet',
    saveWantedAction: 'Add to wanted pieces',
    nameLabel: 'Name',
    namePlaceholder: 'For example, my weekend jeans',
    optionalTag: 'Optional',
    requiredTag: 'Required',
    photoTitle: 'Photo',
    photoHint: 'A photo is optional. Without one, kuyara draws the piece.',
    selectPhotoAction: 'Choose photo',
    takePhotoAction: 'Take photo',
    changePhotoAction: 'Change photo',
    retakePhotoAction: 'Retake photo',
    removePhotoAction: 'Remove photo',
    photoChangeLabel: 'Change',
    photoRetakeLabel: 'Retake',
    photoRemoveLabel: 'Remove',
    photoProcessingLabel: 'Preparing photo…',
    photoError:
      'The photo could not be prepared. Your other changes are still here; please try again.',
    cameraDeniedMessage:
      'Camera access for kuyara is turned off in system settings. You can turn it on there or choose a photo instead.',
    cameraUnavailableMessage:
      'The camera is not available on this device. You can choose a photo instead.',
    openSettingsAction: 'Open Settings',
    photoAccessibilityLabel: (type: string) => `${type} closet item photo.`,
    entryStateTitle: 'Do you own this piece?',
    typeTitle: 'What is it?',
    typeChangeAction: 'Change',
    typeChangeHint: 'Shows the clothing types again.',
    typeRequiredError: 'Choose what kind of piece this is before saving.',
    colorTitle: 'Color',
    solidColorsLabel: 'Solid colors',
    patternColorsLabel: 'Two colors and patterns',
    moreColorsLabel: 'More colors',
    colorOptionNames: {
      white: 'White',
      ecru: 'Ecru',
      stone: 'Stone',
      sand: 'Sand',
      straw: 'Straw',
      camel: 'Camel',
      tan_leather: 'Tan leather',
      chocolate: 'Chocolate',
      light_grey: 'Light grey',
      heather_grey: 'Heather grey',
      charcoal: 'Charcoal',
      black: 'Black',
      navy: 'Navy',
      indigo_denim: 'Indigo denim',
      mid_wash_denim: 'Mid-wash denim',
      light_wash_denim: 'Light-wash denim',
      oxford_blue: 'Oxford blue',
      sky_blue: 'Sky blue',
      cobalt: 'Cobalt',
      black_denim: 'Black denim',
      sage: 'Sage',
      olive: 'Olive',
      forest_green: 'Forest green',
      mustard: 'Mustard',
      rain_yellow: 'Rain yellow',
      terracotta: 'Terracotta',
      rust: 'Rust',
      tomato_red: 'Tomato red',
      burgundy: 'Burgundy',
      blush: 'Blush',
      dusty_rose: 'Dusty rose',
      lavender: 'Lavender',
      plum: 'Plum',
      white_and_black: 'White and black',
      white_and_blue: 'White and blue',
      navy_and_camel: 'Navy and camel',
      blue_stripes: 'Blue stripes',
      navy_stripes: 'Navy stripes',
      black_stripes: 'Black stripes',
      red_stripes: 'Red stripes',
      blue_gingham: 'Blue gingham',
      red_gingham: 'Red gingham',
      tartan: 'Tartan',
      houndstooth: 'Houndstooth',
      polka_dots: 'Polka dots',
      floral: 'Floral',
      leopard: 'Leopard',
    },
    colorUnspecified: 'Any',
    saveAction: 'Save',
    savedOwnedConfirmation: (piece: string) => `${piece} added to your Closet.`,
    savedWantedConfirmation: (piece: string) => `${piece} added to your wanted pieces.`,
    undoAction: 'Undo',
    createError: 'This item could not be added. Your entries are still here; please try again.',
    updateError: 'This item could not be saved. Your changes are still here; please try again.',
    pieceSheetAddTitle: 'Add to Closet',
    pieceSheetEditTitle: 'Edit piece',
    pieceSheetOwnershipTitle: 'Is it yours?',
    pieceSheetSuggested: 'Suggested today',
    pieceSheetYours: 'Yours',
    pieceSheetDone: 'Done',
    typeChangeTitle: 'Change clothing type?',
    typeChangeBody:
      'Changing the type will remove your item property choices and use the new type’s catalog defaults.',
    keepTypeAction: 'Keep current type',
    changeTypeAction: 'Change type and reset properties',
    discardTitle: 'Discard unsaved changes?',
    discardBody: 'Your changes to this closet item will be lost.',
    keepEditingAction: 'Keep editing',
    discardAction: 'Discard changes',
    deleteSectionTitle: 'Remove from closet',
    deleteSectionBody: 'This item will no longer appear in your closet list.',
    deleteAction: 'Delete item',
    deletingLabel: 'Deleting item…',
    deleteConfirmTitle: 'Delete this item?',
    deleteConfirmBody: 'The item will be removed from your closet list.',
    cancelDeleteAction: 'Keep item',
    confirmDeleteAction: 'Delete from closet',
    deleteError: 'This item could not be deleted. Please try again.',
    notFoundTitle: 'Closet item not found',
    notFoundBody: 'It may have been deleted or is no longer available.',
    returnToWardrobeAction: 'Return to closet',
  },
  today: {
    titleTemplate: 'Today · {temperature} {symbol} {condition}',
    dailyStyle: {
      question: 'What kind of day is it?',
      questionEvening: 'What kind of evening is it?',
      casual: 'Casual', smart: 'Smart', formal: 'Formal',
      updating: {
        casual: 'Updating for a Casual day…',
        smart: 'Updating for a Smart day…',
        formal: 'Updating for a Formal day…',
      },
      firstDayNote: 'Your answer from setup is already selected. Tap it to confirm.',
      close: 'Close',
      saveError: 'Your choice could not be saved. Try again.',
      stylesQuestion: 'Any styles for today?',
      stylesNote: 'Only for today. Your Settings stay as they are.',
    },
    greetingNamed: (name) => `Welcome back, ${name}`,
    greetingFirstNamed: (name) => `Welcome, ${name}`,
    generationModeOnDeviceAi: 'Chosen with Apple Intelligence',
    generationModeAiAssisted: 'Chosen with AI',
    generationModeOnDeviceAiAccessibilityLabel:
      'Recommendation source: kuyara chose this outfit with Apple Intelligence',
    generationModeAiAssistedAccessibilityLabel:
      'Recommendation source: kuyara chose this outfit with AI',
    generationSourceOnDeviceAi: 'kuyara chose this outfit on your device with Apple Intelligence.',
    generationSourceAiAssisted: 'kuyara chose this outfit with online AI.',
    generationSourceDeterministic: 'AI was not used. kuyara computed this outfit on your device.',
    askAgain: {
      action: 'Ask the stylist again',
      hint: 'Chooses a new outfit for the time you pick.',
      whenQuestion: 'When are you heading out?',
      now: 'Now',
      later: 'Later',
      chooseNow: 'Choose for now',
      chooseAt: (time) => `Choose for ${time}`,
      warning: (start, end) =>
        `kuyara will choose again for the weather between ${start} and ${end}. The outfits on screen will be replaced.`,
      warningOnDay: (day, start, end) =>
        `kuyara will choose again for the weather on ${day}, between ${start} and ${end}. The outfits on screen will be replaced.`,
    },
    coverage: {
      chosen: (start, end) => `Chosen for the weather between ${start} and ${end}.`,
      chosenOnDay: (day, start, end) => `Chosen for the weather on ${day}, between ${start} and ${end}.`,
      choosing: (start, end) => `Choosing for the weather between ${start} and ${end}…`,
      choosingOnDay: (day, start, end) => `Choosing for the weather on ${day}, between ${start} and ${end}…`,
    },
    drift: {
      rain: (time) => `This outfit wasn’t chosen for the rain after ${time}.`,
      snow: (time) => `This outfit wasn’t chosen for the snow after ${time}.`,
      cold: (time) => `This outfit wasn’t chosen for the cold after ${time}.`,
    },
    coolSpell: (time) => `Take a light layer for the cool spell around ${time}.`,
    otherOptionsHeading: 'Alternative outfits',
    tomorrow: {
      heading: 'Tomorrow',
      weather: ({ condition, minimum, maximum }) => `${condition}, ${minimum}\u00a0to\u00a0${maximum}`,
      range: ({ minimum, maximum }) => `${minimum}\u00a0to\u00a0${maximum}`,
      weatherAccessibilityLabel: ({ condition, minimum, maximum, unitName }) =>
        `${condition}. Low ${minimum} ${unitName}, high ${maximum} ${unitName}.`,
      stripAccessibilityLabel: ({ outfit, weather }) => `Tomorrow: ${outfit} ${weather}`,
      stripAccessibilityHint: 'Opens tomorrow’s outfit',
      recapAccessibilityLabel: ({ condition, minimum, maximum, unitName, rainProbability, coverageCaption }) =>
        `${condition}, ${minimum} to ${maximum} ${unitName}, ${rainProbability} percent chance of rain` +
        (coverageCaption ? `. ${coverageCaption}` : ''),
    },
    piecesHeading: 'Wear',
    reasonsHeading: 'Why it works',
    finishingTouchesHeading: 'Finishing touches',
    finishingTouchesAccessibilityLabel: (items) =>
      `Finishing touches: ${items.join(', ')}.`,
    finishingTouchesRowAccessibilityLabel: ({ item, slot }) => `${item}, ${slot}`,
    ownershipOwnedAction: 'I own it',
    ownershipWantedAction: 'I want it',
    ownershipUntrackedLabel: 'Not in your Closet',
    ownershipSimilarLabel: 'You have a similar one',
    ownershipYours: (color) => `Yours: ${color}`,
    ownershipOnBoard: {
      owned: 'In your\u00a0Closet',
      similar: 'Similar one in your\u00a0Closet',
      wanted: 'In your wanted\u00a0pieces',
    },
    boardHint: 'Tap a piece, then swipe to change it.',
    editPieceAccessibilityHint: 'Opens this piece in your Closet',
    manualMix: {
      change: 'Change',
      changeAccessibilityLabel: {
        primary_top: (piece) => `Change the top, now ${piece}`,
        bottom: (piece) => `Change the bottom, now ${piece}`,
        one_piece: (piece) => `Change the one-piece, now ${piece}`,
        mid_layer: (piece) => `Change the mid layer, now ${piece}`,
        outer_layer: (piece) => `Change the outer layer, now ${piece}`,
        footwear: (piece) => `Change the footwear, now ${piece}`,
      },
      changed: 'Changed',
      title: 'Your outfit',
      changedFrom: (archetype) => `Changed from ${archetype}`,
      unusual: 'Unusual for this weather',
      unusualAccessibilityLabel: 'Unusual for this weather. You can still wear this outfit and record it.',
      reset: 'Back to kuyara’s pick',
      pickerFits: 'Fits today’s weather',
      pickerOther: 'Other pieces',
      pickerOtherHint: 'These can make the outfit unusual for this weather.',
      pickerCurrent: 'Current',
      counter: (position, total) => `${position} / ${total}`,
      pieceValue: ({ piece, position, total }) => `${piece}, ${position} of ${total}`,
      stepUnusual: ({ piece, position, total }) =>
        `${piece}, ${position} of ${total}. Unusual for this weather. You can still wear this outfit and record it.`,
      done: 'Done',
      otherPieceHint: 'This piece can make the outfit unusual for this weather.',
      stripShown: 'The pieces you can choose are below.',
      sourceOne: {
        onDeviceAi: 'You changed a piece. kuyara chose the rest on your device with Apple Intelligence.',
        aiAssisted: 'You changed a piece. kuyara chose the rest with online AI.',
        deterministic: 'You changed a piece. kuyara computed the rest on your device.',
      },
      sourceMany: {
        onDeviceAi: 'You changed some pieces. kuyara chose the rest on your device with Apple Intelligence.',
        aiAssisted: 'You changed some pieces. kuyara chose the rest with online AI.',
        deterministic: 'You changed some pieces. kuyara computed the rest on your device.',
      },
    },
    share: { action: 'Share outfit', brandName: 'kuyara' },
    wornAction: 'Wore this today',
    wornToday: 'Worn today',
    wornSaveError: 'Today’s look could not be saved. Try again.',
    wornReplaceTitle: 'Replace today’s look?',
    wornReplaceBody: 'Only one look can be saved for a day. This replaces the look you recorded earlier today.',
    wornReplaceConfirm: 'Replace look',
    wornReplaceCancel: 'Cancel',
    slots: {
      primary_top: 'Top',
      bottom: 'Bottom',
      one_piece: 'One-piece',
      mid_layer: 'Mid layer',
      outer_layer: 'Outer layer',
      footwear: 'Footwear',
      head: 'Head',
      neck: 'Neck',
      hands: 'Hands',
      handheld: 'Carry',
    },
    requirementNames: {
      thermal: 'Warmth',
      breathability: 'Breathability',
      arm_coverage: 'Arm coverage',
      leg_coverage: 'Leg coverage',
      body_water_protection: 'Body water protection',
      footwear_water_protection: 'Footwear water protection',
      wind_protection: 'Wind protection',
      traction: 'Traction',
    },
    requirementRow: ({ requirement, garments }) =>
      `${requirement}: ${garments.join(', ')}.`,
    requirementTradeoffRow: ({ requirement, garments }) =>
      `Trade-off (${requirement}): ${garments.join(', ')}.`,
    requirementReasons: {
      temperature_low: 'The temperature calls for warmth.',
      apparent_temperature_low: 'It feels cold enough to require insulation.',
      temperature_high: 'High temperatures require breathable clothing.',
      apparent_temperature_high: 'It feels hot enough to require breathable clothing.',
      daily_range_wide: 'A wide temperature range calls for adjustable layers.',
      daily_extrema_fallback: 'The daily temperature range is based on current conditions.',
      wind_elevated: 'Elevated wind calls for wind protection.',
      wind_strong: 'Strong wind requires wind protection.',
      precipitation_possible: 'Possible precipitation calls for water protection.',
      precipitation_likely: 'Likely precipitation requires water protection.',
      condition_drizzle: 'Drizzle calls for light water protection.',
      condition_rain: 'Rain requires water protection.',
      condition_heavy_rain: 'Heavy rain requires waterproof protection.',
      condition_sleet: 'Sleet requires warmth, water protection, and traction.',
      condition_snow: 'Snow requires warmth, water protection, and traction.',
      condition_thunderstorm: 'Thunderstorms require water protection and traction.',
    },
    compositionReasons: {
      breathability_protection_tradeoff: 'Protection is prioritized over breathability.',
      thermal_over_protection: 'This outfit carries more warmth than the day calls for.',
      unnecessary_water_protection: 'This outfit includes more water protection than required.',
    },
    mildWeatherRationale: 'Nothing in the weather ahead asks for special protection.',
    dayInsight: {
      sentences: {
      clear_day: 'Sunny all day.',
      clear_day_hot: 'Sunny all day and hot.',
      clear_day_veryHot: 'Sunny all day but very hot.',
      clear_day_chilly: 'Sunny all day and chilly.',
      clear_day_freezing: 'Sunny all day but freezing.',
      clear_evening: 'Clear all evening.',
      clear_evening_hot: 'Clear all evening and hot.',
      clear_evening_veryHot: 'Clear all evening but very hot.',
      clear_evening_chilly: 'Clear all evening and chilly.',
      clear_evening_freezing: 'Clear all evening but freezing.',
      cloudy_day: 'Cloudy all day.',
      cloudy_day_hot: 'Cloudy all day and hot.',
      cloudy_day_veryHot: 'Cloudy all day but very hot.',
      cloudy_day_chilly: 'Cloudy all day and chilly.',
      cloudy_day_freezing: 'Cloudy all day but freezing.',
      cloudy_evening: 'Cloudy all evening.',
      cloudy_evening_hot: 'Cloudy all evening and hot.',
      cloudy_evening_veryHot: 'Cloudy all evening but very hot.',
      cloudy_evening_chilly: 'Cloudy all evening and chilly.',
      cloudy_evening_freezing: 'Cloudy all evening but freezing.',
      foggy_day: 'Foggy all day.',
      foggy_day_hot: 'Foggy all day and hot.',
      foggy_day_veryHot: 'Foggy all day but very hot.',
      foggy_day_chilly: 'Foggy all day and chilly.',
      foggy_day_freezing: 'Foggy all day but freezing.',
      foggy_evening: 'Foggy all evening.',
      foggy_evening_hot: 'Foggy all evening and hot.',
      foggy_evening_veryHot: 'Foggy all evening but very hot.',
      foggy_evening_chilly: 'Foggy all evening and chilly.',
      foggy_evening_freezing: 'Foggy all evening but freezing.',
      rain_day: 'Rainy all day.',
      rain_evening: 'Rainy all evening.',
      snow_day: 'Snowy all day.',
      snow_evening: 'Snowy all evening.',
      windy: 'It stays windy.',
      veryWindy: 'It stays very windy.',
      },
      rainFromUntil: ({ from, until }) => `Rain from ${from}, easing around ${until}.`,
      rainFrom: (from: string) => `Rain from ${from} onward.`,
      rainUntil: (until: string) => `Rain easing around ${until}.`,
      snowFromUntil: ({ from, until }) => `Snow from ${from}, easing around ${until}.`,
      snowFrom: (from: string) => `Snow from ${from} onward.`,
      snowUntil: (until: string) => `Snow easing around ${until}.`,
      hot: (time: string) => `It gets hot around ${time}.`,
      veryHot: (time: string) => `It gets very hot around ${time}.`,
      chilly: (time: string) => `It turns chilly around ${time}.`,
      freezing: (time: string) => `It turns freezing around ${time}.`,
    },
    updatedAt: (time: string) => `Last updated at ${time}`,
    staleAt: (time: string) => `Last updated at ${time} · May be out of date`,
    refreshingStatus: 'Refreshing today’s guidance…',
    refreshFailedAt: (time: string) => `Couldn't refresh · Showing last update from ${time}`,
    refreshAction: 'Refresh',
    apparentTemperature: (temperature: string) => `Feels like ${temperature}`,
    temperatureRange: (minimum: string, maximum: string) => `Low ${minimum} · High ${maximum}`,
    rainProbability: (probability: string) => `${probability} chance of rain`,
    optionPosition: (position: number, total: number) => `Option ${position} of ${total}`,
    loadingTitle: 'Preparing today’s guidance',
    loadingBody: 'Your weather summary and outfit options will appear here.',
    loadingAccessibilityLabel: 'Preparing today’s guidance. Content is loading.',
    generatingStatus: 'Choosing today’s outfits.',
    generatingLongWaitStatus: 'Choosing today’s outfits. This can take a little longer.',
    loading: {
      heading: 'Putting your outfit together.',
      phase: 'Finding pieces that work together.',
      tip: 'Your outfit options respond to today’s weather.',
      progress: {
        waiting: 'Choosing your outfit.',
        dressing: 'Your outfit is chosen. Adding its pieces and colors.',
        done: 'Your outfit is ready.',
      },
      chosen: 'Your outfit is chosen.',
      keepWaiting: 'Keep waiting',
      skipWait: 'Skip the wait',
      allSet: 'All set',
    },
    phase: {
      'checking-on-device': 'Checking the on-device AI.',
      'asking-stylist': 'Asking the AI stylist.',
      'answer-received': 'AI answered. Checking the picks.',
      'preparing-outfits': 'Preparing your outfits.',
      'using-standard': 'AI did not answer. Using standard suggestions.',
    },
    unavailableTitle: 'Today’s guidance is unavailable',
    unavailableBody: 'There is no saved guidance to show right now.',
    noLocationTitle: 'kuyara doesn’t know where you are yet',
    noLocationBody: 'Choose your device location or search for a city to see today’s weather and outfit suggestions.',
    chooseLocationAction: 'Choose a location',
    noOutfitTitle: 'Outfit unavailable',
    noOutfitBody: 'No complete outfit can be recommended for these conditions.',
    weatherAccessibilityLabel: ({
      condition,
      current,
      apparent,
      minimum,
      maximum,
      rainProbability,
      unitName,
    }) =>
      `${condition}. ${current} ${unitName}, feels like ${apparent} ${unitName}. ` +
      `Low ${minimum} ${unitName}, high ${maximum} ${unitName}. ${rainProbability} percent chance of rain.`,
    titleAccessibilityLabel: ({ temperature, unitName, condition }) =>
      `Today, ${temperature} ${unitName}, ${condition}`,
    weatherRecapAccessibilityLabel: ({ temperature, unitName, condition, rainProbability, coverageCaption }) =>
      `${temperature} ${unitName}, ${condition}, ${rainProbability} percent chance of rain` +
      (coverageCaption ? `. ${coverageCaption}` : ''),
    boardAccessibilityLabel: ({ archetype, pieces }) => `${archetype}. ${pieces.join(', ')}.`,
    stageAccessibilityLabel: ({ temperature, unitName, condition, pieces, archetype }) =>
      `${temperature} ${unitName}. ${condition}. ${pieces.join(', ')}. ${archetype}.`,
    outfitAccessibilityLabel: ({
      position,
      total,
      archetype,
      pieces,
      reasons,
    }) => {
      return [
        `Option ${position} of ${total}.`,
        `${archetype}.`,
        ...pieces.map(({ slot, item }) => `${slot}: ${item}.`),
        reasons.length > 0 ? `Why it works: ${reasons.join(' ')}` : null,
      ].filter(Boolean).join(' ');
    },
  },
  walkthrough: {
    name: 'Get to know kuyara step by step',
    counter: (step: number, total: number) => `Step ${step} of ${total}`,
    skip: 'Skip',
    targetHint: 'Tour. Opens the next step.',
    steps: {
      outfit: {
        title: 'Your outfit for today',
        body: 'kuyara chose it for today’s weather. The badge under the title shows that AI helped choose it. Tap the outfit to see its pieces.',
        bodyNoBadge: 'kuyara chose it for today’s weather. Tap the outfit to see its pieces.',
      },
      piece: {
        title: 'Every piece by name',
        body: (piece: string) => `Each piece has its name beside it. Tap ${piece} to see it on its own.`,
      },
      sheet: {
        title: 'Mark what you own or want',
        body: 'Under “Is it yours?”, choose “I own it” or “I want it”, then Done, and the piece joins your Closet. For now, close this sheet.',
      },
      worn: {
        title: 'On the day you wear it',
        body: 'When you wear this outfit, tap “Wore this today”. History then lists it under that day. You do not need to tap it now.',
      },
      back: {
        title: 'Back to Today',
        body: 'Tap Today in the corner to go back.',
      },
      again: {
        title: 'If your day changes',
        body: 'Each morning and evening, kuyara asks whether your day is casual, smart or formal. If your plans change during the day, tap “Ask the stylist again”.',
      },
      profileTab: {
        title: 'Your Closet and History',
        body: 'Both are on the Profile tab. Tap Profile.',
      },
      closet: {
        title: 'Your Closet',
        body: 'The pieces you mark hang on this rack. The ones you want have a dashed outline.',
      },
      history: {
        body: 'The outfits you wore are listed here by day. To see this tour again, open Settings and find it under Help.',
      },
    },
  },
  account: {
    card: {
      title: 'Complete your profile',
      body: 'Sign in to take your Closet and History to a new phone.',
      action: 'Continue',
      dismiss: 'Don’t show again',
    },
    signIn: {
      close: 'Close',
      title: 'Complete your profile',
      benefits: [
        'Your Closet and History come with you to a new phone.',
        'If you reinstall kuyara, you pick up where you left off.',
        'Everything works the same without an account.',
      ],
      continueWith: { apple: 'Continue with Apple', google: 'Continue with Google' },
      notNow: 'Not now',
      footer: 'Signing in adds your Closet, History and style preferences to your account. Your birth date is not added.',
      privacy: 'Privacy policy',
      cancelled: 'Sign-in was cancelled. Choose a way to sign in when you are ready.',
      offline: 'You are offline. You can sign in once you are connected.',
      failed: {
        apple: 'Apple could not complete the sign-in. Try again in a moment, or continue with Google.',
        google: 'Google could not complete the sign-in. Try again in a moment, or continue with Apple.',
      },
    },
    welcome: {
      title: 'You’re signed in',
      summary: (pieces: number, days: number) =>
        `${enPieces(pieces)} from your Closet and ${enDays(days)} of History are now in your account.`,
      done: 'Done',
    },
    method: { apple: 'Using Sign in with Apple', google: 'Using Sign in with Google' },
    settings: {
      group: 'Account',
      signIn: 'Sign in',
      signedOutFooter: 'Take your Closet and History to a new phone.',
      signedIn: { apple: 'Signed in with Apple', google: 'Signed in with Google' },
      deleted: 'Your account is deleted. What you see in kuyara stays.',
      signedOut: 'You are signed out. Your Closet and History stay in kuyara.',
    },
    sync: {
      heading: 'Sync',
      upToDate: 'Up to date',
      offline: 'Offline',
      syncing: 'Syncing',
      failed: 'Couldn’t sync',
      restoring: 'Restoring',
      offlineWaiting: (pending: number) => (pending > 0 ? `Offline · ${pending} waiting` : 'Offline'),
      waiting: (pending: number) => `${pending} waiting`,
      syncingCount: (pending: number) => `${pending} syncing`,
      restoringCount: (done: number, total: number) => `${done} of ${total}`,
      syncNow: 'Sync now',
      retry: 'Try again',
      upToDateFooter: (time: string) => `Last synced at ${time}. Your birth date is not added to your account.`,
      offlineFooter: (pending: number, time: string) => (pending > 0
        ? `You have ${enChanges(pending)} waiting. ${pending === 1 ? 'It syncs' : 'They sync'} when you are back online. Last synced at ${time}.`
        : `kuyara syncs when you are back online. Last synced at ${time}.`),
      syncingFooter: (pending: number, time: string) => (pending > 0
        ? `Syncing ${enChanges(pending)}. Last synced at ${time}.`
        : `Last synced at ${time}.`),
      failedFooter: (pending: number, time: string) => (pending > 0
        ? `kuyara could not reach your account. Your ${enChanges(pending)} ${pending === 1 ? 'is kept and syncs' : 'are kept and sync'} on the next try. Last synced at ${time}.`
        : `kuyara could not reach your account. Last synced at ${time}.`),
      restoringFooter: (counts: RestoreCounts) =>
        `kuyara is bringing back your Closet and History. ${enRestoreCount(counts)}`,
      pausedFooter: (counts: RestoreCounts) =>
        `${enRestoreCount(counts)} The rest come back when you are online.`,
    },
    account: {
      title: 'Account',
      closet: 'Closet',
      pieces: enPieces,
      history: 'History',
      days: enDays,
      preferences: 'Style preferences',
      included: 'Included',
      methodsHeading: 'Sign-in methods',
      providerName: { apple: 'Apple', google: 'Google' },
      connected: 'Connected',
      add: { apple: 'Add Apple', google: 'Add Google' },
      methodsFooter: 'Add a second way to sign in to the same account.',
      signOut: 'Sign out',
      delete: 'Delete account',
      deleteFooter: 'Deletes your account and everything saved to it.',
    },
    signOutAlert: {
      title: 'Sign out?',
      body: 'Your Closet and History stay in kuyara. Sign in again to sync them.',
      cancel: 'Cancel',
      confirm: 'Sign out',
    },
    deletion: {
      title: 'Delete account',
      goneHeading: 'What is deleted',
      goneAccount: {
        apple: 'Your account and your sign-in with Apple',
        google: 'Your account and your sign-in with Google',
      },
      goneData: 'Your Closet, History and preferences saved to your account',
      stayHeading: 'What stays',
      stay: 'What you see in kuyara now stays, and kuyara keeps working without an account.',
      footer: {
        apple: 'Deleting takes up to a minute. kuyara tells you when it is done. You confirm with Apple before anything is deleted.',
        google: 'Deleting takes up to a minute. kuyara tells you when it is done. You confirm with Google before anything is deleted.',
      },
      action: 'Delete account',
      deleting: 'Deleting your account. This can take up to a minute.',
      failed: 'kuyara could not delete your account. Nothing was deleted. Try again.',
      offline: 'You are offline. You can delete your account once you are connected.',
    },
    deleteAlert: {
      title: 'Delete your account?',
      body: 'This can’t be undone.',
      cancel: 'Cancel',
      confirm: 'Delete',
    },
    restore: {
      progressTitle: 'Bringing back your Closet and History',
      progressBody: 'You’re signed in. You can keep using kuyara meanwhile.',
      progressCount: enRestoreCount,
      progressKeep: 'Continue closes this sheet, and bringing them back keeps going.',
      progressAction: 'Continue',
      doneTitle: 'Your Closet and History are back',
      doneBody: (pieces: number, days: number) => `${enPieces(pieces)} and ${enDays(days)} of History are back in kuyara.`,
      doneProfile: 'Your name, gender, dress style and style preferences come from your account.',
      done: 'Done',
    },
    deleted: {
      title: 'Your account is deleted',
      gone: {
        apple: 'Everything saved to your account is deleted, and your sign-in with Apple is disconnected.',
        google: 'Everything saved to your account is deleted, and your sign-in with Google is disconnected.',
      },
      stay: 'What you see in kuyara stays, and kuyara keeps working without an account.',
      done: 'Done',
    },
  },
} satisfies AppMessages;

const tr = {
  temperatureUnitNames: { celsius: 'santigrat derece', fahrenheit: 'fahrenhayt derece' },
  catalog: catalogMessages.tr,
  recommendation: recommendationMessages.tr,
  common: {
    back: 'Geri',
    continue: 'Devam et',
    negativeTemperatureRange: (low, high) => `${low} ile ${high}`,
  },
  navigation: {
    today: 'Bugün',
    weather: 'Hava',
    profile: 'Profil',
  },
  bootstrap: {
    loadingTitle: 'kuyara hazırlanıyor',
    loadingBody: 'Tercihlerin yükleniyor.',
    errorTitle: 'kuyara başlatılamadı',
    errorBody: 'Verilerin güvende.',
    errorReasonBodies: {
      'database-open': 'Veri tabanı açılamadı.',
      migration: 'Verilerin bu sürüme güncellenemedi.',
      'profile-load': 'Profilin okunamadı.',
    },
    retryAction: 'Yeniden dene',
    reportAction: 'Sorun bildir',
  },
  onboarding: {
    stepPosition: (position: number, total: number) => `${total} adımdan ${position}. adım`,
    nameTitle: 'Sana nasıl hitap edelim?',
    nameBody: 'İsteğe bağlı. Adını daha sonra Ayarlar’dan ekleyebilir veya değiştirebilirsin.',
    namePlaceholder: 'Adın',
    nameShortError: 'En az 2 karakter yaz veya Şimdi değil seçeneğini kullan.',
    nameLongError: 'En fazla 30 karakter kullan.',
    nameNotNow: 'Şimdi değil',
    welcomeTitle: 'kuyara’ya hoş geldin',
    welcomeBody: 'Hava durumuna göre her gün ne giyeceğine sakince karar vermenin yolu.',
    welcomePreviewTitle: (temperature) => `Bugün · ${temperature} · Bulutlu`,
    welcomePreviewCaption: 'Her sabah: günün havasına göre bir kombin.',
    nameGreetingEmpty: 'Hoş geldin',
    nameGreetingCaption: 'Adın Bugün ekranında burada görünür.',
    genderTitle: 'Cinsiyetin',
    genderBody: 'kuyara bunu kombin önerilerinin geldiği kataloğu seçmek için kullanır. Daha sonra Ayarlar’dan değiştirebilirsin.',
    dressStyleTitle: 'Genelde nasıl giyinirsin?',
    dressStyleBody: 'Çoğu gün giydiğin görünümü seç. Öneriler önce bu stile göre sıralanır, hiçbir kombin dışarıda kalmaz. Daha sonra Ayarlar’dan değiştirebilirsin.',
    dressStyleRequiredError: 'Devam etmek için giyim stilini seç.',
    stylePreferencesTitle: 'Hangi stiller sana yakın?',
    stylePreferencesBody: 'İsteğe bağlı. En fazla üç stil seç. Bu seçimler kombinleri elemeden öneri sırasını etkiler.',
    birthDateTitle: 'Doğum tarihin',
    birthDateBody: 'İsteğe bağlı. kuyara’yı kimlerin kullandığını anlamamıza yardımcı olur. Önerilerini değiştirmez.',
    birthDateNotSet: 'Ayarlanmadı',
    birthDateClearAction: 'Doğum tarihini kaldır',
    locationTitle: 'Konumunu ayarla',
    locationBody: 'kuyara’nın kombin önerileri için hava durumunu bulabilmesi adına cihaz konumunu kullan veya bir şehir ara. Bunu daha sonra da yapabilirsin.',
    completeAction: 'kuyara’yı kullanmaya başla',
    locationSkipAction: 'Konum olmadan devam et',
    genderRequiredError: 'Devam etmek için cinsiyetini seç.',
    saveError: 'Seçimlerin kaydedilemedi. Lütfen yeniden dene.',
  },
  preferences: {
    stylePreferencesTitle: 'Stil tercihleri',
    stylePreferencesBody: 'En fazla üç stil seç.',
    stylePreferencesNone: 'Seçim yok',
    stylePreferencesDone: 'Bitti',
    stylePreferencesLimit: 'En fazla üç stil seçebilirsin.',
    styleAestheticMinimal: 'Minimal',
    styleAestheticClassic: 'Klasik',
    styleAestheticSporty: 'Sportif',
    styleAestheticStreetwear: 'Sokak stili',
    styleAestheticRelaxed: 'Serbest',
    morningQuestionTitle: 'Sabah sorusu',
    genderTitle: 'Cinsiyet',
    genderWoman: 'Kadın',
    genderMan: 'Erkek',
    dressStyleTitle: 'Giyim stili',
    dressStyleCasual: 'Rahat',
    dressStyleSmart: 'Şık',
    dressStyleFormal: 'Resmî',
    birthDateTitle: 'Doğum tarihi',
    languageTitle: 'Dil',
    languageSystem: 'Sistem',
    languageTurkish: 'Türkçe',
    languageEnglish: 'English',
    themeSystem: 'Sistem',
    themeLight: 'Açık',
    themeDark: 'Koyu',
  },
  settings: {
    title: 'Ayarlar',
    appearanceHeading: 'Görünüm',
    notificationsHeading: 'Bildirimler',
    profileHeading: 'Profil',
    helpHeading: 'Yardım',
    aboutHeading: 'Hakkında',
    accessibilityHeading: 'Erişilebilirlik',
    easierToSee: {
      title: 'Görme kolaylığı',
      on: 'Açık',
      off: 'Kapalı',
      footer: 'Yazıyı kalınlaştırır, kontrastı artırır, düğmelerin kenarlarını belirginleştirir, kıyafet çizimlerini ve düğmeleri büyütür.',
      previewHeading: 'Önizleme',
      previewLabelOff: 'Görme kolaylığı kapalıyken Bugün ekranının önizlemesi.',
      previewLabelOn: 'Görme kolaylığı açıkken Bugün ekranının önizlemesi.',
      previewOutfitName: 'Katmanlı Sıcaklık',
      systemHeading: 'kuyara’nın izlediği iPhone ayarları',
      systemFooter: 'Bunları iPhone’daki Ayarlar uygulamasında, Erişilebilirlik, Ekran ve Metin Puntosu bölümünde değiştirebilirsin. Kalın Metin ya da Kontrastı Artır açıksa, Görme kolaylığı kapalıyken de kuyara bu ayara uyar.',
      largerText: 'Daha Büyük Metin',
      boldText: 'Kalın Metin',
      increaseContrast: 'Kontrastı Artır',
      textSizeDefault: 'Varsayılan',
      textSizeLarger: 'Büyük',
      textSizeSmaller: 'Küçük',
    },
    themeRow: 'Tema',
    versionLine: (version: string, build?: string | null) => build ? `Sürüm ${version} (${build})` : `Sürüm ${version}`,
    developmentBuild: 'Geliştirme derlemesi',
    supportRow: 'Destek',
    shareRow: 'kuyara’yı paylaş',
    shareText: 'Günlük kombinimi seçerken kuyara bana yardımcı oluyor. Sen de göz at.',
    rateRow: 'kuyara’yı değerlendir',
    licenceRow: 'Lisans',
    serviceProvidersHeading: 'Servis sağlayıcıları',
    artificialIntelligenceHeading: 'Yapay zekâ',
    weatherDataHeading: 'Hava durumu verisi',
    weatherNoSnapshot: 'Kaynaklar ilk hava güncellemesinden sonra burada görünür.',
    weatherFooter: 'Son hava durumunun geldiği yer.',
    aiStatusIntro: 'Kısa bir istek gönderir. Kombinin değişmez.',
    aiStatusProvenanceFooter: 'kuyara önce Apple Intelligence’a sorar. Zamanında yanıt alamazsa çevrimiçi yapay zekâya sorar, o da olmazsa standart önerilerini kullanır. Apple Intelligence, Apple Inc.’in ticari markasıdır.',
    aiStatusOnDeviceRunning: 'Apple Intelligence açık ve hazır.',
    aiStatusOnDeviceOff: 'Apple Intelligence kapalı.',
    aiStatusOnDeviceIncompatible: 'Bu cihaz Apple Intelligence’ı desteklemiyor.',
    aiStatusOnDeviceGettingReady: 'Apple Intelligence hazırlanıyor.',
    aiStatusAssistant: (provider: string, model: string) =>
      `Yanıtlayan: ${provider} (${model})`,
    aiStatusLastOnDeviceAi: 'kuyara son kombinini Apple Intelligence ile seçti.',
    aiStatusLastAiAssisted: 'kuyara son kombinini çevrimiçi yapay zekâ ile seçti.',
    aiStatusLastStandard: 'kuyara son kombinini standart önerilerinden seçti.',
    aiStatusLastUnknown: 'Henüz bir kombin seçilmedi.',
    aiStatusCheckAction: 'Çevrimiçi yapay zekâyı dene',
    aiStatusChecking: 'Çevrimiçi yapay zekâ deneniyor…',
    aiStatusResultOk: (time: string) => `Çevrimiçi yapay zekâ yanıt verdi (${time}).`,
    aiStatusResultUnavailable: 'Çevrimiçi yapay zekâ bu sefer yanıt vermedi.',
    aiStatusResultRateLimited: 'Az önce denendi. Birkaç dakika sonra yeniden dene.',
    aiStatusResultError: 'Deneme yapılamadı. Daha sonra yeniden dene.',
    aiStatusUnsupported: 'Bu sürüm denemeyi yapamıyor.',
    saving: 'Değişiklikler kaydediliyor…',
    saveError: 'Bu değişiklik kaydedilemedi. Önceki ayarın kullanılmaya devam ediyor.',
  },
  analytics: {
    consentTitle: "kuyara'yı geliştirmeye yardım et",
    consentBody: "kuyara'yı nasıl kullandığını, uygulama hatalarını ve performans verilerini paylaşman uygulamayı geliştirmemize yardımcı olur. Buna kullandığın ekranlar, önerilerin yüklenip yüklenmediği, gardırobuna eklediğin kıyafet türleri ve giyim stili ile yaş aralığı gibi genel ayarlar dahildir. Konumun, fotoğrafların, adın, gardırobundaki parçaların adları ve renkleri hiçbir zaman dahil edilmez.",
    consentSettingsBody: "Bunu istediğin zaman Ayarlar'daki Gizlilik bölümünden değiştirebilirsin.",
    acceptAction: 'Yardım et',
    declineAction: 'Şimdi değil',
    privacyTitle: 'Gizlilik',
    shareUsageData: 'Kullanım ve tanılama verisi paylaş',
    toggleFooter: "Kullanım, hata ve performans verilerini paylaşmak kuyara'yı geliştirmeye yardımcı olur. Kapatmak bu anahtarın yönettiği paylaşımı durdurur ve bu cihazın analitik kimliğini siler. Gizlilik politikasında anlatılan açılış sayımı ve güncelleme kontrolü yine de çalışır.",
    withdrawFailed: 'Paylaşım tamamen kapatılamadı. Yeniden dene.',
    withdrawIncomplete: 'Paylaşımı kapatma seçimin kaydedildi, ancak temizleme tamamlanamadı. Yeniden dene.',
    grantFailed: 'Paylaşım açılamadı. Yeniden dene.',
    grantIncomplete: 'Paylaşma seçimin kaydedildi, ancak işlem tamamlanamadı. Bazı veriler paylaşılabilir. Yeniden dene.',
    retryGrant: 'Paylaşımı yeniden dene',
    retryWithdraw: 'Kapatmayı yeniden dene',
    identifierLabel: 'Analitik kimliği',
    identifierFooter: 'Verilerinle ilgili bir talepte bu kimliği belirtebilirsin.',
    privacyPolicyLabel: 'Gizlilik politikası',
  },
  profile: {
    title: 'Profil',
    nameLabel: 'Ad',
    nameDone: 'Bitti',
    nameClear: 'Adı temizle',
    nameSaveError: 'Bu değişiklik kaydedilemedi. Önceki adın kullanılmaya devam ediyor.',
    nameCancel: 'Vazgeç',
    nameRemove: 'Adı kaldır',
    settingsAction: 'Ayarlar',
    settingsHint: 'Uygulama ayarlarını açar.',
    wardrobeTitle: 'Gardırop',
    wardrobeTitleNamed: (name) => `Gardırop · ${name}`,
    closetHeadingAccessibilityLabel: ({ count }) => `Gardırop, ${count} parça.`,
    closetHeadingNamedAccessibilityLabel: ({ name, count }) => `Gardırop · ${name}, ${count} parça.`,
    closetHeadingHint: 'Gardırobunu açar.',
    wantedLabel: 'İstekler',
    historyLabel: 'Geçmiş',
    historyIntro: 'Giymeyi seçtiğin kombinler.',
    historyEmptyTitle: 'Henüz giyilen kombin yok',
    historyEmptyBody: 'Bir kombini giydiğinde, Bugün ekranından açıp “Bugün bunu giydim” düğmesine dokun. Burada o günün altında görünür.',
    historyLoadError: 'Geçmiş yüklenemedi. Biraz sonra yeniden dene.',
    wardrobeEmpty: 'Sahip olduğun ya da istediğin parçaları ekle.',
    addPieceAction: 'Parça ekle',
    rackAccessibilityLabel: ({ title, count, categories }) =>
      `${title}, ${count} parça`
      + (categories.length > 0
        ? `: ${categories.map(({ label, count: n }) => `${label} ${n}`).join(', ')}.`
        : '.'),
  },
  notifications: {
    title: 'Bildirimler',
    introduction: 'kuyara bu cihazda, önündeki saatler için hava uyarıları gönderir.',
    leadTimeHint: 'Uyarı, yağmur başlamadan ya da sıcaklık sert değişmeden en çok bir saat önce gelir.',
    quietHoursHint: ({ start, end }) => `${start} ile ${end} arasında uyarı gönderilmez.`,
    toggleLabel: 'Bildirimlere izin ver',
    statusOn: 'Açık',
    statusOff: 'Kapalı',
    permissionDeniedHint: 'Bildirimler sistem ayarlarında kapalı.',
    openSettingsAction: 'Ayarları aç',
    offer: {
      sentences: {
        precipitation_onset: 'kuyara bugün yağış başlamadan seni uyarabilirdi.',
        temperature_swing: 'kuyara bugün sıcaklık sert değişmeden seni uyarabilirdi.',
      },
      morningBriefingSentence: (time) => `kuyara sabahları bir brifing (saat ${time}), gün içinde hava değişmeden de bir uyarı gönderebilir.`,
      acceptAction: 'Bildirimleri aç',
      dismissAction: 'Şimdi değil',
    },
    morningBriefing: {
      toggleLabel: 'Sabah brifingi',
      hint: (time) => `Yarın sabah tahminde yer aldığında, günün sıcaklık aralığını ve en önemli hava değişimini anlatan tek bir bildirim (saat ${time}).`,
      title: 'Günaydın',
      fullRange: (range) => `Bugün ${range}.`,
      partialRange: ({ range, through }) => `${through} saatine kadar: ${range}.`,
      clearMorning: 'Sabah hava açık.',
      cloudyMorning: 'Sabah hava bulutlu.',
      wetMorning: 'Sabah yağış bekleniyor.',
      rainStarting: (time) => `Yağmur saat ${time} civarında başlıyor.`,
      snowStarting: (time) => `Kar saat ${time} civarında başlıyor.`,
      rainEasing: (time) => `Yağmur saat ${time} civarında hafifliyor.`,
      snowEasing: (time) => `Kar saat ${time} civarında hafifliyor.`,
      temperatureDrop: ({ time, temperature }) => `Saat ${time} civarında hava soğuyor, hissedilen ${temperature}.`,
      temperatureRise: ({ time, temperature }) => `Saat ${time} civarında hava ısınıyor, hissedilen ${temperature}.`,
    },
    alerts: {
      rainTitle: 'Yağmur geliyor',
      rainBody: (time) => `Saat ${time} civarında yağmur bekleniyor. Yanına su geçirmez bir parça al.`,
      snowTitle: 'Kar geliyor',
      snowBody: (time) => `Saat ${time} civarında kar bekleniyor. Yanına sıcak tutan, su geçirmez bir kat al.`,
      dropTitle: 'Hava daha soğuk hissedilecek',
      dropBody: ({ time, temperature }) =>
        `Saat ${time} civarında hissedilen sıcaklık ${temperature} olacak. Yanına daha sıcak tutan bir kat al.`,
      riseTitle: 'Hava daha sıcak hissedilecek',
      riseBody: ({ time, temperature }) =>
        `Saat ${time} civarında hissedilen sıcaklık ${temperature} olacak. Daha hafif bir kat seç.`,
    },
  },
  weather: {
    title: 'Hava',
    introduction: 'Bugünün hava durumu için tek bir etkin konum seç.',
    noLocation: 'Henüz konum seçilmedi.',
    currentLocation: 'Mevcut konum',
    approximateLocation: 'Yaklaşık konum',
    fullLocation: 'Kesin konum',
    locationAccessOff: 'Konum erişimi kapalı. Son bilinen yer gösteriliyor.',
    useCurrentLocation: 'Mevcut konumumu kullan',
    changeLocationAction: 'Değiştir',
    locationRationaleTitle: 'Konumun hava durumu için kullanılsın mı?',
    locationRationaleBody: 'kuyara, kombin önerileri için hava durumunu bulmak üzere uygulamayı kullanırken yaklaşık konumunu kullanır.',
    continuePermission: 'Devam et',
    cancel: 'Şimdi değil',
    lookupFailedBody: 'Konumun bulunamadı. Önceki konumun değiştirilmedi.',
    selectionFailedBody: 'Bu konum kaydedilemedi. Önceki konumun etkin kalıyor.',
    openSettings: 'Sistem ayarlarını aç',
    sampleDisclosure: 'Örnek hava durumu verisi, canlı değildir.',
    hourlyHeading: 'Önümüzdeki saatler',
    hourlyNow: 'Şimdi',
    noSnapshot: 'Bir konum seçildiğinde hava durumu burada görünecek.',
    loadErrorTitle: 'Hava durumu hazırlanamadı',
    loadErrorBody: 'Kayıtlı verilerin güvende. Lütfen yeniden dene.',
    retry: 'Yeniden dene',
    refresh: 'Yenile',
    refreshAccessibilityLabel: 'Hava durumunu yenile',
    refreshing: 'Hava durumu yenileniyor…',
    refreshFailed: 'Yenilenemedi',
    loading: 'Hava durumu yükleniyor…',
    offlineTitle: 'Çevrimdışı görünüyorsun',
    offlineBody: 'İnternete bağlanıp hava durumunu yeniden yüklemeyi dene.',
    offlineNotice: 'Çevrimdışısın. Son eşleşen hava durumu gösterilmeye devam ediyor.',
    unavailableTitle: 'Hava durumu geçici olarak kullanılamıyor',
    unavailableBody: 'Hava durumu servisi geçerli veri sağlayamadı. Lütfen yeniden dene.',
    unavailableNotice: 'Hava durumu geçici olarak kullanılamıyor. Son eşleşen hava durumu gösterilmeye devam ediyor.',
    rateLimitedTitle: 'Hava durumu güncellemeleri kısa süreliğine durduruldu',
    rateLimitedBody: 'Şu anda çok fazla hava durumu isteği var. Lütfen kısa süre sonra yeniden dene.',
    rateLimitedNotice: 'Hava durumu güncellemeleri kısa süreliğine durduruldu. Son eşleşen hava durumu gösterilmeye devam ediyor.',
    attributionOpenMeteo: 'Hava durumu verisi: Open-Meteo.com (CC BY 4.0)',
    attributionOpenWeather: 'Hava durumu verisi: OpenWeather (ODbL)',
    attributionAppleWeather: 'Hava durumu verisi: Apple Weather',
    attributionHint: (host) => `${host} adresini açar`,
    placeSearchTitle: 'Konum',
    placeSearchLabel: 'Şehir ara',
    placeSearchPlaceholder: 'Şehir ara',
    placeSearchLoading: 'Yerler aranıyor…',
    placeSearchEmpty: 'Eşleşen yer bulunamadı. Başka bir şehir adı dene.',
    placeSearchAttribution: 'Yer verileri: Open-Meteo ve GeoNames',
    placeSearchResultLabel: (name, region) => `${name}, ${region}`,
    placeSearchErrors: {
      'invalid-input': '2 ile 100 karakter arasında bir şehir adı yaz.',
      'invalid-response': 'Arama sonuçları yüklenemedi. Tekrar dene.',
      unavailable: 'Yer araması şu anda kullanılamıyor. Daha sonra tekrar dene.',
      'rate-limited': 'Çok fazla arama yapıldı. Biraz bekleyip tekrar dene.',
    },
    placeDeniedBody: 'Konum erişimine izin verilmedi. Bir şehir ara veya daha sonra tekrar dene.',
    placePermanentDeniedBody: 'Konum izni buradan tekrar istenemiyor. Sistem ayarlarını aç veya bir şehir ara.',
    placeServicesUnavailableBody: 'Konum servisleri kullanılamıyor veya kapalı. Bir şehir ara veya servisleri açıp tekrar dene.',
    fresh: 'Güncel',
    stale: 'Güncelliğini yitirmiş olabilir',
    updatedAt: (time) => `Son güncelleme ${time}`,
    feelsLike: (temperature) => `Hissedilen\u00a0${temperature}`,
    range: (minimum, maximum) => `En\u00a0düşük\u00a0${minimum} · En\u00a0yüksek\u00a0${maximum}`,
    currentConditionsAccessibilityLabel: ({
      condition,
      unitName,
      temperature,
      apparentTemperature,
      minimumTemperature,
      maximumTemperature,
      precipitationProbability,
    }) =>
      `${condition}. Sıcaklık ${temperature} ${unitName}. Hissedilen sıcaklık ${apparentTemperature} ${unitName}. ` +
      `En düşük ${minimumTemperature} ${unitName}, en yüksek ${maximumTemperature} ${unitName}. ` +
      `Yağış olasılığı yüzde ${Math.round(precipitationProbability * 100)}.`,
    wind: (speed) => `Rüzgâr ${speed} m/sn`,
    humidity: (humidity) => `%${Math.round(humidity * 100)} nem`,
    uvIndex: (index) => `UV endeksi ${index}`,
    hourlyForecastAccessibilityLabel: ({
      day,
      time,
      unitName,
      temperature,
      condition,
      precipitationProbability,
    }) =>
      `${day ? `${day}, saat` : 'Saat'} ${time}. Sıcaklık ${temperature} ${unitName}. ${condition}. ` +
      `Yağış olasılığı yüzde ${Math.round(precipitationProbability * 100)}.`,
    dailyHeading: 'Önümüzdeki günler',
    // One line when it fits. When it does not, the row shows the stacked form instead, so a
    // line never begins with the dot: iOS still breaks a no-break run that is wider than the
    // day column, which is exactly what the dot's no-break space made at the largest text size.
    dailyPrecipitationValue: (millimetres, probability) => `${millimetres}\u00a0mm\u00a0· ${probability}`,
    dailyPrecipitationStacked: (millimetres, probability) => `${millimetres}\u00a0mm\n${probability}`,
    dailyForecastAccessibilityLabel: ({
      day,
      condition,
      unitName,
      minimumTemperature,
      maximumTemperature,
      precipitationProbability,
      precipitationMillimetres,
      currentTemperature,
    }) =>
      `${currentTemperature ? `Bugün, ${day}` : day}. ${condition}. ` +
      `En düşük ${minimumTemperature} ${unitName}, en yüksek ${maximumTemperature} ${unitName}. ` +
      `${currentTemperature ? `Şu an ${currentTemperature} ${unitName}. ` : ''}` +
      `${precipitationMillimetres ? `${precipitationMillimetres} milimetre yağış. ` : ''}` +
      `Yağış olasılığı yüzde ${Math.round(precipitationProbability * 100)}.`,
    windValue: (speed) => `${speed} m/sn`,
    humidityValue: (humidity) => `%${Math.round(humidity * 100)}`,
    windLabel: 'Rüzgâr',
    humidityLabel: 'Nem',
    uvIndexLabel: 'UV',
    outlook: {
      rainStarting: (time) => `Yağmur ${time} civarında başlıyor`,
      snowStarting: (time) => `Kar ${time} civarında başlıyor`,
      rainEasing: (time) => `Yağmur ${time} civarında hafifliyor`,
      snowEasing: (time) => `Kar ${time} civarında hafifliyor`,
      temperatureDrop: ({ time, degrees }) => `Saat ${time} civarında ${degrees} düşüyor`,
      temperatureRise: ({ time, degrees }) => `Saat ${time} civarında ${degrees} yükseliyor`,
      steady: 'Bugünün kalanında belirgin bir değişiklik yok',
      steadyEvening: 'Akşamın kalanında belirgin bir değişiklik yok',
    },
    conditions: {
      clear: 'Açık', mostly_clear: 'Çoğunlukla açık', partly_cloudy: 'Parçalı bulutlu',
      cloudy: 'Bulutlu', fog: 'Sisli', drizzle: 'Çiseleme', rain: 'Yağmurlu',
      heavy_rain: 'Kuvvetli yağmur', sleet: 'Karla karışık yağmur', snow: 'Karlı', thunderstorm: 'Gök gürültülü fırtına',
    },
  },
  wardrobe: {
    title: 'Gardırop',
    addAction: 'Ekle',
    addHint: 'Yeni gardırop parçası formunu açar.',
    loadingLabel: 'Gardırobun yükleniyor.',
    loadErrorTitle: 'Gardırobun yüklenemedi',
    loadErrorBody: 'Kayıtlı parçaların güvende. Lütfen yeniden dene.',
    retryAction: 'Yeniden dene',
    unclassifiedType: 'Tür seçilmedi',
    wornCount: (count: number) => `${count} kez giyildi`,
    ownedLabel: 'Sahip olduklarım',
    // ADR 0028 section 5: the twelve-letter "İstediklerim" could not fit the label
    // column at fontScale 3.118. The Profile screen already unified profile.wantedLabel;
    // this closes the same key here so the two screens cannot drift again.
    wantedLabel: 'İstekler',
    categoryFilterLabels: {
      top: 'Üstler',
      bottom: 'Altlar',
      one_piece: 'Tek parçalar',
      outerwear: 'Dış giyim',
      footwear: 'Ayakkabılar',
      accessory: 'Aksesuarlar',
    },
    categoryAccessibilityLabel: ({ category, count, wanted }) =>
      `${category}, ${count} parça` + (wanted > 0 ? `, ${wanted} tanesi istek.` : '.'),
    categoryEmpty: {
      top: 'Henüz üst parça eklemedin.',
      bottom: 'Henüz alt parça eklemedin.',
      one_piece: 'Henüz tek parça eklemedin.',
      outerwear: 'Henüz dış giyim parçası eklemedin.',
      footwear: 'Henüz ayakkabı eklemedin.',
      accessory: 'Henüz aksesuar eklemedin.',
    },
    wantedTileLabel: 'İstek',
    newTitle: 'Yeni parça',
    editTitle: 'Parçayı düzenle',
    cancelAction: 'Vazgeç',
    saveOwnedAction: 'Gardıroba ekle',
    saveWantedAction: 'İsteklere ekle',
    nameLabel: 'Ad',
    namePlaceholder: 'Örneğin hafta sonu kotum',
    optionalTag: 'İsteğe bağlı',
    requiredTag: 'Zorunlu',
    photoTitle: 'Fotoğraf',
    photoHint: 'Fotoğraf isteğe bağlı. Fotoğraf yoksa kuyara parçayı çizer.',
    selectPhotoAction: 'Fotoğraf seç',
    takePhotoAction: 'Fotoğraf çek',
    changePhotoAction: 'Fotoğrafı değiştir',
    retakePhotoAction: 'Fotoğrafı yeniden çek',
    removePhotoAction: 'Fotoğrafı kaldır',
    photoChangeLabel: 'Değiştir',
    photoRetakeLabel: 'Yeniden çek',
    photoRemoveLabel: 'Kaldır',
    photoProcessingLabel: 'Fotoğraf hazırlanıyor…',
    photoError:
      'Fotoğraf hazırlanamadı. Diğer değişikliklerin hâlâ burada; lütfen yeniden dene.',
    cameraDeniedMessage:
      'kuyara için kamera erişimi sistem ayarlarında kapalı. Oradan açabilir ya da bunun yerine bir fotoğraf seçebilirsin.',
    cameraUnavailableMessage:
      'Bu cihazda kamera kullanılamıyor. Bunun yerine bir fotoğraf seçebilirsin.',
    openSettingsAction: 'Ayarları aç',
    photoAccessibilityLabel: (type: string) => `${type} gardırop parçası fotoğrafı.`,
    entryStateTitle: 'Bu parça sende var mı?',
    typeTitle: 'Bu ne?',
    typeChangeAction: 'Değiştir',
    typeChangeHint: 'Giyim türlerini yeniden gösterir.',
    typeRequiredError: 'Kaydetmeden önce bunun ne tür bir parça olduğunu seç.',
    colorTitle: 'Renk',
    solidColorsLabel: 'Düz renkler',
    patternColorsLabel: 'İki renk ve desenler',
    moreColorsLabel: 'Diğer renkler',
    colorOptionNames: {
      white: 'Beyaz',
      ecru: 'Ekru',
      stone: 'Taş rengi',
      sand: 'Kum',
      straw: 'Hasır',
      camel: 'Deve tüyü',
      tan_leather: 'Taba deri',
      chocolate: 'Çikolata',
      light_grey: 'Açık gri',
      heather_grey: 'Gri melanj',
      charcoal: 'Antrasit',
      black: 'Siyah',
      navy: 'Lacivert',
      indigo_denim: 'İndigo kot',
      mid_wash_denim: 'Orta yıkama kot',
      light_wash_denim: 'Açık yıkama kot',
      oxford_blue: 'Oxford mavisi',
      sky_blue: 'Gök mavisi',
      cobalt: 'Kobalt',
      black_denim: 'Siyah kot',
      sage: 'Adaçayı',
      olive: 'Haki',
      forest_green: 'Orman yeşili',
      mustard: 'Hardal',
      rain_yellow: 'Yağmurluk sarısı',
      terracotta: 'Terrakota',
      rust: 'Kiremit',
      tomato_red: 'Domates kırmızısı',
      burgundy: 'Bordo',
      blush: 'Pudra',
      dusty_rose: 'Gül kurusu',
      lavender: 'Lila',
      plum: 'Mürdüm',
      white_and_black: 'Beyaz ve siyah',
      white_and_blue: 'Beyaz ve mavi',
      navy_and_camel: 'Lacivert ve deve tüyü',
      blue_stripes: 'Mavi çizgili',
      navy_stripes: 'Lacivert çizgili',
      black_stripes: 'Siyah çizgili',
      red_stripes: 'Kırmızı çizgili',
      blue_gingham: 'Mavi pötikare',
      red_gingham: 'Kırmızı pötikare',
      tartan: 'Ekose',
      houndstooth: 'Kazayağı',
      polka_dots: 'Puantiyeli',
      floral: 'Çiçekli',
      leopard: 'Leopar desenli',
    },
    colorUnspecified: 'Fark etmez',
    saveAction: 'Kaydet',
    savedOwnedConfirmation: (piece: string) => `${piece} gardırobuna eklendi.`,
    savedWantedConfirmation: (piece: string) => `${piece} isteklerine eklendi.`,
    undoAction: 'Geri al',
    createError: 'Bu parça eklenemedi. Girdilerin hâlâ burada; lütfen yeniden dene.',
    updateError: 'Bu parça kaydedilemedi. Değişikliklerin hâlâ burada; lütfen yeniden dene.',
    pieceSheetAddTitle: 'Gardıroba ekle',
    pieceSheetEditTitle: 'Parçayı düzenle',
    pieceSheetOwnershipTitle: 'Sende var mı?',
    pieceSheetSuggested: 'Bugün önerilen',
    pieceSheetYours: 'Seninki',
    pieceSheetDone: 'Bitti',
    typeChangeTitle: 'Giyim türü değiştirilsin mi?',
    typeChangeBody:
      'Türü değiştirmek, parça özellikleri seçimlerini kaldırır ve yeni türün katalog varsayılanlarını kullanır.',
    keepTypeAction: 'Mevcut türü koru',
    changeTypeAction: 'Türü değiştir ve özellikleri sıfırla',
    discardTitle: 'Kaydedilmemiş değişiklikler silinsin mi?',
    discardBody: 'Bu gardırop parçasında yaptığın değişiklikler kaybolacak.',
    keepEditingAction: 'Düzenlemeye devam et',
    discardAction: 'Değişiklikleri sil',
    deleteSectionTitle: 'Gardıroptan kaldır',
    deleteSectionBody: 'Bu parça artık gardırop listende görünmeyecek.',
    deleteAction: 'Parçayı sil',
    deletingLabel: 'Parça siliniyor…',
    deleteConfirmTitle: 'Bu parça silinsin mi?',
    deleteConfirmBody: 'Parça gardırop listenden kaldırılacak.',
    cancelDeleteAction: 'Parçayı koru',
    confirmDeleteAction: 'Gardıroptan sil',
    deleteError: 'Bu parça silinemedi. Lütfen yeniden dene.',
    notFoundTitle: 'Gardırop parçası bulunamadı',
    notFoundBody: 'Bu parça silinmiş veya artık kullanılamıyor olabilir.',
    returnToWardrobeAction: 'Gardıroba dön',
  },
  today: {
    titleTemplate: 'Bugün · {temperature} {symbol} {condition}',
    dailyStyle: {
      question: 'Bugün nasıl bir gün?',
      questionEvening: 'Bu akşam nasıl bir akşam?',
      casual: 'Rahat', smart: 'Şık', formal: 'Resmî',
      updating: {
        casual: 'Rahat bir güne göre güncelleniyor…',
        smart: 'Şık bir güne göre güncelleniyor…',
        formal: 'Resmî bir güne göre güncelleniyor…',
      },
      firstDayNote: 'Kurulumda verdiğin cevap zaten seçili. Onaylamak için ona dokun.',
      close: 'Kapat',
      saveError: 'Seçimin kaydedilemedi. Yeniden dene.',
      stylesQuestion: 'Bugün hangi stiller?',
      stylesNote: 'Yalnızca bugün için. Ayarların olduğu gibi kalır.',
    },
    greetingNamed: (name) => `Tekrar hoş geldin, ${name}`,
    greetingFirstNamed: (name) => `Hoş geldin, ${name}`,
    generationModeOnDeviceAi: 'Apple Intelligence ile seçildi',
    generationModeAiAssisted: 'AI ile seçildi',
    generationModeOnDeviceAiAccessibilityLabel:
      'Öneri kaynağı: kuyara bu kombini Apple Intelligence ile seçti',
    generationModeAiAssistedAccessibilityLabel:
      'Öneri kaynağı: kuyara bu kombini AI ile seçti',
    generationSourceOnDeviceAi: 'Bu kombini kuyara, cihazında Apple Intelligence ile seçti.',
    generationSourceAiAssisted: 'Bu kombini kuyara çevrimiçi AI ile seçti.',
    generationSourceDeterministic: 'AI kullanılmadı, bu kombini kuyara cihazında hesapladı.',
    askAgain: {
      action: 'Stiliste tekrar sor',
      hint: 'Seçeceğin saat için yeni bir kombin seçer.',
      whenQuestion: 'Ne zaman çıkıyorsun?',
      now: 'Şimdi',
      later: 'Sonra',
      chooseNow: 'Şimdi için seç',
      chooseAt: (time) => `${time} için seç`,
      warning: (start, end) =>
        `kuyara, ${start} ile ${end} arasındaki havaya göre yeniden seçecek. Ekrandaki kombinlerin yerine yenileri gelecek.`,
      warningOnDay: (day, start, end) =>
        `kuyara, ${day} ${start} ile ${end} arasındaki havaya göre yeniden seçecek. Ekrandaki kombinlerin yerine yenileri gelecek.`,
    },
    coverage: {
      chosen: (start, end) => `${start} ile ${end} arasındaki havaya göre seçildi.`,
      chosenOnDay: (day, start, end) => `${day}, ${start} ile ${end} arasındaki havaya göre seçildi.`,
      choosing: (start, end) => `${start} ile ${end} arasındaki havaya göre seçiliyor…`,
      choosingOnDay: (day, start, end) => `${day}, ${start} ile ${end} arasındaki havaya göre seçiliyor…`,
    },
    drift: {
      rain: (time) => `Bu kombin ${time} yağmuruna göre seçilmedi.`,
      snow: (time) => `Bu kombin ${time} karına göre seçilmedi.`,
      cold: (time) => `Bu kombin ${time} soğuğuna göre seçilmedi.`,
    },
    coolSpell: (time) => `Yanına ince bir kat al, saat ${time} gibi hava serinliyor.`,
    otherOptionsHeading: 'Alternatif kombinler',
    tomorrow: {
      heading: 'Yarın',
      weather: ({ condition, minimum, maximum }) => `${condition}, ${minimum}\u00a0ile\u00a0${maximum}\u00a0arası`,
      range: ({ minimum, maximum }) => `${minimum}\u00a0ile\u00a0${maximum}\u00a0arası`,
      weatherAccessibilityLabel: ({ condition, minimum, maximum, unitName }) =>
        `${condition}. En düşük ${minimum} ${unitName}, en yüksek ${maximum} ${unitName}.`,
      stripAccessibilityLabel: ({ outfit, weather }) => `Yarın: ${outfit} ${weather}`,
      stripAccessibilityHint: 'Yarının kombinini açar',
      recapAccessibilityLabel: ({ condition, minimum, maximum, unitName, rainProbability, coverageCaption }) =>
        `${condition}, ${minimum} ile ${maximum} ${unitName} arası, yağmur olasılığı yüzde ${rainProbability}` +
        (coverageCaption ? `. ${coverageCaption}` : ''),
    },
    piecesHeading: 'Parçalar',
    reasonsHeading: 'Neden uygun',
    finishingTouchesHeading: 'Son dokunuşlar',
    finishingTouchesAccessibilityLabel: (items) =>
      `Son dokunuşlar: ${items.join(', ')}.`,
    finishingTouchesRowAccessibilityLabel: ({ item, slot }) => `${item}, ${slot}`,
    ownershipOwnedAction: 'Bende var',
    ownershipWantedAction: 'İstiyorum',
    ownershipUntrackedLabel: 'Gardırobunda yok',
    ownershipSimilarLabel: 'Sende benzeri var',
    ownershipYours: (color) => `Seninki: ${color}`,
    ownershipOnBoard: {
      owned: 'Gardırobunda\u00a0var',
      similar: 'Benzeri Gardırobunda',
      wanted: 'İsteklerinde',
    },
    boardHint: 'Bir parçaya dokun, sonra kaydırarak değiştir.',
    editPieceAccessibilityHint: 'Bu parçayı Gardırobunda açar',
    manualMix: {
      change: 'Değiştir',
      changeAccessibilityLabel: {
        primary_top: (piece) => `Üstü değiştir, şu an ${piece}`,
        bottom: (piece) => `Altı değiştir, şu an ${piece}`,
        one_piece: (piece) => `Tek parçayı değiştir, şu an ${piece}`,
        mid_layer: (piece) => `Orta katmanı değiştir, şu an ${piece}`,
        outer_layer: (piece) => `Dış katmanı değiştir, şu an ${piece}`,
        footwear: (piece) => `Ayakkabıyı değiştir, şu an ${piece}`,
      },
      changed: 'Değişti',
      title: 'Senin kombinin',
      changedFrom: (archetype) => `${archetype} önerisinden değiştirildi`,
      unusual: 'Bu hava için alışılmadık',
      unusualAccessibilityLabel: 'Bu hava için alışılmadık. Bu kombini yine de giyip kaydedebilirsin.',
      reset: 'kuyara’nın seçimine dön',
      pickerFits: 'Bugünkü havaya uygun',
      pickerOther: 'Diğer parçalar',
      pickerOtherHint: 'Bunlar kombini bu hava için alışılmadık yapabilir.',
      pickerCurrent: 'Şu anki',
      counter: (position, total) => `${position} / ${total}`,
      pieceValue: ({ piece, position, total }) => `${piece}, ${total} parçadan ${position}`,
      stepUnusual: ({ piece, position, total }) =>
        `${piece}, ${total} parçadan ${position}. Bu hava için alışılmadık. Bu kombini yine de giyip kaydedebilirsin.`,
      done: 'Bitti',
      otherPieceHint: 'Bu parça kombini bu hava için alışılmadık yapabilir.',
      stripShown: 'Seçebileceğin parçalar aşağıda.',
      sourceOne: {
        onDeviceAi: 'Bir parçayı sen değiştirdin. Kalanını kuyara, cihazında Apple Intelligence ile seçti.',
        aiAssisted: 'Bir parçayı sen değiştirdin. Kalanını kuyara çevrimiçi AI ile seçti.',
        deterministic: 'Bir parçayı sen değiştirdin. Kalanını kuyara cihazında hesapladı.',
      },
      sourceMany: {
        onDeviceAi: 'Birkaç parçayı sen değiştirdin. Kalanını kuyara, cihazında Apple Intelligence ile seçti.',
        aiAssisted: 'Birkaç parçayı sen değiştirdin. Kalanını kuyara çevrimiçi AI ile seçti.',
        deterministic: 'Birkaç parçayı sen değiştirdin. Kalanını kuyara cihazında hesapladı.',
      },
    },
    share: { action: 'Kombini paylaş', brandName: 'kuyara' },
    wornAction: 'Bugün bunu giydim',
    wornToday: 'Bugün giyildi',
    wornSaveError: 'Bugünkü kombin kaydedilemedi. Yeniden dene.',
    wornReplaceTitle: 'Bugünkü kombin değişsin mi?',
    wornReplaceBody: 'Bir güne yalnızca bir kombin kaydedilebilir. Bu işlem, bugün daha önce kaydettiğin kombinin yerini alır.',
    wornReplaceConfirm: 'Kombini değiştir',
    wornReplaceCancel: 'Vazgeç',
    slots: {
      primary_top: 'Üst',
      bottom: 'Alt',
      one_piece: 'Tek parça',
      mid_layer: 'Orta katman',
      outer_layer: 'Dış katman',
      footwear: 'Ayakkabı',
      head: 'Baş',
      neck: 'Boyun',
      hands: 'Eller',
      handheld: 'Yanına al',
    },
    requirementNames: {
      thermal: 'Sıcaklık koruması',
      breathability: 'Nefes alabilirlik',
      arm_coverage: 'Kol koruması',
      leg_coverage: 'Bacak koruması',
      body_water_protection: 'Gövde su koruması',
      footwear_water_protection: 'Ayakkabı su koruması',
      wind_protection: 'Rüzgâr koruması',
      traction: 'Tutuş',
    },
    requirementRow: ({ requirement, garments }) =>
      `${requirement}: ${garments.join(', ')}.`,
    requirementTradeoffRow: ({ requirement, garments }) =>
      `Denge (${requirement}): ${garments.join(', ')}.`,
    requirementReasons: {
      temperature_low: 'Hava daha sıcak giyinmeyi gerektiriyor.',
      apparent_temperature_low: 'Hissedilen sıcaklık yalıtım gerektirecek kadar düşük.',
      temperature_high: 'Yüksek sıcaklıklar nefes alabilen giysiler gerektiriyor.',
      apparent_temperature_high: 'Hissedilen sıcaklık nefes alabilen giysiler gerektirecek kadar yüksek.',
      daily_range_wide: 'Geniş sıcaklık aralığı ayarlanabilir katmanlar gerektiriyor.',
      daily_extrema_fallback: 'Günlük sıcaklık aralığı mevcut koşullara dayanıyor.',
      wind_elevated: 'Artan rüzgâr, rüzgâr koruması gerektiriyor.',
      wind_strong: 'Kuvvetli rüzgâr, rüzgâr koruması gerektiriyor.',
      precipitation_possible: 'Yağış ihtimali su koruması gerektiriyor.',
      precipitation_likely: 'Beklenen yağış su koruması gerektiriyor.',
      condition_drizzle: 'Çiseleme hafif su koruması gerektiriyor.',
      condition_rain: 'Yağmur su koruması gerektiriyor.',
      condition_heavy_rain: 'Kuvvetli yağmur su geçirmez koruma gerektiriyor.',
      condition_sleet: 'Karla karışık yağmur sıcaklık, su koruması ve tutuş gerektiriyor.',
      condition_snow: 'Kar sıcaklık, su koruması ve tutuş gerektiriyor.',
      condition_thunderstorm: 'Gök gürültülü fırtına su koruması ve tutuş gerektiriyor.',
    },
    compositionReasons: {
      breathability_protection_tradeoff: 'Koruma, nefes alabilirliğe göre önceliklendirildi.',
      thermal_over_protection: 'Bu kombin günün gerektirdiğinden daha sıcak tutuyor.',
      unnecessary_water_protection: 'Bu kombin gerekenden daha fazla su koruması içeriyor.',
    },
    mildWeatherRationale: 'Havada özel bir koruma isteyen bir şey yok.',
    dayInsight: {
      sentences: {
      clear_day: 'Gün boyu güneşli.',
      clear_day_hot: 'Gün boyu güneşli ve sıcak.',
      clear_day_veryHot: 'Gün boyu güneşli ama çok sıcak.',
      clear_day_chilly: 'Gün boyu güneşli ve serin.',
      clear_day_freezing: 'Gün boyu güneşli ama dondurucu.',
      clear_evening: 'Akşam boyu açık.',
      clear_evening_hot: 'Akşam boyu açık ve sıcak.',
      clear_evening_veryHot: 'Akşam boyu açık ama çok sıcak.',
      clear_evening_chilly: 'Akşam boyu açık ve serin.',
      clear_evening_freezing: 'Akşam boyu açık ama dondurucu.',
      cloudy_day: 'Gün boyu bulutlu.',
      cloudy_day_hot: 'Gün boyu bulutlu ve sıcak.',
      cloudy_day_veryHot: 'Gün boyu bulutlu ama çok sıcak.',
      cloudy_day_chilly: 'Gün boyu bulutlu ve serin.',
      cloudy_day_freezing: 'Gün boyu bulutlu ama dondurucu.',
      cloudy_evening: 'Akşam boyu bulutlu.',
      cloudy_evening_hot: 'Akşam boyu bulutlu ve sıcak.',
      cloudy_evening_veryHot: 'Akşam boyu bulutlu ama çok sıcak.',
      cloudy_evening_chilly: 'Akşam boyu bulutlu ve serin.',
      cloudy_evening_freezing: 'Akşam boyu bulutlu ama dondurucu.',
      foggy_day: 'Gün boyu sisli.',
      foggy_day_hot: 'Gün boyu sisli ve sıcak.',
      foggy_day_veryHot: 'Gün boyu sisli ama çok sıcak.',
      foggy_day_chilly: 'Gün boyu sisli ve serin.',
      foggy_day_freezing: 'Gün boyu sisli ama dondurucu.',
      foggy_evening: 'Akşam boyu sisli.',
      foggy_evening_hot: 'Akşam boyu sisli ve sıcak.',
      foggy_evening_veryHot: 'Akşam boyu sisli ama çok sıcak.',
      foggy_evening_chilly: 'Akşam boyu sisli ve serin.',
      foggy_evening_freezing: 'Akşam boyu sisli ama dondurucu.',
      rain_day: 'Gün boyu yağmurlu.',
      rain_evening: 'Akşam boyu yağmurlu.',
      snow_day: 'Gün boyu karlı.',
      snow_evening: 'Akşam boyu karlı.',
      windy: 'Rüzgâr sürüyor.',
      veryWindy: 'Kuvvetli rüzgâr sürüyor.',
      },
      rainFromUntil: ({ from, until }) =>
        `Yağmur ${from} civarında başlıyor, ${until} civarında hafifliyor.`,
      rainFrom: (from: string) => `Yağmur ${from} civarında başlıyor.`,
      rainUntil: (until: string) => `Yağmur ${until} civarında hafifliyor.`,
      snowFromUntil: ({ from, until }) =>
        `Kar ${from} civarında başlıyor, ${until} civarında hafifliyor.`,
      snowFrom: (from: string) => `Kar ${from} civarında başlıyor.`,
      snowUntil: (until: string) => `Kar ${until} civarında hafifliyor.`,
      hot: (time: string) => `Saat ${time} civarında hava ısınıyor.`,
      veryHot: (time: string) => `Saat ${time} civarında hava iyice ısınıyor.`,
      chilly: (time: string) => `Saat ${time} civarında hava serinliyor.`,
      freezing: (time: string) => `Saat ${time} civarında hava buz gibi oluyor.`,
    },
    updatedAt: (time: string) => `Son güncelleme ${time}`,
    staleAt: (time: string) => `Son güncelleme ${time} · Güncelliğini yitirmiş olabilir`,
    refreshingStatus: 'Bugünün önerileri yenileniyor…',
    refreshFailedAt: (time: string) => `Yenilenemedi · ${time} güncellemesi gösteriliyor`,
    refreshAction: 'Yenile',
    apparentTemperature: (temperature: string) => `Hissedilen ${temperature}`,
    temperatureRange: (minimum: string, maximum: string) => `En düşük ${minimum} · En yüksek ${maximum}`,
    rainProbability: (probability: string) => `Yağmur olasılığı ${probability}`,
    optionPosition: (position: number, total: number) => `${total} seçenekten ${position}.`,
    loadingTitle: 'Bugünün önerileri hazırlanıyor',
    loadingBody: 'Hava özeti ve kombin seçenekleri burada görünecek.',
    loadingAccessibilityLabel: 'Bugünün önerileri hazırlanıyor. İçerik yükleniyor.',
    generatingStatus: 'Bugünün kombinleri seçiliyor.',
    generatingLongWaitStatus: 'Bugünün kombinleri seçiliyor. Bu biraz daha uzun sürebilir.',
    loading: {
      heading: 'Kombinin hazırlanıyor.',
      phase: 'Birbirine uyan parçalar aranıyor.',
      tip: 'Kombin seçeneklerin bugünün havasına göre hazırlanır.',
      progress: {
        waiting: 'Kombinin seçiliyor.',
        dressing: 'Kombinin seçildi. Parçaları ve renkleri ekleniyor.',
        done: 'Kombinin hazır.',
      },
      chosen: 'Kombinin seçildi.',
      keepWaiting: 'Beklemeye devam et',
      skipWait: 'Beklemeyi atla',
      allSet: 'Hazır',
    },
    phase: {
      'checking-on-device': 'Cihaz içi AI kontrol ediliyor.',
      'asking-stylist': 'AI stiliste soruluyor.',
      'answer-received': 'AI yanıt verdi. Seçimler kontrol ediliyor.',
      'preparing-outfits': 'Kombinlerin hazırlanıyor.',
      'using-standard': 'AI yanıt vermedi. Standart öneriler kullanılıyor.',
    },
    unavailableTitle: 'Bugünün önerileri kullanılamıyor',
    unavailableBody: 'Şu anda gösterilecek kayıtlı bir öneri yok.',
    noLocationTitle: 'kuyara henüz nerede olduğunu bilmiyor',
    noLocationBody: 'Bugünün hava durumunu ve kombin önerilerini görmek için cihaz konumunu kullan veya bir şehir ara.',
    chooseLocationAction: 'Konum seç',
    noOutfitTitle: 'Kombin bulunamadı',
    noOutfitBody: 'Bu koşullar için eksiksiz bir kombin önerilemiyor.',
    weatherAccessibilityLabel: ({
      condition,
      current,
      apparent,
      minimum,
      maximum,
      rainProbability,
      unitName,
    }) =>
      `${condition}. Sıcaklık ${current} ${unitName}, hissedilen ${apparent} ${unitName}. ` +
      `En düşük ${minimum} ${unitName}, en yüksek ${maximum} ${unitName}. Yağmur olasılığı yüzde ${rainProbability}.`,
    titleAccessibilityLabel: ({ temperature, unitName, condition }) =>
      `Bugün, ${temperature} ${unitName}, ${condition}`,
    weatherRecapAccessibilityLabel: ({ temperature, unitName, condition, rainProbability, coverageCaption }) =>
      `${temperature} ${unitName}, ${condition}, yağmur olasılığı yüzde ${rainProbability}` +
      (coverageCaption ? `. ${coverageCaption}` : ''),
    boardAccessibilityLabel: ({ archetype, pieces }) => `${archetype}. ${pieces.join(', ')}.`,
    stageAccessibilityLabel: ({ temperature, unitName, condition, pieces, archetype }) =>
      `${temperature} ${unitName}. ${condition}. ${pieces.join(', ')}. ${archetype}.`,
    outfitAccessibilityLabel: ({
      position,
      total,
      archetype,
      pieces,
      reasons,
    }) => {
      const ordinal = ['birincisi', 'ikincisi', 'üçüncüsü'][position - 1] ?? `${position}. seçenek`;
      return [
        `${total} seçenekten ${ordinal}.`,
        `${archetype}.`,
        ...pieces.map(({ slot, item }) => `${slot}: ${item}.`),
        reasons.length > 0 ? `Bu kombin şu nedenlerle uygun: ${reasons.join(' ')}` : null,
      ].filter(Boolean).join(' ');
    },
  },
  walkthrough: {
    name: 'kuyara’yı adım adım tanı',
    counter: (step: number, total: number) => `Adım ${step}/${total}`,
    skip: 'Geç',
    targetHint: 'Tur. Sonraki adımı açar.',
    steps: {
      outfit: {
        title: 'Bugünkü kombinin',
        body: 'kuyara bunu bugünkü havaya göre seçti. Başlığın altındaki rozet, bu seçimde AI yardımı olduğunu gösterir. Parçalarını görmek için kombine dokun.',
        bodyNoBadge: 'kuyara bunu bugünkü havaya göre seçti. Parçalarını görmek için kombine dokun.',
      },
      piece: {
        title: 'Her parça adıyla',
        body: (piece: string) => `Her parçanın adı yanında yazar. Tek başına görmek için ${piece} parçasına dokun.`,
      },
      sheet: {
        title: 'Sende olanı ya da istediğini işaretle',
        body: '“Sende var mı?” altında “Bende var” ya da “İstiyorum” seçip Bitti’ye dokunduğunda parça Gardırobuna eklenir. Şimdilik bu ekranı kapat.',
      },
      worn: {
        title: 'Giydiğin gün',
        body: 'Bu kombini giydiğinde “Bugün bunu giydim” düğmesine dokun. Geçmiş onu o günün altında listeler. Şimdi dokunman gerekmez.',
      },
      back: {
        title: 'Bugün’e dön',
        body: 'Geri dönmek için köşedeki Bugün düğmesine dokun.',
      },
      again: {
        title: 'Günün değişirse',
        body: 'kuyara her sabah ve akşam gününün rahat mı, şık mı, resmî mi olduğunu sorar. Gün içinde planın değişirse “Stiliste tekrar sor” düğmesine dokun.',
      },
      profileTab: {
        title: 'Gardırop ve Geçmiş',
        body: 'İkisi de Profil sekmesinde. Profil sekmesine dokun.',
      },
      closet: {
        title: 'Gardırobun',
        body: 'İşaretlediğin parçalar bu askılıkta asılı durur. İstediklerinin çizgisi kesiklidir.',
      },
      history: {
        body: 'Giydiğin kombinler burada günlere göre listelenir. Bu turu yeniden görmek için Ayarlar’ı aç, Yardım bölümünde bulursun.',
      },
    },
  },
  account: {
    card: {
      title: 'Profilini tamamla',
      body: 'Gardırobunu ve Geçmişini yeni telefonuna taşımak için giriş yap.',
      action: 'Devam et',
      dismiss: 'Bir daha gösterme',
    },
    signIn: {
      close: 'Kapat',
      title: 'Profilini tamamla',
      benefits: [
        'Gardırobun ve Geçmişin yeni telefonuna seninle gelir.',
        'kuyara’yı yeniden yüklersen kaldığın yerden devam edersin.',
        'Hesap olmadan da her şey aynı şekilde çalışır.',
      ],
      continueWith: { apple: 'Apple ile Devam Et', google: 'Google ile devam et' },
      notNow: 'Şimdi değil',
      footer: 'Giriş yaptığında Gardırobun, Geçmişin ve stil tercihlerin hesabına eklenir. Doğum tarihin eklenmez.',
      privacy: 'Gizlilik politikası',
      cancelled: 'Giriş iptal edildi. Hazır olduğunda bir giriş yolu seç.',
      offline: 'İnternet bağlantın yok. Bağlandıktan sonra giriş yapabilirsin.',
      failed: {
        apple: 'Apple girişi tamamlayamadı. Biraz sonra yeniden dene ya da Google ile devam et.',
        google: 'Google girişi tamamlayamadı. Biraz sonra yeniden dene ya da Apple ile devam et.',
      },
    },
    welcome: {
      title: 'Giriş yaptın',
      summary: (pieces: number, days: number) =>
        `Gardırobundaki ${pieces} parça ve Geçmişindeki ${days} gün hesabına eklendi.`,
      done: 'Bitti',
    },
    method: { apple: 'Apple ile giriş kullanılıyor', google: 'Google ile giriş kullanılıyor' },
    settings: {
      group: 'Hesap',
      signIn: 'Giriş yap',
      signedOutFooter: 'Gardırobunu ve Geçmişini yeni telefonuna taşı.',
      signedIn: { apple: 'Apple ile giriş yapıldı', google: 'Google ile giriş yapıldı' },
      deleted: 'Hesabın silindi. kuyara’da gördüklerin kalır.',
      signedOut: 'Çıkış yaptın. Gardırobun ve Geçmişin kuyara’da kalır.',
    },
    sync: {
      heading: 'Eşitleme',
      upToDate: 'Güncel',
      offline: 'Çevrimdışı',
      syncing: 'Eşitleniyor',
      failed: 'Eşitlenemedi',
      restoring: 'Geri geliyor',
      offlineWaiting: (pending: number) => (pending > 0 ? `Çevrimdışı · ${pending} bekliyor` : 'Çevrimdışı'),
      waiting: (pending: number) => `${pending} bekliyor`,
      syncingCount: (pending: number) => `${pending} eşitleniyor`,
      restoringCount: (done: number, total: number) => `${done} / ${total}`,
      syncNow: 'Şimdi eşitle',
      retry: 'Yeniden dene',
      upToDateFooter: (time: string) => `Son eşitleme ${time}. Doğum tarihin hesabına eklenmez.`,
      offlineFooter: (pending: number, time: string) => (pending > 0
        ? `Bekleyen ${pending} değişikliğin var. Bağlantı gelince eşitlenir. Son eşitleme ${time}.`
        : `Bağlantı gelince eşitlenir. Son eşitleme ${time}.`),
      syncingFooter: (pending: number, time: string) => (pending > 0
        ? `${pending} değişiklik eşitleniyor. Son eşitleme ${time}.`
        : `Son eşitleme ${time}.`),
      failedFooter: (pending: number, time: string) => (pending > 0
        ? `kuyara hesabına ulaşamadı. ${pending} değişikliğin korunur ve bir sonraki denemede eşitlenir. Son eşitleme ${time}.`
        : `kuyara hesabına ulaşamadı. Son eşitleme ${time}.`),
      restoringFooter: (counts: RestoreCounts) =>
        `kuyara Gardırobunu ve Geçmişini geri getiriyor. ${trRestoreCount(counts)}`,
      pausedFooter: (counts: RestoreCounts) =>
        `${trRestoreCount(counts)} Kalanlar bağlantı gelince gelir.`,
    },
    account: {
      title: 'Hesap',
      closet: 'Gardırop',
      pieces: (count: number) => `${count} parça`,
      history: 'Geçmiş',
      days: (count: number) => `${count} gün`,
      preferences: 'Stil tercihleri',
      included: 'Dahil',
      methodsHeading: 'Giriş yolları',
      providerName: { apple: 'Apple', google: 'Google' },
      connected: 'Bağlı',
      add: { apple: 'Apple ekle', google: 'Google ekle' },
      methodsFooter: 'Aynı hesaba ikinci bir giriş yolu ekle.',
      signOut: 'Çıkış yap',
      delete: 'Hesabı sil',
      deleteFooter: 'Hesabını ve hesabına kaydedilen her şeyi siler.',
    },
    signOutAlert: {
      title: 'Çıkış yapılsın mı?',
      body: 'Gardırobun ve Geçmişin kuyara’da kalır. Eşitlemek için yeniden giriş yap.',
      cancel: 'Vazgeç',
      confirm: 'Çıkış yap',
    },
    deletion: {
      title: 'Hesabı sil',
      goneHeading: 'Neler silinir',
      goneAccount: {
        apple: 'Hesabın ve Apple ile giriş bağlantın',
        google: 'Hesabın ve Google ile giriş bağlantın',
      },
      goneData: 'Hesabına kaydedilen Gardırop, Geçmiş ve tercihlerin',
      stayHeading: 'Neler kalır',
      stay: 'kuyara’da şu an gördüklerin kalır ve kuyara hesapsız çalışmaya devam eder.',
      footer: {
        apple: 'Silme bir dakikayı bulabilir. Bitince kuyara haber verir. Bir şey silinmeden önce Apple ile onay verirsin.',
        google: 'Silme bir dakikayı bulabilir. Bitince kuyara haber verir. Bir şey silinmeden önce Google ile onay verirsin.',
      },
      action: 'Hesabı sil',
      deleting: 'Hesabın siliniyor. Bu bir dakikayı bulabilir.',
      failed: 'kuyara hesabını silemedi. Hiçbir şey silinmedi. Yeniden dene.',
      offline: 'İnternet bağlantın yok. Bağlandıktan sonra hesabını silebilirsin.',
    },
    deleteAlert: {
      title: 'Hesabın silinsin mi?',
      body: 'Bu işlem geri alınamaz.',
      cancel: 'Vazgeç',
      confirm: 'Sil',
    },
    restore: {
      progressTitle: 'Gardırobun ve Geçmişin geri geliyor',
      progressBody: 'Giriş yaptın. Bu sırada kuyara’yı kullanmaya devam edebilirsin.',
      progressCount: trRestoreCount,
      progressKeep: 'Devam et bu sayfayı kapatır, geri getirme sürer.',
      progressAction: 'Devam et',
      doneTitle: 'Gardırobun ve Geçmişin geri geldi',
      doneBody: (pieces: number, days: number) => `${pieces} parça ve Geçmişindeki ${days} gün kuyara’ya geri geldi.`,
      doneProfile: 'Adın, cinsiyetin, giyim stilin ve stil tercihlerin hesabından geldi.',
      done: 'Bitti',
    },
    deleted: {
      title: 'Hesabın silindi',
      gone: {
        apple: 'Hesabına kaydedilen her şey silindi ve Apple ile giriş bağlantın koparıldı.',
        google: 'Hesabına kaydedilen her şey silindi ve Google ile giriş bağlantın koparıldı.',
      },
      stay: 'kuyara’da gördüklerin kalır ve kuyara hesapsız çalışmaya devam eder.',
      done: 'Bitti',
    },
  },
} satisfies AppMessages;

export type SupportedLanguage = 'en' | 'tr';

export const messages: Readonly<Record<SupportedLanguage, AppMessages>> = Object.freeze({ en, tr });

export function resolveSupportedLanguage(locale: string | null | undefined): SupportedLanguage {
  return locale?.toLocaleLowerCase('en').startsWith('tr') ? 'tr' : 'en';
}

export function getMessages(locale: string | null | undefined): AppMessages {
  return messages[resolveSupportedLanguage(locale)];
}
