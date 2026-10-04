import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, CheckRow, NativeSheet, TextButton } from '@/components/ui';
import type { ConsentStatus } from '@/features/account/application/account-screens';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { StatusLine } from '@/features/account/presentation/account-status';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/** The expanded text's height before it scrolls, from the approved drawing. */
const TEXT_PANEL_MAX_HEIGHT = 190;

/**
 * "Read the text" lines its words up with the checkbox label's: the box's hairline and inset,
 * less the text button's own inset around its words.
 */
const READ_TEXT_INSET = borderWidths.subtle + spacing.md - spacing.sm;

/**
 * One entry of the consent text: `**Lead.** rest` opens with a bold lead, `- ` marks a bullet.
 * Only the lead is semibold; every line and bullet reads in the regular body style.
 */
function ConsentLine({ line }: Readonly<{ line: string }>) {
  if (line.startsWith('- ')) return <AppText>{`• ${line.slice(2)}`}</AppText>;
  const lead = /^\*\*(.+?)\*\*\s*(.*)$/.exec(line);
  if (!lead) return <AppText>{line}</AppText>;
  return (
    <AppText>
      <AppText variant="bodyStrong">{lead[1]}</AppText>
      {lead[2] ? ` ${lead[2]}` : null}
    </AppText>
  );
}

/**
 * The sync consent question (ADR 0041 sections 5 and 10): a title, the
 * subtitle naming the six kinds of records, one unticked checkbox, "Read the text" that opens
 * the full text in place, and Continue, which works with the box unticked. No terms box, and
 * nothing asks the person to confirm they read a notice. It fills a large sheet: the question
 * scrolls, Continue stays pinned under it, so the open text and a failure line never push it
 * out of reach. The sheet owns whether the text is open, because the sheet stops a swipe from
 * closing it while the text is open.
 */
export function AccountConsentContent({ expanded, onContinue, onToggleText, status }: Readonly<{
  status: ConsentStatus['status'];
  onContinue: (given: boolean) => void;
  expanded: boolean;
  onToggleText: () => void;
}>) {
  const copy = useMessages().account.consent;
  const theme = useKuyaraTheme();
  const [given, setGiven] = useState(false);

  return (
    <View style={styles.content} testID="account-consent">
      <ScrollView contentContainerStyle={styles.question} style={styles.scroll} testID="account-consent-scroll">
        <AppText accessibilityRole="header" variant="title">{copy.title}</AppText>
        <AppText colorRole="textSecondary">{copy.syncConsentSubtitle}</AppText>
        <View style={[styles.box, { borderColor: theme.colors.borderDefined }]}>
          <CheckRow
            checked={given}
            label={copy.syncConsentBox}
            leading={null}
            onPress={() => setGiven((value) => !value)}
            testID="account-consent-box"
          />
        </View>
        <View style={styles.readText} testID="account-consent-read-text-row">
          <TextButton
            accessibilityState={{ expanded }}
            label={expanded ? copy.hideText : copy.readText}
            link
            onPress={onToggleText}
            testID="account-consent-read-text"
          />
        </View>
        {expanded ? (
          <ScrollView
            contentContainerStyle={styles.textContent}
            nestedScrollEnabled
            style={[styles.textPanel, { borderColor: theme.colors.borderSubtle }]}
            testID="account-consent-text">
            {copy.syncConsentText.map((line) => <ConsentLine key={line} line={line} />)}
          </ScrollView>
        ) : null}
        {status === 'failed' ? <StatusLine testID="account-consent-failed" text={copy.failed} tone="danger" /> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={copy.continue}
          loading={status === 'saving'}
          onPress={() => onContinue(given)}
          size="large"
          testID="account-consent-continue"
        />
      </View>
    </View>
  );
}

/**
 * Whether the consent text is open, for the sheet that asks. While it is open a swipe inside it
 * scrolls the text and never closes the sheet; a new question starts with the text closed.
 */
export function useConsentTextToggle(asking: boolean) {
  const [open, setOpen] = useState(false);
  const [wasAsking, setWasAsking] = useState(asking);
  if (wasAsking !== asking) {
    setWasAsking(asking);
    setOpen(false);
  }
  return { open: asking && open, toggle: () => setOpen((value) => !value) };
}

/** The same question asked later from the Account screen, on that screen's own sheet. */
export function AccountConsentSheet() {
  const { port, snapshot } = useAccountScreens();
  const visible = snapshot.consent.prompt === 'account';
  const text = useConsentTextToggle(visible);
  return (
    <NativeSheet
      dismissible={!text.open}
      onDismiss={port.closeConsent}
      size="large"
      testID="account-consent-sheet"
      visible={visible}>
      <AccountConsentContent
        expanded={text.open}
        onContinue={port.answerConsent}
        onToggleText={text.toggle}
        status={snapshot.consent.status}
      />
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  scroll: { flex: 1 },
  question: { gap: spacing.md, padding: spacing.lg },
  footer: { paddingBottom: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  box: { borderRadius: radii.control, borderWidth: borderWidths.subtle, paddingHorizontal: spacing.md },
  readText: { alignItems: 'flex-start', marginLeft: READ_TEXT_INSET },
  textPanel: { borderRadius: radii.control, borderWidth: borderWidths.subtle, maxHeight: TEXT_PANEL_MAX_HEIGHT },
  textContent: { gap: spacing.sm, padding: spacing.md },
});
