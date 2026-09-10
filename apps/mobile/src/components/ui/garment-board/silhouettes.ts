// ADR 0025's approved silhouettes and category fallback vocabulary.
// Bounds exclude stroke; silhouettes.test.mjs recomputes them from these paths.
export type Silhouette = Readonly<{
  id: string;
  viewBox: 64;
  paths: readonly Readonly<{ d: string; filled: boolean }>[];
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;

export const silhouettes = {
  'g-tank': {
    id: 'g-tank', viewBox: 64,
    paths: [
      { d: 'M26 16 L21 19 L23 28 L25 27 L25 50 L39 50 L39 27 L41 28 L43 19 L38 16 Z', filled: true },
      { d: 'M26 16 Q32 22 38 16', filled: false },
    ],
    bounds: { x: 21, y: 16, width: 22, height: 34 },
  },
  'g-leggings': {
    id: 'g-leggings', viewBox: 64,
    paths: [
      { d: 'M24 16 L40 16 L39 54 L34 54 L32 34 L30 54 L25 54 Z', filled: true },
      { d: 'M24 21 L40 21', filled: false },
    ],
    bounds: { x: 24, y: 16, width: 16, height: 38 },
  },
  'g-tee': {
    id: 'g-tee', viewBox: 64,
    paths: [
      { d: 'M24 16 L15 21 L18 32 L25 31 L24 50 L40 50 L39 31 L46 32 L49 21 L40 16 Z', filled: true },
      { d: 'M24 16 Q32 22 40 16', filled: false },
    ],
    bounds: { x: 15, y: 16, width: 34, height: 34 },
  },
  'g-long': {
    id: 'g-long', viewBox: 64,
    paths: [
      { d: 'M24 15 L15 20 L19 43 L25 42 L24 51 L40 51 L39 42 L45 43 L49 20 L40 15 Z', filled: true },
      { d: 'M24 15 Q32 21 40 15', filled: false },
    ],
    bounds: { x: 15, y: 15, width: 34, height: 36 },
  },
  'g-shirt': {
    id: 'g-shirt', viewBox: 64,
    paths: [
      { d: 'M24 15 L15 20 L19 43 L25 42 L24 52 L40 52 L39 42 L45 43 L49 20 L40 15 Z', filled: true },
      { d: 'M24 15 L28 21 L32 18 L36 21 L40 15', filled: false },
      { d: 'M32 21 L32 52', filled: false },
    ],
    bounds: { x: 15, y: 15, width: 34, height: 37 },
  },
  'g-sweater': {
    id: 'g-sweater', viewBox: 64,
    paths: [
      { d: 'M23 16 L14 21 L18 42 L25 41 L24 52 L40 52 L39 41 L46 42 L50 21 L41 16 Z', filled: true },
      { d: 'M23 16 Q32 23 41 16', filled: false },
      { d: 'M18 39 L25 38', filled: false },
      { d: 'M39 38 L46 39', filled: false },
      { d: 'M24 48 L40 48', filled: false },
    ],
    bounds: { x: 14, y: 16, width: 36, height: 36 },
  },
  'g-hoodie': {
    id: 'g-hoodie', viewBox: 64,
    paths: [
      { d: 'M23 18 Q26 11 32 11 Q38 11 41 18 Z', filled: true },
      { d: 'M23 18 L14 23 L18 44 L25 43 L24 53 L40 53 L39 43 L46 44 L50 23 L41 18 Z', filled: true },
      { d: 'M28 19 L29 27', filled: false },
      { d: 'M36 19 L35 27', filled: false },
      { d: 'M25 42 L39 42', filled: false },
    ],
    bounds: { x: 14, y: 11, width: 36, height: 42 },
  },
  'g-cardigan': {
    id: 'g-cardigan', viewBox: 64,
    paths: [
      { d: 'M23 16 L14 21 L18 42 L25 41 L24 52 L31 52 L31 18 Z', filled: true },
      { d: 'M41 16 L50 21 L46 42 L39 41 L40 52 L33 52 L33 18 Z', filled: true },
    ],
    bounds: { x: 14, y: 16, width: 36, height: 36 },
  },
  'g-jacket': {
    id: 'g-jacket', viewBox: 64,
    paths: [
      { d: 'M23 15 L14 20 L18 40 L25 39 L24 49 L40 49 L39 39 L46 40 L50 20 L41 15 Z', filled: true },
      { d: 'M23 15 L32 27 L41 15', filled: false },
      { d: 'M32 27 L32 49', filled: false },
    ],
    bounds: { x: 14, y: 15, width: 36, height: 34 },
  },
  'g-puffer': {
    id: 'g-puffer', viewBox: 64,
    paths: [
      { d: 'M23 15 L13 20 L17 41 L24 40 L23 51 L41 51 L40 40 L47 41 L51 20 L41 15 Z', filled: true },
      { d: 'M23 15 L32 26 L41 15', filled: false },
      { d: 'M32 26 L32 51', filled: false },
      { d: 'M19 31 L45 31', filled: false },
      { d: 'M18 39 L46 39', filled: false },
    ],
    bounds: { x: 13, y: 15, width: 38, height: 36 },
  },
  'g-trench': {
    id: 'g-trench', viewBox: 64,
    paths: [
      { d: 'M23 14 L13 19 L17 40 L24 39 L23 56 L41 56 L40 39 L47 40 L51 19 L41 14 Z', filled: true },
      { d: 'M23 14 L32 26 L41 14', filled: false },
      { d: 'M20 34 L44 34', filled: false },
      { d: 'M32 26 L32 56', filled: false },
    ],
    bounds: { x: 13, y: 14, width: 38, height: 42 },
  },
  'g-rain': {
    id: 'g-rain', viewBox: 64,
    paths: [
      { d: 'M25 16 L14 21 L18 41 L25 40 L24 50 L40 50 L39 40 L46 41 L50 21 L39 16 Z', filled: true },
      { d: 'M25 16 Q32 8 39 16', filled: false },
      { d: 'M32 16 L32 50', filled: false },
    ],
    bounds: { x: 14, y: 12, width: 36, height: 38 },
  },
  'g-trousers': {
    id: 'g-trousers', viewBox: 64,
    paths: [
      { d: 'M22 16 L42 16 L41 53 L34 53 L32 33 L30 53 L23 53 Z', filled: true },
      { d: 'M22 22 L42 22', filled: false },
    ],
    bounds: { x: 22, y: 16, width: 20, height: 37 },
  },
  'g-jeans': {
    id: 'g-jeans', viewBox: 64,
    paths: [
      { d: 'M22 16 L42 16 L41 53 L34 53 L32 33 L30 53 L23 53 Z', filled: true },
      { d: 'M22 22 L42 22', filled: false },
      { d: 'M25 23 L28 28', filled: false },
      { d: 'M39 23 L36 28', filled: false },
    ],
    bounds: { x: 22, y: 16, width: 20, height: 37 },
  },
  'g-shorts': {
    id: 'g-shorts', viewBox: 64,
    paths: [
      { d: 'M22 16 L42 16 L41 41 L34 41 L32 30 L30 41 L23 41 Z', filled: true },
      { d: 'M22 21 L42 21', filled: false },
    ],
    bounds: { x: 22, y: 16, width: 20, height: 25 },
  },
  'g-skirt': {
    id: 'g-skirt', viewBox: 64,
    paths: [
      { d: 'M24 18 L40 18 L47 50 L17 50 Z', filled: true },
      { d: 'M24 24 L40 24', filled: false },
    ],
    bounds: { x: 17, y: 18, width: 30, height: 32 },
  },
  'g-dress': {
    id: 'g-dress', viewBox: 64,
    paths: [
      { d: 'M25 13 L17 18 L21 28 L24 27 L18 55 L46 55 L40 27 L43 28 L47 18 L39 13 Z', filled: true },
      { d: 'M25 13 Q32 19 39 13', filled: false },
      { d: 'M23 31 L41 31', filled: false },
    ],
    bounds: { x: 17, y: 13, width: 30, height: 42 },
  },
  'g-jumpsuit': {
    id: 'g-jumpsuit', viewBox: 64,
    paths: [
      { d: 'M25 13 L17 18 L21 28 L24 27 L23 54 L30 54 L32 37 L34 54 L41 54 L40 27 L43 28 L47 18 L39 13 Z', filled: true },
      { d: 'M25 13 Q32 19 39 13', filled: false },
      { d: 'M23 31 L41 31', filled: false },
    ],
    bounds: { x: 17, y: 13, width: 30, height: 41 },
  },
  'g-sneaker': {
    id: 'g-sneaker', viewBox: 64,
    paths: [
      { d: 'M12 45 L12 36 Q12 31 18 31 L25 31 L33 36 L46 39 Q52 40 52 45 Z', filled: true },
      { d: 'M12 42 L52 42', filled: false },
      { d: 'M21 33 L26 36', filled: false },
    ],
    bounds: { x: 12, y: 31, width: 40, height: 14 },
  },
  'g-boot': {
    id: 'g-boot', viewBox: 64,
    paths: [
      { d: 'M21 15 L33 15 L33 39 L46 42 Q52 43 52 48 L21 48 Z', filled: true },
      { d: 'M21 21 L33 21', filled: false },
      { d: 'M21 45 L52 45', filled: false },
    ],
    bounds: { x: 21, y: 15, width: 31, height: 33 },
  },
  'g-dressshoe': {
    id: 'g-dressshoe', viewBox: 64,
    paths: [
      { d: 'M13 45 L13 41 Q13 37 19 36 L30 34 L44 39 Q50 40 50 45 Z', filled: true },
      { d: 'M43 45 L43 50 L50 50 L50 45', filled: false },
      { d: 'M21 37 Q28 41 35 38', filled: false },
    ],
    bounds: { x: 13, y: 34, width: 37, height: 16 },
  },
  'g-sandal': {
    id: 'g-sandal', viewBox: 64,
    paths: [
      { d: 'M14 44 L48 44 Q52 44 52 47 Q52 50 48 50 L18 50 Q14 50 14 47 Z', filled: true },
      { d: 'M19 44 L23 38 L36 38 L40 44', filled: false },
      { d: 'M25 38 L28 44', filled: false },
    ],
    bounds: { x: 14, y: 38, width: 38, height: 12 },
  },
  'g-beanie': {
    id: 'g-beanie', viewBox: 64,
    paths: [
      { d: 'M16 38 Q16 20 32 20 Q48 20 48 38 Z', filled: true },
      { d: 'M14 38 L50 38 L50 46 L14 46 Z', filled: true },
    ],
    bounds: { x: 14, y: 20, width: 36, height: 26 },
  },
  'g-hat': {
    id: 'g-hat', viewBox: 64,
    paths: [
      { d: 'M22 42 L22 22 Q32 14 42 22 L42 42 Z', filled: true },
      { d: 'M12 42 Q32 38 52 42 Q32 50 12 42 Z', filled: true },
      { d: 'M22 35 L42 35', filled: false },
    ],
    bounds: { x: 12, y: 18, width: 40, height: 28 },
  },
  'g-scarf': {
    id: 'g-scarf', viewBox: 64,
    paths: [
      { d: 'M16 24 Q32 12 48 24 L44 31 Q32 22 20 31 Z', filled: true },
      { d: 'M21 29 L30 27 L27 51 L18 51 Z', filled: true },
      { d: 'M34 27 L43 29 L46 51 L37 51 Z', filled: true },
      { d: 'M19 44 L28 44', filled: false },
      { d: 'M36 44 L45 44', filled: false },
    ],
    bounds: { x: 16, y: 18, width: 32, height: 33 },
  },
  'g-gloves': {
    id: 'g-gloves', viewBox: 64,
    paths: [
      { d: 'M23 51 L23 39 L16 35 L14 33 Q14 30 17 31 L25 35 L25 24 Q25 21 28 21 Q31 21 31 24 L31 31 L32 21 Q32 18 35 18 Q38 18 38 21 L38 31 L39 23 Q39 20 42 20 Q45 20 45 23 L45 33 L46 27 Q46 24 49 25 Q50 25 50 29 L49 40 Q48 47 43 51 Z', filled: true },
      { d: 'M23 44 L47 44', filled: false },
    ],
    bounds: { x: 14, y: 18, width: 36, height: 33 },
  },
  'g-umbrella': {
    id: 'g-umbrella', viewBox: 64,
    paths: [
      { d: 'M12 31 Q16 16 32 16 Q48 16 52 31 Q47 27 42 31 Q37 27 32 31 Q27 27 22 31 Q17 27 12 31 Z', filled: true },
      { d: 'M32 16 Q24 20 22 31', filled: false },
      { d: 'M32 16 Q40 20 42 31', filled: false },
      { d: 'M32 16 L32 44 Q32 49 37 49 Q41 49 41 45', filled: false },
    ],
    bounds: { x: 12, y: 16, width: 40, height: 33 },
  },
  'g-cat-top': {
    id: 'g-cat-top', viewBox: 64,
    paths: [
      { d: 'M24 16 L17 21 L19 36 L25 35 L24 50 L40 50 L39 35 L45 36 L47 21 L40 16 Z', filled: true },
      { d: 'M24 16 Q32 22 40 16', filled: false },
    ],
    bounds: { x: 17, y: 16, width: 30, height: 34 },
  },
  'g-cat-bottom': {
    id: 'g-cat-bottom', viewBox: 64,
    paths: [
      { d: 'M19 16 L45 16 L44 52 L36 52 L32 33 L28 52 L20 52 Z', filled: true },
      { d: 'M19 22 L45 22', filled: false },
    ],
    bounds: { x: 19, y: 16, width: 26, height: 36 },
  },
  'g-cat-one_piece': {
    id: 'g-cat-one_piece', viewBox: 64,
    paths: [
      { d: 'M25 14 L18 19 L21 29 L25 28 L21 53 L43 53 L39 28 L43 29 L46 19 L39 14 Z', filled: true },
      { d: 'M25 14 Q32 20 39 14', filled: false },
    ],
    bounds: { x: 18, y: 14, width: 28, height: 39 },
  },
  'g-cat-outerwear': {
    id: 'g-cat-outerwear', viewBox: 64,
    paths: [
      { d: 'M24 15 L16 20 L19 41 L25 40 L24 51 L40 51 L39 40 L45 41 L48 20 L40 15 Z', filled: true },
      { d: 'M24 15 Q32 21 40 15', filled: false },
      { d: 'M32 18 L32 51', filled: false },
    ],
    bounds: { x: 16, y: 15, width: 32, height: 36 },
  },
  'g-cat-footwear': {
    id: 'g-cat-footwear', viewBox: 64,
    paths: [
      { d: 'M15 46 L15 29 Q15 26 20 26 L26 26 L33 35 L44 38 Q49 39 49 44 L49 46 Z', filled: true },
      { d: 'M15 42 L49 42', filled: false },
    ],
    bounds: { x: 15, y: 26, width: 34, height: 20 },
  },
  'g-cat-accessory': {
    id: 'g-cat-accessory', viewBox: 64,
    paths: [
      { d: 'M20 37 Q20 19 32 19 Q44 19 44 37', filled: true },
      { d: 'M16 37 L48 37 L48 47 L16 47 Z', filled: true },
    ],
    bounds: { x: 16, y: 19, width: 32, height: 28 },
  },
} as const satisfies Record<string, Silhouette>;

export type SilhouetteId = keyof typeof silhouettes;
