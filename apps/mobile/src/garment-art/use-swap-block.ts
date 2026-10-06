import { useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { fadeEasing, fadeTo } from '@/components/ui/fade';
import { PRESENCE_TEXT_AFTER } from '@/components/ui/presence';
import type { Grow, Pager } from './swap-reconcile';
import type { SwapPanels } from './use-swap-pager';

/**
 * The block under the swap board: one height for the stage and what stands under it, the
 * line at rest or the strip while a piece is enlarged, and Presence's order for their words:
 * text enters once its space is 90 per cent open and leaves before it closes.
 */
export function useSwapBlock({
  focusedSlot, hintVisible, restHeight, settled, activeGrow, pager, panels, setPanels, panelHeightOf, onReveal,
}: Readonly<{
  focusedSlot: OutfitSlot | null;
  hintVisible: boolean;
  restHeight: number;
  /** Whether the pieces have arrived: before then nothing under the board animates. */
  settled: boolean;
  activeGrow: Grow | null;
  pager: Pager | null;
  panels: SwapPanels;
  setPanels: Dispatch<SetStateAction<SwapPanels>>;
  panelHeightOf: (slot: OutfitSlot) => number;
  onReveal?: (area: Readonly<{ pieceTop: number; panelBottom: number }>) => void;
}>) {
  const theme = useKuyaraTheme();
  const fadeEase = useMemo(() => fadeEasing(theme.motion), [theme.motion]);
  const spatial = theme.springs.spatial;
  const { fast, normal } = theme.motion;

  const [hintHeight, setHintHeight] = useState(0);
  const [hintMounted, setHintMounted] = useState(hintVisible);
  if (hintVisible && !hintMounted) setHintMounted(true);
  // The strip takes touches and VoiceOver's focus only once it is fading in: while its space
  // opens its tiles are not drawn yet, so they are not there to press or read.
  const [liveSlot, setLiveSlot] = useState<OutfitSlot | null>(focusedSlot);
  if (focusedSlot === null && liveSlot !== null) setLiveSlot(null);

  const block = useSharedValue(0);
  const blockFrom = useSharedValue(0);
  const blockTo = useSharedValue(0);
  const panelOpacity = useSharedValue(0);
  const leavingPanelOpacity = useSharedValue(0);
  const hintOpacity = useSharedValue(hintVisible ? 1 : 0);
  const panelPending = useSharedValue(0);
  const hintPending = useSharedValue(0);

  // One height for the stage and what stands under it: the hint at rest, the strip while a
  // piece is enlarged. Text enters once its space is 90 per cent open and leaves before it closes.
  const heldStage = panels.current?.held ?? activeGrow?.held ?? restHeight;
  const blockTarget = focusedSlot && activeGrow
    ? activeGrow.held + spacing.md + panelHeightOf(focusedSlot)
    : restHeight + (hintVisible ? hintHeight : 0);
  const latest = useRef({ focus: focusedSlot, target: blockTarget, hint: hintVisible });
  const markPanelLive = () => setLiveSlot(latest.current.focus);
  const flushPending = () => {
    'worklet';
    if (panelPending.get() === 1) {
      panelPending.set(0);
      panelOpacity.set(withTiming(1, { duration: fast, easing: fadeEase }));
      scheduleOnRN(markPanelLive);
    }
    if (hintPending.get() === 1) {
      hintPending.set(0);
      hintOpacity.set(withTiming(1, { duration: fast, easing: fadeEase }));
    }
  };
  useAnimatedReaction(() => block.get(), (height) => {
    const start = blockFrom.get();
    const end = blockTo.get();
    if (Math.abs(end - start) < 0.5 || (height - start) / (end - start) >= PRESENCE_TEXT_AFTER) flushPending();
  });
  const blockToken = useRef(0);
  // After a settle the strip leaves the tree once the block has closed over it.
  const closingPanel = useRef(false);
  const clearPanel = () => {
    closingPanel.current = false;
    setPanels((current) => (current.focus === null ? { ...current, current: null, leaving: null } : current));
  };
  const blockLanded = (token: number) => {
    if (token !== blockToken.current) return;
    flushPending();
    if (closingPanel.current) clearPanel();
  };
  const startBlock = (target: number) => {
    const start = block.get();
    blockFrom.set(start);
    blockTo.set(target);
    blockToken.current += 1;
    const token = blockToken.current;
    if (Math.abs(target - start) < 0.5) {
      block.set(target);
      flushPending();
      return;
    }
    block.set(withSpring(target, spatial, (finished) => {
      if (finished) scheduleOnRN(blockLanded, token);
    }));
  };
  const afterPanelOut = () => {
    if (latest.current.focus !== null) return;
    if (latest.current.hint) hintPending.set(1);
    else setHintMounted(false);
    closingPanel.current = true;
    startBlock(latest.current.target);
    if (Math.abs(block.get() - latest.current.target) < 0.5) clearPanel();
  };
  const afterLeavingPanelOut = () => {
    setPanels((current) => (current.leaving ? { ...current, leaving: null } : current));
  };
  const afterShorterSwap = () => {
    afterLeavingPanelOut();
    if (latest.current.focus === null) return;
    startBlock(latest.current.target);
    panelOpacity.set(fadeTo(1, normal, theme.motion));
    markPanelLive();
  };
  const afterHintOut = () => {
    if (latest.current.hint) return;
    setHintMounted(false);
    if (latest.current.focus === null) startBlock(latest.current.target);
  };
  const reveal = (slot: OutfitSlot) => {
    if (!pager || !activeGrow) return;
    onReveal?.({ pieceTop: pager.grown.y, panelBottom: activeGrow.held + spacing.md + panelHeightOf(slot) });
  };

  const blockSeen = useRef<Readonly<{ focus: OutfitSlot | null; hint: boolean; target: number; panel: number }> | null>(null);
  const panelHeight = focusedSlot ? panelHeightOf(focusedSlot) : 0;
  useLayoutEffect(() => {
    const seen = blockSeen.current;
    latest.current = { focus: focusedSlot, target: blockTarget, hint: hintVisible };
    blockSeen.current = { focus: focusedSlot, hint: hintVisible, target: blockTarget, panel: panelHeight };
    if (!seen || !settled) {
      // Before the pieces have arrived nothing under the board animates.
      blockToken.current += 1;
      block.set(blockTarget);
      blockFrom.set(blockTarget);
      blockTo.set(blockTarget);
      hintOpacity.set(hintVisible && focusedSlot === null ? 1 : 0);
      panelOpacity.set(focusedSlot ? 1 : 0);
      return;
    }
    if (focusedSlot !== seen.focus) {
      if (seen.focus === null && focusedSlot) {
        // Enlarge: the block opens in the tap frame, the hint's words leave at once and the
        // strip fades in once 90 per cent of its space is open.
        panelOpacity.set(0);
        panelPending.set(1);
        hintPending.set(0);
        hintOpacity.set(fadeTo(0, fast, theme.motion));
        startBlock(blockTarget);
        reveal(focusedSlot);
      } else if (focusedSlot === null) {
        // Settle: the strip fades out first, then the block closes in one spring.
        panelPending.set(0);
        panelOpacity.set(fadeTo(0, fast, theme.motion, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(afterPanelOut);
        }));
      } else {
        // The enlargement moves: the old strip leaves on `fast`; the new one arrives at once
        // on `normal` when it is as tall, after the block opens when taller, and after the
        // old one has gone and the block has closed when shorter.
        leavingPanelOpacity.set(1);
        panelOpacity.set(0);
        if (Math.abs(panelHeight - seen.panel) < 0.5) {
          leavingPanelOpacity.set(fadeTo(0, fast, theme.motion, (finished) => {
            'worklet';
            if (finished) scheduleOnRN(afterLeavingPanelOut);
          }));
          panelOpacity.set(fadeTo(1, normal, theme.motion));
          markPanelLive();
          startBlock(blockTarget);
        } else if (panelHeight > seen.panel) {
          leavingPanelOpacity.set(fadeTo(0, fast, theme.motion, (finished) => {
            'worklet';
            if (finished) scheduleOnRN(afterLeavingPanelOut);
          }));
          panelPending.set(1);
          startBlock(blockTarget);
          reveal(focusedSlot);
        } else {
          panelPending.set(0);
          leavingPanelOpacity.set(fadeTo(0, fast, theme.motion, (finished) => {
            'worklet';
            if (finished) scheduleOnRN(afterShorterSwap);
          }));
        }
      }
      return;
    }
    if (focusedSlot === null && hintVisible !== seen.hint) {
      if (!hintVisible) {
        // A change: the hint's words leave before its space closes.
        hintPending.set(0);
        hintOpacity.set(fadeTo(0, fast, theme.motion, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(afterHintOut);
        }));
      } else {
        // Back to kuyara's pick: the space opens, the words follow at 90 per cent.
        hintPending.set(1);
        startBlock(blockTarget);
      }
      return;
    }
    if (Math.abs(blockTarget - seen.target) >= 0.5 && !(focusedSlot === null && panels.current)) startBlock(blockTarget);
  });

  const blockStyle = useAnimatedStyle(() => ({ height: block.get() }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hintOpacity.get() }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: panelOpacity.get() }));
  const leavingPanelStyle = useAnimatedStyle(() => ({ opacity: leavingPanelOpacity.get() }));

  // Before the pieces have arrived the strip is drawn at once, so it is live at once.
  const stripLive = panels.current !== null && focusedSlot === panels.current.slot
    && (liveSlot === focusedSlot || !settled);
  const measureHint = (height: number) => {
    if (height !== hintHeight) setHintHeight(height);
  };

  return { heldStage, hintMounted, measureHint, stripLive, blockStyle, hintStyle, panelStyle, leavingPanelStyle };
}
