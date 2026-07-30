import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import type { ProfileRepository } from '@/features/profile/data/profile-repository';
import type {
  LocalProfile,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';

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

  updateClothingPreference(preference: ClothingPreference): Promise<void> {
    return this.updateProfile((repository) =>
      repository.updateClothingPreference(preference),
    );
  }

  updateLanguagePreference(preference: LanguagePreference): Promise<void> {
    return this.updateProfile((repository) =>
      repository.updateLanguagePreference(preference),
    );
  }

  updateThemePreference(preference: ThemePreference): Promise<void> {
    return this.updateProfile((repository) => repository.updateThemePreference(preference));
  }

  private async initializeOnce(): Promise<void> {
    try {
      const repository = await this.loadRepository();
      const profile = await repository.getOrCreateProfile();
      this.repository = repository;
      this.setState({ status: 'ready', profile, isSaving: false });
    } catch {
      this.setState({ status: 'error' });
    }
  }

  private updateProfile(
    operation: (repository: ProfileRepository) => Promise<LocalProfile>,
  ): Promise<void> {
    if (this.updatePromise) {
      return this.updatePromise;
    }

    if (this.state.status !== 'ready' || !this.repository) {
      return Promise.reject(new Error('The local profile is not ready.'));
    }

    const previousProfile = this.state.profile;
    this.setState({ status: 'ready', profile: previousProfile, isSaving: true });

    this.updatePromise = operation(this.repository)
      .then((profile) => {
        this.setState({ status: 'ready', profile, isSaving: false });
      })
      .catch((error) => {
        this.setState({ status: 'ready', profile: previousProfile, isSaving: false });
        throw error;
      })
      .finally(() => {
        this.updatePromise = null;
      });

    return this.updatePromise;
  }

  private setState(state: ProfileApplicationState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
