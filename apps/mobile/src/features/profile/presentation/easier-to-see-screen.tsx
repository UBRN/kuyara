import { useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  AppText,
  Icon,
  NativeList,
  NativeListContentRow,
  NativeListRow,
  NativeListSection,
  useTextScaling,
  type IconName,
} from '@/components/ui';
import { GarmentBoard, type GarmentBoardPiece, type GarmentOutfitPalette } from '@/garment-art';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { useMessages } from '@/localization/use-messages';
import { EasierToSeeContext, useEasierToSee, useSystemVisibility } from '@/theme/easier-to-see';
import { radii, spacing } from '@/theme/theme';
import { PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The preview card (ADR 0030 section 5): one fixed layered outfit drawn on
// a stage the way Today draws its boards, beside an outfit name and one insight line in
// Today's type roles, so the switch shows its larger drawing and heavier, darker text
// without leaving Settings. It is illustration only and never a recommendation, and it has
// no day-type pill because Today has none.
const previewPieces: readonly GarmentBoardPiece[] = [
  { slot: 'primary_top', garmentTypeId: 'shirt', category: 'top' },
  { slot: 'bottom', garmentTypeId: 'trousers', category: 'bottom' },
  { slot: 'outer_layer', garmentTypeId: 'light_jacket', category: 'outerwear' },
  { slot: 'mid_layer', garmentTypeId: 'sweater', category: 'top' },
  { slot: 'footwear', garmentTypeId: 'ankle_boots', category: 'footwear' },
];
const previewPalette: GarmentOutfitPalette = {
  optionId: 'easier-to-see-preview',
  formality: 'smart',
  temperatureC: 9,
  condition: 'cloudy',
  isNight: false,
  pieces: previewPieces.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })),
};
// The stage's share of the card's width, beside the two lines of text.
const PREVIEW_STAGE_SHARE = 0.42;

export type EasierToSeeScreenProps = Readonly<{
  enabled: boolean;
  isSaving: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}>;

