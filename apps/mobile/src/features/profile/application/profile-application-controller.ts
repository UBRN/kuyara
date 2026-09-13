import type {
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import { TelemetryError } from '@/features/analytics/domain/performance-telemetry';
import type { ProfileRepository } from '@/features/profile/data/profile-repository';
import type {
  AnalyticsConsent,
  LocalProfile,
  Profile,
  OnboardingPreferences,
  DressStyle,
  Gender,
} from '@/features/profile/domain/profile';

const catalogPreferenceByGender = { woman: 'womens', man: 'mens' } as const;

function applicationProfile(profile: Profile): LocalProfile {
  return {
    ...profile,
    clothingPreference: profile.gender === null ? null : catalogPreferenceByGender[profile.gender],
  };
}

export type ProfileApplicationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; reason: ProfileBootstrapFailureReason }>
  | Readonly<{
      status: 'ready';
      profile: LocalProfile;
      isSaving: boolean;
    }>;

export type ProfileBootstrapFailureReason =
  | 'database-open'
  | 'migration'
  | 'profile-load';

export class ProfileBootstrapError extends Error {
  readonly reason: Exclude<ProfileBootstrapFailureReason, 'profile-load'>;

  constructor(
    reason: Exclude<ProfileBootstrapFailureReason, 'profile-load'>,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'ProfileBootstrapError';
    this.reason = reason;
  }
}

type Listener = () => void;

export class ProfileApplicationController {
  private state: ProfileApplicationState = { status: 'loading' };
  private repository: ProfileRepository | null = null;
  private initializationPromise: Promise<void> | null = null;
  private updatePromise: Promise<void> | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly loadRepository: () => Promise<ProfileRepository>;
  private readonly reportError: (error: TelemetryError) => void;

  // `reportError` is optional so existing composition and tests are unchanged. The bootstrap
  // stage is the one failure the user cannot work around and cannot report, so it is worth a
  // diagnostic.
  constructor(
    loadRepository: () => Promise<ProfileRepository>,
    reportError: (error: TelemetryError) => void = () => undefined,
  ) {
    this.loadRepository = loadRepository;
    this.reportError = reportError;
  }

  getSnapshot = (): ProfileApplicationState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  initialize(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeOnce();
    }

    return this.initializationPromise;
  }

  retry(): Promise<void> {
    if (this.state.status === 'loading' && this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = null;
    this.repository = null;
    this.setState({ status: 'loading' });
    return this.initialize();
  }

  completeOnboarding(preferences: OnboardingPreferences): Promise<void> {
    return this.updateProfile((repository) => repository.completeOnboarding(preferences));
  }

  updateGender(gender: Gender): Promise<void> {
    return this.updateProfile((repository) => repository.updateGender(gender));
  }

  updateDressStyle(dressStyle: DressStyle): Promise<void> {
    return this.updateProfile((repository) => repository.updateDressStyle(dressStyle));
  }

  updateBirthDate(birthDate: string | null): Promise<void> {
    return this.updateProfile((repository) => repository.updateBirthDate(birthDate));
  }

  updateLanguagePreference(preference: LanguagePreference): Promise<void> {
    return this.updateProfile((repository) =>
      repository.updateLanguagePreference(preference),
    );
  }

  updateThemePreference(preference: ThemePreference): Promise<void> {
    return this.updateProfile((repository) => repository.updateThemePreference(preference));
  }

  updateNotificationsOptIn(optIn: boolean): Promise<void> {
    return this.updateProfile((repository) => repository.updateNotificationsOptIn(optIn));
  }

  updateAnalyticsConsent(consent: AnalyticsConsent): Promise<void> {
    return this.updateProfile((repository) => repository.updateAnalyticsConsent(consent));
  }

  private async initializeOnce(): Promise<void> {
    try {
      const repository = await this.loadRepository();
      const profile = await repository.getOrCreateProfile();
      this.repository = repository;
      this.setState({ status: 'ready', profile: applicationProfile(profile), isSaving: false });
    } catch (error) {
      const reason = error instanceof ProfileBootstrapError
        ? error.reason
        : 'profile-load';
      const reportedError = error instanceof ProfileBootstrapError
        ? error.cause
        : error;
      const name = reportedError instanceof Error ? reportedError.name : 'Error';
      const message = reportedError instanceof Error
        ? reportedError.message
        : String(reportedError);
      console.error(
        `[profile-bootstrap] stage=${reason} error=${name.replace(/[\r\n]+/g, ' ')} message=${message.replace(/[\r\n]+/g, ' ').slice(0, 200)}`,
      );
      // Only the stage and the thrown value's class name. A SQLite or migration message can
      // quote row values, so it stays in the local console line and never leaves the device.
      this.reportError(
        new TelemetryError('profile.bootstrap_failed', { stage: reason, error_name: name }),
      );
      this.setState({ status: 'error', reason });
    }
  }

  private updateProfile(
    operation: (repository: ProfileRepository) => Promise<Profile>,
  ): Promise<void> {
    if (this.state.status !== 'ready' || !this.repository) {
      return Promise.reject(new Error('The local profile is not ready.'));
    }

    const repository = this.repository;
    const run = async (): Promise<void> => {
      if (this.state.status !== 'ready') {
        throw new Error('The local profile is not ready.');
      }

      const previousProfile = this.state.profile;
      try {
        const profile = await operation(repository);
        this.setState({ status: 'ready', profile: applicationProfile(profile), isSaving: true });
      } catch (error) {
        this.setState({ status: 'ready', profile: previousProfile, isSaving: true });
        throw error;
      }
    };

    if (!this.updatePromise) {
      this.setState({ status: 'ready', profile: this.state.profile, isSaving: true });
    }
    const updatePromise = (this.updatePromise
      ? this.updatePromise.then(run, run)
      : run()
    )
      .finally(() => {
        if (this.updatePromise === updatePromise && this.state.status === 'ready') {
          this.updatePromise = null;
          this.setState({ status: 'ready', profile: this.state.profile, isSaving: false });
        }
      });

    this.updatePromise = updatePromise;
    return updatePromise;
  }

  private setState(state: ProfileApplicationState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
