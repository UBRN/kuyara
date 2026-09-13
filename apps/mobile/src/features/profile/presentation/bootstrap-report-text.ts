import type { BootstrapReport } from '@/features/profile/application/profile-application-controller';

// Deliberately not localized: the maintainer reads this, the user only confirms it in the
// share sheet. Every field is either a build constant, a device model, or the failure
// classification; none of it identifies the device or the person.
type BootstrapReportEnvironment = Readonly<{
  appVersion: string | null | undefined;
  buildNumber: string | null | undefined;
  osName: string | null | undefined;
  osVersion: string | null | undefined;
  modelName: string | null | undefined;
}>;

const unknown = 'unknown';

export function composeBootstrapReportText(
  report: BootstrapReport,
  environment: BootstrapReportEnvironment,
): string {
  return [
    `kuyara ${environment.appVersion ?? unknown} (${environment.buildNumber ?? unknown})`,
    `${environment.osName ?? unknown} ${environment.osVersion ?? unknown}`,
    environment.modelName ?? unknown,
    `stage=${report.stage}`,
    `error=${report.errorName}`,
    `message=${report.errorMessage}`,
  ].join('\n');
}
