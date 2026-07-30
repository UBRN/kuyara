import { useLocalizationContext } from '@/localization/localization-context';

export function useLocalization() {
  return useLocalizationContext();
}

export function useMessages() {
  return useLocalization().messages;
}
