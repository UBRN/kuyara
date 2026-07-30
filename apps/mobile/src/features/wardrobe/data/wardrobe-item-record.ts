export type WardrobeItemRecord = Readonly<{
  id: string;
  localProfileId: string;
  name: string | null;
  category: string;
  color: string | null;
  photoRelativePath: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;
