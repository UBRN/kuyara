import { z } from 'zod';

/**
 * The ids of the Phase 6 swatch library, the colours a garment drawing is painted in. A worn
 * day stores them (migration 24), so they are stored values: add new ids, never rename or
 * remove one. The board's swatch table names exactly these ids.
 */
export const garmentSwatchIds = Object.freeze([
  'white', 'ecru', 'stone', 'sand', 'straw', 'camel', 'tan', 'chocolate',
  'black', 'charcoal', 'heather', 'lightgrey', 'navy', 'oxford', 'indigo', 'midwash',
  'lightwash', 'blackdenim', 'olive', 'rust', 'terracotta', 'mustard', 'rainyellow', 'forest',
  'sage', 'burgundy', 'tomato', 'dustyrose', 'blush', 'skyblue', 'cobalt',
] as const);

export const garmentSwatchIdSchema = z.enum(garmentSwatchIds);
export type GarmentSwatchId = z.infer<typeof garmentSwatchIdSchema>;
