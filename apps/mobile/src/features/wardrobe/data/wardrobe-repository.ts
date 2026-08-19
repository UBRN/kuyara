import type { ZodType } from 'zod';

import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import {
  breathabilitySchema,
  colorFamilySchema,
  coverageSchema,
  garmentTypeIdSchema,
  thermalLevelSchema,
  tractionSuitabilitySchema,
  waterProtectionSchema,
  windProtectionSchema,
  type Breathability,
  type ColorFamily,
  type Coverage,
  type GarmentTypeId,
  type ThermalLevel,
  type TractionSuitability,
  type WaterProtection,
  type WindProtection,
} from '@/features/catalog/domain/garment-taxonomy';
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

type WardrobePhotoCleanupDataSource = WardrobeLocalDataSource &
  Readonly<{
    listPendingPhotoCleanup(localProfileId: string): Promise<WardrobeItemRecord[]>;
    clearPendingPhotoCleanup(
      localProfileId: string,
      id: string,
      photoRelativePath: string,
    ): Promise<boolean>;
  }>;

export type PendingWardrobePhotoCleanup = Readonly<{
  id: string;
  photoRelativePath: string;
}>;

type MutableWardrobeFields = Readonly<{
  name: string | null;
  category: WardrobeItemCategory;
  garmentTypeId: GarmentTypeId | null;
  color: string | null;
  colorFamily: ColorFamily | null;
  thermalLevelOverride: ThermalLevel | null;
  waterProtectionOverride: WaterProtection | null;
  windProtectionOverride: WindProtection | null;
  breathabilityOverride: Breathability | null;
  armCoverageOverride: Coverage | null;
  legCoverageOverride: Coverage | null;
  tractionSuitabilityOverride: TractionSuitability | null;
  photoRelativePath: string | null;
}>;

export interface WardrobeRepository {
  createItem(input: CreateWardrobeItemInput): Promise<WardrobeItem>;
  getActiveItem(localProfileId: string, id: string): Promise<WardrobeItem | null>;
  getItemIncludingDeleted(localProfileId: string, id: string): Promise<WardrobeItem | null>;
  listActiveItems(localProfileId: string): Promise<WardrobeItem[]>;
  listPendingPhotoCleanup(
    localProfileId: string,
  ): Promise<PendingWardrobePhotoCleanup[]>;
  clearPendingPhotoCleanup(
    localProfileId: string,
    id: string,
    photoRelativePath: string,
  ): Promise<boolean>;
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

function requireEnum<Value>(value: unknown, schema: ZodType<Value>): Value {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new WardrobeItemValidationError();
  }

  return result.data;
}

function optionalEnum<Value>(
  value: unknown,
  schema: ZodType<Value>,
): Value | null {
  if (value === null || value === undefined) {
    return null;
  }

  return requireEnum(value, schema);
}

function taxonomyFieldsAreConsistent(fields: MutableWardrobeFields): boolean {
  if (fields.garmentTypeId === null) {
    return (
      fields.colorFamily === null &&
      fields.thermalLevelOverride === null &&
      fields.waterProtectionOverride === null &&
      fields.windProtectionOverride === null &&
      fields.breathabilityOverride === null &&
      fields.armCoverageOverride === null &&
      fields.legCoverageOverride === null &&
      fields.tractionSuitabilityOverride === null
    );
  }

  const type = getGarmentType(fields.garmentTypeId);
  return Boolean(
    type &&
    type.structuralCategory === fields.category &&
    (type.defaultThermalLevel !== null || fields.thermalLevelOverride === null) &&
    (type.defaultWaterProtection !== null || fields.waterProtectionOverride === null) &&
    (type.defaultWindProtection !== null || fields.windProtectionOverride === null) &&
    (type.defaultBreathability !== null || fields.breathabilityOverride === null) &&
    (type.defaultArmCoverage !== null || fields.armCoverageOverride === null) &&
    (type.defaultLegCoverage !== null || fields.legCoverageOverride === null) &&
    (type.defaultTractionSuitability !== null ||
      fields.tractionSuitabilityOverride === null),
  );
}

function requireConsistentTaxonomyFields(
  fields: MutableWardrobeFields,
): MutableWardrobeFields {
  if (!taxonomyFieldsAreConsistent(fields)) {
    throw new WardrobeItemValidationError();
  }

  return fields;
}

