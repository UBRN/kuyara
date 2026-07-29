import { View, type ViewProps } from 'react-native';

import type { SemanticColorRole } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type ThemedViewProps = ViewProps & {
  backgroundRole?: SemanticColorRole;
};

export function ThemedView({
  style,
  backgroundRole = 'background',
  ...otherProps
}: ThemedViewProps) {
  const theme = useKuyaraTheme();

  return <View style={[{ backgroundColor: theme.colors[backgroundRole] }, style]} {...otherProps} />;
}
