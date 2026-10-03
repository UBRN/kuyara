import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, ListRow, ListRowGroup, type GarmentOutfitPalette } from '@/components/ui';
import type { ComposePin } from '@/features/recommendation/application/compose-around-pieces';
import {
  colorComposeChoice,
  composePins,
  toggleComposeChoice,
  type ComposeCatalogGroup,
  type ComposePiece,
  type ComposeSelection,
} from '@/features/today/application/compose-selection';
import { ComposeSheet } from '@/features/today/presentation/compose-sheet';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

export type ComposeEntryProps = Readonly<{
  isMember: boolean;
  /** A non-member's tap: opens "Complete your profile" on detail, on the compose benefit page. */
  onSignIn: () => void;
  pieces: readonly ComposePiece[];
  catalog: readonly ComposeCatalogGroup[];
  /** The board's palette: an outfit piece in the sheet shows the colours it has on the board. */
  palette: GarmentOutfitPalette;
  /** Builds the result around the chosen pieces. Synchronous and transient. */
  onCompose: (pins: readonly ComposePin[]) => void;
}>;

/**
 * "Build from a piece" under "Wore this today" (ADR 0041 section 5, ADR 0026 section 6): a
 * member opens the compose sheet; a non-member sees the row muted but legible with the
 * Members chip and a tap asks for sign-in. The route renders it only while accounts are open.
 * The choice outlives the sheet for as long as detail is open.
 */
export function ComposeEntry({
  catalog, isMember, onCompose, onSignIn, palette, pieces,
}: ComposeEntryProps) {
  const copy = useMessages().today.compose;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<ComposeSelection>([]);

  const build = () => {
    setBusy(true);
    // Composing takes a moment on the JS thread: the spinner is drawn first.
    setTimeout(() => {
      onCompose(composePins(selection));
      setBusy(false);
      setOpen(false);
    }, 0);
  };

  return (
    <View style={styles.entry}>
      <ListRowGroup>
        <ListRow
          accessibilityHint={isMember ? undefined : copy.membersHint}
          chip={isMember ? undefined : copy.membersChip}
          gated={!isMember}
          glyph={({ color, size }) => <Icon color={color} name="clothing" size={size} />}
          label={copy.entry}
          onPress={isMember ? () => setOpen(true) : onSignIn}
          testID="compose-entry-row"
        />
      </ListRowGroup>
      {isMember ? (
        <ComposeSheet
          busy={busy}
          catalog={catalog}
          onBuild={build}
          onColor={(slot, colorId) => setSelection((current) => colorComposeChoice(current, slot, colorId))}
          onDismiss={() => setOpen(false)}
          onToggle={(piece) => setSelection((current) => toggleComposeChoice(current, piece))}
          palette={palette}
          pieces={pieces}
          selection={selection}
          visible={open}
        />
      ) : null}
    </View>
  );
}

/**
 * The result's place among the outfits built around the chosen pieces, "1 / 3", and "Show
 * another", which wraps back to the first. Fewer are shown as they are ("1 / 2", "1 / 1"); a
 * single outfit has nothing more to show. A step announces the new place.
 */
export function ComposeResultLine({ index, total, onShowAnother }: Readonly<{
  index: number;
  total: number;
  onShowAnother: () => void;
}>) {
  const copy = useMessages().today.compose;
  const spoken = copy.positionAccessibilityLabel(index + 1, total);
  const shown = useRef(index);
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    AccessibilityInfo.announceForAccessibility(spoken);
  }, [index, spoken]);

  return (
    <View style={styles.line}>
      <AppText accessibilityLabel={spoken} tabularNumbers testID="compose-result-position" variant="body">
        {copy.position(index + 1, total)}
      </AppText>
      {total > 1 ? (
        <Button label={copy.showAnother} onPress={onShowAnother} size="small" testID="compose-show-another" variant="plain" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { marginTop: spacing.md },
  line: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
});
