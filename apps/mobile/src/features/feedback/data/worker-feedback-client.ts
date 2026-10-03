import {
  feedbackV1ErrorSchema, feedbackV1Path, feedbackV1RequestSchema, feedbackV1SuccessSchema,
  type FeedbackV1Request,
} from '@kuyara/contracts';

export async function sendFeedback(
  baseUrl: string,
  input: FeedbackV1Request,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const request = feedbackV1RequestSchema.parse(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher(`${baseUrl.replace(/\/$/u, '')}${feedbackV1Path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const body: unknown = await response.json();
    if (response.ok) {
      if (!feedbackV1SuccessSchema.safeParse(body).success) throw new Error('invalid_response');
    } else {
      if (!feedbackV1ErrorSchema.safeParse(body).success) throw new Error('invalid_response');
      throw new Error('send_failed');
    }
  } finally {
    clearTimeout(timer);
  }
}
