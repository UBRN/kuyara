-- Frozen SQLite schema at migration version 29, the schema build 20 ships and the last version before migration 30.
-- Derived from the migration file at release commit 1960f5ab (build 20); do not regenerate from working migrations.
CREATE TABLE wardrobe_items (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL,
        name TEXT,
        category TEXT NOT NULL CHECK (
          category IN ('top', 'bottom', 'one_piece', 'outerwear', 'footwear', 'accessory')
        ),
        color TEXT,
        photo_relative_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT, garment_type_id TEXT, color_family TEXT CHECK (
        color_family IS NULL OR color_family IN (
          'black', 'white', 'gray', 'brown', 'beige', 'red', 'orange',
          'yellow', 'green', 'blue', 'purple', 'pink', 'multicolor'
        )
      ), thermal_level_override TEXT CHECK (
        thermal_level_override IS NULL OR thermal_level_override IN (
          'none', 'light', 'moderate', 'high'
        )
      ), water_protection_override TEXT CHECK (
        water_protection_override IS NULL OR water_protection_override IN (
          'none', 'water_resistant', 'waterproof'
        )
      ), wind_protection_override TEXT CHECK (
        wind_protection_override IS NULL OR wind_protection_override IN (
          'none', 'wind_resistant'
        )
      ), breathability_override TEXT CHECK (
        breathability_override IS NULL OR breathability_override IN (
          'low', 'moderate', 'high'
        )
      ), arm_coverage_override TEXT CHECK (
        arm_coverage_override IS NULL OR arm_coverage_override IN (
          'none', 'partial', 'full'
        )
      ), leg_coverage_override TEXT CHECK (
        leg_coverage_override IS NULL OR leg_coverage_override IN (
          'none', 'partial', 'full'
        )
      ), traction_suitability_override TEXT CHECK (
        traction_suitability_override IS NULL OR traction_suitability_override IN (
          'everyday', 'enhanced'
        )
      ), entry_state TEXT NOT NULL DEFAULT 'owned'
          CHECK (entry_state IN ('owned', 'wanted')), color_option_id TEXT, color_custom_hex TEXT CHECK (
        color_custom_hex IS NULL OR (
          length(color_custom_hex) = 7 AND
          color_custom_hex GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'
        )
      ), pending_sync INTEGER NOT NULL DEFAULT 0
        CHECK (pending_sync IN (0, 1)),
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      );

CREATE INDEX idx_wardrobe_items_profile_deleted_updated
      ON wardrobe_items (local_profile_id, deleted_at, updated_at DESC);

CREATE TABLE active_locations (
        local_profile_id TEXT PRIMARY KEY NOT NULL,
        location_key TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('manual', 'device')),
        manual_catalog_id TEXT,
        latitude_e2 INTEGER NOT NULL CHECK (latitude_e2 BETWEEN -9000 AND 9000),
        longitude_e2 INTEGER NOT NULL CHECK (longitude_e2 BETWEEN -18000 AND 18000),
        time_zone TEXT NOT NULL,
        device_accuracy TEXT CHECK (
          device_accuracy IS NULL OR device_accuracy IN ('approximate', 'full')
        ),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, display_name TEXT CHECK (
        display_name IS NULL OR length(trim(display_name)) BETWEEN 1 AND 200
      ),
        CHECK (
          (source = 'manual' AND manual_catalog_id IS NOT NULL AND device_accuracy IS NULL)
          OR
          (source = 'device' AND manual_catalog_id IS NULL AND device_accuracy IS NOT NULL)
        ),
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      );

CREATE TABLE weather_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL,
        location_key TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        origin_kind TEXT NOT NULL CHECK (origin_kind IN ('sample', 'live')),
        source_id TEXT NOT NULL,
        temperature_c REAL NOT NULL,
        apparent_temperature_c REAL NOT NULL,
        minimum_temperature_c REAL NOT NULL,
        maximum_temperature_c REAL NOT NULL,
        condition_code TEXT NOT NULL CHECK (condition_code IN (
          'clear', 'mostly_clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle',
          'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm'
        )),
        precipitation_probability REAL NOT NULL CHECK (
          precipitation_probability BETWEEN 0 AND 1
        ),
        wind_speed_mps REAL NOT NULL CHECK (wind_speed_mps >= 0),
        humidity REAL NOT NULL CHECK (humidity BETWEEN 0 AND 1),
        uv_index REAL NOT NULL CHECK (uv_index >= 0), daily_json TEXT,
        UNIQUE (local_profile_id, location_key),
        CHECK (minimum_temperature_c <= maximum_temperature_c),
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      );

CREATE TABLE weather_hourly_entries (
        snapshot_id TEXT NOT NULL,
        forecast_at TEXT NOT NULL,
        temperature_c REAL NOT NULL,
        apparent_temperature_c REAL NOT NULL,
        condition_code TEXT NOT NULL CHECK (condition_code IN (
          'clear', 'mostly_clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle',
          'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm'
        )),
        precipitation_probability REAL NOT NULL CHECK (
          precipitation_probability BETWEEN 0 AND 1
        ),
        wind_speed_mps REAL NOT NULL CHECK (wind_speed_mps >= 0),
        humidity REAL NOT NULL CHECK (humidity BETWEEN 0 AND 1),
        uv_index REAL NOT NULL CHECK (uv_index >= 0),
        PRIMARY KEY (snapshot_id, forecast_at),
        FOREIGN KEY (snapshot_id) REFERENCES weather_snapshots(id)
          ON UPDATE RESTRICT
          ON DELETE CASCADE
      );

