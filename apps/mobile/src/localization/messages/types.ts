import type {
  AccessoryOutfitSlot,
  OutfitCompositionReasonCode,
  OutfitSlot,
} from '@/features/recommendation/domain/outfit-composition';
import type { RemovableSlot, SwappableSlot } from '@/features/recommendation/domain/manual-mix';
import type { OutfitRatingReason } from '@/features/today/domain/outfit-rating';
import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import type { ClothingRequirementReasonCode } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { WeatherCause } from '@/features/recommendation/domain/weather-causes';
import type { WeatherAlertOfferReason } from '@/features/notifications/domain/weather-alert-offer';
import type {
  WeatherConditionCode as LiveWeatherConditionCode,
} from '@/features/weather/domain/weather';
import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type {
  AccountIntroLimits,
  AccountIntroPageId,
} from '@/features/account/application/account-intro-pages';
import type { WindSpeedUnit } from '@/domain/wind-speed';
import type { ClosetColorOptionId } from '@/features/wardrobe/domain/closet-color-options';
import type { CatalogMessages } from '@/features/catalog/localization/catalog-messages';
import type { RecommendationMessages } from '@/features/recommendation/localization/recommendation-messages';

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
    /** The morning and evening sheets' question, naming the profile's usual day type. */
    usualQuestion: DayTypeMessages;
    usualQuestionEvening: DayTypeMessages;
    /** The one large answer: the profile's usual day type. */
    usualAction: string;
    /** The line over the other two day types. */
    differentQuestion: string;
    differentQuestionEvening: string;
    /** Opens the optional styles step. */
    pickStyles: string;
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
  laterReady: (values: { departure: string; ready: string }) => string;
  otherOptionsHeading: string;
  // The composed pool past the outfits on screen, in one strip under the alternatives.
  moreIdeas: Readonly<{
    heading: string;
    caption: (count: number) => string;
    /** A deterministic day: no stylist looked, so the line names the weather alone. */
    captionDeterministic: (count: number) => string;
  }>;
  // In the evening, the outfit chosen for the next dressing day, in one strip under today's.
  tomorrow: Readonly<{
    heading: string;
    morningHeading: string;
    // One line: the condition, then the day's low-to-high range.
    weather: (values: { condition: string; minimum: string; maximum: string }) => string;
    // The same range alone, where the condition stands beside it (the detail's weather recap).
    range: (values: { minimum: string; maximum: string }) => string;
    weatherAccessibilityLabel: (values: {
      condition: string; minimum: string; maximum: string; unitName: string;
    }) => string;
    stripAccessibilityLabel: (values: { outfit: string; weather: string }) => string;
    stripAccessibilityHint: string;
    morningStripAccessibilityLabel: (values: { outfit: string; weather: string }) => string;
    morningStripAccessibilityHint: string;
    recapAccessibilityLabel: (values: {
      condition: string; minimum: string; maximum: string; unitName: string;
      rainProbability: number; coverageCaption: string | null;
    }) => string;
  }>;
  piecesHeading: string;
  finishingTouchesHeading: string;
  finishingTouchesAccessibilityLabel: (items: readonly string[]) => string;
  finishingTouchesRowAccessibilityLabel: (
    parts: Readonly<{ item: string; slot: string }>,
  ) => string;
  ownershipOwnedAction: string;
  /** "Why this outfit": the weather that put each piece in the outfit. */
  whyOutfit: Readonly<{
    heading: string;
    causes: Readonly<Record<WeatherCause, string>>;
    link: Readonly<Record<WeatherCause, (garments: readonly string[]) => string>>;
  }>;
  /** The empty Closet's one tap that adds the outfit's pieces as owned. */
  closetSeed: Readonly<{
    action: string;
    body: string;
    question: string;
    choice: Readonly<Record<'owned' | 'wanted', string>>;
    cancel: string;
    added: (count: number) => string;
    failed: string;
  }>;
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
    // Detail edit (ADR 0026 section 6): a layer taken off or added, the finishing touches
    // taken off, put back and added. Every sentence is whole, per slot where a slot is named.
    /** The enlarged layer's strip action; its spoken sentence names the layer. */
    takeOff: string;
    takeOffAccessibilityLabel: Readonly<Record<RemovableSlot, string>>;
    /** One announcement after a layer is taken off; the unusual one also carries the note. */
    takenOff: Readonly<Record<RemovableSlot, string>>;
    takenOffUnusual: Readonly<Record<RemovableSlot, string>>;
    /** The empty place a layer taken off leaves in the rows, and its subtitle. */
    noLayer: Readonly<Record<RemovableSlot, string>>;
    tookOff: string;
    changeEmptyAccessibilityLabel: Readonly<Record<RemovableSlot, string>>;
    /** The empty place's picker entry, fixed first. */
    wearWithout: Readonly<Record<RemovableSlot, string>>;
    /** A layer the reader added. */
    added: string;
    /** A piece the reader chose to compose around. */
    yourChoice: string;
    addLayer: string;
    addLayerHint: string;
    addAccessory: string;
    addAccessoryHint: string;
    /** An added accessory's subtitle: its slot, then "added". */
    accessoryAdded: (slot: string) => string;
    accessoryTakeOffAccessibilityLabel: Readonly<Record<AccessoryOutfitSlot, (piece: string) => string>>;
    /** The closing line once finishing touches are taken off: one whole sentence per count. */
    accessoriesTookOff: (count: number) => string;
    putBack: string;
    putBackAccessibilityLabel: (count: number) => string;
  }>;
  /**
   * Compose around chosen pieces (ADR 0026 section 6): the members-only row under "Wore this
   * today", its sheet, and the result's line. The colour group's name is one whole phrase per
   * slot, never a piece name inflected in place.
   */
  compose: Readonly<{
    entry: string;
    membersChip: string;
    /** Spoken after a non-member's row: what a tap opens. */
    membersHint: string;
    title: string;
    /** Takes the piece limit, `composePieceLimit`. */
    subtitle: (limit: number) => string;
    fromOutfit: string;
    yourPieces: string;
    chooseAnother: string;
    back: string;
    /** Spoken on a piece that cannot be ticked while the limit is chosen. */
    limitHint: (limit: number) => string;
    colorLabel: Readonly<Record<SwappableSlot, string>>;
    build: string;
    chosenCount: (count: number, limit: number) => string;
    /** The result's subtitle under the title. */
    builtFrom: string;
    /** Compose never asks AI, so its source sentence has one form. */
    source: string;
    /** The visible "1 / 3" and its spoken whole phrase. */
    position: (position: number, total: number) => string;
    positionAccessibilityLabel: (position: number, total: number) => string;
    showAnother: string;
  }>;
  /**
   * The outfit detail's share button, the name on the shared outfit card, and the text sent
   * with the image, which carries the App Store link.
   */
  share: Readonly<{ action: string; brandName: string; message: (storeUrl: string) => string }>;
  // ADR 0038: "Wore this today" and its saved state, directly under the board.
  wornAction: string;
  wornToday: string;
  wornSaveError: string;
  /**
   * The like and dislike under it, shown only while sharing is on. The question is the row's
   * name and gives way to the thanks once a verdict is chosen; a dislike offers the reasons.
   */
  rating: Readonly<{
    question: string;
    thanks: string;
    like: string;
    dislike: string;
    reasonsHeading: string;
    reasons: Readonly<Record<OutfitRatingReason, string>>;
  }>;
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
  replacedOutfitTitle: string;
  replacedOutfitBody: string;
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
  /** Takes the style limit, `styleAestheticsLimit`. */
  stylePreferencesBody: (limit: number) => string;
  stylePreferencesNone: string;
  stylePreferencesDone: string;
  /** Takes the style limit, `styleAestheticsLimit`. */
  stylePreferencesLimit: (limit: number) => string;
  styleAestheticMinimal: string;
  styleAestheticClassic: string;
  styleAestheticSporty: string;
  styleAestheticStreetwear: string;
  styleAestheticRelaxed: string;
  dayQuestionsTitle: string;
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
    /** Take the display name's shortest and longest length from `profile.ts`. */
    nameShortError: (minimum: number) => string;
    nameLongError: (maximum: number) => string;
    nameNotNow: string;
    welcomeTitle: string;
    welcomeBody: string;
    welcomePreviewTitle: (temperature: string, condition: string) => string;
    welcomePreviewCaption: string;
    nameGreetingEmpty: string;
    nameGreetingCaption: string;
    genderTitle: string;
    genderBody: string;
    dressStyleTitle: string;
    dressStyleBody: string;
    dressStyleRequiredError: string;
    stylePreferencesTitle: string;
    /** Takes the style limit, `styleAestheticsLimit`. */
    stylePreferencesBody: (limit: number) => string;
    ageTitle: string;
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
    unitsHeading: string;
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
    /** Unit choices in Appearance; the values are unit symbols, never assembled sentences. */
    units: Readonly<{
      temperatureRow: string;
      windSpeedRow: string;
      system: string;
      celsius: string;
      fahrenheit: string;
      kmh: string;
      mph: string;
    }>;
    versionLine: (version: string, build?: string | null) => string;
    developmentBuild: string;
    supportRow: string;
    feedback: Readonly<{
      title: string;
      body: string;
      messageLabel: string;
      placeholder: string;
      characterCount: (current: number, maximum: number) => string;
      send: string;
      cancel: string;
      failed: string;
      sentTitle: string;
      sentBody: string;
      done: string;
    }>;
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
    withdrawnIdentifierFooter: string;
    removeIdentifier: string;
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
    historyEmptyBody: string;
    historyEmptyAction: string;
    historyLoadError: string;
    historyRetryAction: string;
    // History's Sunday-evening look back at the week (ADR 0038): counts the reader's own
    // records, never a goal, a streak or a missing day.
    historyWeekTitle: string;
    historyWeekDays: (count: number) => string;
    historyWeekDressedFor: Readonly<Record<'rain' | 'cold' | 'light', (count: number) => string>>;
    historyWeekMostWorn: (values: { piece: string; count: number }) => string;
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
    lastKnownPlace: string;
    useCurrentLocation: string;
    locatingDevice: string;
    locationFound: string;
    locationFoundNamed: (name: string) => string;
    changeLocationAction: string;
    locationRationaleBody: string;
    cancel: string;
    lookupFailedBody: string;
    selectionFailedBody: string;
    lookupFailedNoLocationBody: string;
    selectionFailedNoLocationBody: string;
    openSettings: string;
    sampleDisclosure: string;
    hourlyHeading: string;
    hourlyNow: string;
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
    /** Spoken wind line, one per unit in `@/domain/wind-speed`. */
    wind: Readonly<Record<WindSpeedUnit, (speed: string) => string>>;
    humidity: (humidity: number) => string;
    /** The spoken UV line: the whole index and its band's word. */
    uvIndex: (index: string, level: string) => string;
    /** The WHO UV index bands, as a reader says them. */
    uvLevels: Readonly<Record<'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme', string>>;
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
    windValue: Readonly<Record<WindSpeedUnit, (speed: string) => string>>;
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
    /** A Closet section heading spoken whole: its name and how many pieces it holds. */
    sectionAccessibilityLabel: Readonly<Record<'owned' | 'wanted', (count: number) => string>>;
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
    untypedPhotoAccessibilityLabel: string;
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
    colorOptionNames: Readonly<Record<ClosetColorOptionId, string>>;
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
    /** One page per benefit, in the order `accountIntroPageIds` lists them. */
    pages: (limits: AccountIntroLimits) => Readonly<Record<AccountIntroPageId, Readonly<{ title: string; body: string }>>>;
    /** A page dot's spoken name: "Page 2 of 5". */
    pagePosition: (page: number, total: number) => string;
    /** The control that stops or starts the pages moving on by themselves, named by its action. */
    pausePages: string;
    playPages: string;
    continueWith: ByProvider;
    notNow: string;
    /** ADR 0041 section 5: what works without an account, then that continuing accepts the Account terms. */
    footer: string;
    terms: string;
    privacy: string;
    cancelled: string;
    offline: string;
    failed: ByProvider;
  }>;
  welcome: Readonly<{
    title: string;
    summary: (pieces: number, days: number) => string;
    /** After sign-in without the sync consent: only name and gender went to the account. */
    withoutRecords: string;
    /** After sign-in whose first sync failed or did not run: nothing reached the account yet. */
    notYet: string;
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
    offlineWaiting: (pending: number) => string;
    waiting: (pending: number) => string;
    syncingCount: (pending: number) => string;
    syncNow: string;
    retry: string;
    /** `time` is null until a sync has completed on this phone: no footer names a last sync then. */
    upToDateFooter: (time: string | null) => string;
    offlineFooter: (pending: number, time: string | null) => string;
    syncingFooter: (pending: number, time: string | null) => string | undefined;
    failedFooter: (pending: number, time: string | null) => string;
  }>;
  account: Readonly<{
    title: string;
    closet: string;
    pieces: (count: number) => string;
    history: string;
    days: (count: number) => string;
    preferences: string;
    included: string;
    notIncluded: string;
    methodsHeading: string;
    providerName: ByProvider;
    connected: string;
    add: ByProvider;
    methodsFooter: string;
    signOut: string;
    delete: string;
    deleteFooter: string;
  }>;
  /** `body` while the records sync; `bodyWithoutRecords` without the sync consent. */
  signOutAlert: Readonly<{ title: string; body: string; bodyWithoutRecords: string; cancel: string; confirm: string }>;
  deletion: Readonly<{
    title: string;
    goneHeading: string;
    goneAccount: ByProvider;
    /** What the account holds: with the sync consent the records, without it the name and gender. */
    goneData: string;
    goneDataWithoutRecords: string;
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
    doneTitle: string;
    doneBody: (pieces: number, days: number) => string;
    /** Where the profile came from: all four fields, or the name and gender only (`ProfileSource`). */
    doneProfile: string;
    doneNameAndGender: string;
    done: string;
  }>;
  deleted: Readonly<{
    title: string;
    gone: ByProvider;
    /** When Apple's sign-in could not be disconnected: what was deleted, then how to remove it. */
    goneUnrevoked: string;
    appleUnrevoked: string;
    stay: string;
    done: string;
  }>;
  /** The result sheet after a link merges this phone and the account, first or different (ADR 0041 sections 4 and 6). */
  merge: Readonly<{
    title: string;
    closet: (added: number, received: number) => string;
    history: (added: number, received: number) => string;
    rule: string;
    duplicates: string;
    openCloset: string;
    done: string;
  }>;
  /** The system alert when the identity being added belongs to another account (ADR 0041 section 1). */
  identityTaken: Readonly<{ title: ByProvider; body: ByProvider; ok: string }>;
  /** The sync consent sheet (ADR 0041 sections 5 and 10). */
  consent: Readonly<{
    title: string;
    /** The approved consent wording, verbatim; `sync-consent-text.test.mjs` pins it to the text version. */
    syncConsentSubtitle: string;
    syncConsentBox: string;
    readText: string;
    hideText: string;
    continue: string;
    failed: string;
    /**
     * The full consent text, verbatim, one entry per paragraph or bullet: `**Lead.** rest` opens a
     * paragraph with a bold lead and `- ` marks a bullet. The one account surface that may say
     * where records are kept.
     */
    syncConsentText: readonly string[];
  }>;
  /** The Account screen's sync consent group: whether the records sync, and the way to change it. */
  records: Readonly<{
    heading: string;
    /** The status row's noun label ("Record sync" On or Off), never read as the action row. */
    label: string;
    on: string;
    off: string;
    give: string;
    withdraw: string;
    onFooter: string;
    offFooter: string;
    failed: string;
  }>;
  withdrawAlert: Readonly<{ title: string; body: string; cancel: string; confirm: string }>;
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
