import type {
  OutfitCompositionReasonCode,
  OutfitSlot,
} from '@/features/recommendation/domain/outfit-composition';
import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import type { ClothingRequirementReasonCode } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { WeatherAlertOfferReason } from '@/features/notifications/domain/weather-alert-offer';
import type {
  WeatherConditionCode as LiveWeatherConditionCode,
} from '@/features/weather/domain/weather';
import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
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

export type TodayMessages = Readonly<{
  title: string;
  greetingNamed: (name: string) => string;
  // ADR 0034 section 4: the two AI modes have badges, the words final, no Apple glyph. The
  // on-device badge carries the Apple Intelligence word mark inside a referential phrase;
  // the spoken label makes kuyara the subject the badge alone cannot show.
  generationModeOnDeviceAi: string;
  generationModeAiAssisted: string;
  generationModeOnDeviceAiAccessibilityLabel: string;
  generationModeAiAssistedAccessibilityLabel: string;
  // The recommendation detail says in one plain sentence where the outfit was chosen, in
  // all three modes. It names no provider, no model and no failure.
  generationSourceOnDeviceAi: string;
  generationSourceAiAssisted: string;
  generationSourceDeterministic: string;
  // Today's "show another outfit" action. It names no provider, no quota and no
  // remaining count, and it is the same words whichever path answers the tap.
  regenerateAction: string;
  regenerateCaption: string;
  backAction: string;
  otherOptionsHeading: string;
  piecesHeading: string;
  reasonsHeading: string;
  finishingTouchesHeading: string;
  finishingTouchesAccessibilityLabel: (items: readonly string[]) => string;
  finishingTouchesRowAccessibilityLabel: (
    parts: Readonly<{ item: string; slot: string }>,
  ) => string;
  ownershipOwnedAction: string;
  ownershipWantedAction: string;
  ownershipChangeHint: string;
  ownershipOwnedLabel: string;
  ownershipWantedLabel: string;
  ownershipUntrackedLabel: string;
  ownershipSummary: (values: { owned: number; total: number }) => string;
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
  dayWindow: Readonly<{
    rain: (from: string | null, until: string | null) => string;
    snow: (from: string | null, until: string | null) => string;
    wind: (from: string | null, until: string | null) => string;
    veryWindy: (from: string | null, until: string | null) => string;
    staysHot: (time: string) => string;
    staysVeryHot: (time: string) => string;
    staysCold: (time: string) => string;
    staysFreezing: (time: string) => string;
    coolsTo: (time: string, temperature: string) => string;
    warmsTo: (time: string, temperature: string) => string;
    lowest: (time: string, temperature: string) => string;
  }>;
  emphasis: Readonly<{ recommended: string }>;
  updatedAt: (time: string) => string;
  staleAt: (time: string) => string;
  refreshingStatus: string;
  refreshFailedAt: (time: string) => string;
  refreshAction: string;
  apparentTemperature: (temperature: string) => string;
  temperatureRange: (minimum: string, maximum: string) => string;
  rainProbability: (probability: string) => string;
  hourlyRainAccessibilityLabel: (values: {
    time: string;
    probabilityPercent: number;
  }) => string;
  windLabel: string;
  humidityLabel: string;
  uvIndexLabel: string;
  humidityValue: (percent: number) => string;
  uvIndexValue: (value: string) => string;
  metricsAccessibilityLabel: (values: {
    windSpeed: string;
    humidityPercent: string;
    uvIndex: string;
  }) => string;
  optionPosition: (position: number, total: number) => string;
  loadingTitle: string;
  loadingBody: string;
  loadingAccessibilityLabel: string;
  generatingStatus: string;
  generatingLongWaitStatus: string;
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
    apparent: string;
    minimum: string;
    maximum: string;
    rainProbability: number;
  }) => string;
  boardAccessibilityLabel: (values: { archetype: string; pieces: readonly string[] }) => string;
  stageAccessibilityLabel: (values: {
    temperature: string; condition: string; pieces: readonly string[]; archetype: string;
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
  themeTitle: string;
  themeSystem: string;
  themeLight: string;
  themeDark: string;
}>;

/** A morning's low and high, already formatted; equal values read as one temperature. */
export type MorningTemperatures = Readonly<{ low: string; high: string }>;

export type AppMessages = Readonly<{
  catalog: CatalogMessages;
  recommendation: RecommendationMessages;
  common: Readonly<{
    back: string;
    continue: string;
  }>;
  navigation: Readonly<{
    today: string;
    weather: string;
    profile: string;
    wardrobe: string;
    settings: string;
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
    promiseHeading: string;
    weatherPromise: string;
    outfitsPromise: string;
    wardrobePromise: string;
    genderTitle: string;
    genderBody: string;
    dressStyleTitle: string;
    dressStyleBody: string;
    dressStyleRequiredError: string;
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
    identifierLabel: string;
    identifierFooter: string;
    privacyPolicyLabel: string;
    statusNotAsked: string;
  }>;
  profile: Readonly<{
    title: string;
    nameLabel: string;
    nameEditTitle: string;
    nameDone: string;
    nameClear: string;
    nameSaveError: string;
    nameRemoveHint: string;
    settingsAction: string;
    settingsHint: string;
    wardrobeTitle: string;
    wardrobeTitleNamed: (name: string) => string;
    closetHeadingAccessibilityLabel: (values: { count: number }) => string;
    closetHeadingNamedAccessibilityLabel: (values: { name: string; count: number }) => string;
    closetHeadingHint: string;
    wantedLabel: string;
    historyLabel: string;
    wardrobeLoading: string;
    wardrobeEmpty: string;
    wardrobeUnavailable: string;
    addPieceAction: string;
    railAllPiecesLabel: string;
    railItemAccessibilityLabel: (values: {
      label: string;
      position: number;
      total: number;
    }) => string;
  }>;
  notifications: Readonly<{
    title: string;
    introduction: string;
    leadTimeHint: string;
    quietHoursHint: string;
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
      sentences: Readonly<Record<WeatherAlertOfferReason, string>>;
      acceptAction: string;
      dismissAction: string;
    }>;
    /**
     * ADR 0004's second notification kind. Each body is one complete localized text read at
     * 07:00 on the morning it describes, never assembled from fragments.
     */
    morningBriefing: Readonly<{
      toggleLabel: string;
      hint: string;
      title: string;
      /**
       * `low` and `high` arrive already formatted for the language's locale, as the alert
       * bodies' temperatures do; the unit, the range dash and the single-value form belong
       * to the copy.
       */
      clearBody: (values: MorningTemperatures) => string;
      cloudyBody: (values: MorningTemperatures) => string;
      wetBody: (values: MorningTemperatures) => string;
    }>;
    alerts: Readonly<{
      rainTitle: string;
      rainBody: (time: string) => string;
      snowTitle: string;
      snowBody: (time: string) => string;
      dropTitle: string;
      dropBody: (values: { time: string; temperatureCelsius: number }) => string;
      riseTitle: string;
      riseBody: (values: { time: string; temperatureCelsius: number }) => string;
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
    deniedBody: string;
    permanentDeniedBody: string;
    servicesUnavailableBody: string;
    lookupFailedBody: string;
    selectionFailedBody: string;
    openSettings: string;
    sampleDisclosure: string;
    hourlyHeading: string;
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
    precipitation: (probability: number) => string;
    currentConditionsAccessibilityLabel: (values: {
      condition: string;
      temperature: string;
      apparentTemperature: string;
      minimumTemperature: string;
      maximumTemperature: string;
      precipitationProbability: number;
    }) => string;
    wind: (speed: string) => string;
    humidity: (humidity: number) => string;
    uvIndex: (index: string) => string;
    metricsAccessibilityLabel: (values: {
      windSpeed: string;
      humidity: number;
      uvIndex: string;
    }) => string;
    hourlyForecastAccessibilityLabel: (values: {
      day?: string;
      time: string;
      temperature: string;
      condition: string;
      precipitationProbability: number;
    }) => string;
    dailyHeading: string;
    /** A measured amount beside its chance, both already formatted for the locale. */
    dailyPrecipitationValue: (millimetres: string, probability: string) => string;
    dailyForecastAccessibilityLabel: (values: {
      day: string;
      condition: string;
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
    ownedLabel: string;
    wantedLabel: string;
    // ADR 0029 section 2: new plural chip strings for the Closet's category filter. The
    // catalogue's singular attribute labels (`catalog.attribute.structural_category.*`)
    // stay for the type picker and the tile subline.
    categoryFilterAll: string;
    categoryFilterLabels: Readonly<Record<StructuralCategory, string>>;
    // The Closet's empty sentence is segment-scoped: on the Owned segment it must not
    // claim the wanted list is empty too.
    ownedEmpty: string;
    wantedEmpty: string;
    bothEmpty: string;
    newTitle: string;
    editTitle: string;
    nameLabel: string;
    nameDescription: string;
    namePlaceholder: string;
    photoTitle: string;
    photoDescription: string;
    photoEmptyBody: string;
    selectPhotoAction: string;
    changePhotoAction: string;
    removePhotoAction: string;
    photoProcessingLabel: string;
    photoError: string;
    photoAccessibilityLabel: (type: string) => string;
    entryStateTitle: string;
    entryStateDescription: string;
    typeTitle: string;
    typeDescription: string;
    typeChoosePrompt: string;
    typePickerHint: string;
    typeAccessibilityLabel: (value: string) => string;
    typeRequiredError: string;
    detailsTitle: string;
    detailsCaption: string;
    colorTitle: string;
    colorDescription: string;
    colorUnspecified: string;
    saveAction: string;
    savingLabel: string;
    createError: string;
    updateError: string;
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
}>;

const englishOwnershipStateLabels = Object.freeze({
  owned: 'Owned',
  wanted: 'Wanted',
});

const en = {
  catalog: catalogMessages.en,
  recommendation: recommendationMessages.en,
  common: {
    back: 'Back',
    continue: 'Continue',
  },
  navigation: {
    today: 'Today',
    weather: 'Weather',
    profile: 'Profile',
    wardrobe: 'Closet',
    settings: 'Settings',
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
    promiseHeading: 'What to expect',
    weatherPromise: 'kuyara uses weather to simplify what to wear each day.',
    outfitsPromise: 'You will see three complete outfit suggestions for different plans.',
    wardrobePromise: 'Your closet keeps track of pieces you own or want, separate from your outfit suggestions.',
    genderTitle: 'Your gender',
    genderBody: 'kuyara uses it to choose the catalog your outfit suggestions come from. You can change it later in Settings.',
    dressStyleTitle: 'How do you usually dress?',
    dressStyleBody: 'Choose the look you wear most days. Suggestions lean that way first and exclude nothing. You can change it later in Settings.',
    dressStyleRequiredError: 'Choose how you usually dress to continue.',
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
    themeTitle: 'Appearance',
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
    weatherNoSnapshot: 'No valid weather snapshot is saved yet. Provider attribution will appear after the first successful weather update.',
    weatherFooter: 'Attribution stays available here for the last valid weather snapshot.',
    aiStatusIntro: 'This active check uses the bounded online probe.',
    aiStatusProvenanceFooter: 'Apple Intelligence is checked on this device. When it cannot choose, kuyara tries an online service before standard suggestions. Apple Intelligence is a trademark of Apple Inc.',
    aiStatusOnDeviceRunning: 'Apple Intelligence is compatible and running.',
    aiStatusOnDeviceOff: 'Apple Intelligence is turned off.',
    aiStatusOnDeviceIncompatible: 'Apple Intelligence is not compatible with this device.',
    aiStatusOnDeviceGettingReady: 'Apple Intelligence is compatible and getting ready.',
    aiStatusAssistant: (provider: string, model: string) =>
      `Answered by ${provider} (${model})`,
    aiStatusLastOnDeviceAi: 'The last recommendation was chosen on this device.',
    aiStatusLastAiAssisted: 'The last recommendation was chosen in the cloud.',
    aiStatusLastStandard: 'The last recommendation used standard suggestions.',
    aiStatusLastUnknown: 'The last recommendation source is unknown.',
    aiStatusCheckAction: 'Check AI status',
    aiStatusChecking: 'Checking AI status…',
    aiStatusResultOk: (time: string) => `AI responded at ${time}`,
    aiStatusResultUnavailable: 'AI did not respond right now.',
    aiStatusResultRateLimited: 'Checked too often. Try again in a little while.',
    aiStatusResultError: 'AI status could not be checked.',
    aiStatusUnsupported: 'AI status checks are not available on this build.',
    saving: 'Saving changes…',
    saveError: 'That change could not be saved. Your previous setting is still active.',
  },
  analytics: {
    consentTitle: 'Help improve kuyara',
    consentBody: 'Knowing which screens are used, whether suggestions load and coarse settings like dress style and age range helps make kuyara better. Your location, photos, closet and name are never included.',
    consentSettingsBody: 'You can change this any time in Settings, under Privacy.',
    acceptAction: 'Help improve',
    declineAction: 'Not now',
    privacyTitle: 'Privacy',
    shareUsageData: 'Share usage data',
    toggleFooter: 'Usage data helps improve kuyara. Turning this off stops collection immediately and unlinks past data from this device.',
    identifierLabel: 'Analytics identifier',
    identifierFooter: 'You can quote this identifier in a request about your data.',
    privacyPolicyLabel: 'Privacy policy',
    statusNotAsked: 'Not asked yet',
  },
  profile: {
    title: 'Profile',
    nameLabel: 'Name',
    nameEditTitle: 'Edit name',
    nameDone: 'Done',
    nameClear: 'Clear name',
    nameSaveError: 'That change could not be saved. Your previous name is still active.',
    nameRemoveHint: 'Choose Done to remove your name.',
    settingsAction: 'Settings',
    settingsHint: 'Opens app settings.',
    wardrobeTitle: 'Closet',
    wardrobeTitleNamed: (name) => `${name}'s Closet`,
    closetHeadingAccessibilityLabel: ({ count }) => `Closet, ${count}.`,
    closetHeadingNamedAccessibilityLabel: ({ name, count }) => `${name}'s Closet, ${count}.`,
    closetHeadingHint: 'Opens your closet.',
    wantedLabel: 'Wanted',
    historyLabel: 'History',
    wardrobeLoading: 'Loading closet counts.',
    wardrobeEmpty: 'You have not added any owned or wanted items yet. Your closet stays separate from your outfit suggestions.',
    wardrobeUnavailable: 'Closet counts are unavailable right now.',
    addPieceAction: 'Add a piece',
    railAllPiecesLabel: 'All pieces',
    railItemAccessibilityLabel: ({ label, position, total }) =>
      `${label}, ${position} of ${total}.`,
  },
  notifications: {
    title: 'Notifications',
    introduction: 'kuyara sends weather alerts for the hours ahead on this device.',
    leadTimeHint: 'An alert arrives up to an hour before rain starts or the temperature swings sharply.',
    quietHoursHint: 'No alert is sent between 22:00 and 07:00.',
    toggleLabel: 'Allow notifications',
    statusOn: 'On',
    statusOff: 'Off',
    permissionDeniedHint: 'Notifications are turned off in system settings.',
    openSettingsAction: 'Open Settings',
    offer: {
      sentences: {
        precipitation_onset: 'kuyara could have warned you before rain or snow started today.',
        temperature_swing: 'kuyara could have warned you before today\u2019s sharp temperature change.',
        morning_briefing: 'kuyara can send a morning briefing at 07:00 and a weather alert before the weather changes during the day.',
      },
      acceptAction: 'Turn on notifications',
      dismissAction: 'Not now',
    },
    morningBriefing: {
      toggleLabel: 'Morning briefing',
      hint: 'A single notification at 07:00 with the morning\u2019s weather, when tomorrow morning is already in the forecast.',
      title: 'Good morning',
      clearBody: ({ low, high }) => (low === high
        ? `A clear morning at ${low}\u00b0C. Your outfit for today is waiting in kuyara.`
        : `A clear morning between ${low}\u00b0C and ${high}\u00b0C. Your outfit for today is waiting in kuyara.`),
      cloudyBody: ({ low, high }) => (low === high
        ? `A cloudy morning at ${low}\u00b0C. Your outfit for today is waiting in kuyara.`
        : `A cloudy morning between ${low}\u00b0C and ${high}\u00b0C. Your outfit for today is waiting in kuyara.`),
      wetBody: ({ low, high }) => (low === high
        ? `A wet morning at ${low}\u00b0C. Your outfit for today is waiting in kuyara.`
        : `A wet morning between ${low}\u00b0C and ${high}\u00b0C. Your outfit for today is waiting in kuyara.`),
    },
    alerts: {
      rainTitle: 'Rain is on the way',
      rainBody: (time) => `Rain is expected around ${time}. Take something waterproof with you.`,
      snowTitle: 'Snow is on the way',
      snowBody: (time) => `Snow is expected around ${time}. Take a warm, waterproof layer with you.`,
      dropTitle: 'It will feel colder',
      dropBody: ({ time, temperatureCelsius }) =>
        `Around ${time}, it will feel like ${temperatureCelsius}°C. Take a warmer layer with you.`,
      riseTitle: 'It will feel warmer',
      riseBody: ({ time, temperatureCelsius }) =>
        `Around ${time}, it will feel like ${temperatureCelsius}°C. Choose a lighter layer.`,
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
    deniedBody: 'Location access was not granted. You can choose a sample location or try again later.',
    permanentDeniedBody: 'Location access can no longer be requested here. Open system settings or choose a sample location.',
    servicesUnavailableBody: 'Location services are unavailable or turned off. Choose a sample location or try again after enabling them.',
    lookupFailedBody: 'Your location could not be found. Your previous location is unchanged.',
    selectionFailedBody: 'That location could not be saved. Your previous location is still active.',
    openSettings: 'Open system settings',
    sampleDisclosure: 'Sample weather data, not live weather.',
    hourlyHeading: 'Coming hours',
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
    feelsLike: (temperature) => `Feels like ${temperature}`,
    range: (minimum, maximum) => `Low ${minimum} · High ${maximum}`,
    precipitation: (probability) => `${Math.round(probability * 100)}% precipitation`,
    currentConditionsAccessibilityLabel: ({
      condition,
      temperature,
      apparentTemperature,
      minimumTemperature,
      maximumTemperature,
      precipitationProbability,
    }) =>
      `${condition}. ${temperature}. Feels like ${apparentTemperature}. ` +
      `Low ${minimumTemperature} · High ${maximumTemperature}. ` +
      `${Math.round(precipitationProbability * 100)}% precipitation`,
    wind: (speed) => `Wind ${speed} m/s`,
    humidity: (humidity) => `${Math.round(humidity * 100)}% humidity`,
    uvIndex: (index) => `UV index ${index}`,
    metricsAccessibilityLabel: ({ windSpeed, humidity, uvIndex }) =>
      `Wind ${windSpeed} m/s. ${Math.round(humidity * 100)}% humidity. UV index ${uvIndex}`,
    hourlyForecastAccessibilityLabel: ({
      day,
      time,
      temperature,
      condition,
      precipitationProbability,
    }) =>
      `${day ? `${day}, ` : ''}${time}. ${temperature}. ${condition}. ` +
      `${Math.round(precipitationProbability * 100)}% precipitation`,
    dailyHeading: 'Coming days',
    dailyPrecipitationValue: (millimetres, probability) => `${millimetres} mm · ${probability}`,
    dailyForecastAccessibilityLabel: ({
      day,
      condition,
      minimumTemperature,
      maximumTemperature,
      precipitationProbability,
      precipitationMillimetres,
      currentTemperature,
    }) =>
      `${currentTemperature ? `Today, ${day}` : day}. ${condition}. ` +
      `Low ${minimumTemperature} · High ${maximumTemperature}. ` +
      `${currentTemperature ? `Now ${currentTemperature}. ` : ''}` +
      `${precipitationMillimetres ? `${precipitationMillimetres} mm, ` : ''}` +
      `${Math.round(precipitationProbability * 100)}% precipitation`,
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
    ownedLabel: englishOwnershipStateLabels.owned,
    wantedLabel: englishOwnershipStateLabels.wanted,
    categoryFilterAll: 'All',
    categoryFilterLabels: {
      top: 'Tops',
      bottom: 'Bottoms',
      one_piece: 'One-piece',
      outerwear: 'Outerwear',
      footwear: 'Shoes',
      accessory: 'Accessories',
    },
    ownedEmpty: 'You have not added any owned items yet.',
    wantedEmpty: 'You have not added any wanted items yet.',
    bothEmpty: 'You have not added any owned or wanted items yet. Your closet stays separate from your outfit suggestions.',
    newTitle: 'Add closet item',
    editTitle: 'Edit closet item',
    nameLabel: 'Item name',
    nameDescription: 'Optional. Use a name that helps you recognize this item.',
    namePlaceholder: 'For example, everyday rain jacket',
    photoTitle: 'Photo',
    photoDescription: 'Optional. One photo of the piece.',
    photoEmptyBody: 'No photo selected.',
    selectPhotoAction: 'Select photo',
    changePhotoAction: 'Change photo',
    removePhotoAction: 'Remove photo',
    photoProcessingLabel: 'Preparing photo…',
    photoError:
      'The photo could not be prepared. Your other changes are still here; please try again.',
    photoAccessibilityLabel: (type: string) => `${type} closet item photo.`,
    entryStateTitle: 'Closet list',
    entryStateDescription: 'Choose whether you own this item or want it.',
    typeTitle: 'Clothing type',
    typeDescription: 'Required. Choose the closest type from the catalog.',
    typeChoosePrompt: 'Choose a type',
    typePickerHint: 'Opens the clothing type chooser.',
    typeAccessibilityLabel: (value: string) => `Clothing type, required: ${value}`,
    typeRequiredError: 'Choose a clothing type before saving.',
    detailsTitle: 'Details',
    detailsCaption: 'Optional. The color family for this item.',
    colorTitle: 'Color family',
    colorDescription: 'Optional. Choose the item’s main color family.',
    colorUnspecified: 'Any',
    saveAction: 'Save item',
    savingLabel: 'Saving item…',
    createError: 'This item could not be added. Your entries are still here; please try again.',
    updateError: 'This item could not be saved. Your changes are still here; please try again.',
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
    title: 'Today',
    greetingNamed: (name) => `Welcome back, ${name}`,
    generationModeOnDeviceAi: 'Chosen with Apple Intelligence',
    generationModeAiAssisted: 'Chosen with AI',
    generationModeOnDeviceAiAccessibilityLabel:
      'Recommendation source: kuyara chose this outfit with Apple Intelligence',
    generationModeAiAssistedAccessibilityLabel:
      'Recommendation source: kuyara chose this outfit with AI',
    generationSourceOnDeviceAi: 'kuyara chose this outfit on your device with Apple Intelligence.',
    generationSourceAiAssisted: 'kuyara chose this outfit with online AI.',
    generationSourceDeterministic: 'AI was not used. kuyara computed this outfit on your device.',
    regenerateAction: 'Show another outfit',
    regenerateCaption: 'See a different outfit for the same day.',
    backAction: 'Back to Today',
    otherOptionsHeading: 'Alternative outfits',
    piecesHeading: 'Wear',
    reasonsHeading: 'Why it works',
    finishingTouchesHeading: 'Finishing touches',
    finishingTouchesAccessibilityLabel: (items) =>
      `Finishing touches: ${items.join(', ')}.`,
    finishingTouchesRowAccessibilityLabel: ({ item, slot }) => `${item}, ${slot}`,
    ownershipOwnedAction: 'I own it',
    ownershipWantedAction: 'I want it',
    ownershipChangeHint: 'Changes whether this piece is in your Closet',
    ownershipOwnedLabel: englishOwnershipStateLabels.owned,
    ownershipWantedLabel: englishOwnershipStateLabels.wanted,
    ownershipUntrackedLabel: 'Not in your Closet',
    ownershipSummary: ({ owned, total }) =>
      owned === 0
        ? 'You don’t own any of these pieces yet. Tap a piece to mark it owned or wanted.'
        : `You own ${owned} of ${total} ${total === 1 ? 'piece' : 'pieces'}.`,
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
    dayWindow: {
      rain: (from, until) => from && until
        ? `Rain is expected between ${from} and ${until}.`
        : from ? `Rain is expected after ${from}.` : until
          ? `Rain is expected until ${until}.` : 'Rain is expected for the remaining hours.',
      snow: (from, until) => from && until
        ? `Snow is expected between ${from} and ${until}.`
        : from ? `Snow is expected after ${from}.` : until
          ? `Snow is expected until ${until}.` : 'Snow is expected for the remaining hours.',
      wind: (from, until) => from && until
        ? `Windy between ${from} and ${until}.`
        : from ? `Windy after ${from}.` : until
          ? `Windy until ${until}.` : 'Windy for the remaining hours.',
      veryWindy: (from, until) => from && until
        ? `Very windy between ${from} and ${until}.`
        : from ? `Very windy after ${from}.` : until
          ? `Very windy until ${until}.` : 'Very windy for the remaining hours.',
      staysHot: (time) => `It stays hot after ${time}.`,
      staysVeryHot: (time) => `It stays very hot after ${time}.`,
      staysCold: (time) => `It stays cold after ${time}.`,
      staysFreezing: (time) => `It stays freezing after ${time}.`,
      coolsTo: (time, temperature) => `It cools to ${temperature} by ${time}.`,
      warmsTo: (time, temperature) => `It warms to ${temperature} by ${time}.`,
      lowest: (time, temperature) => `Lowest around ${time}, near ${temperature}.`,
    },
    emphasis: {
      recommended: 'Recommended',
    },
    updatedAt: (time: string) => `Last updated at ${time}`,
    staleAt: (time: string) => `Last updated at ${time} · May be out of date`,
    refreshingStatus: 'Refreshing today’s guidance…',
    refreshFailedAt: (time: string) => `Couldn't refresh · Showing last update from ${time}`,
    refreshAction: 'Refresh',
    apparentTemperature: (temperature: string) => `Feels like ${temperature}`,
    temperatureRange: (minimum: string, maximum: string) => `Low ${minimum} · High ${maximum}`,
    rainProbability: (probability: string) => `${probability} chance of rain`,
    hourlyRainAccessibilityLabel: ({ time, probabilityPercent }) =>
      `${time}. ${probabilityPercent}% chance of rain`,
    windLabel: 'Wind',
    humidityLabel: 'Humidity',
    uvIndexLabel: 'UV',
    humidityValue: (humidity: number) => `${Math.round(humidity * 100)}%`,
    uvIndexValue: (value: string) => value,
    metricsAccessibilityLabel: ({ windSpeed, humidityPercent, uvIndex }) =>
      `Wind: ${windSpeed} m/s. Humidity: ${humidityPercent}%. UV: ${uvIndex}`,
    optionPosition: (position: number, total: number) => `Option ${position} of ${total}`,
    loadingTitle: 'Preparing today’s guidance',
    loadingBody: 'Your weather summary and outfit options will appear here.',
    loadingAccessibilityLabel: 'Preparing today’s guidance. Content is loading.',
    generatingStatus: 'Choosing today’s outfits.',
    generatingLongWaitStatus: 'Choosing today’s outfits. This can take a little longer.',
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
    }) =>
      `${condition}. ${current} degrees Celsius, feels like ${apparent} degrees. ` +
      `Low ${minimum}, high ${maximum}. ${rainProbability} percent chance of rain.`,
    boardAccessibilityLabel: ({ archetype, pieces }) => `${archetype}. ${pieces.join(', ')}.`,
    stageAccessibilityLabel: ({ temperature, condition, pieces, archetype }) =>
      `${temperature} degrees Celsius. ${condition}. ${pieces.join(', ')}. ${archetype}.`,
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
} satisfies AppMessages;

const tr = {
  catalog: catalogMessages.tr,
  recommendation: recommendationMessages.tr,
  common: {
    back: 'Geri',
    continue: 'Devam et',
  },
  navigation: {
    today: 'Bugün',
    weather: 'Hava',
    profile: 'Profil',
    wardrobe: 'Gardırop',
    settings: 'Ayarlar',
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
    welcomeTitle: 'kuyara’ya hoş geldiniz',
    welcomeBody: 'Hava durumunu dikkate alarak günlük giyim kararlarını sakinleştiren bir yol.',
    promiseHeading: 'Seni neler bekliyor',
    weatherPromise: 'kuyara, her gün ne giyeceğine karar vermeni kolaylaştırmak için hava durumunu kullanır.',
    outfitsPromise: 'Farklı planlar için üç eksiksiz kombin önerisi görürsün.',
    wardrobePromise: 'Gardırobun, sahip olduğun ya da istediğin parçaları kombin önerilerinden ayrı tutar.',
    genderTitle: 'Cinsiyetin',
    genderBody: 'kuyara bunu kombin önerilerinin geldiği kataloğu seçmek için kullanır. Daha sonra Ayarlar’dan değiştirebilirsin.',
    dressStyleTitle: 'Genelde nasıl giyinirsin?',
    dressStyleBody: 'Çoğu gün giydiğin görünümü seç. Öneriler önce o yöne eğilir, hiçbir şeyi dışlamaz. Daha sonra Ayarlar’dan değiştirebilirsin.',
    dressStyleRequiredError: 'Devam etmek için giyim tarzını seç.',
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
    genderTitle: 'Cinsiyet',
    genderWoman: 'Kadın',
    genderMan: 'Erkek',
    dressStyleTitle: 'Giyim tarzı',
    dressStyleCasual: 'Günlük',
    dressStyleSmart: 'Şık',
    dressStyleFormal: 'Resmî',
    birthDateTitle: 'Doğum tarihi',
    languageTitle: 'Dil',
    languageSystem: 'Sistem',
    languageTurkish: 'Türkçe',
    languageEnglish: 'English',
    themeTitle: 'Görünüm',
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
    themeRow: 'Tema',
    versionLine: (version: string, build?: string | null) => build ? `Sürüm ${version} (${build})` : `Sürüm ${version}`,
    developmentBuild: 'Geliştirme derlemesi',
    supportRow: 'Destek',
    shareRow: 'kuyara paylaş',
    shareText: 'Günlük kombinimi seçerken kuyara bana yardımcı oluyor. Sen de göz at.',
    rateRow: 'kuyara değerlendir',
    licenceRow: 'Lisans',
    serviceProvidersHeading: 'Servis sağlayıcıları',
    artificialIntelligenceHeading: 'Yapay zekâ',
    weatherDataHeading: 'Hava durumu verisi',
    weatherNoSnapshot: 'Henüz geçerli hava durumu verisi kaydedilmedi. İlk başarılı güncellemeden sonra sağlayıcı atfı burada görünecek.',
    weatherFooter: 'Kayıtlı son geçerli hava durumu verisinin atfına buradan ulaşabilirsin.',
    aiStatusIntro: 'Bu etkin kontrol sınırlı çevrimiçi sorguyu kullanır.',
    aiStatusProvenanceFooter: 'Apple Intelligence bu cihazda kontrol edilir. Seçim yapamadığında kuyara standart önerilerden önce çevrimiçi servisi dener. Apple Intelligence, Apple Inc.’in ticari markasıdır.',
    aiStatusOnDeviceRunning: 'Apple Intelligence uyumlu ve çalışıyor.',
    aiStatusOnDeviceOff: 'Apple Intelligence kapalı.',
    aiStatusOnDeviceIncompatible: 'Apple Intelligence bu cihazla uyumlu değil.',
    aiStatusOnDeviceGettingReady: 'Apple Intelligence uyumlu ve hazırlanıyor.',
    aiStatusAssistant: (provider: string, model: string) =>
      `Yanıtlayan: ${provider} (${model})`,
    aiStatusLastOnDeviceAi: 'Son öneri bu cihazda seçildi.',
    aiStatusLastAiAssisted: 'Son öneri bulutta seçildi.',
    aiStatusLastStandard: 'Son öneri standart önerilerle oluşturuldu.',
    aiStatusLastUnknown: 'Son önerinin kaynağı bilinmiyor.',
    aiStatusCheckAction: 'AI durumunu kontrol et',
    aiStatusChecking: 'AI durumu kontrol ediliyor…',
    aiStatusResultOk: (time: string) => `AI saat ${time} yanıt verdi.`,
    aiStatusResultUnavailable: 'AI şu anda yanıt vermedi.',
    aiStatusResultRateLimited: 'Çok sık kontrol edildi. Biraz sonra yeniden dene.',
    aiStatusResultError: 'AI durumu kontrol edilemedi.',
    aiStatusUnsupported: 'AI durum kontrolleri bu sürümde kullanılamıyor.',
    saving: 'Değişiklikler kaydediliyor…',
    saveError: 'Bu değişiklik kaydedilemedi. Önceki ayarın kullanılmaya devam ediyor.',
  },
  analytics: {
    consentTitle: "kuyara'yı geliştirmeye yardım et",
    consentBody: "Hangi ekranların kullanıldığını, önerilerin yüklenip yüklenmediğini ve giyim tarzı ile yaş aralığı gibi kaba ayarları bilmek kuyara'yı daha iyi yapar. Konumun, fotoğrafların, gardırobun ve adın hiçbir zaman dahil edilmez.",
    consentSettingsBody: "Bunu istediğin zaman Ayarlar'daki Gizlilik bölümünden değiştirebilirsin.",
    acceptAction: 'Yardım et',
    declineAction: 'Şimdi değil',
    privacyTitle: 'Gizlilik',
    shareUsageData: 'Kullanım verisi paylaş',
    toggleFooter: "Kullanım verisi kuyara'yı geliştirmeye yardımcı olur. Kapatmak toplamayı hemen durdurur ve geçmiş verilerin bu cihazla bağını koparır.",
    identifierLabel: 'Analitik kimliği',
    identifierFooter: 'Verilerinle ilgili bir talepte bu kimliği belirtebilirsin.',
    privacyPolicyLabel: 'Gizlilik politikası',
    statusNotAsked: 'Henüz sorulmadı',
  },
  profile: {
    title: 'Profil',
    nameLabel: 'Ad',
    nameEditTitle: 'Adı düzenle',
    nameDone: 'Bitti',
    nameClear: 'Adı temizle',
    nameSaveError: 'Bu değişiklik kaydedilemedi. Önceki adın kullanılmaya devam ediyor.',
    nameRemoveHint: 'Adını kaldırmak için Bitti’yi seç.',
    settingsAction: 'Ayarlar',
    settingsHint: 'Uygulama ayarlarını açar.',
    wardrobeTitle: 'Gardırop',
    wardrobeTitleNamed: (name) => `Gardırop · ${name}`,
    closetHeadingAccessibilityLabel: ({ count }) => `Gardırop, ${count}.`,
    closetHeadingNamedAccessibilityLabel: ({ name, count }) => `Gardırop · ${name}, ${count}.`,
    closetHeadingHint: 'Gardırobunu açar.',
    wantedLabel: 'İstekler',
    historyLabel: 'Geçmiş',
    wardrobeLoading: 'Gardırop sayıları yükleniyor.',
    wardrobeEmpty: 'Henüz sahip olduğun veya istediğin bir parça eklemedin. Gardırobun kombin önerilerinden ayrı tutulur.',
    wardrobeUnavailable: 'Gardırop sayıları şu anda gösterilemiyor.',
    addPieceAction: 'Parça ekle',
    railAllPiecesLabel: 'Tüm parçalar',
    railItemAccessibilityLabel: ({ label, position, total }) =>
      `${label}, ${total} parçadan ${position}.`,
  },
  notifications: {
    title: 'Bildirimler',
    introduction: 'kuyara bu cihazda, önündeki saatler için hava uyarıları gönderir.',
    leadTimeHint: 'Uyarı, yağmur başlamadan ya da sıcaklık sert değişmeden en çok bir saat önce gelir.',
    quietHoursHint: '22:00 ile 07:00 arasında uyarı gönderilmez.',
    toggleLabel: 'Bildirimlere izin ver',
    statusOn: 'Açık',
    statusOff: 'Kapalı',
    permissionDeniedHint: 'Bildirimler sistem ayarlarında kapalı.',
    openSettingsAction: 'Ayarları Aç',
    offer: {
      sentences: {
        precipitation_onset: 'kuyara bugün yağış başlamadan seni uyarabilirdi.',
        temperature_swing: 'kuyara bugün sıcaklık sert değişmeden seni uyarabilirdi.',
        morning_briefing: 'kuyara sabah 07.00\u2019de bir brifing, gün içinde hava değişmeden de bir uyarı gönderebilir.',
      },
      acceptAction: 'Bildirimleri aç',
      dismissAction: 'Şimdi değil',
    },
    morningBriefing: {
      toggleLabel: 'Sabah brifingi',
      hint: 'Yarın sabah tahminde yer aldığında, 07.00\u2019de sabahın havasını anlatan tek bir bildirim.',
      title: 'Günaydın',
      clearBody: ({ low, high }) => (low === high
        ? `Açık bir sabah, ${low}\u00b0C. Bugünün kombini kuyara\u2019da seni bekliyor.`
        : `Açık bir sabah, ${low}\u00b0C ile ${high}\u00b0C arası. Bugünün kombini kuyara\u2019da seni bekliyor.`),
      cloudyBody: ({ low, high }) => (low === high
        ? `Bulutlu bir sabah, ${low}\u00b0C. Bugünün kombini kuyara\u2019da seni bekliyor.`
        : `Bulutlu bir sabah, ${low}\u00b0C ile ${high}\u00b0C arası. Bugünün kombini kuyara\u2019da seni bekliyor.`),
      wetBody: ({ low, high }) => (low === high
        ? `Yağışlı bir sabah, ${low}\u00b0C. Bugünün kombini kuyara\u2019da seni bekliyor.`
        : `Yağışlı bir sabah, ${low}\u00b0C ile ${high}\u00b0C arası. Bugünün kombini kuyara\u2019da seni bekliyor.`),
    },
    alerts: {
      rainTitle: 'Yağmur geliyor',
      rainBody: (time) => `Saat ${time} civarında yağmur bekleniyor. Yanına su geçirmez bir parça al.`,
      snowTitle: 'Kar geliyor',
      snowBody: (time) => `Saat ${time} civarında kar bekleniyor. Yanına sıcak tutan, su geçirmez bir kat al.`,
      dropTitle: 'Hava daha soğuk hissedilecek',
      dropBody: ({ time, temperatureCelsius }) =>
        `Saat ${time} civarında hissedilen sıcaklık ${temperatureCelsius}°C olacak. Yanına daha sıcak tutan bir kat al.`,
      riseTitle: 'Hava daha sıcak hissedilecek',
      riseBody: ({ time, temperatureCelsius }) =>
        `Saat ${time} civarında hissedilen sıcaklık ${temperatureCelsius}°C olacak. Daha hafif bir kat seç.`,
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
    locationRationaleBody: 'kuyara, kıyafet önerileri için hava durumunu bulmak üzere uygulamayı kullanırken yaklaşık konumunu kullanır.',
    continuePermission: 'Devam et',
    cancel: 'Şimdi değil',
    deniedBody: 'Konum erişimi verilmedi. Örnek bir konum seçebilir veya daha sonra yeniden deneyebilirsin.',
    permanentDeniedBody: 'Konum erişimi buradan yeniden istenemiyor. Sistem ayarlarını aç veya örnek bir konum seç.',
    servicesUnavailableBody: 'Konum servisleri kullanılamıyor veya kapalı. Örnek konum seç ya da servisleri açtıktan sonra yeniden dene.',
    lookupFailedBody: 'Konumun bulunamadı. Önceki konumun değiştirilmedi.',
    selectionFailedBody: 'Bu konum kaydedilemedi. Önceki konumun etkin kalıyor.',
    openSettings: 'Sistem ayarlarını aç',
    sampleDisclosure: 'Örnek hava durumu verisi, canlı değildir.',
    hourlyHeading: 'Önümüzdeki saatler',
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
    feelsLike: (temperature) => `Hissedilen ${temperature}`,
    range: (minimum, maximum) => `En düşük ${minimum} · En yüksek ${maximum}`,
    precipitation: (probability) => `%${Math.round(probability * 100)} yağış`,
    currentConditionsAccessibilityLabel: ({
      condition,
      temperature,
      apparentTemperature,
      minimumTemperature,
      maximumTemperature,
      precipitationProbability,
    }) =>
      `${condition}. Sıcaklık ${temperature}. Hissedilen sıcaklık ${apparentTemperature}. ` +
      `En düşük ${minimumTemperature}, en yüksek ${maximumTemperature}. ` +
      `Yağış olasılığı yüzde ${Math.round(precipitationProbability * 100)}.`,
    wind: (speed) => `Rüzgâr ${speed} m/sn`,
    humidity: (humidity) => `%${Math.round(humidity * 100)} nem`,
    uvIndex: (index) => `UV endeksi ${index}`,
    metricsAccessibilityLabel: ({ windSpeed, humidity, uvIndex }) =>
      `Rüzgâr hızı saniyede ${windSpeed} metre. ` +
      `Nem yüzde ${Math.round(humidity * 100)}. UV endeksi ${uvIndex}.`,
    hourlyForecastAccessibilityLabel: ({
      day,
      time,
      temperature,
      condition,
      precipitationProbability,
    }) =>
      `${day ? `${day}, saat` : 'Saat'} ${time}. Sıcaklık ${temperature}. ${condition}. ` +
      `Yağış olasılığı yüzde ${Math.round(precipitationProbability * 100)}.`,
    dailyHeading: 'Önümüzdeki günler',
    dailyPrecipitationValue: (millimetres, probability) => `${millimetres} mm · ${probability}`,
    dailyForecastAccessibilityLabel: ({
      day,
      condition,
      minimumTemperature,
      maximumTemperature,
      precipitationProbability,
      precipitationMillimetres,
      currentTemperature,
    }) =>
      `${currentTemperature ? `Bugün, ${day}` : day}. ${condition}. ` +
      `En düşük ${minimumTemperature}, en yüksek ${maximumTemperature}. ` +
      `${currentTemperature ? `Şu an ${currentTemperature}. ` : ''}` +
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
    ownedLabel: 'Sahip olduklarım',
    // ADR 0028 section 5: the twelve-letter "İstediklerim" could not fit the label
    // column at fontScale 3.118. The Profile lane already unified profile.wantedLabel;
    // this closes the same key here so the two screens cannot drift again.
    wantedLabel: 'İstekler',
    categoryFilterAll: 'Tümü',
    categoryFilterLabels: {
      top: 'Üstler',
      bottom: 'Altlar',
      one_piece: 'Tek parçalar',
      outerwear: 'Dış giyim',
      footwear: 'Ayakkabılar',
      accessory: 'Aksesuarlar',
    },
    ownedEmpty: 'Henüz sahip olduğun bir parça eklemedin.',
    wantedEmpty: 'Henüz istediğin bir parça eklemedin.',
    bothEmpty: 'Henüz sahip olduğun veya istediğin bir parça eklemedin. Gardırobun kombin önerilerinden ayrı tutulur.',
    newTitle: 'Gardırop parçası ekle',
    editTitle: 'Gardırop parçasını düzenle',
    nameLabel: 'Parça adı',
    nameDescription: 'İsteğe bağlı. Bu parçayı tanımana yardımcı olacak bir ad kullan.',
    namePlaceholder: 'Örneğin günlük yağmurluk',
    photoTitle: 'Fotoğraf',
    photoDescription: 'İsteğe bağlı. Parçanın bir fotoğrafı.',
    photoEmptyBody: 'Fotoğraf seçilmedi.',
    selectPhotoAction: 'Fotoğraf seç',
    changePhotoAction: 'Fotoğrafı değiştir',
    removePhotoAction: 'Fotoğrafı kaldır',
    photoProcessingLabel: 'Fotoğraf hazırlanıyor…',
    photoError:
      'Fotoğraf hazırlanamadı. Diğer değişikliklerin hâlâ burada; lütfen yeniden dene.',
    photoAccessibilityLabel: (type: string) => `${type} gardırop parçası fotoğrafı.`,
    entryStateTitle: 'Gardırop listesi',
    entryStateDescription: 'Bu parçaya sahip olduğunu veya parçayı istediğini seç.',
    typeTitle: 'Giyim türü',
    typeDescription: 'Zorunlu. Katalogdan en yakın türü seç.',
    typeChoosePrompt: 'Tür seç',
    typePickerHint: 'Giyim türü seçicisini açar.',
    typeAccessibilityLabel: (value: string) => `Giyim türü, zorunlu: ${value}`,
    typeRequiredError: 'Kaydetmeden önce bir giyim türü seç.',
    detailsTitle: 'Ayrıntılar',
    detailsCaption: 'İsteğe bağlı. Bu parçanın renk ailesi.',
    colorTitle: 'Renk ailesi',
    colorDescription: 'İsteğe bağlı. Parçanın ana renk ailesini seç.',
    colorUnspecified: 'Fark etmez',
    saveAction: 'Parçayı kaydet',
    savingLabel: 'Parça kaydediliyor…',
    createError: 'Bu parça eklenemedi. Girdilerin hâlâ burada; lütfen yeniden dene.',
    updateError: 'Bu parça kaydedilemedi. Değişikliklerin hâlâ burada; lütfen yeniden dene.',
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
    title: 'Bugün',
    greetingNamed: (name) => `Tekrar hoş geldin, ${name}`,
    generationModeOnDeviceAi: 'Apple Intelligence ile seçildi',
    generationModeAiAssisted: 'AI ile seçildi',
    generationModeOnDeviceAiAccessibilityLabel:
      'Öneri kaynağı: kuyara bu kombini Apple Intelligence ile seçti',
    generationModeAiAssistedAccessibilityLabel:
      'Öneri kaynağı: kuyara bu kombini AI ile seçti',
    generationSourceOnDeviceAi: 'Bu kombini kuyara, cihazında Apple Intelligence ile seçti.',
    generationSourceAiAssisted: 'Bu kombini kuyara çevrimiçi AI ile seçti.',
    generationSourceDeterministic: 'AI kullanılmadı, bu kombini kuyara cihazında hesapladı.',
    regenerateAction: 'Başka kombin göster',
    regenerateCaption: 'Aynı gün için farklı bir kombin gör.',
    backAction: 'Bugün’e dön',
    otherOptionsHeading: 'Alternatif kombinler',
    piecesHeading: 'Parçalar',
    reasonsHeading: 'Neden uygun',
    finishingTouchesHeading: 'Son dokunuşlar',
    finishingTouchesAccessibilityLabel: (items) =>
      `Son dokunuşlar: ${items.join(', ')}.`,
    finishingTouchesRowAccessibilityLabel: ({ item, slot }) => `${item}, ${slot}`,
    ownershipOwnedAction: 'Bende var',
    ownershipWantedAction: 'İstiyorum',
    ownershipChangeHint: 'Bu parçanın Gardırop durumunu değiştirir',
    ownershipOwnedLabel: 'Sende var',
    ownershipWantedLabel: 'İstiyorsun',
    ownershipUntrackedLabel: 'Gardırobunda yok',
    ownershipSummary: ({ owned, total }) =>
      owned === 0
        ? 'Bu parçaların hiçbiri henüz sende yok. Bir parçaya dokunup sende var ya da istiyorsun olarak işaretle.'
        : `Bu kombindeki ${total} parçadan ${owned} tanesi sende var.`,
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
    dayWindow: {
      rain: (from, until) => from && until
        ? `${from} ile ${until} arasında yağmur bekleniyor.`
        : from ? `Saat ${from} sonrasında yağmur bekleniyor.` : until
          ? `Saat ${until} civarına kadar yağmur bekleniyor.` : 'Kalan saatlerde yağmur bekleniyor.',
      snow: (from, until) => from && until
        ? `${from} ile ${until} arasında kar bekleniyor.`
        : from ? `Saat ${from} sonrasında kar bekleniyor.` : until
          ? `Saat ${until} civarına kadar kar bekleniyor.` : 'Kalan saatlerde kar bekleniyor.',
      wind: (from, until) => from && until
        ? `${from} ile ${until} arasında hava rüzgârlı olacak.`
        : from ? `Saat ${from} sonrasında hava rüzgârlı olacak.` : until
          ? `Saat ${until} civarına kadar rüzgâr sürecek.` : 'Kalan saatlerde hava rüzgârlı olacak.',
      veryWindy: (from, until) => from && until
        ? `${from} ile ${until} arasında kuvvetli rüzgâr var.`
        : from ? `Saat ${from} sonrasında kuvvetli rüzgâr var.` : until
          ? `Saat ${until} civarına kadar kuvvetli rüzgâr var.` : 'Kalan saatlerde kuvvetli rüzgâr var.',
      staysHot: (time) => `Saat ${time} sonrasında hava sıcak kalacak.`,
      staysVeryHot: (time) => `Saat ${time} sonrasında hava çok sıcak kalacak.`,
      staysCold: (time) => `Saat ${time} sonrasında hava soğuk kalacak.`,
      staysFreezing: (time) => `Saat ${time} sonrasında dondurucu soğuk sürecek.`,
      coolsTo: (time, temperature) => `Hava ${time} civarında ${temperature} seviyesine inecek.`,
      warmsTo: (time, temperature) => `Hava ${time} civarında ${temperature} seviyesine çıkacak.`,
      lowest: (time, temperature) => `En düşük ${time} civarında, ${temperature} dolayında.`,
    },
    emphasis: {
      recommended: 'Önerilen',
    },
    updatedAt: (time: string) => `Son güncelleme ${time}`,
    staleAt: (time: string) => `Son güncelleme ${time} · Güncelliğini yitirmiş olabilir`,
    refreshingStatus: 'Bugünün önerileri yenileniyor…',
    refreshFailedAt: (time: string) => `Yenilenemedi · ${time} güncellemesi gösteriliyor`,
    refreshAction: 'Yenile',
    apparentTemperature: (temperature: string) => `Hissedilen ${temperature}`,
    temperatureRange: (minimum: string, maximum: string) => `En düşük ${minimum} · En yüksek ${maximum}`,
    rainProbability: (probability: string) => `Yağmur olasılığı ${probability}`,
    hourlyRainAccessibilityLabel: ({ time, probabilityPercent }) =>
      `Saat ${time} için yağmur olasılığı yüzde ${probabilityPercent}.`,
    windLabel: 'Rüzgâr',
    humidityLabel: 'Nem',
    uvIndexLabel: 'UV',
    humidityValue: (humidity: number) => `%${Math.round(humidity * 100)}`,
    uvIndexValue: (value: string) => value,
    metricsAccessibilityLabel: ({ windSpeed, humidityPercent, uvIndex }) =>
      `Rüzgâr hızı saniyede ${windSpeed} metre. ` +
      `Nem yüzde ${humidityPercent}. UV endeksi ${uvIndex}.`,
    optionPosition: (position: number, total: number) => `${total} seçenekten ${position}.`,
    loadingTitle: 'Bugünün önerileri hazırlanıyor',
    loadingBody: 'Hava özeti ve kombin seçenekleri burada görünecek.',
    loadingAccessibilityLabel: 'Bugünün önerileri hazırlanıyor. İçerik yükleniyor.',
    generatingStatus: 'Bugünün kombinleri seçiliyor.',
    generatingLongWaitStatus: 'Bugünün kombinleri seçiliyor. Bu biraz daha uzun sürebilir.',
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
    }) =>
      `${condition}. Sıcaklık ${current} santigrat derece, hissedilen ${apparent} derece. ` +
      `En düşük ${minimum}, en yüksek ${maximum}. Yağmur olasılığı yüzde ${rainProbability}.`,
    boardAccessibilityLabel: ({ archetype, pieces }) => `${archetype}. ${pieces.join(', ')}.`,
    stageAccessibilityLabel: ({ temperature, condition, pieces, archetype }) =>
      `${temperature} santigrat derece. ${condition}. ${pieces.join(', ')}. ${archetype}.`,
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
} satisfies AppMessages;

export type SupportedLanguage = 'en' | 'tr';

export const messages: Readonly<Record<SupportedLanguage, AppMessages>> = Object.freeze({ en, tr });

export function resolveSupportedLanguage(locale: string | null | undefined): SupportedLanguage {
  return locale?.toLocaleLowerCase('en').startsWith('tr') ? 'tr' : 'en';
}

export function getMessages(locale: string | null | undefined): AppMessages {
  return messages[resolveSupportedLanguage(locale)];
}
