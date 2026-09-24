import { useNavigation, useRouter } from 'expo-router';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import type { ClothingPreference } from '@/domain/preferences';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import {
  ageBucketProperty,
  dressStyleProperty,
} from '@/features/analytics/domain/analytics-mappers';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import { closetFieldsChanged } from '@/features/wardrobe/application/closet-field-changes';
import { isWardrobeRouteId } from '@/features/wardrobe/application/wardrobe-form';
import { unchangedWardrobePhoto } from '@/features/wardrobe/application/wardrobe-photo-manager';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import type {
  WardrobeEntryState,
  WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';
import {
  showWardrobeConfirmation,
  type WardrobeConfirmation,
} from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { WardrobeItemFormScreen } from '@/features/wardrobe/presentation/wardrobe-item-form-screen';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The type sheet lives inside the form, so the form needs the profile's clothing
// preference; the deleted picker route used to read it for itself.
function clothingPreferenceOf(
  profileApplication: ReturnType<typeof useProfileApplication>,
): ClothingPreference | null {
  return profileApplication.state.status === 'ready'
    ? profileApplication.state.profile.clothingPreference
    : null;
}

function useWardrobeExitGuard(
  isDirty: boolean,
  confirmation: WardrobeConfirmation,
) {
  const navigation = useNavigation();
  const router = useRouter();
  const copy = useMessages().wardrobe;
  const theme = useKuyaraTheme();
  const allowExitRef = useRef(false);

  const confirmDiscard = useCallback(
    (leave: () => void) => {
      confirmation(
        {
          title: copy.discardTitle,
          message: copy.discardBody,
          cancelLabel: copy.keepEditingAction,
          confirmLabel: copy.discardAction,
          destructive: true,
          colorScheme: theme.colorScheme,
        },
        leave,
      );
    },
    [confirmation, copy, theme.colorScheme],
  );

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!isDirty || allowExitRef.current) {
          return;
        }

        event.preventDefault();
        confirmDiscard(() => {
          allowExitRef.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [confirmDiscard, isDirty, navigation],
  );

  return {
    // The Closet list reads its segment, and the tile it should let arrive, from the
    // route, so an exit that finished something says which list it finished it in. A
    // cancelled edit pops instead of replacing, and keeps the list it left untouched.
    returnToList: (params?: Readonly<Record<string, string>>) => {
      allowExitRef.current = true;
      router.replace(params ? { params, pathname: '/wardrobe' } : '../');
    },
  };
}

export function WardrobeRouteStatus({
  status,
  onBack,
  onRetry,
}: Readonly<{
  status: 'loading' | 'error' | 'not-found';
  onBack: () => void;
  onRetry?: () => void;
}>) {
  const copy = useMessages().wardrobe;
  const theme = useKuyaraTheme();

  if (status === 'loading') {
    return (
      <Screen
        accessibilityLabel={copy.loadingLabel}
        contentContainerStyle={styles.centered}
        fill
        testID="wardrobe-item-loading">
        <ActivityIndicator color={theme.colors.brandAccent} />
        <AppText colorRole="textSecondary">{copy.loadingLabel}</AppText>
      </Screen>
    );
  }

  const notFound = status === 'not-found';
  return (
    <Screen contentContainerStyle={styles.centered} fill testID={`wardrobe-item-${status}`}>
      <Surface style={styles.statusCard} variant="elevated">
        <AppText accessibilityRole="header" variant="title">
          {notFound ? copy.notFoundTitle : copy.loadErrorTitle}
        </AppText>
        <AppText colorRole="textSecondary">
          {notFound ? copy.notFoundBody : copy.loadErrorBody}
        </AppText>
        {onRetry ? (
          <Button label={copy.retryAction} onPress={onRetry} />
        ) : null}
        <Button label={copy.returnToWardrobeAction} onPress={onBack} variant="secondary" />
      </Surface>
    </Screen>
  );
}

export function WardrobeNewItemRoute({
  confirmation = showWardrobeConfirmation,
  defaultEntryState,
}: Readonly<{
  confirmation?: WardrobeConfirmation;
  /** The Closet list's current segment; the form falls back to owned without it. */
  defaultEntryState?: WardrobeEntryState;
}>) {
  const {
    createItem,
    discardStagedPhoto,
    preparePhoto,
    refresh,
    state,
  } = useWardrobeApplication();
  const { analytics, firstUses } = useProductAnalytics();
  const profileApplication = useProfileApplication();
  const recommendationApplication = use(RecommendationApplicationContext);
  const [isDirty, setIsDirty] = useState(false);
  const guard = useWardrobeExitGuard(isDirty, confirmation);
  useScreenViewed('closet_item_form');

  if (state.status === 'loading') {
    return <WardrobeRouteStatus onBack={guard.returnToList} status="loading" />;
  }

  if (state.status === 'error') {
    return (
      <WardrobeRouteStatus
        onBack={guard.returnToList}
        onRetry={() => void refresh()}
        status="error"
      />
    );
  }

  return (
    <WardrobeItemFormScreen
      clothingPreference={clothingPreferenceOf(profileApplication)}
      confirmation={confirmation}
      defaultEntryState={defaultEntryState}
      isBusy={state.isMutating}
      mode="create"
      onCreate={async (input, photoChange) => {
        const created = await createItem(input, photoChange);
        if (created.garmentTypeId) {
          const profile =
            profileApplication.state.status === 'ready'
              ? profileApplication.state.profile
              : null;
          analytics.capture('closet_item_created', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            state: created.entryState,
            garment_type_id: created.garmentTypeId,
            has_photo: created.photoRelativePath !== null,
            entry_point: 'closet_list',
            dress_style: dressStyleProperty(
              recommendationApplication?.resolvedDressStyle ?? profile?.dressStyle ?? null,
            ),
            age_bucket: ageBucketProperty(profile?.birthDate ?? null),
          });
          // `markFirstUse` only reports whether this is the first use; the caller
          // decides whether to actually capture `feature_used_first_time` (taxonomy 5.11).
          void firstUses.markFirstUse('closet').then((isFirstUse) => {
            if (isFirstUse) {
              analytics.capture('feature_used_first_time', {
                schema_version: ANALYTICS_SCHEMA_VERSION,
                feature_name: 'closet',
              });
            }
          });
        }
        guard.returnToList({ added: created.id, filter: created.entryState });
      }}
      onDiscardStagedPhoto={discardStagedPhoto}
      onDirtyChange={setIsDirty}
      onSelectPhoto={preparePhoto}
    />
  );
}

