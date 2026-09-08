import type {
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import type { ProfileRepository } from '@/features/profile/data/profile-repository';
import type {
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
  | Readonly<{ status: 'error' }>
  | Readonly<{
      status: 'ready';
      profile: LocalProfile;
      isSaving: boolean;
    }>;

type Listener = () => void;

export class ProfileApplicationController {
  private state: ProfileApplicationState = { status: 'loading' };
  private repository: ProfileRepository | null = null;
  private initializationPromise: Promise<void> | null = null;
  private updatePromise: Promise<void> | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly loadRepository: () => Promise<ProfileRepository>;

  constructor(loadRepository: () => Promise<ProfileRepository>) {
    this.loadRepository = loadRepository;
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

  private async initializeOnce(): Promise<void> {
    try {
      const repository = await this.loadRepository();
      const profile = await repository.getOrCreateProfile();
      this.repository = repository;
      this.setState({ status: 'ready', profile: applicationProfile(profile), isSaving: false });
    } catch {
      this.setState({ status: 'error' });
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
