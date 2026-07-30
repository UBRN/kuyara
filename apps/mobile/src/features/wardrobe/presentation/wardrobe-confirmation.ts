import { Alert } from 'react-native';

export type WardrobeConfirmationRequest = Readonly<{
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
}>;

export type WardrobeConfirmation = (
  request: WardrobeConfirmationRequest,
  onConfirm: () => void,
) => void;

export const showWardrobeConfirmation: WardrobeConfirmation = (
  request,
  onConfirm,
) => {
  Alert.alert(request.title, request.message, [
    {
      text: request.cancelLabel,
      style: 'cancel',
    },
    {
      text: request.confirmLabel,
      style: request.destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
};
