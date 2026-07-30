import {
  mapWardrobeCategoryToRecord,
  mapWardrobeItemRecord,
  WardrobeItemMappingError,
} from '@/features/wardrobe/data/wardrobe-item-mapper';
import type { WardrobeItemRecord } from '@/features/wardrobe/data/wardrobe-item-record';
import type { WardrobeLocalDataSource } from '@/features/wardrobe/data/wardrobe-local-data-source';
import {
  isWardrobeItemCategory,
  normalizeOptionalWardrobeText,
  normalizeWardrobePhotoRelativePath,
  WardrobeItemValidationError,
  type CreateWardrobeItemInput,
  type UpdateWardrobeItemInput,
  type WardrobeItem,
  type WardrobeItemCategory,
} from '@/features/wardrobe/domain/wardrobe-item';

type WardrobeRepositoryDependencies = Readonly<{
  createId: () => string;
  now: () => string;
}>;

type MutableWardrobeFields = Readonly<{
  name: string | null;
  category: WardrobeItemCategory;
  color: string | null;
  photoRelativePath: string | null;
}>;

export interface WardrobeRepository {
  createItem(input: CreateWardrobeItemInput): Promise<WardrobeItem>;
  getActiveItem(localProfileId: string, id: string): Promise<WardrobeItem | null>;
  getItemIncludingDeleted(localProfileId: string, id: string): Promise<WardrobeItem | null>;
  listActiveItems(localProfileId: string): Promise<WardrobeItem[]>;
  updateItem(input: UpdateWardrobeItemInput): Promise<WardrobeItem>;
  softDeleteItem(localProfileId: string, id: string): Promise<WardrobeItem>;
}

export class WardrobeRepositoryError extends Error {
  readonly code: 'invalid-input' | 'invalid-data' | 'not-found' | 'unavailable';

  constructor(code: 'invalid-input' | 'invalid-data' | 'not-found' | 'unavailable') {
    super('The local wardrobe operation could not be completed.');
    this.name = 'WardrobeRepositoryError';
    this.code = code;
  }
}

function isUtcIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function requireIdentifier(value: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new WardrobeItemValidationError();
  }

  return value;
}

function requireTimestamp(value: string): string {
  if (!isUtcIsoTimestamp(value)) {
    throw new WardrobeItemValidationError();
  }

  return value;
}

function requireCategory(value: WardrobeItemCategory): WardrobeItemCategory {
  if (typeof value !== 'string' || !isWardrobeItemCategory(value)) {
    throw new WardrobeItemValidationError();
  }

  return value;
}

function mutableFieldsFromCreate(input: CreateWardrobeItemInput): MutableWardrobeFields {
  return {
    name: normalizeOptionalWardrobeText(input.name),
    category: requireCategory(input.category),
    color: normalizeOptionalWardrobeText(input.color),
    photoRelativePath: normalizeWardrobePhotoRelativePath(input.photoRelativePath),
  };
}

function hasMutableUpdate(input: UpdateWardrobeItemInput): boolean {
  return ['name', 'category', 'color', 'photoRelativePath'].some((key) =>
    Object.prototype.hasOwnProperty.call(input, key),
  );
}

function mutableFieldsFromUpdate(
  current: WardrobeItem,
  input: UpdateWardrobeItemInput,
): MutableWardrobeFields {
  if (!hasMutableUpdate(input)) {
    throw new WardrobeItemValidationError();
  }

  return {
    name: Object.prototype.hasOwnProperty.call(input, 'name')
      ? normalizeOptionalWardrobeText(input.name)
      : current.name,
    category: Object.prototype.hasOwnProperty.call(input, 'category')
      ? requireCategory(input.category as WardrobeItemCategory)
      : current.category,
    color: Object.prototype.hasOwnProperty.call(input, 'color')
      ? normalizeOptionalWardrobeText(input.color)
      : current.color,
    photoRelativePath: Object.prototype.hasOwnProperty.call(input, 'photoRelativePath')
      ? normalizeWardrobePhotoRelativePath(input.photoRelativePath)
      : current.photoRelativePath,
  };
}

export class LocalWardrobeRepository implements WardrobeRepository {
  private readonly dataSource: WardrobeLocalDataSource;
  private readonly dependencies: WardrobeRepositoryDependencies;

  constructor(
    dataSource: WardrobeLocalDataSource,
    dependencies: WardrobeRepositoryDependencies,
  ) {
    this.dataSource = dataSource;
    this.dependencies = dependencies;
  }

