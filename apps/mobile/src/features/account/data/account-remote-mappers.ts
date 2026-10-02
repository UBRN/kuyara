import type { ZodType } from 'zod';

import {
  remoteDressingDayChoiceRowSchema,
  remoteDressingDayDepartureRowSchema,
  remoteOutfitHistoryRowSchema,
  remoteProfileRowSchema,
  remoteWardrobeItemRowSchema,
  type RemoteDressingDayChoiceUpload,
  type RemoteDressingDayDepartureUpload,
  type RemoteOutfitHistoryUpload,
  type RemoteProfileUpload,
  type RemoteWardrobeItemUpload,
} from '@/features/account/data/account-remote-records';
import type { SyncedProfile } from '@/features/account/domain/account-rows';
import { canonicalServerInstant } from '@/features/account/domain/server-instant';
import { sortedStyleAesthetics, normalizeDisplayName } from '@/features/profile/domain/profile';
import type { DressingDayChoice } from '@/features/recommendation/domain/dressing-day-choice';
import type { DressingDayDeparture } from '@/features/recommendation/domain/dressing-day-departure';
import { wornPieceColorsFor, type OutfitHistoryRecord } from '@/features/recommendation/domain/outfit-history';
import { closetColorChoiceFromColumns } from '@/features/wardrobe/domain/closet-color-options';
import { garmentTypeIdFromColumn, type WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

/**
 * One pulled row: kept, or refused because this build cannot parse it (a newer app version
 * wrote it). A refused row never touches the phone, and its arrival still moves the cursor.
 */
export type RemoteRowResult<Row> =
  | Readonly<{ kind: 'accepted'; row: Row; serverUpdatedAt: string }>
  | Readonly<{ kind: 'refused'; serverUpdatedAt: string | null }>;

function arrivalOf(raw: unknown): string | null {
  return typeof raw === 'object' && raw !== null && 'server_updated_at' in raw
    ? canonicalServerInstant(raw.server_updated_at)
    : null;
}

function read<Parsed extends Readonly<{ server_updated_at: string }>, Row>(
  raw: unknown,
  schema: ZodType<Parsed>,
  build: (parsed: Parsed) => Row,
): RemoteRowResult<Row> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { kind: 'refused', serverUpdatedAt: arrivalOf(raw) };
  try {
    return { kind: 'accepted', row: build(parsed.data), serverUpdatedAt: parsed.data.server_updated_at };
  } catch {
    // A row the domain rules reject after the schema passed is refused like any other.
    return { kind: 'refused', serverUpdatedAt: parsed.data.server_updated_at };
  }
}

export function toRemoteProfile(profile: SyncedProfile, userId: string): RemoteProfileUpload {
  return {
    user_id: userId,
    display_name: profile.displayName,
    gender: profile.gender,
    dress_style: profile.dressStyle,
    style_aesthetics: sortedStyleAesthetics(profile.styleAesthetics),
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
    deleted_at: null,
  };
}

