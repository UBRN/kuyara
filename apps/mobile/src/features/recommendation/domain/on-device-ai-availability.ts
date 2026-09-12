// ADR 0034 section 5: what the device reports about on-device selection. Reading it runs no
// inference, consumes no quota and names no model. The reasons are coarse and closed so the
// AI status surface can collapse them into its three user-visible states.
export type OnDeviceAiUnavailableReason =
  | 'device_not_eligible'
  | 'apple_intelligence_not_enabled'
  | 'model_not_ready'
  | 'unsupported_os'
  | 'unknown';

export type OnDeviceAiAvailability =
  | Readonly<{ status: 'available'; reason?: undefined }>
  | Readonly<{ status: 'unavailable'; reason?: OnDeviceAiUnavailableReason }>;