export function WardrobeEditItemRoute({
  confirmation = showWardrobeConfirmation,
  itemId,
}: Readonly<{
  confirmation?: WardrobeConfirmation;
  itemId: string | string[] | undefined;
}>) {
  const application = useWardrobeApplication();
  const { analytics } = useProductAnalytics();
  const profileApplication = useProfileApplication();
  const router = useRouter();
  const [item, setItem] = useState<WardrobeItem | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'error' | 'ready'>(
    'loading',
  );
  const [isDirty, setIsDirty] = useState(false);
  const guard = useWardrobeExitGuard(isDirty, confirmation);
  const normalizedId = typeof itemId === 'string' ? itemId : '';
  const getItem = application.getItem;
  useScreenViewed('closet_item_form');

  const loadItem = async () => {
    setLoadStatus('loading');
    try {
      const loaded = await getItem(normalizedId);
      setItem(loaded);
      setLoadStatus('ready');
    } catch {
      setLoadStatus('error');
    }
  };

  useEffect(() => {
    let cancelled = false;

    getItem(normalizedId)
      .then((loaded) => {
        if (!cancelled) {
          setItem(loaded);
          setLoadStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getItem, normalizedId]);

  if (!isWardrobeRouteId(normalizedId)) {
    return (
      <WardrobeRouteStatus
        onBack={() => router.replace('../')}
        status="not-found"
      />
    );
  }

  if (loadStatus === 'loading') {
    return <WardrobeRouteStatus onBack={guard.returnToList} status="loading" />;
  }

  if (loadStatus === 'error') {
    return (
      <WardrobeRouteStatus
        onBack={guard.returnToList}
        onRetry={() => void loadItem()}
        status="error"
      />
    );
  }

  if (!item) {
    return <WardrobeRouteStatus onBack={guard.returnToList} status="not-found" />;
  }

  return (
    <WardrobeItemFormScreen
      clothingPreference={clothingPreferenceOf(profileApplication)}
      confirmation={confirmation}
      isBusy={
        application.state.status === 'ready' && application.state.isMutating
      }
      item={item}
      mode="edit"
      onDelete={async () => {
        // Taxonomy 5.8: `state` and `had_photo` are read from the loaded item before the
        // soft delete, not from the (already cleared) mutation result.
        const deletedEntryState = item.entryState;
        const hadPhoto = item.photoRelativePath !== null;
        await application.softDeleteItem(item.id);
        analytics.capture('closet_item_deleted', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          state: deletedEntryState,
          had_photo: hadPhoto,
        });
        guard.returnToList({ filter: deletedEntryState });
      }}
      onDiscardStagedPhoto={application.discardStagedPhoto}
      onDirtyChange={setIsDirty}
      onSelectPhoto={application.preparePhoto}
      onCreate={async () => undefined}
      onUpdate={async (input, photoChange = unchangedWardrobePhoto) => {
        const fieldsChanged = closetFieldsChanged(
          item,
          input,
          photoChange.kind !== 'unchanged',
        );
        const updated = await application.updateItem(item.id, input, photoChange);
        if (updated.garmentTypeId) {
          analytics.capture('closet_item_updated', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            fields_changed: fieldsChanged,
            garment_type_id: updated.garmentTypeId,
            entry_point: 'closet_list',
          });
        }
        guard.returnToList({ filter: updated.entryState });
      }}
      photoPreviewUri={application.resolvePhotoUri(item.photoRelativePath)}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    gap: spacing.md,
    justifyContent: 'center',
  },
  statusCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
});
