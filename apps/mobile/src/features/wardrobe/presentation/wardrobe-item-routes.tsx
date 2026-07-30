import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import { garmentCatalog } from '@/features/catalog/domain/garment-catalog';
import { isWardrobeRouteId } from '@/features/wardrobe/application/wardrobe-form';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import {
  showWardrobeConfirmation,
  type WardrobeConfirmation,
} from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { WardrobeItemFormScreen } from '@/features/wardrobe/presentation/wardrobe-item-form-screen';
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
  const { createItem, state } = useWardrobeApplication();
  const [isDirty, setIsDirty] = useState(false);
  const guard = useWardrobeExitGuard(isDirty, confirmation);

  return (
    <WardrobeItemFormScreen
      confirmation={confirmation}
      garmentTypes={garmentCatalog.garmentTypes}
      isBusy={state.status === 'ready' && state.isMutating}
      mode="create"
      onBackRequested={guard.requestBack}
      onCreate={async (input) => {
        await createItem(input);
        guard.returnToList();
      }}
      onDirtyChange={setIsDirty}
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
      garmentTypes={garmentCatalog.garmentTypes}
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
      onDirtyChange={setIsDirty}
      onCreate={async () => undefined}
      onUpdate={async (input) => {
        await application.updateItem(item.id, input);
        guard.returnToList();
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    gap: spacing.lg,
    justifyContent: 'center',
  },
  statusCard: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
});
