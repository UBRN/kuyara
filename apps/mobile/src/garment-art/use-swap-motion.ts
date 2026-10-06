import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  cancelAnimation,
  useAnimatedReaction,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { useKuyaraTheme } from '@/theme/theme-context';

import { fadeTo } from '@/components/ui/fade';
import { PRESENCE_TEXT_AFTER } from '@/components/ui/presence';
import { entranceStartBoxes, type GarmentBoardPiece } from './garment-board';
import { garmentRolesBySlot, type GarmentOutfitPalette } from './garment-palette';
import { swapEntryBox, swapExitOffset } from './swap-gesture';
import { bandBoxesOnBoard, lerpBox, type Composer } from './swap-layout';
import { DRESS_LIFT, paced, SETTLE_TRAVEL, valuesFor } from './swap-motion';
import {
  emptyModel,
  reconcile,
  sameBox,
  type Box,
  type Candidates,
  type Composed,
  type Grow,
  type Intent,
  type Model,
  type Pager,
  type PieceValues,
  type ReconcileTools,
} from './swap-reconcile';

/**
 * The swap board's pieces and their motion: the model `reconcile` derives from the owner's
 * pieces, focus and layout while rendering, the springs and fades each re-layout's intents
 * start once it has committed, the entrance's arrival and tint, and Law 7's settle.
 */
