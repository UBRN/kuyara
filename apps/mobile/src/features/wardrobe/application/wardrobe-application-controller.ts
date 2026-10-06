import {
  failureCategoryFromErrorKind,
  type FailureCategory,
} from '@/domain/failure-category';
import type {
  CreateWardrobeItemInput,
  UpdateWardrobeItemInput,
  WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';
import type {
  PendingWardrobePhotoCleanup,
  WardrobeRepository,
} from '@/features/wardrobe/data/wardrobe-repository';
import { isWardrobeRouteId } from '@/features/wardrobe/application/wardrobe-form';
import {
  unavailableWardrobePhotoManager,
  unchangedWardrobePhoto,
  type WardrobePhotoChange,
  type WardrobePhotoManager,
} from '@/features/wardrobe/application/wardrobe-photo-manager';
import type { StagedWardrobePhoto } from '@/features/wardrobe/data/wardrobe-photo-adapters';
import { isManagedWardrobePhotoRelativePath } from '@/features/wardrobe/domain/wardrobe-photo-path';
import type { WardrobePhotoSource } from '@/features/wardrobe/domain/wardrobe-photo';
import { WardrobeRepositoryError } from '@/features/wardrobe/domain/wardrobe-repository-error';
import {
  orphanedWardrobePhotoPaths,
  staleStagedWardrobePhotoMinimumAgeMs,
} from '@/features/wardrobe/domain/wardrobe-photo-sweep';
import { coalescedRun } from '@/domain/coalesced-run';

export type WardrobeApplicationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error' }>
  | Readonly<{
      status: 'ready';
      items: readonly WardrobeItem[];
      isRefreshing: boolean;
      isMutating: boolean;
      refreshFailure: FailureCategory | null;
    }>;

// The repository is the only error this feature can classify. Its codes are
// 'invalid-input' | 'invalid-data' | 'not-found' | 'unavailable', none of which is a
// network or rate-limit signal, so every repository failure is 'unavailable'; anything
// else thrown while listing (a bare Error, a photo-manager throw) is 'unknown'.
function wardrobeFailureCategory(error: unknown): FailureCategory {
  return error instanceof WardrobeRepositoryError
    ? failureCategoryFromErrorKind(error.code)
    : 'unknown';
}

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
  private mutationPromise: Promise<unknown> | null = null;
  // Set while the launch photo sweep reads and deletes files; a save waits for it.
  private sweepPromise: Promise<void> | null = null;
  // Bumped when a mutation starts and when it settles, so a refresh can tell that its
  // list read straddled a mutation and may hold pre-mutation data.
  private mutationEpoch = 0;
  // Each list read takes a ticket when it starts; a read lands only if no later-started read
  // has landed, so a refresh begun before a reload never replaces the reloaded list.
  private readTicket = 0;
  private landedTicket = 0;
  private readonly reloadRun = coalescedRun(() => this.reloadOnce());
  private readonly listeners = new Set<Listener>();
  private readonly localProfileId: string;
  private readonly loadRepository: () => Promise<WardrobeRepository>;
  private readonly photoManager: WardrobePhotoManager;
  private readonly reportPhotoCleanupError: () => void;
  private readonly now: () => Date;

  constructor(
    localProfileId: string,
    loadRepository: () => Promise<WardrobeRepository>,
    photoManager: WardrobePhotoManager = unavailableWardrobePhotoManager,
    reportPhotoCleanupError: () => void = () => undefined,
    now: () => Date,
  ) {
    this.localProfileId = localProfileId;
    this.loadRepository = loadRepository;
    this.photoManager = photoManager;
    this.reportPhotoCleanupError = reportPhotoCleanupError;
    this.now = now;
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

  /**
   * Reads the Closet again after a write this controller did not make, such as a sync pull
   * landing another phone's pieces (ADR 0041 section 4). It shows no refresh indicator, keeps
   * the shown state when nothing changed, waits for a save in progress so that save's own read
   * stands, and removes the photo of a piece deleted elsewhere. A request during a reload gets
   * one more read after it. Before the first load it reads nothing: that load reads the phone.
   */
  reload(): Promise<void> {
    return this.reloadRun();
  }

  async getItem(id: string): Promise<WardrobeItem | null> {
    if (!isWardrobeRouteId(id)) {
      return null;
    }

    const repository = this.requireRepository();
    return repository.getActiveItem(this.localProfileId, id);
  }

  preparePhoto(source?: WardrobePhotoSource): Promise<StagedWardrobePhoto | null> {
    return this.photoManager.preparePhoto(source);
  }

  discardStagedPhoto(photo: StagedWardrobePhoto): Promise<void> {
    return this.cleanupPhoto(() =>
      this.photoManager.discardStagedPhoto(photo),
    ).then(() => undefined);
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

  /**
   * Adds the given pieces to an empty Closet in one database transaction: every piece is
   * created or none is. The repository reads the emptiness inside that transaction, so a
   * second call (a double tap, a stale screen) finds the Closet no longer empty and adds
   * nothing. Resolves with the records it created.
   */
  seedEmptyCloset(inputs: readonly CreateInput[]): Promise<readonly WardrobeItem[]> {
    return this.mutate(
      (repository) => repository.createItemsIfEmpty(this.localProfileId, inputs),
      (items, created) => this.sortItems([...created, ...items]),
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
      async (repository) => {
        const deleted = await repository.softDeleteItem(this.localProfileId, id);
        if (
          deleted.photoRelativePath &&
          (await this.cleanupPendingPhotos(repository, deleted.id))
        ) {
          return { ...deleted, photoRelativePath: null };
        }
        return deleted;
      },
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
        refreshFailure: null,
      });
      void this.cleanupPhotosOnLaunch(this.repository);
    } catch {
      this.setState({ status: 'error' });
    }
  }

  /**
   * The launch housekeeping for photo files, in the background: retry the deletions still
   * pending, then sweep the files nothing names. The sweep starts only when no save is in
   * progress, and from then on a save waits for it, so a photo copied for a save that has not
   * written its row yet is never mistaken for a leftover.
   */
  private async cleanupPhotosOnLaunch(repository: WardrobeRepository): Promise<void> {
    if (this.photoManager === unavailableWardrobePhotoManager) {
      return;
    }

    await this.cleanupPendingPhotos(repository);
    while (this.mutationPromise) {
      try {
        await this.mutationPromise;
      } catch {
        // The save reports its own failure; the sweep only waits for it to end.
      }
    }
    // No await between the check above and this line: no save can start in between.
    this.sweepPromise = this.sweepPhotoFiles(repository).finally(() => {
      this.sweepPromise = null;
    });
  }

  /** Answers true when a save started during the read, so the reload reads once more after it. */
  private async reloadOnce(): Promise<boolean> {
    if (this.state.status !== 'ready' || !this.repository) return false;
    try {
      await this.mutationPromise;
    } catch {
      // The save reports its own failure; the reload only reads after it.
    }
    const repository = this.repository;
    const epoch = this.mutationEpoch;
    const ticket = ++this.readTicket;
    let items: readonly WardrobeItem[];
    try {
      items = await repository.listActiveItems(this.localProfileId);
    } catch {
      // The shown list stays; the next write, focus or retry reads again.
      return false;
    }
    // A save started meanwhile: read again after it, never over its result.
    if (epoch !== this.mutationEpoch) return true;
    if (this.lands(ticket) && this.state.status === 'ready'
      && JSON.stringify(items) !== JSON.stringify(this.state.items)) {
      this.setState({ ...this.state, items });
    }
    await this.cleanupPendingPhotos(repository);
    return false;
  }

  /** Whether a read that started with `ticket` is still the newest to land, recording it if so. */
  private lands(ticket: number): boolean {
    if (ticket < this.landedTicket) return false;
    this.landedTicket = ticket;
    return true;
  }

  private async refreshOnce(): Promise<void> {
    const repository = this.requireRepository();
    const previous = this.state.status === 'ready' ? this.state : null;

    if (previous) {
      // Keep a shown failure present until a successful list read actually lands. Clearing
      // it at retry start would falsely report recovery while the request is still pending.
      this.setState({ ...previous, isRefreshing: true });
    } else {
      this.setState({ status: 'loading' });
    }

    const epoch = this.mutationEpoch;
    const ticket = ++this.readTicket;
    try {
      const items = await repository.listActiveItems(this.localProfileId);
      if ((epoch !== this.mutationEpoch || !this.lands(ticket)) && this.state.status === 'ready') {
        // A mutation started or settled during the read, or a later read already landed. It
        // owns the list (and a mutation the isMutating flag), so this older result must not
        // overwrite them.
        this.setState({ ...this.state, isRefreshing: false });
        return;
      }
      this.setState({
        status: 'ready',
        items,
        isRefreshing: false,
        isMutating: this.mutationPromise !== null,
        refreshFailure: null,
      });
    } catch (error) {
      if (previous && this.state.status === 'ready') {
        this.setState({
          ...this.state,
          isRefreshing: false,
          refreshFailure:
            epoch !== this.mutationEpoch
              ? this.state.refreshFailure
              : wardrobeFailureCategory(error),
        });
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

  private async cleanupPendingPhotos(
    repository: WardrobeRepository,
    itemId?: string,
  ): Promise<boolean> {
    if (this.photoManager === unavailableWardrobePhotoManager) {
      return false;
    }

    let pending: readonly PendingWardrobePhotoCleanup[];
    try {
      pending = await repository.listPendingPhotoCleanup(this.localProfileId);
    } catch {
      this.reportCleanupError();
      return false;
    }

    let requestedItemWasCleared = false;
    for (const photo of pending) {
      if (
        (itemId && photo.id !== itemId) ||
        !isManagedWardrobePhotoRelativePath(photo.photoRelativePath)
      ) {
        continue;
      }

      const fileWasDeleted = await this.cleanupPhoto(() =>
        this.photoManager.deleteStoredPhoto(photo.photoRelativePath),
      );
      if (!fileWasDeleted) {
        continue;
      }

      let pathWasCleared = false;
      const clearSucceeded = await this.cleanupPhoto(async () => {
        pathWasCleared = await repository.clearPendingPhotoCleanup(
          this.localProfileId,
          photo.id,
          photo.photoRelativePath,
        );
      });
      requestedItemWasCleared ||=
        clearSucceeded && pathWasCleared && photo.id === itemId;
    }

    return requestedItemWasCleared;
  }

  /**
   * Removes the managed photo files no row names, and the staged photos nobody will commit.
   * It lists the directory first and reads the named paths after, so a photo that a save
   * wrote between the two reads is named by then. Every failure is dropped into one report at
   * the end: the sweep is housekeeping and runs again on the next launch.
   */
  private async sweepPhotoFiles(repository: WardrobeRepository): Promise<void> {
    const nowMs = this.now().getTime();
    let swept = true;
    try {
      swept = await this.deleteOrphanedPhotos(repository, nowMs);
    } catch {
      swept = false;
    }
    try {
      await this.photoManager.discardStaleStagedPhotos(
        nowMs - staleStagedWardrobePhotoMinimumAgeMs,
      );
    } catch {
      swept = false;
    }

    if (!swept) {
      this.reportCleanupError();
    }
  }

  /** Deletes each orphaned file it can; answers whether every one of them was deleted. */
  private async deleteOrphanedPhotos(
    repository: WardrobeRepository,
    nowMs: number,
  ): Promise<boolean> {
    const files = await this.photoManager.listManagedPhotos();
    const namedPaths = await repository.listPhotoPathsInUse();

    let everyFileDeleted = true;
    for (const relativePath of orphanedWardrobePhotoPaths(files, namedPaths, nowMs)) {
      try {
        await this.photoManager.deleteStoredPhoto(relativePath);
      } catch {
        everyFileDeleted = false;
      }
    }

    return everyFileDeleted;
  }

  private async cleanupPhoto(operation: () => Promise<void>): Promise<boolean> {
    try {
      await operation();
      return true;
    } catch {
      this.reportCleanupError();
      return false;
    }
  }

  private reportCleanupError(): void {
    try {
      this.reportPhotoCleanupError();
    } catch {
      // The report hook is best effort: a throwing reporter must not fail the Closet action it observes.
    }
  }

  private mutate<Result>(
    operation: (repository: WardrobeRepository) => Promise<Result>,
    applyConfirmedItem: (
      items: readonly WardrobeItem[],
      item: Result,
    ) => readonly WardrobeItem[],
  ): Promise<Result> {
    if (this.mutationPromise) {
      return Promise.reject(new Error('A wardrobe change is already in progress.'));
    }

    const repository = this.requireRepository();
    const readyState = this.state.status === 'ready' ? this.state : null;
    this.mutationEpoch += 1;
    if (readyState) {
      this.setState({ ...readyState, isMutating: true });
    }

    const mutation = (async () => {
      let item: Result;
      try {
        // The launch sweep deletes files by what the rows name, so no save runs beside it.
        if (this.sweepPromise) await this.sweepPromise;
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
          refreshFailure: null,
        });
      } catch (error) {
        this.setState({
          status: 'ready',
          items: confirmedItems,
          isRefreshing: false,
          isMutating: false,
          refreshFailure: wardrobeFailureCategory(error),
        });
      }

      return item;
    })().finally(() => {
      this.mutationPromise = null;
      this.mutationEpoch += 1;
    });
    this.mutationPromise = mutation;

    return mutation;
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
