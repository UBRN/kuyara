export { ChoiceTile, ChoiceTileGrid, type ChoiceTileDrawing, type ChoiceTileProps } from './choice-tile';
export { ClosetSolidStrip, type ClosetSolidStripProps } from './closet-solid-strip';
export { ColorSwatch, ColorWellFace } from './color-swatch';
export { GarmentSlotGlyph, GarmentSlotTile } from './garment-slot-glyph';
export { defaultGarmentCut, GarmentCutProvider, useGarmentCut } from './garment-cut';

export {
  GarmentBoard,
  garmentBoardDressingOrder,
  layoutGarmentBoard,
  measureGarmentBoardHeight,
  useGarmentCandidateRoles,
  useGarmentRoles,
  type GarmentBoardLayout,
  type GarmentBoardLayoutBox,
  type GarmentBoardPiece,
} from './garment-board';

export {
  GarmentSwapBoard,
  type GarmentSwapBoardLabels,
  type GarmentSwapBoardProps,
  type GarmentSwapCandidate,
} from './garment-swap-board';
export { swapRevealScroll } from './swap-gesture';

export { GarmentCandidateTile, GarmentDrawing, GarmentTileArtwork } from './garment-tile-artwork';
export { ClosetColorDisc } from './closet-color-art';
export { ClosetRack, RACK_ASPECT, type ClosetRackProps, type RackPiece } from './closet-rack';
export {
  GarmentRunwayBoard,
  runwayDressingDuration,
  type RunwayBoardOutfit,
} from './garment-runway-board';
export { GarmentPreviewBoard, type GarmentPreviewBoardProps } from './garment-preview-board';
export {
  garmentColorFamiliesBySlot,
  garmentSwatchesBySlot,
  garmentUsualColorFamilies,
  keepGarmentColors,
  type GarmentOutfitPalette,
} from './garment-palette';

// ADR 0028 section 6 and ADR 0029 section 5: approved content colour for the Profile
// rack, the Closet grid, and the form's colour-family swatches. Never a theme role.
export { colorFamilyFills } from './color-family-fill';
