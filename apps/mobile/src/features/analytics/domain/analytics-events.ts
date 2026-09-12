// The typed catalog of the twenty-three custom events in `docs/analytics-taxonomy.md`
// section 5. Every enum here is closed: a new value is added to the taxonomy first, in the
// same change that adds it to the code it is derived from, and it bumps the schema version.
// Nothing in this module talks to a provider; it is the contract the `ProductAnalytics`
// port is generic over.
import type { DressStyle, OutfitArchetypeId } from '@kuyara/contracts';

import type { LanguagePreference, ThemePreference } from '@/domain/preferences';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';

// Taxonomy 5.0: incremented only when an existing event's properties change meaning or an
// allowed value set changes, never when a new event is added.
export const ANALYTICS_SCHEMA_VERSION = 1;

type AnalyticsEventBase = Readonly<{
  schema_version: typeof ANALYTICS_SCHEMA_VERSION;
}>;

// Taxonomy 3: the only two profile-derived properties, on four events and nowhere else.
export const ageBuckets = [
  'under_18',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_64',
  '65_plus',
  'unknown',
] as const;
export type AgeBucket = (typeof ageBuckets)[number];

type ProfileSegmentation = Readonly<{
  dress_style: DressStyle;
  age_bucket: AgeBucket;
}>;

// Taxonomy 5.10: the snake_case form of the shared domain `FailureCategory`.
export type FailureCategoryProperty =
  | 'offline'
  | 'unavailable'
  | 'rate_limited'
  | 'unknown';

// Taxonomy 5.0: the snake_case form of the domain's generation mode.
export type GenerationModeProperty = 'ai_assisted' | 'deterministic_fallback';

// Taxonomy 5.5: the snake_case form of `RecommendationRefreshTrigger`, all seven values.
export type TriggerReasonProperty =
  | 'first_recommendation'
  | 'stale_weather_refresh'
  | 'location_changed'
  | 'clothing_preference_changed'
  | 'dress_style_changed'
  | 'new_calendar_day'
  | 'explicit_request';

// Taxonomy 5.4: a total bucketing of the eleven-code condition vocabulary.
export type ConditionCategory =
  | 'clear'
  | 'cloudy'
  | 'fog'
  | 'precipitation'
  | 'snow'
  | 'storm';

// Taxonomy 5.7 and 5.10: one through four, five and above collapsed.
export type CountBucket = 1 | 2 | 3 | 4 | '5+';

type RefreshResult = 'success' | 'failure_kept_last_known' | 'failure_no_snapshot';

export type ErrorSurface =
  | 'today'
  | 'weather'
  | 'recommendation'
  | 'closet'
  | 'settings'
  | 'onboarding';

export type RefreshSurface = 'today' | 'weather' | 'closet';

export type ScreenName =
  | 'onboarding'
  | 'today'
  | 'outfit_detail'
  | 'weather'
  | 'weather_location'
  | 'profile'
  | 'closet_list'
  | 'closet_item_form'
  | 'closet_garment_type_picker'
  | 'settings'
  | 'settings_appearance'
  | 'settings_language'
  | 'settings_notifications'
  | 'settings_gender'
  | 'settings_dress_style'
  | 'settings_birth_date'
  | 'settings_ai_status'
  | 'settings_privacy'
  | 'analytics_consent_sheet';

export type OnboardingStepName =
  | 'welcome'
  | 'gender'
  | 'dress_style'
  | 'birth_date'
  | 'location';

export type FeatureName =
  | 'closet'
  | 'manual_refresh'
  | 'ai_status_probe'
  | 'location_override'
  | 'appearance_override'
  | 'language_override'
  | 'notifications';

// Taxonomy 5.8: which categories changed, never any value.
export type ClosetFieldChanged =
  | 'garment_type'
  | 'name'
  | 'color_family'
  | 'thermal_level_override'
  | 'water_protection_override'
  | 'wind_protection_override'
  | 'breathability_override'
  | 'arm_coverage_override'
  | 'leg_coverage_override'
  | 'traction_suitability_override'
  | 'state'
  | 'photo';

type ClosetEntryPoint = 'closet_list' | 'outfit_detail';

