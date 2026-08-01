export type WorkerPlatform = 'android' | 'ios' | 'web';

type WorkerBaseUrlOptions = Readonly<{
  configuredUrl?: string;
  isDevelopment: boolean;
  platform: WorkerPlatform;
}>;

const localWorkerBaseUrls: Readonly<Record<WorkerPlatform, string>> = {
  android: 'http://10.0.2.2:8788',
  ios: 'http://127.0.0.1:8788',
  web: 'http://127.0.0.1:8788',
};

export class WorkerBaseUrlConfigurationError extends Error {
  constructor() {
    super('The Worker base URL is not configured correctly.');
    this.name = 'WorkerBaseUrlConfigurationError';
  }
}

export function resolveWorkerBaseUrl(options: WorkerBaseUrlOptions): string {
  const candidate = options.configuredUrl?.trim()
    || (options.isDevelopment ? localWorkerBaseUrls[options.platform] : '');

  try {
    const url = new URL(candidate);
    if (
      !['http:', 'https:'].includes(url.protocol)
      || (!options.isDevelopment && url.protocol !== 'https:')
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash
    ) {
      throw new WorkerBaseUrlConfigurationError();
    }
    return url.origin;
  } catch (error) {
    if (error instanceof WorkerBaseUrlConfigurationError) throw error;
    throw new WorkerBaseUrlConfigurationError();
  }
}
