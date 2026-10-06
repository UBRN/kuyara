import type { RefObject } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { layout } from '@/theme/theme';

import { SWAP_STEP_BACK, swapScaledBox, swapTouchBox } from './swap-gesture';
import type { Box, GarmentSwapCandidate } from './swap-reconcile';

export type SwapPieceTargetLabels = Readonly<{
  slotName: (slot: OutfitSlot) => string;
  pieceName: (garmentTypeId: GarmentTypeId) => string;
  pieceValue: (piece: string, position: number, total: number) => string;
  pieceState?: (garmentTypeId: GarmentTypeId) => string | null;
  stripShown: string;
}>;

/**
 * One piece's screen-reader element on the swap board. VoiceOver's focus is the focus: every
 * piece is adjustable without enlarging it, and it stands where the piece is drawn, grown,
 * stepped back or at rest.
 */
export function SwapPieceTarget({
  slot, garmentTypeId, composedBox, grownBox, focusedSlot, order, labels, takeOffLabel, targets,
  onStep, onTakeOff, onFocusChange, onEscape, testID,
}: Readonly<{
  slot: OutfitSlot;
  garmentTypeId: GarmentTypeId;
  composedBox: Box;
  /** The enlarged piece's grown box, while this piece is the enlarged one. */
  grownBox: Box | null;
  focusedSlot: OutfitSlot | null;
  /** The slot's candidates in picker order. */
  order: readonly GarmentSwapCandidate[];
  labels: SwapPieceTargetLabels;
  /** The whole Take off sentence, when the reader may take this piece off. */
  takeOffLabel: string | null;
  /** Where each piece's element is kept, so a settle can hand VoiceOver's focus back to it. */
  targets: RefObject<Map<OutfitSlot, View>>;
  onStep: (slot: OutfitSlot, direction: 1 | -1) => void;
  onTakeOff?: (slot: OutfitSlot) => void;
  onFocusChange: (slot: OutfitSlot | null) => void;
  onEscape: () => void;
  testID: string;
}>) {
  const shownBox = focusedSlot === slot && grownBox ? grownBox
    : focusedSlot ? swapScaledBox(composedBox, SWAP_STEP_BACK) : composedBox;
  const box = swapTouchBox(shownBox, layout.minimumTouchTarget);
  const position = order.findIndex((c) => c.garmentTypeId === garmentTypeId) + 1;
  const value = labels.pieceValue(labels.pieceName(garmentTypeId), position, order.length);
  const state = labels.pieceState?.(garmentTypeId) ?? null;
  return (
    <View
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' },
        ...(takeOffLabel ? [{ name: 'takeOff', label: takeOffLabel }] : [])]}
      accessibilityLabel={labels.slotName(slot)}
      accessibilityRole="adjustable"
      // The enlarged piece reads as expanded: its strip is open under the board.
      accessibilityState={{ expanded: focusedSlot === slot }}
      accessibilityValue={{ text: state ? `${value}, ${state}` : value }}
      accessible
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'increment') onStep(slot, 1);
        else if (nativeEvent.actionName === 'decrement') onStep(slot, -1);
        else if (nativeEvent.actionName === 'takeOff') onTakeOff?.(slot);
        else if (nativeEvent.actionName === 'activate') {
          // Focus stays on the piece; one short sentence says the strip is below.
          if (slot !== focusedSlot) AccessibilityInfo.announceForAccessibility(labels.stripShown);
          onFocusChange(slot === focusedSlot ? null : slot);
        }
      }}
      onAccessibilityEscape={onEscape}
      pointerEvents="none"
      ref={(node) => {
        if (node) targets.current.set(slot, node);
        else targets.current.delete(slot);
      }}
      style={[styles.target, { height: box.h, left: box.x, top: box.y, width: box.w }]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  target: {
    position: 'absolute',
  },
});
