import { createContext, use } from 'react';

import type { WardrobeApplicationState } from '@/features/wardrobe/application/wardrobe-application-controller';
import type {
  CreateWardrobeItemInput,
  UpdateWardrobeItemInput,
  WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';

export type WardrobeApplicationValue = Readonly<{
  state: WardrobeApplicationState;
  refresh: () => Promise<void>;
  getItem: (id: string) => Promise<WardrobeItem | null>;
  createItem: (
    input: Omit<CreateWardrobeItemInput, 'localProfileId'>,
  ) => Promise<WardrobeItem>;
  updateItem: (
    id: string,
    input: Omit<UpdateWardrobeItemInput, 'id' | 'localProfileId'>,
  ) => Promise<WardrobeItem>;
  softDeleteItem: (id: string) => Promise<WardrobeItem>;
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