function requireValidPersistedTaxonomy(item: WardrobeItem): WardrobeItem {
  if (!taxonomyFieldsAreConsistent(item)) {
    throw new WardrobeItemMappingError();
  }

  return item;
}

function mutableFieldsFromCreate(input: CreateWardrobeItemInput): MutableWardrobeFields {
  const garmentTypeId = requireEnum(input.garmentTypeId, garmentTypeIdSchema);
  const type = getGarmentType(garmentTypeId);
  if (!type) {
    throw new WardrobeItemValidationError();
  }

  return requireConsistentTaxonomyFields({
    name: normalizeOptionalWardrobeText(input.name),
    category: Object.prototype.hasOwnProperty.call(input, 'category')
      ? requireCategory(input.category as WardrobeItemCategory)
      : type.structuralCategory,
    garmentTypeId,
    color: normalizeOptionalWardrobeText(input.color),
    colorFamily: optionalEnum(input.colorFamily, colorFamilySchema),
    thermalLevelOverride: optionalEnum(
      input.thermalLevelOverride,
      thermalLevelSchema,
    ),
    waterProtectionOverride: optionalEnum(
      input.waterProtectionOverride,
      waterProtectionSchema,
    ),
    windProtectionOverride: optionalEnum(
      input.windProtectionOverride,
      windProtectionSchema,
    ),
    breathabilityOverride: optionalEnum(
      input.breathabilityOverride,
      breathabilitySchema,
    ),
    armCoverageOverride: optionalEnum(input.armCoverageOverride, coverageSchema),
    legCoverageOverride: optionalEnum(input.legCoverageOverride, coverageSchema),
    tractionSuitabilityOverride: optionalEnum(
      input.tractionSuitabilityOverride,
      tractionSuitabilitySchema,
    ),
    photoRelativePath: normalizeWardrobePhotoRelativePath(input.photoRelativePath),
  });
}

function hasMutableUpdate(input: UpdateWardrobeItemInput): boolean {
  return [
    'name',
    'category',
    'garmentTypeId',
    'color',
    'colorFamily',
    'thermalLevelOverride',
    'waterProtectionOverride',
    'windProtectionOverride',
    'breathabilityOverride',
    'armCoverageOverride',
    'legCoverageOverride',
    'tractionSuitabilityOverride',
    'photoRelativePath',
  ].some((key) => Object.prototype.hasOwnProperty.call(input, key));
}

function mutableFieldsFromUpdate(
  current: WardrobeItem,
  input: UpdateWardrobeItemInput,
): MutableWardrobeFields {
  if (!hasMutableUpdate(input)) {
    throw new WardrobeItemValidationError();
  }

  const hasGarmentTypeUpdate = Object.prototype.hasOwnProperty.call(
    input,
    'garmentTypeId',
  );
  const garmentTypeId = hasGarmentTypeUpdate
    ? requireEnum(input.garmentTypeId, garmentTypeIdSchema)
    : current.garmentTypeId;
  const selectedType = garmentTypeId ? getGarmentType(garmentTypeId) : null;

  return requireConsistentTaxonomyFields({
    name: Object.prototype.hasOwnProperty.call(input, 'name')
      ? normalizeOptionalWardrobeText(input.name)
      : current.name,
    category: Object.prototype.hasOwnProperty.call(input, 'category')
      ? requireCategory(input.category as WardrobeItemCategory)
      : hasGarmentTypeUpdate && selectedType
        ? selectedType.structuralCategory
        : current.category,
    garmentTypeId,
    color: Object.prototype.hasOwnProperty.call(input, 'color')
      ? normalizeOptionalWardrobeText(input.color)
      : current.color,
    colorFamily: Object.prototype.hasOwnProperty.call(input, 'colorFamily')
      ? optionalEnum(input.colorFamily, colorFamilySchema)
      : current.colorFamily,
    thermalLevelOverride: Object.prototype.hasOwnProperty.call(
      input,
      'thermalLevelOverride',
    )
      ? optionalEnum(input.thermalLevelOverride, thermalLevelSchema)
      : current.thermalLevelOverride,
    waterProtectionOverride: Object.prototype.hasOwnProperty.call(
      input,
      'waterProtectionOverride',
    )
      ? optionalEnum(input.waterProtectionOverride, waterProtectionSchema)
      : current.waterProtectionOverride,
    windProtectionOverride: Object.prototype.hasOwnProperty.call(
      input,
      'windProtectionOverride',
    )
      ? optionalEnum(input.windProtectionOverride, windProtectionSchema)
      : current.windProtectionOverride,
    breathabilityOverride: Object.prototype.hasOwnProperty.call(
      input,
      'breathabilityOverride',
    )
      ? optionalEnum(input.breathabilityOverride, breathabilitySchema)
      : current.breathabilityOverride,
    armCoverageOverride: Object.prototype.hasOwnProperty.call(
      input,
      'armCoverageOverride',
    )
      ? optionalEnum(input.armCoverageOverride, coverageSchema)
      : current.armCoverageOverride,
    legCoverageOverride: Object.prototype.hasOwnProperty.call(
      input,
      'legCoverageOverride',
    )
      ? optionalEnum(input.legCoverageOverride, coverageSchema)
      : current.legCoverageOverride,
    tractionSuitabilityOverride: Object.prototype.hasOwnProperty.call(
      input,
      'tractionSuitabilityOverride',
    )
      ? optionalEnum(input.tractionSuitabilityOverride, tractionSuitabilitySchema)
      : current.tractionSuitabilityOverride,
    photoRelativePath: Object.prototype.hasOwnProperty.call(input, 'photoRelativePath')
      ? normalizeWardrobePhotoRelativePath(input.photoRelativePath)
      : current.photoRelativePath,
  });
}