export function useSwapMotion({
  pieces, palette, width, large, focusedSlot, candidates, entrance, settle,
  compose, composed, fit, activeGrow, pager,
}: Readonly<{
  pieces: readonly GarmentBoardPiece[];
  palette: GarmentOutfitPalette;
  width: number;
  large: boolean;
  focusedSlot: OutfitSlot | null;
  candidates: Candidates;
  entrance: Readonly<{ fromStageColor: string; fromWidth: number | null }>;
  settle: number | undefined;
  compose: Composer;
  composed: Composed | null;
  fit: number;
  activeGrow: Grow | null;
  pager: Pager | null;
}>) {
  const theme = useKuyaraTheme();
  const spatial = theme.springs.spatial;
  const { fast, normal } = theme.motion;
  const { colors } = theme;
  const rolesFor = useMemo(() => (input: GarmentOutfitPalette) => garmentRolesBySlot({
    ...input,
    appearance: theme.colorScheme,
    stageColor: colors.background,
    accessoryStageColor: colors.background,
    inkColor: colors.textPrimary,
  }), [colors.background, colors.textPrimary, theme.colorScheme]);
  const roles = useMemo(() => rolesFor(palette), [palette, rolesFor]);

  // The entrance is nine tenths travelled, so what waits for the pieces follows; then it has
  // landed, no piece moving any more, so none overlaps another as it travels.
  const [settled, setSettled] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [model, setModel] = useState<Model>(emptyModel);
  const [lastSettle, setLastSettle] = useState(settle);
  const tint = useSharedValue(0);
  const arrival = useSharedValue(0);
  const settleTravel = useSharedValue(0);
  const stageLimit = useSharedValue(0);

  // The pieces follow the owner's pieces, focus and layout; a change is derived here, while
  // rendering, and its motion starts once it has committed.
  const signature = composed
    ? JSON.stringify([pieces, palette, width, large, focusedSlot, activeGrow?.scale ?? null, fit,
      focusedSlot ? candidates[focusedSlot] ?? null : null, theme.colorScheme])
    : null;
  if (composed && signature && signature !== model.signature) {
    const tools: ReconcileTools = {
      values: valuesFor,
      compose,
      entranceBoxes: (next) => (entrance.fromWidth === null
        ? entranceStartBoxes(next, width, 'today', true, large)
        : bandBoxesOnBoard(entranceStartBoxes(next, entrance.fromWidth, 'today', true, large), entrance.fromWidth, width)),
    };
    setModel(reconcile(model, {
      signature, composed, pieces, palette, roles, rolesFor, width, focusedSlot, grow: activeGrow, pager, candidates,
    }, tools));
  }
  // Law 7's moment: one settle per completing action, never on mount.
  if (settle !== lastSettle) setLastSettle(settle);

  // Every spring a re-layout starts is counted; the captions return once the last one lands.
  const pendingSprings = useRef(0);
  const springLanded = () => {
    pendingSprings.current = Math.max(0, pendingSprings.current - 1);
    if (pendingSprings.current === 0) {
      setModel((current) => (current.relayouting ? { ...current, relayouting: false } : current));
    }
  };
  const removeLeaving = (key: string) => {
    setModel((current) => (current.instances.some((instance) => instance.key === key && instance.role === 'leaving') ? {
      ...current,
      instances: current.instances.filter((instance) => !(instance.key === key && instance.role === 'leaving')),
    } : current));
  };
  const clearDrain = (key: string) => {
    setModel((current) => (current.instances.some((instance) => instance.key === key && instance.drainRoles) ? {
      ...current,
      instances: current.instances.map((instance) =>
        (instance.key === key && instance.drainRoles ? { ...instance, drainRoles: null } : instance)),
    } : current));
  };
  const dropBig = (key: string) => {
    setModel((current) => ({
      ...current,
      instances: current.instances.map((instance) => (instance.key === key && instance.big !== null
        && instance.scale <= 1 ? { ...instance, big: null } : instance)),
    }));
  };

  // Each re-layout's intents start once, however often the effect itself runs.
  const appliedIntents = useRef<readonly Intent[] | null>(null);
  useLayoutEffect(() => {
    if (appliedIntents.current === model.intents) return;
    appliedIntents.current = model.intents;
    const landed = () => {
      'worklet';
      scheduleOnRN(springLanded);
    };
    const spring = (value: SharedValue<number>, target: number, config = spatial) => {
      pendingSprings.current += 1;
      value.set(withSpring(target, config, landed));
    };
    // Law 7's dressing, with the piece's shadow drawn in the same view: the piece taken off
    // lifts away as it fades, the one put on is hung on from above, and one the finger has
    // already carried in catches its weight with the moment's settle.
    const liftOff = (values: PieceValues) => values.dy.set(withTiming(-DRESS_LIFT, { duration: fast }));
    const hangOn = (values: PieceValues) => {
      values.dy.set(-DRESS_LIFT);
      spring(values.dy, 0, theme.springs.arrival);
    };
    const catchWeight = (values: PieceValues) => {
      pendingSprings.current += 1;
      values.dy.set(withSequence(
        withTiming(SETTLE_TRAVEL, { duration: fast }),
        withSpring(0, theme.springs.arrival, landed),
      ));
    };
    const visualOf = (values: PieceValues) => lerpBox(values.from.get(), values.to.get(), values.p.get());
    const retarget = (values: PieceValues, box: Box) => {
      values.from.set(visualOf(values));
      values.to.set(box);
      values.p.set(0);
      spring(values.p, 1);
    };
    const scaleTo = (values: PieceValues, scale: number) => {
      const now = values.sc.get();
      if (scale > 1) {
        // Growing: the big drawing fades in over the resting one from the tap frame.
        values.handTo.set(Number.NaN);
        values.hand.set(fadeTo(1, fast, theme.motion));
      } else if (values.hand.get() > 0) {
        values.handFrom.set(now);
        values.handTo.set(scale);
      }
      spring(values.sc, scale);
    };
    for (const intent of model.intents) {
      const { values } = intent;
      switch (intent.kind) {
        case 'entrance':
          // ADR 0026 section 7's entry travel keeps the role it shipped with; the swap does not touch it.
          values.p.set(withSpring(1, theme.springs.arrival));
          // The same arrival, read once nine tenths of it is travelled; its landing settles too.
          if (intent.reportsSettled) {
            arrival.set(withSpring(1, theme.springs.arrival, (finished) => {
              if (finished) {
                scheduleOnRN(setSettled, true);
                scheduleOnRN(setArrived, true);
              }
            }));
          }
          break;
        case 'retarget':
          retarget(values, intent.box);
          break;
        case 'promote':
          retarget(values, intent.box);
          // A paged neighbour is already opaque and large; a piece coming back from leaving fades in.
          values.op.set(intent.paged ? 1 : fadeTo(1, fast, theme.motion));
          if (!intent.fromGesture) spring(values.dx, 0);
          if (values.sc.get() !== intent.scale) scaleTo(values, intent.scale);
          if (intent.fromGesture) catchWeight(values);
          else hangOn(values);
          break;
        case 'enter': {
          if (intent.previous) {
            values.from.set(swapEntryBox(visualOf(intent.previous), intent.box));
            values.to.set(intent.box);
            values.dx.set(intent.previous.dx.get() + intent.direction * intent.stride);
            values.p.set(0);
            // Shown with its offset in one batch, so it never draws at the window's centre.
            if (intent.paged) values.op.set(1);
          }
          spring(values.p, 1);
          spring(values.dx, 0);
          hangOn(values);
          if (!intent.paged) values.op.set(fadeTo(1, fast, theme.motion));
          break;
        }
        case 'leave': {
          const { key } = intent;
          liftOff(values);
          if (intent.paged) {
            // Clipped, it fades out on `fast` as it slides out of the window, so it never rests
            // cut at the window's edge, and is gone on landing.
            values.op.set(fadeTo(0, fast, theme.motion));
            if (!intent.fromGesture) {
              pendingSprings.current += 1;
              values.dx.set(withSpring(swapExitOffset(intent.direction, values.dx.get(), intent.stride), spatial,
                (finished) => {
                  scheduleOnRN(springLanded);
                  if (finished) scheduleOnRN(removeLeaving, key);
                }));
            }
            break;
          }
          if (!intent.fromGesture) {
            spring(values.dx, swapExitOffset(intent.direction, values.dx.get(), intent.stride));
            spring(values.sc, 1);
          }
          values.op.set(fadeTo(0, fast, theme.motion, (finished) => {
            'worklet';
            if (finished) scheduleOnRN(removeLeaving, key);
          }));
          break;
        }
        case 'vanish': {
          // A layer taken off rises and fades where it stands; nothing slides sideways. Its
          // frame is the one that mounts the change, and comes late: the motion is paced.
          const { key } = intent;
          values.dy.set(paced(withTiming(-DRESS_LIFT, { duration: fast })));
          values.op.set(paced(fadeTo(0, fast, theme.motion, (finished) => {
            'worklet';
            if (finished) scheduleOnRN(removeLeaving, key);
          })));
          break;
        }
        case 'scale':
          scaleTo(values, intent.scale);
          break;
        case 'wait':
          if (!intent.created) {
            if (!sameBox(values.to.get(), intent.box)) retarget(values, intent.box);
            values.sc.set(intent.scale);
            values.hand.set(1);
            values.handTo.set(Number.NaN);
            pendingSprings.current += 1;
            values.dx.set(withSpring(intent.offset, spatial, (finished) => {
              // Behind the window's edge it waits unseen, so a wider neighbour never peeks.
              if (finished) values.op.set(0);
              scheduleOnRN(springLanded);
            }));
          }
          break;
        case 'retire': {
          const { key } = intent;
          pendingSprings.current += 1;
          values.dx.set(withSpring(intent.offset, spatial, (finished) => {
            scheduleOnRN(springLanded);
            if (finished) scheduleOnRN(removeLeaving, key);
          }));
          break;
        }
        case 'home':
          if (values.dx.get() !== 0) spring(values.dx, 0);
          break;
        case 'drain': {
          const { key } = intent;
          values.drain.set(1);
          values.drain.set(fadeTo(0, normal, theme.motion, (finished) => {
            'worklet';
            if (finished) scheduleOnRN(clearDrain, key);
          }));
          break;
        }
      }
    }
  });

  // The captions, and what waits for the pieces to arrive, follow once the arrival is nine
  // tenths travelled, as Presence's text follows its container, instead of waiting out the
  // spring's overshoot.
  useAnimatedReaction(() => arrival.get() >= PRESENCE_TEXT_AFTER, (reached, was) => {
    if (reached && !was) scheduleOnRN(setSettled, true);
  });
  useEffect(() => {
    if (model.entered) tint.set(withTiming(1, { duration: normal }));
  }, [model.entered, normal, tint]);
  useEffect(() => {
    if (!lastSettle) return;
    settleTravel.set(withSequence(
      withTiming(1, { duration: fast }),
      withSpring(0, theme.springs.arrival),
    ));
  }, [fast, lastSettle, settleTravel, theme.springs.arrival]);
  useEffect(() => () => {
    cancelAnimation(tint);
    cancelAnimation(arrival);
    cancelAnimation(settleTravel);
  }, [arrival, settleTravel, tint]);
  const activeHeld = activeGrow?.held ?? null;
  useLayoutEffect(() => {
    if (activeHeld !== null) stageLimit.set(activeHeld);
  }, [activeHeld, stageLimit]);

  return { model, setModel, settled, arrived, tint, settleTravel, stageLimit, removeLeaving, dropBig };
}