  createItem(input: CreateWardrobeItemInput): Promise<WardrobeItem> {
    return this.execute(async () => {
      const localProfileId = requireIdentifier(input.localProfileId);
      const id = this.dependencies.createId();
      const now = requireTimestamp(this.dependencies.now());

      if (!isUuidV4(id)) {
        throw new WardrobeItemValidationError();
      }

      const fields = mutableFieldsFromCreate(input);
      const record = await this.dataSource.createItem({
        id,
        localProfileId,
        name: fields.name,
        category: mapWardrobeCategoryToRecord(fields.category),
        color: fields.color,
        photoRelativePath: fields.photoRelativePath,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      return this.mapScopedRecord(record, localProfileId, false);
    });
  }

  getActiveItem(localProfileId: string, id: string): Promise<WardrobeItem | null> {
    return this.execute(async () => {
      const owner = requireIdentifier(localProfileId);
      const itemId = requireIdentifier(id);
      const record = await this.dataSource.getActiveItem(owner, itemId);
      return record ? this.mapScopedRecord(record, owner, false) : null;
    });
  }

  getItemIncludingDeleted(
    localProfileId: string,
    id: string,
  ): Promise<WardrobeItem | null> {
    return this.execute(async () => {
      const owner = requireIdentifier(localProfileId);
      const itemId = requireIdentifier(id);
      const record = await this.dataSource.getItemIncludingDeleted(owner, itemId);
      return record ? this.mapScopedRecord(record, owner, true) : null;
    });
  }

  listActiveItems(localProfileId: string): Promise<WardrobeItem[]> {
    return this.execute(async () => {
      const owner = requireIdentifier(localProfileId);
      const records = await this.dataSource.listActiveItems(owner);
      return records.map((record) => this.mapScopedRecord(record, owner, false));
    });
  }

  updateItem(input: UpdateWardrobeItemInput): Promise<WardrobeItem> {
    return this.execute(async () => {
      const owner = requireIdentifier(input.localProfileId);
      const itemId = requireIdentifier(input.id);
      const currentRecord = await this.dataSource.getActiveItem(owner, itemId);

      if (!currentRecord) {
        throw new WardrobeRepositoryError('not-found');
      }

      const current = this.mapScopedRecord(currentRecord, owner, false);
      const fields = mutableFieldsFromUpdate(current, input);
      const updatedRecord = await this.dataSource.updateActiveItem({
        id: current.id,
        localProfileId: current.localProfileId,
        name: fields.name,
        category: mapWardrobeCategoryToRecord(fields.category),
        color: fields.color,
        photoRelativePath: fields.photoRelativePath,
        updatedAt: requireTimestamp(this.dependencies.now()),
      });

      if (!updatedRecord) {
        throw new WardrobeRepositoryError('not-found');
      }

      const updated = this.mapScopedRecord(updatedRecord, owner, false);

      if (updated.id !== current.id || updated.createdAt !== current.createdAt) {
        throw new WardrobeItemMappingError();
      }

      return updated;
    });
  }

  softDeleteItem(localProfileId: string, id: string): Promise<WardrobeItem> {
    return this.execute(async () => {
      const owner = requireIdentifier(localProfileId);
      const itemId = requireIdentifier(id);
      const deletedRecord = await this.dataSource.softDeleteActiveItem(
        owner,
        itemId,
        requireTimestamp(this.dependencies.now()),
      );

      if (!deletedRecord) {
        throw new WardrobeRepositoryError('not-found');
      }

      const deleted = this.mapScopedRecord(deletedRecord, owner, true);

      if (deleted.deletedAt === null || deleted.deletedAt !== deleted.updatedAt) {
        throw new WardrobeItemMappingError();
      }

      return deleted;
    });
  }

  private mapScopedRecord(
    record: WardrobeItemRecord,
    localProfileId: string,
    includeDeleted: boolean,
  ): WardrobeItem {
    const item = mapWardrobeItemRecord(record);

    if (
      item.localProfileId !== localProfileId ||
      (!includeDeleted && item.deletedAt !== null)
    ) {
      throw new WardrobeItemMappingError();
    }

    return item;
  }

  private async execute<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof WardrobeRepositoryError) {
        throw error;
      }

      if (error instanceof WardrobeItemValidationError) {
        throw new WardrobeRepositoryError('invalid-input');
      }

      if (error instanceof WardrobeItemMappingError) {
        throw new WardrobeRepositoryError('invalid-data');
      }

      throw new WardrobeRepositoryError('unavailable');
    }
  }
}
