import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import {
  garmentCatalog,
  getGarmentType,
} from '@/features/catalog/domain/garment-catalog';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { isWardrobeRouteId } from '@/features/wardrobe/application/wardrobe-form';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import {
  showWardrobeConfirmation,
  type WardrobeConfirmation,
} from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { WardrobeItemFormScreen } from '@/features/wardrobe/presentation/wardrobe-item-form-screen';
import { GarmentTypePickerScreen } from '@/features/wardrobe/presentation/garment-type-picker-screen';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

function useWardrobeExitGuard(
  isDirty: boolean,
  confirmation: WardrobeConfirmation,
) {
  const navigation = useNavigation();
  const router = useRouter();
  const copy = useMessages().wardrobe;
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
        },
        leave,
      );
    },
    [confirmation, copy],
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
    requestBack: () => {
      if (!isDirty) {
        router.back();
        return;
      }

      confirmDiscard(() => {
        allowExitRef.current = true;
        router.back();
      });
    },
    returnToList: () => {
      allowExitRef.current = true;
      router.replace('../');
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
        testID="wardrobe-item-loading">
        <ActivityIndicator color={theme.colors.brandAccent} />
        <AppText colorRole="textSecondary">{copy.loadingLabel}</AppText>
      </Screen>
    );
  }

  const notFound = status === 'not-found';
  return (
    <Screen contentContainerStyle={styles.centered} testID={`wardrobe-item-${status}`}>
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
}: Readonly<{ confirmation?: WardrobeConfirmation }>) {
  const {
    createItem,
    discardStagedPhoto,
    preparePhoto,
    refresh,
    state,
  } = useWardrobeApplication();
  const router = useRouter();
  const { garmentTypeId } = useLocalSearchParams<{
    garmentTypeId?: string | string[];
  }>();
  const [isDirty, setIsDirty] = useState(false);
  const guard = useWardrobeExitGuard(isDirty, confirmation);

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
      confirmation={confirmation}
      garmentTypeSelection={
        typeof garmentTypeId === 'string' ? getGarmentType(garmentTypeId) : null
      }
      isBusy={state.isMutating}
      mode="create"
      onBackRequested={guard.requestBack}
      onCreate={async (input, photoChange) => {
        await createItem(input, photoChange);
        guard.returnToList();
      }}
      onDiscardStagedPhoto={discardStagedPhoto}
      onDirtyChange={setIsDirty}
      onGarmentTypeSelectionHandled={() =>
        router.setParams({ garmentTypeId: undefined })
      }
      onOpenGarmentTypePicker={(selectedTypeId) =>
        router.push({
          pathname: '/wardrobe/garment-type',
          params: { returnTo: 'new', selectedTypeId: selectedTypeId ?? '' },
        })
      }
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
  const router = useRouter();
  const { garmentTypeId } = useLocalSearchParams<{
    garmentTypeId?: string | string[];
  }>();
  const [item, setItem] = useState<WardrobeItem | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'error' | 'ready'>(
    'loading',
  );
  const [isDirty, setIsDirty] = useState(false);
  const guard = useWardrobeExitGuard(isDirty, confirmation);
  const normalizedId = typeof itemId === 'string' ? itemId : '';
  const getItem = application.getItem;

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
      confirmation={confirmation}
      garmentTypeSelection={
        typeof garmentTypeId === 'string' ? getGarmentType(garmentTypeId) : null
      }
      isBusy={
        application.state.status === 'ready' && application.state.isMutating
      }
      item={item}
      mode="edit"
      onBackRequested={guard.requestBack}
      onDelete={async () => {
        await application.softDeleteItem(item.id);
        guard.returnToList();
      }}
      onDiscardStagedPhoto={application.discardStagedPhoto}
      onDirtyChange={setIsDirty}
      onGarmentTypeSelectionHandled={() =>
        router.setParams({ garmentTypeId: undefined })
      }
      onOpenGarmentTypePicker={(selectedTypeId) =>
        router.push({
          pathname: '/wardrobe/garment-type',
          params: {
            itemId: item.id,
            returnTo: 'edit',
            selectedTypeId: selectedTypeId ?? '',
          },
        })
      }
      onSelectPhoto={application.preparePhoto}
      onCreate={async () => undefined}
      onUpdate={async (input, photoChange) => {
        await application.updateItem(item.id, input, photoChange);
        guard.returnToList();
      }}
      photoPreviewUri={application.resolvePhotoUri(item.photoRelativePath)}
    />
  );
}

export function WardrobeGarmentTypePickerRoute() {
  const profileApplication = useProfileApplication();
  const router = useRouter();
  const { itemId, returnTo, selectedTypeId } = useLocalSearchParams<{
    itemId?: string | string[];
    returnTo?: string | string[];
    selectedTypeId?: string | string[];
  }>();

  if (
    profileApplication.state.status !== 'ready' ||
    !profileApplication.state.profile.clothingPreference
  ) {
    return null;
  }

  const selection =
    typeof selectedTypeId === 'string' && getGarmentType(selectedTypeId)
      ? selectedTypeId
      : null;

  return (
    <GarmentTypePickerScreen
      clothingPreference={profileApplication.state.profile.clothingPreference}
      garmentTypes={garmentCatalog.garmentTypes}
      onBack={() => router.back()}
      onSelect={(nextTypeId) => {
        if (returnTo === 'edit' && isWardrobeRouteId(itemId)) {
          router.dismissTo({
            pathname: '/wardrobe/[id]',
            params: { garmentTypeId: nextTypeId, id: itemId },
          });
          return;
        }

        router.dismissTo({
          pathname: '/wardrobe/new',
          params: { garmentTypeId: nextTypeId },
        });
      }}
      selectedTypeId={selection}
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
