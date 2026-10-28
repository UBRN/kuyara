import type { DetailBoard, ManualDetail } from '@/features/today/application/composed-detail';
import type { TodayScreenState } from '@/features/today/model';
import {
  createTodayPresentation,
  type LoadedOutfitPresentation,
} from '@/features/today/presentation/today-presentation';
import { garmentSwatchesBySlot, keepGarmentColors, type GarmentOutfitPalette } from '@/garment-art';
import type { TemperatureUnit } from '@/localization/device-locale';
import type { SupportedLanguage } from '@/localization/messages';

/**
 * O15 and Phase 7: the pieces kuyara still chose keep their colours after a change; only a
 * changed piece is coloured afresh.
 */
export function detailPalette(suggestion: LoadedOutfitPresentation): GarmentOutfitPalette {
  return suggestion.keptColors
    ? keepGarmentColors(suggestion.keptColors.original, suggestion.palette, suggestion.keptColors.slots)
    : suggestion.palette;
}

/** The swatch detail's board draws each piece of `suggestionId` in, for any showing of it. */
export function detailBoard(
  state: TodayScreenState,
  language: SupportedLanguage,
  hour12: boolean,
  temperatureUnit: TemperatureUnit,
  now: number,
  suggestionId: string | undefined,
): DetailBoard {
  return {
    suggestionId,
    colorsOf: (manual: ManualDetail | null) => {
      const presentation = createTodayPresentation(state, language, hour12, temperatureUnit, now, manual);
      const suggestion = presentation.kind === 'loaded'
        ? presentation.suggestions.find(({ id }) => id === suggestionId) : undefined;
      return suggestion ? garmentSwatchesBySlot(detailPalette(suggestion)) : {};
    },
  };
}