export function fromRemoteProfile(raw: unknown): RemoteRowResult<SyncedProfile> {
  return read(raw, remoteProfileRowSchema, (row) => {
    if (normalizeDisplayName(row.display_name) !== row.display_name) throw new Error('Invalid display name.');
    return {
      displayName: row.display_name,
      gender: row.gender,
      dressStyle: row.dress_style,
      styleAesthetics: sortedStyleAesthetics(row.style_aesthetics),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export function toRemoteWardrobeItem(item: WardrobeItem, userId: string): RemoteWardrobeItemUpload {
  return {
    id: item.id,
    user_id: userId,
    name: item.name,
    category: item.category,
    entry_state: item.entryState,
    garment_type_id: item.garmentTypeId,
    color: item.color,
    color_family: item.colorFamily,
    color_option_id: item.colorChoice?.kind === 'option' ? item.colorChoice.id : null,
    color_custom_hex: item.colorChoice?.kind === 'custom' ? item.colorChoice.hex : null,
    thermal_level_override: item.thermalLevelOverride,
    water_protection_override: item.waterProtectionOverride,
    wind_protection_override: item.windProtectionOverride,
    breathability_override: item.breathabilityOverride,
    arm_coverage_override: item.armCoverageOverride,
    leg_coverage_override: item.legCoverageOverride,
    traction_suitability_override: item.tractionSuitabilityOverride,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt,
  };
}

export function fromRemoteWardrobeItem(raw: unknown, localProfileId: string): RemoteRowResult<WardrobeItem> {
  return read(raw, remoteWardrobeItemRowSchema, (row) => {
    // The phone reads an unlisted garment type or colour option as none, to keep an old piece
    // readable. A pulled row that names one was written by a newer build and is refused whole.
    const garmentTypeId = garmentTypeIdFromColumn(row.garment_type_id);
    const colorChoice = closetColorChoiceFromColumns(row.color_option_id, row.color_custom_hex, row.color_family);
    if ((row.garment_type_id !== null && garmentTypeId === null) ||
        (row.color_option_id !== null && colorChoice === null)) {
      throw new Error('Unknown catalog value.');
    }
    return {
      id: row.id,
      localProfileId,
      name: row.name,
      category: row.category,
      entryState: row.entry_state,
      garmentTypeId,
      color: row.color,
      colorFamily: row.color_family,
      colorChoice,
      thermalLevelOverride: row.thermal_level_override,
      waterProtectionOverride: row.water_protection_override,
      windProtectionOverride: row.wind_protection_override,
      breathabilityOverride: row.breathability_override,
      armCoverageOverride: row.arm_coverage_override,
      legCoverageOverride: row.leg_coverage_override,
      tractionSuitabilityOverride: row.traction_suitability_override,
      photoRelativePath: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  });
}

export function toRemoteDressingDayChoice(choice: DressingDayChoice, userId: string): RemoteDressingDayChoiceUpload {
  return {
    id: choice.id,
    user_id: userId,
    day_key: choice.dayKey,
    formality: choice.formality,
    source: choice.source,
    style_aesthetics: choice.styleAesthetics === null ? null : [...choice.styleAesthetics].sort(),
    created_at: choice.createdAt,
    updated_at: choice.updatedAt,
    deleted_at: choice.deletedAt,
  };
}

export function fromRemoteDressingDayChoice(raw: unknown, localProfileId: string): RemoteRowResult<DressingDayChoice> {
  return read(raw, remoteDressingDayChoiceRowSchema, (row) => ({
    id: row.id,
    localProfileId,
    dayKey: row.day_key,
    formality: row.formality,
    source: row.source,
    styleAesthetics: row.style_aesthetics === null ? null : [...row.style_aesthetics].sort(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }));
}

export function toRemoteDressingDayDeparture(
  departure: DressingDayDeparture,
  userId: string,
): RemoteDressingDayDepartureUpload {
  return {
    id: departure.id,
    user_id: userId,
    day_key: departure.dayKey,
    departure_at: departure.departureAt,
    time_zone: departure.timeZone,
    created_at: departure.createdAt,
    updated_at: departure.updatedAt,
    deleted_at: departure.deletedAt,
  };
}

export function fromRemoteDressingDayDeparture(
  raw: unknown,
  localProfileId: string,
): RemoteRowResult<DressingDayDeparture> {
  return read(raw, remoteDressingDayDepartureRowSchema, (row) => ({
    id: row.id,
    localProfileId,
    dayKey: row.day_key,
    departureAt: row.departure_at,
    timeZone: row.time_zone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }));
}

export function toRemoteOutfitHistory(record: OutfitHistoryRecord, userId: string): RemoteOutfitHistoryUpload {
  return {
    id: record.id,
    user_id: userId,
    day_key: record.dayKey,
    outfit_json: record.outfit,
    piece_colors_json: record.pieceColors,
    worn_at: record.wornAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  };
}

export function fromRemoteOutfitHistory(raw: unknown, localProfileId: string): RemoteRowResult<OutfitHistoryRecord> {
  return read(raw, remoteOutfitHistoryRowSchema, (row) => ({
    id: row.id,
    localProfileId,
    dayKey: row.day_key,
    outfit: row.outfit_json,
    pieceColors: wornPieceColorsFor(row.outfit_json, row.piece_colors_json ?? null),
    photoPath: null,
    wornAt: row.worn_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }));
}