CREATE INDEX idx_weather_snapshots_profile_fetched
      ON weather_snapshots (local_profile_id, fetched_at DESC);

CREATE TABLE "local_profiles" (
        singleton_key INTEGER PRIMARY KEY NOT NULL CHECK (singleton_key = 1),
        id TEXT NOT NULL UNIQUE,
        gender TEXT CHECK (gender IS NULL OR gender IN ('woman', 'man')),
        language_preference TEXT NOT NULL CHECK (language_preference IN ('system', 'tr', 'en')),
        theme_preference TEXT NOT NULL CHECK (theme_preference IN ('system', 'light', 'dark')),
        onboarding_completed INTEGER NOT NULL CHECK (onboarding_completed IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        notifications_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (notifications_opt_in IN (0, 1)),
        birth_date TEXT CHECK (
          birth_date IS NULL OR (
            birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
            AND CAST(substr(birth_date, 1, 4) AS INTEGER) BETWEEN 1900 AND 2100
          )
        )
      , dress_style TEXT CHECK (
          dress_style IS NULL OR dress_style IN ('casual', 'smart', 'formal')
        ), analytics_consent TEXT NOT NULL DEFAULT 'undecided' CHECK (
          analytics_consent IN ('undecided', 'granted', 'withdrawn')
        ), weather_alert_offer_shown INTEGER NOT NULL DEFAULT 0 CHECK (
          weather_alert_offer_shown IN (0, 1)
        ), morning_briefing_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (
          morning_briefing_opt_in IN (0, 1)
        ), display_name TEXT NULL, name_prompt_version INTEGER NOT NULL DEFAULT 0, style_aesthetics TEXT NOT NULL DEFAULT '[]', morning_sheet_enabled INTEGER NOT NULL DEFAULT 1
        CHECK (morning_sheet_enabled IN (0, 1)), easier_to_see INTEGER NOT NULL DEFAULT 0
        CHECK (easier_to_see IN (0, 1)), walkthrough_version INTEGER NOT NULL DEFAULT 0, swap_hint_shown INTEGER NOT NULL DEFAULT 0
        CHECK (swap_hint_shown IN (0, 1)), pending_sync INTEGER NOT NULL DEFAULT 0
        CHECK (pending_sync IN (0, 1)), temperature_unit TEXT NOT NULL DEFAULT 'system'
        CHECK (temperature_unit IN ('system', 'celsius', 'fahrenheit')), wind_speed_unit TEXT NOT NULL DEFAULT 'system'
        CHECK (wind_speed_unit IN ('system', 'kmh', 'mph')));

CREATE TABLE weather_alert_deliveries (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL,
        fire_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      );

CREATE INDEX idx_weather_alert_deliveries_profile_fire_at
      ON weather_alert_deliveries (local_profile_id, fire_at);

CREATE TABLE "recommendation_snapshots" (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL UNIQUE,
        weather_snapshot_id TEXT NOT NULL,
        location_key TEXT NOT NULL,
        generation_mode TEXT NOT NULL CHECK (
          generation_mode IN ('on-device-ai', 'ai-assisted', 'deterministic-fallback')
        ),
        context_json TEXT NOT NULL,
        outfits_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      );

CREATE TABLE dressing_day_choices (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL,
        day_key TEXT NOT NULL,
        formality TEXT NOT NULL CHECK (formality IN ('casual', 'smart', 'formal')),
        source TEXT NOT NULL CHECK (source IN ('morning', 'chip', 'plan', 'random')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT, style_aesthetics TEXT, pending_sync INTEGER NOT NULL DEFAULT 0
        CHECK (pending_sync IN (0, 1)),
        UNIQUE (local_profile_id, day_key),
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT ON DELETE RESTRICT
      );

CREATE TABLE dressing_day_departures (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL,
        day_key TEXT NOT NULL,
        departure_at TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT, pending_sync INTEGER NOT NULL DEFAULT 0
        CHECK (pending_sync IN (0, 1)),
        UNIQUE (local_profile_id, day_key),
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT ON DELETE RESTRICT
      );

CREATE TABLE device_account_link (
        singleton_key INTEGER PRIMARY KEY NOT NULL CHECK (singleton_key = 1),
        linked_user_id TEXT,
        last_linked_user_id TEXT,
        last_pull_cursor TEXT,
        sign_in_card_dismissed INTEGER NOT NULL DEFAULT 0
          CHECK (sign_in_card_dismissed IN (0, 1))
      , records_user_id TEXT, records_consent_recorded_at TEXT);

CREATE TABLE "outfit_history" (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL,
        day_key TEXT NOT NULL CHECK (day_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        outfit_json TEXT NOT NULL,
        photo_path TEXT,
        worn_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        piece_colors_json TEXT,
        pending_sync INTEGER NOT NULL DEFAULT 0 CHECK (pending_sync IN (0, 1)),
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT ON DELETE RESTRICT
      );

CREATE INDEX idx_outfit_history_profile_live_day
        ON outfit_history (local_profile_id, deleted_at, day_key DESC);

PRAGMA user_version = 29;