// The event catalog. Each member is the complete property payload for one event name.
export type AnalyticsEventCatalog = {
  onboarding_started: AnalyticsEventBase;
  onboarding_step_completed: AnalyticsEventBase &
    Readonly<{
      step_name: OnboardingStepName;
      step_index: 1 | 2 | 3 | 4 | 5;
      skipped: boolean;
      // Taxonomy 3: the value being chosen on the dress style step, not segmentation.
      dress_style?: DressStyle;
    }>;
  onboarding_completed: AnalyticsEventBase &
    ProfileSegmentation &
    Readonly<{ location_method: 'device' | 'manual' | 'skipped' }>;
  screen_viewed: AnalyticsEventBase & Readonly<{ screen_name: ScreenName }>;
  // Taxonomy 5.4: `condition_category` exists only on a successful refresh.
  weather_refreshed: AnalyticsEventBase &
    Readonly<{
      trigger_method:
        | 'manual'
        | 'automatic_no_cache'
        | 'automatic_stale'
        | 'location_changed';
    }> &
    (
      | Readonly<{ result: 'success'; condition_category: ConditionCategory }>
      | Readonly<{ result: 'failure_kept_last_known' | 'failure_no_snapshot' }>
    );
  location_changed: AnalyticsEventBase &
    Readonly<{
      method: 'device' | 'manual_selection';
      change_context: 'onboarding' | 'weather_tab';
    }>;
  recommendation_viewed: AnalyticsEventBase &
    ProfileSegmentation &
    Readonly<{
      generation_mode: GenerationModeProperty;
      cache_state: 'fresh' | 'stale_shown' | 'refreshing';
      // Taxonomy 5.5: the success contract selects exactly three suggestions.
      outfit_count: 3;
    }>;
  // Taxonomy 5.5: both failure forms omit `generation_mode`; no new result exists.
  recommendation_regenerated: AnalyticsEventBase &
    Readonly<{ trigger_reason: TriggerReasonProperty }> &
    (
      | Readonly<{ result: 'success'; generation_mode: GenerationModeProperty }>
      | Readonly<{ result: 'failure_kept_last_known' | 'failure_no_snapshot' }>
    );
  outfit_detail_opened: AnalyticsEventBase &
    ProfileSegmentation &
    Readonly<{
      outfit_position: 1 | 2 | 3;
      archetype: OutfitArchetypeId;
      generation_mode: GenerationModeProperty;
    }>;
  // Taxonomy 5.7: Closet refresh starts from a loaded list, so it has no no-snapshot form.
  manual_refresh_triggered: AnalyticsEventBase &
    (
      | Readonly<{ surface: 'today' | 'weather'; result: RefreshResult }>
      | Readonly<{
          surface: 'closet';
          result: 'success' | 'failure_kept_last_known';
        }>
    );
  retry_after_failure_triggered: AnalyticsEventBase &
    Readonly<{
      surface: RefreshSurface;
      attempt_number: CountBucket;
      result: 'success' | 'failure';
    }>;
  closet_item_created: AnalyticsEventBase &
    ProfileSegmentation &
    Readonly<{
      state: WardrobeEntryState;
      garment_type_id: GarmentTypeId;
      has_photo: boolean;
      entry_point: ClosetEntryPoint;
    }>;
  closet_item_updated: AnalyticsEventBase &
    Readonly<{
      fields_changed: readonly ClosetFieldChanged[];
      garment_type_id: GarmentTypeId;
      entry_point: ClosetEntryPoint;
    }>;
  closet_item_deleted: AnalyticsEventBase &
    Readonly<{ state: WardrobeEntryState; had_photo: boolean }>;
  // Taxonomy 5.9: gender and birth date carry no value, since neither is an allowed property.
  setting_changed: AnalyticsEventBase &
    (
      | Readonly<{ setting_name: 'appearance_theme'; new_value: ThemePreference }>
      | Readonly<{ setting_name: 'language'; new_value: LanguagePreference }>
      | Readonly<{ setting_name: 'notifications_enabled'; new_value: boolean }>
      | Readonly<{ setting_name: 'dress_style'; new_value: DressStyle }>
      | Readonly<{ setting_name: 'gender' | 'birth_date' }>
    );
  ai_probe_triggered: AnalyticsEventBase &
    Readonly<{ result: 'ok' | 'unavailable' | 'rate_limited' | 'error' }>;
  error_shown: AnalyticsEventBase &
    Readonly<{
      surface: ErrorSurface;
      failure_category: FailureCategoryProperty;
      occurrence_count: CountBucket;
    }>;
  error_recovered: AnalyticsEventBase &
    Readonly<{ surface: ErrorSurface; failure_category: FailureCategoryProperty }>;
  feature_used_first_time: AnalyticsEventBase &
    Readonly<{ feature_name: FeatureName }>;
  // Taxonomy 5.13: `can_request_again` only qualifies a blocked outcome.
  notification_permission_resolved: AnalyticsEventBase &
    (
      | Readonly<{ outcome: 'enabled' }>
      | Readonly<{ outcome: 'blocked'; can_request_again: boolean }>
    );
  notification_opened: AnalyticsEventBase;
  analytics_consent_granted: AnalyticsEventBase &
    Readonly<{ surface: 'today_sheet' | 'settings_privacy' }>;
  analytics_consent_withdrawn: AnalyticsEventBase;
};