export class LocalWardrobeRepository implements WardrobeRepository {
  private readonly dataSource: WardrobePhotoCleanupDataSource;
  private readonly dependencies: WardrobeRepositoryDependencies;

  constructor(
    dataSource: WardrobePhotoCleanupDataSource,
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
        garmentTypeId: fields.garmentTypeId,
        color: fields.color,
        colorFamily: fields.colorFamily,
        thermalLevelOverride: fields.thermalLevelOverride,
        waterProtectionOverride: fields.waterProtectionOverride,
        windProtectionOverride: fields.windProtectionOverride,
        breathabilityOverride: fields.breathabilityOverride,
        armCoverageOverride: fields.armCoverageOverride,
        legCoverageOverride: fields.legCoverageOverride,
        tractionSuitabilityOverride: fields.tractionSuitabilityOverride,
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

  listPendingPhotoCleanup(
    localProfileId: string,
  ): Promise<PendingWardrobePhotoCleanup[]> {
    return this.execute(async () => {
      const owner = requireIdentifier(localProfileId);
      const records = await this.dataSource.listPendingPhotoCleanup(owner);

      return records.map((record) => {
        const item = this.mapScopedRecord(record, owner, true);
        if (item.deletedAt === null || item.photoRelativePath === null) {
          throw new WardrobeItemMappingError();
        }

        return { id: item.id, photoRelativePath: item.photoRelativePath };
      });
    });
  }

  clearPendingPhotoCleanup(
    localProfileId: string,
    id: string,
    photoRelativePath: string,
  ): Promise<boolean> {
    return this.execute(() => {
      const owner = requireIdentifier(localProfileId);
      const itemId = requireIdentifier(id);
      const normalizedPath = normalizeWardrobePhotoRelativePath(photoRelativePath);
      if (!normalizedPath) {
        throw new WardrobeItemValidationError();
      }

      return this.dataSource.clearPendingPhotoCleanup(owner, itemId, normalizedPath);
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
        garmentTypeId: fields.garmentTypeId,
        color: fields.color,
        colorFamily: fields.colorFamily,
        thermalLevelOverride: fields.thermalLevelOverride,
        waterProtectionOverride: fields.waterProtectionOverride,
        windProtectionOverride: fields.windProtectionOverride,
        breathabilityOverride: fields.breathabilityOverride,
        armCoverageOverride: fields.armCoverageOverride,
        legCoverageOverride: fields.legCoverageOverride,
        tractionSuitabilityOverride: fields.tractionSuitabilityOverride,
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
    const item = requireValidPersistedTaxonomy(mapWardrobeItemRecord(record));

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
