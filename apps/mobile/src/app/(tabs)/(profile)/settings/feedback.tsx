import Constants from 'expo-constants';
import { Redirect, Stack, router } from 'expo-router';
import { Platform } from 'react-native';

import { resolveAppWorkerBaseUrl } from '@/config/app-worker-base-url';
import { FEEDBACK_FORM_ENABLED } from '@/features/feedback/application/feedback-form-flag';
import { sendFeedback } from '@/features/feedback/data/worker-feedback-client';
import { FeedbackScreen } from '@/features/feedback/presentation/feedback-screen';
import { newUuid } from '@/infrastructure/new-uuid';
import { useLocalization } from '@/localization/use-messages';

export default function FeedbackRoute() {
  return FEEDBACK_FORM_ENABLED ? <FeedbackRouteContent /> : <Redirect href="/settings" />;
}

function FeedbackRouteContent() {
  const { language, messages } = useLocalization();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: messages.settings.feedback.title }} />
      <FeedbackScreen
        createSubmissionId={newUuid}
        onCancel={() => router.back()}
        onSend={(message, submissionId) => sendFeedback(resolveAppWorkerBaseUrl(), {
          submissionId,
          message,
          appVersion: Constants.expoConfig?.version ?? '',
          platform: Platform.OS === 'android' ? 'android' : 'ios',
          locale: language,
        })}
      />
    </>
  );
}
