import { createContext, use } from 'react';

import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import type { RecommendationSnapshot } from '@/features/recommendation/data/recommendation-repository';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';
import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';
import type { DressingDayChoiceSource } from '@/features/recommendation/domain/dressing-day-choice';
import type { DressingDayDeparture } from '@/features/recommendation/domain/dressing-day-departure';
import type { OutfitHistoryRecord, WornOutfit } from '@/features/recommendation/domain/outfit-history';

export type RecommendationApplicationValue = Readonly<{
  state: RecommendationApplicationState;
  getSnapshot: () => RecommendationApplicationState;
  // ADR 0034 section 5: what the device reports about on-device selection, read once and
  // null until that answer arrives. No inference, no quota, no provider or model identity.
  onDeviceAvailability: OnDeviceAiAvailability | null;
  refresh: () => Promise<RecommendationSnapshot | null>;
  evaluateApprovedTriggers: (foreground?: boolean) => Promise<void>;
  skipWait: () => Promise<RecommendationSnapshot | null>;
  /**
   * Today's "show another outfit" action: it regenerates the recommendation and leaves
   * weather alone. Whether this one reaches the AI chain or composes from the validated
   * pool is decided behind this call; the caller neither knows nor shows it.
   */
  regenerate: () => Promise<RecommendationSnapshot | null>;
  dressingDayKey?: string;
  dressingDayChoiceReady?: boolean;
  dressingDayChoiceFailed?: boolean;
  morningChoicePending?: boolean;
  eveningChoicePending?: boolean;
  activeDeparture?: DressingDayDeparture | null;
  readDeparture?: (dayKey: string) => Promise<DressingDayDeparture | null>;
  setDeparture?: (departureAt: string, timeZone: string) => Promise<DressingDayDeparture>;
  clearDeparture?: (dayKey: string) => Promise<boolean>;
  resolvedDressStyle?: DressStyle;
  /** The active dressing day's styles: its own answer, else the Settings defaults (N4). */
  resolvedStyleAesthetics?: readonly StyleAesthetic[];
  /**
   * One answer to the morning or evening question. `styleAesthetics` is the day's step-2
   * answer (M18), written in the same row and starting the same single generation; left
   * out, the day keeps the styles it had.
   */
  chooseFormality?: (key: string, formality: DressStyle, source: DressingDayChoiceSource,
    styleAesthetics?: readonly StyleAesthetic[]) => Promise<void>;
  /**
   * Outfit history (ADR 0038) for this profile, keyed by the bare-date day. Writing it
   * never starts a generation; the next approved one reads it for repeat avoidance.
   */
  outfitHistory?: Readonly<{
    list: () => Promise<readonly OutfitHistoryRecord[]>;
    get: (dayKey: string) => Promise<OutfitHistoryRecord | null>;
    log: (dayKey: string, outfit: WornOutfit) => Promise<OutfitHistoryRecord>;
  }>;
  /**
   * The confirmed "Ask the stylist again" (O3). It records a changed day type as the active
   * dressing day's `chip` answer, stores a Later departure under its own dressing day or
   * clears the day's departure for Now, then starts one re-ask through the strict five-per-day
   * reservation. It resolves once the answers are stored; `settled` ends with the generation.
   */
  reask?: (choice: Readonly<{
    formality: DressStyle;
    departureAt: string | null;
    timeZone: string;
  }>) => Promise<Readonly<{ settled: Promise<void> }>>;
  reevaluateLocalDay: () => void;
}>;

export const RecommendationApplicationContext =
  createContext<RecommendationApplicationValue | null>(null);

export function useRecommendationApplication(): RecommendationApplicationValue {
  const value = use(RecommendationApplicationContext);
  if (!value) {
    throw new Error(
      'useRecommendationApplication must be used within RecommendationApplicationProvider',
    );
  }
  return value;
}