export type AnalyticsEventName = keyof AnalyticsEventCatalog;

export type AnalyticsEventProperties<Name extends AnalyticsEventName> =
  AnalyticsEventCatalog[Name];

// The exhaustive runtime list. `satisfies` rejects a name the catalog does not define, and
// the guard test compares it against the property-key catalog, which the compiler forces to
// carry every event.
export const analyticsEventNames = [
  'onboarding_started',
  'onboarding_step_completed',
  'onboarding_completed',
  'screen_viewed',
  'weather_refreshed',
  'location_changed',
  'recommendation_viewed',
  'recommendation_regenerated',
  'outfit_detail_opened',
  'manual_refresh_triggered',
  'retry_after_failure_triggered',
  'closet_item_created',
  'closet_item_updated',
  'closet_item_deleted',
  'setting_changed',
  'ai_probe_triggered',
  'error_shown',
  'error_recovered',
  'feature_used_first_time',
  'notification_permission_resolved',
  'notification_opened',
  'analytics_consent_granted',
  'analytics_consent_withdrawn',
] as const satisfies readonly AnalyticsEventName[];

// Keys of a union member are the union's keys, so the optional and variant properties are
// visible to the privacy guard test as well.
type PropertyKeyOf<Payload> = Payload extends unknown ? keyof Payload : never;

// The runtime projection of the catalog's property keys, for the privacy guard test in
// `analytics-events.test.mjs`. Types do not survive to runtime; this list does.
export const analyticsEventPropertyKeys = {
  onboarding_started: ['schema_version'],
  onboarding_step_completed: [
    'schema_version',
    'step_name',
    'step_index',
    'skipped',
    'dress_style',
  ],
  onboarding_completed: [
    'schema_version',
    'dress_style',
    'age_bucket',
    'location_method',
  ],
  screen_viewed: ['schema_version', 'screen_name'],
  weather_refreshed: [
    'schema_version',
    'trigger_method',
    'result',
    'condition_category',
  ],
  location_changed: ['schema_version', 'method', 'change_context'],
  recommendation_viewed: [
    'schema_version',
    'dress_style',
    'age_bucket',
    'generation_mode',
    'cache_state',
    'outfit_count',
  ],
  recommendation_regenerated: [
    'schema_version',
    'trigger_reason',
    'result',
    'generation_mode',
  ],
  outfit_detail_opened: [
    'schema_version',
    'dress_style',
    'age_bucket',
    'outfit_position',
    'archetype',
    'generation_mode',
  ],
  manual_refresh_triggered: ['schema_version', 'surface', 'result'],
  retry_after_failure_triggered: [
    'schema_version',
    'surface',
    'attempt_number',
    'result',
  ],
  closet_item_created: [
    'schema_version',
    'dress_style',
    'age_bucket',
    'state',
    'garment_type_id',
    'has_photo',
    'entry_point',
  ],
  closet_item_updated: [
    'schema_version',
    'fields_changed',
    'garment_type_id',
    'entry_point',
  ],
  closet_item_deleted: ['schema_version', 'state', 'had_photo'],
  setting_changed: ['schema_version', 'setting_name', 'new_value'],
  ai_probe_triggered: ['schema_version', 'result'],
  error_shown: [
    'schema_version',
    'surface',
    'failure_category',
    'occurrence_count',
  ],
  error_recovered: ['schema_version', 'surface', 'failure_category'],
  feature_used_first_time: ['schema_version', 'feature_name'],
  notification_permission_resolved: [
    'schema_version',
    'outcome',
    'can_request_again',
  ],
  notification_opened: ['schema_version'],
  analytics_consent_granted: ['schema_version', 'surface'],
  analytics_consent_withdrawn: ['schema_version'],
} as const satisfies {
  [Name in AnalyticsEventName]: readonly PropertyKeyOf<
    AnalyticsEventProperties<Name>
  >[];
};

type MissingPropertyKey = {
  [Name in AnalyticsEventName]: Exclude<
    PropertyKeyOf<AnalyticsEventProperties<Name>>,
    (typeof analyticsEventPropertyKeys)[Name][number]
  >;
}[AnalyticsEventName];

// A property the catalog above forgot to list is a compile error here: only `never`
// satisfies the constraint, so the runtime projection cannot drift from the types.
type NoMissingPropertyKey<Key extends never> = Key;
export type AnalyticsPropertyKeysAreExhaustive =
  NoMissingPropertyKey<MissingPropertyKey>;
