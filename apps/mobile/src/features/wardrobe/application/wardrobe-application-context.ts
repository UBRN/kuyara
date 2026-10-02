import { createContext, use } from 'react';

import type { WardrobeApplicationState } from '@/features/wardrobe/application/wardrobe-application-controller';
import type { WardrobePhotoChange } from '@/features/wardrobe/application/wardrobe-photo-manager';
import type { StagedWardrobePhoto } from '@/features/wardrobe/data/wardrobe-photo-adapters';
import type { WardrobePhotoSource } from '@/features/wardrobe/domain/wardrobe-photo';
import type {
  CreateWardrobeItemInput,
  UpdateWardrobeItemInput,
  WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';

export type WardrobeApplicationValue = Readonly<{
  state: WardrobeApplicationState;
  refresh: () => Promise<void>;
  getItem: (id: string) => Promise<WardrobeItem | null>;
  /** Opens the system photo picker, or the system camera for `'camera'`. */
  preparePhoto: (source?: WardrobePhotoSource) => Promise<StagedWardrobePhoto | null>;
  discardStagedPhoto: (photo: StagedWardrobePhoto) => Promise<void>;
  resolvePhotoUri: (relativePath: string | null) => string | null;
  createItem: (
    input: Omit<CreateWardrobeItemInput, 'localProfileId' | 'photoRelativePath'>,
    photoChange?: WardrobePhotoChange,
  ) => Promise<WardrobeItem>;
  updateItem: (
    id: string,
    input: Omit<
      UpdateWardrobeItemInput,
      'id' | 'localProfileId' | 'photoRelativePath'
    >,
    photoChange?: WardrobePhotoChange,
  ) => Promise<WardrobeItem>;
  softDeleteItem: (id: string) => Promise<WardrobeItem>;
  /** Adds the pieces only while the Closet is empty; see `closetSeedInputs`. */
  seedEmptyCloset: (
    inputs: readonly Omit<CreateWardrobeItemInput, 'localProfileId' | 'photoRelativePath'>[],
  ) => Promise<readonly WardrobeItem[]>;
}>;

export const WardrobeApplicationContext =
  createContext<WardrobeApplicationValue | null>(null);

export function useWardrobeApplication(): WardrobeApplicationValue {
  const application = use(WardrobeApplicationContext);

  if (!application) {
    throw new Error(
      'useWardrobeApplication must be used within WardrobeApplicationProvider',
    );
  }

  return application;
}