export function EasierToSeeScreen({ enabled, isSaving, onChange }: EasierToSeeScreenProps) {
  const messages = useMessages();
  const copy = messages.settings.easierToSee;
  const theme = useKuyaraTheme();
  const { width } = useWindowDimensions();
  const { fontScale, usesStackedLayout } = useTextScaling();
  const system = useSystemVisibility();
  const [hasSaveError, setHasSaveError] = useState(false);
  const [onHeight, setOnHeight] = useState(0);
  // VoiceOver reads no footer change, so a failed save is spoken as well as shown.
  useErrorAnnouncement(hasSaveError ? messages.settings.saveError : null);
  const cardWidth = Math.max(0, width - spacing.lg * 4);
  const stageWidth = usesStackedLayout ? cardWidth : Math.round(cardWidth * PREVIEW_STAGE_SHARE);
  const onOff = (value: boolean) => (value ? copy.on : copy.off);
  const textSize = Math.abs(fontScale - 1) < 0.01
    ? copy.textSizeDefault
    : fontScale > 1 ? copy.textSizeLarger : copy.textSizeSmaller;

  const save = async (value: boolean) => {
    setHasSaveError(false);
    try {
      await onChange(value);
    } catch {
      setHasSaveError(true);
    }
  };

  return (
    <NativeList testID="settings-easier-to-see">
      <NativeListSection heading={copy.previewHeading} testID="settings-easier-to-see-preview-group">
        <NativeListContentRow testID="settings-easier-to-see-preview-row">
          {/* The card is always as tall as its "on" drawing, so turning the switch on or off
              changes what the card shows but never moves the switch under the finger. An unseen
              "on" copy measures that height whatever the mode, so no first toggle jumps. */}
          <View
            accessibilityLabel={enabled ? copy.previewLabelOn : copy.previewLabelOff}
            accessibilityRole="image"
            accessible
            style={[
              styles.preview,
              usesStackedLayout && styles.stackedPreview,
              { minHeight: onHeight, width: cardWidth },
            ]}
            testID="settings-easier-to-see-preview">
            <PreviewContent stageWidth={stageWidth} testIDs />
          </View>
          <EasierToSeeContext value>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onLayout={(event) => setOnHeight(event.nativeEvent.layout.height)}
              pointerEvents="none"
              style={[
                styles.preview,
                usesStackedLayout && styles.stackedPreview,
                styles.measure,
                { width: cardWidth },
              ]}>
              <PreviewContent stageWidth={stageWidth} />
            </View>
          </EasierToSeeContext>
        </NativeListContentRow>
      </NativeListSection>
      <NativeListSection
        footer={hasSaveError ? messages.settings.saveError : copy.footer}
        testID="settings-easier-to-see-group">
        <NativeListRow
          glyph={glyph('accessibility')}
          label={copy.title}
          testID="settings-easier-to-see-toggle-row"
          toggle={{ disabled: isSaving, onValueChange: (value) => void save(value), value: enabled }}
        />
      </NativeListSection>
      {/* Read-only: kuyara names the iPhone settings it follows and never changes or deep-links
          into them. Android reports neither setting, so the group is iPhone-only. */}
      {Platform.OS === 'ios' ? (
        <NativeListSection
          footer={copy.systemFooter}
          heading={copy.systemHeading}
          testID="settings-easier-to-see-system-group">
          <NativeListRow
            glyph={glyph('textSize')}
            label={copy.largerText}
            testID="settings-easier-to-see-larger-text-row"
            value={textSize}
          />
          <NativeListRow
            glyph={glyph('boldText')}
            label={copy.boldText}
            testID="settings-easier-to-see-bold-text-row"
            value={onOff(system.boldText)}
          />
          <NativeListRow
            glyph={glyph('increaseContrast')}
            label={copy.increaseContrast}
            testID="settings-easier-to-see-increase-contrast-row"
            value={onOff(system.increaseContrast)}
          />
        </NativeListSection>
      ) : null}
    </NativeList>
  );
}

/** The preview's stage and two lines, drawn in whichever mode its provider gives it. */
function PreviewContent({ stageWidth, testIDs = false }: Readonly<{ stageWidth: number; testIDs?: boolean }>) {
  const messages = useMessages();
  const copy = messages.settings.easierToSee;
  const theme = useKuyaraTheme();
  const enabled = useEasierToSee();
  return (
    <>
      <PlateView color={theme.colors.stage} style={[styles.stage, { width: stageWidth }]}>
        <GarmentBoard
          accessibilityLabel={enabled ? copy.previewLabelOn : copy.previewLabelOff}
          decorative
          palette={previewPalette}
          pieces={previewPieces}
          preset="today"
          stageColor={theme.colors.stage}
          testID={testIDs ? 'settings-easier-to-see-preview-board' : undefined}
          width={stageWidth}
        />
      </PlateView>
      <View style={styles.previewText}>
        <AppText testID={testIDs ? 'settings-easier-to-see-preview-name' : undefined} variant="label">
          {copy.previewOutfitName}
        </AppText>
        <AppText testID={testIDs ? 'settings-easier-to-see-preview-insight' : undefined} variant="body">
          {messages.today.dayInsight.sentences.cloudy_day_chilly}
        </AppText>
      </View>
    </>
  );
}

function glyph(name: IconName) {
  return function RowGlyph({ color, size }: Readonly<{ color: string; size: number }>) {
    return <Icon color={color} name={name} size={size} />;
  };
}

const styles = StyleSheet.create({
  preview: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  stackedPreview: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  // Out of the flow and unseen: it only measures the "on" card's height.
  measure: { left: 0, opacity: 0, position: 'absolute', top: 0 },
  stage: {
    borderRadius: radii.control,
    overflow: 'hidden',
  },
  previewText: {
    flexGrow: 1,
    flexShrink: 1,
    gap: spacing.xs,
  },
});
