import {
  feedbackV1ErrorSchema, feedbackV1Path, feedbackV1RequestSchema, feedbackV1SuccessSchema,
  type FeedbackV1Request,
} from '@kuyara/contracts';

import { fetchJsonWithTimeout } from '@/infrastructure/network/fetch-json-with-timeout';

export async function sendFeedback(
  baseUrl: string,
  input: FeedbackV1Request,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const request = feedbackV1RequestSchema.parse(input);
  const { response, body } = await fetchJsonWithTimeout(
    fetcher,
    `${baseUrl.replace(/\/$/u, '')}${feedbackV1Path}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) },
    10000,
    { network: () => new Error('send_failed'), invalidJson: () => new Error('invalid_response') },
  );
  if (response.ok) {
    if (!feedbackV1SuccessSchema.safeParse(body).success) throw new Error('invalid_response');
  } else {
    if (!feedbackV1ErrorSchema.safeParse(body).success) throw new Error('invalid_response');
    throw new Error('send_failed');
  }
}
