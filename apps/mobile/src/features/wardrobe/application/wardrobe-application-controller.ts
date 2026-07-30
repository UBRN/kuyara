import type {
  CreateWardrobeItemInput,
  UpdateWardrobeItemInput,
  WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';
import type { WardrobeRepository } from '@/features/wardrobe/data/wardrobe-repository';
import { isWardrobeRouteId } from '@/features/wardrobe/application/wardrobe-form';
import {
  unavailableWardrobePhotoManager,
  unchangedWardrobePhoto,
  type WardrobePhotoChange,
  type WardrobePhotoManager,
} from '@/features/wardrobe/application/wardrobe-photo-manager';
import type { StagedWardrobePhoto } from '@/features/wardrobe/data/wardrobe-photo-adapters';

export type WardrobeApplicationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error' }>
  | Readonly<{
      status: 'ready';
      items: readonly WardrobeItem[];
      isRefreshing: boolean;
      isMutating: boolean;
      hasRefreshError: boolean;
    }>;

type Listener = () => void;
type CreateInput = Omit<
  CreateWardrobeItemInput,
  'localProfileId' | 'photoRelativePath'
>;
type UpdateInput = Omit<
  UpdateWardrobeItemInput,
  'id' | 'localProfileId' | 'photoRelativePath'
>;

export class WardrobeApplicationController {
  private state: WardrobeApplicationState = { status: 'loading' };
  private repository: WardrobeRepository | null = null;
  private initializationPromise: Promise<void> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private mutationPromise: Promise<WardrobeItem> | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly localProfileId: string;
  private readonly loadRepository: () => Promise<WardrobeRepository>;
  private readonly photoManager: WardrobePhotoManager;
  private readonly reportPhotoCleanupError: () => void;

  constructor(
    localProfileId: string,
    loadRepository: () => Promise<WardrobeRepository>,
    photoManager: WardrobePhotoManager = unavailableWardrobePhotoManager,
    reportPhotoCleanupError: () => void = () => undefined,
  ) {
    this.localProfileId = localProfileId;
    this.loadRepository = loadRepository;
    this.photoManager = photoManager;
    this.reportPhotoCleanupError = reportPhotoCleanupError;
  }

  getSnapshot = (): WardrobeApplicationState => this.state;

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

  refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.repository) {
      this.initializationPromise = null;
      return this.initialize();
    }

    this.refreshPromise = this.refreshOnce().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async getItem(id: string): Promise<WardrobeItem | null> {
    if (!isWardrobeRouteId(id)) {
      return null;
    }

    const repository = this.requireRepository();
    return repository.getActiveItem(this.localProfileId, id);
  }

  preparePhoto(): Promise<StagedWardrobePhoto | null> {
    return this.photoManager.preparePhoto();
  }

  discardStagedPhoto(photo: StagedWardrobePhoto): Promise<void> {
    return this.cleanupPhoto(() => this.photoManager.discardStagedPhoto(photo));
  }

  resolvePhotoUri(relativePath: string | null): string | null {
    return this.photoManager.resolvePhotoUri(relativePath);
  }

  createItem(
    input: CreateInput,
    photoChange: WardrobePhotoChange = unchangedWardrobePhoto,
  ): Promise<WardrobeItem> {
    return this.mutate(
      (repository) => this.createItemWithPhoto(repository, input, photoChange),
      (items, created) =>
        this.sortItems([created, ...items.filter((item) => item.id !== created.id)]),
    );
  }

  updateItem(
    id: string,
    input: UpdateInput,
    photoChange: WardrobePhotoChange = unchangedWardrobePhoto,
  ): Promise<WardrobeItem> {
    if (!isWardrobeRouteId(id)) {
      return Promise.reject(new Error('The wardrobe item is not available.'));
    }

    return this.mutate(
      (repository) =>
        this.updateItemWithPhoto(repository, id, input, photoChange),
      (items, updated) =>
        this.sortItems([updated, ...items.filter((item) => item.id !== updated.id)]),
    );
  }

  softDeleteItem(id: string): Promise<WardrobeItem> {
    if (!isWardrobeRouteId(id)) {
      return Promise.reject(new Error('The wardrobe item is not available.'));
    }

    return this.mutate(
      (repository) => repository.softDeleteItem(this.localProfileId, id),
      (items, deleted) => items.filter((item) => item.id !== deleted.id),
    );
  }

  private async initializeOnce(): Promise<void> {
    try {
      this.repository = await this.loadRepository();
      const items = await this.repository.listActiveItems(this.localProfileId);
      this.setState({
        status: 'ready',
        items,
        isRefreshing: false,
        isMutating: false,
        hasRefreshError: false,
      });
    } catch {
      this.setState({ status: 'error' });
    }
  }

  private async refreshOnce(): Promise<void> {
    const repository = this.requireRepository();
    const previous = this.state.status === 'ready' ? this.state : null;

    if (previous) {
      this.setState({ ...previous, isRefreshing: true, hasRefreshError: false });
    } else {
      this.setState({ status: 'loading' });
    }

    try {
      const items = await repository.listActiveItems(this.localProfileId);
      this.setState({
        status: 'ready',
        items,
        isRefreshing: false,
        isMutating: previous?.isMutating ?? false,
        hasRefreshError: false,
      });
    } catch {
      if (previous) {
        this.setState({ ...previous, isRefreshing: false, hasRefreshError: true });
      } else {
        this.setState({ status: 'error' });
      }
    }
  }

  private async createItemWithPhoto(
    repository: WardrobeRepository,
    input: CreateInput,
    photoChange: WardrobePhotoChange,
  ): Promise<WardrobeItem> {
    if (photoChange.kind !== 'replace') {
      return repository.createItem({
        ...input,
        localProfileId: this.localProfileId,
      });
    }

    const stored = await this.photoManager.commitStagedPhoto(
      photoChange.stagedPhoto,
    );
    try {
      const created = await repository.createItem({
        ...input,
        localProfileId: this.localProfileId,
        photoRelativePath: stored.relativePath,
      });
      await this.cleanupPhoto(() =>
        this.photoManager.discardStagedPhoto(photoChange.stagedPhoto),
      );
      return created;
    } catch (error) {
      await this.cleanupPhoto(() =>
        this.photoManager.deleteStoredPhoto(stored.relativePath),
      );
      throw error;
    }
  }

  private async updateItemWithPhoto(
    repository: WardrobeRepository,
    id: string,
    input: UpdateInput,
    photoChange: WardrobePhotoChange,
  ): Promise<WardrobeItem> {
    if (photoChange.kind === 'unchanged') {
      return repository.updateItem({
        ...input,
        id,
        localProfileId: this.localProfileId,
      });
    }

    const current = await repository.getActiveItem(this.localProfileId, id);
    if (!current) {
      throw new Error('The wardrobe item is not available.');
    }

    if (photoChange.kind === 'remove') {
      const updated = await repository.updateItem({
        ...input,
        id,
        localProfileId: this.localProfileId,
        photoRelativePath: null,
      });
      const previousPhotoPath = current.photoRelativePath;
      if (previousPhotoPath) {
        await this.cleanupPhoto(() =>
          this.photoManager.deleteStoredPhoto(previousPhotoPath),
        );
      }
      return updated;
    }

    const stored = await this.photoManager.commitStagedPhoto(
      photoChange.stagedPhoto,
    );
    try {
      const updated = await repository.updateItem({
        ...input,
        id,
        localProfileId: this.localProfileId,
        photoRelativePath: stored.relativePath,
      });
      await this.cleanupPhoto(() =>
        this.photoManager.discardStagedPhoto(photoChange.stagedPhoto),
      );
      const previousPhotoPath = current.photoRelativePath;
      if (previousPhotoPath && previousPhotoPath !== stored.relativePath) {
        await this.cleanupPhoto(() =>
          this.photoManager.deleteStoredPhoto(previousPhotoPath),
        );
      }
      return updated;
    } catch (error) {
      await this.cleanupPhoto(() =>
        this.photoManager.deleteStoredPhoto(stored.relativePath),
      );
      throw error;
    }
  }

  private async cleanupPhoto(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch {
      try {
        this.reportPhotoCleanupError();
      } catch {}
    }
  }

  private mutate(
    operation: (repository: WardrobeRepository) => Promise<WardrobeItem>,
    applyConfirmedItem: (
      items: readonly WardrobeItem[],
      item: WardrobeItem,
    ) => readonly WardrobeItem[],
  ): Promise<WardrobeItem> {
    if (this.mutationPromise) {
      return this.mutationPromise;
    }

    const repository = this.requireRepository();
    const readyState = this.state.status === 'ready' ? this.state : null;
    if (readyState) {
      this.setState({ ...readyState, isMutating: true });
    }

    this.mutationPromise = (async () => {
      let item: WardrobeItem;
      try {
        item = await operation(repository);
      } catch (error) {
        if (readyState) {
          this.setState({ ...readyState, isMutating: false });
        }
        throw error;
      }

      const confirmedItems = applyConfirmedItem(readyState?.items ?? [], item);
      try {
        const persistedItems = await repository.listActiveItems(
          this.localProfileId,
        );
        this.setState({
          status: 'ready',
          items: persistedItems,
          isRefreshing: false,
          isMutating: false,
          hasRefreshError: false,
        });
      } catch {
        this.setState({
          status: 'ready',
          items: confirmedItems,
          isRefreshing: false,
          isMutating: false,
          hasRefreshError: true,
        });
      }

      return item;
    })().finally(() => {
      this.mutationPromise = null;
    });

    return this.mutationPromise;
  }

  private sortItems(items: readonly WardrobeItem[]): readonly WardrobeItem[] {
    return [...items].sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.createdAt.localeCompare(left.createdAt) ||
        left.id.localeCompare(right.id),
    );
  }

  private requireRepository(): WardrobeRepository {
    if (!this.repository) {
      throw new Error('The local wardrobe is not ready.');
    }

    return this.repository;
  }

  private setState(state: WardrobeApplicationState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
