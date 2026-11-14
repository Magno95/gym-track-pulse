import { Platform } from 'react-native';
import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import { createSessionActivitySynchronizer } from './data/session-activity';

// Serialize updates and logout cleanup so an old account cannot leave a new activity behind.
export const syncSessionActivity = createSessionActivitySynchronizer(() => {
  if (Platform.OS !== 'ios') return 'unsupported';
  if (isRunningInExpoGo()) return 'expo-go';
  return requireOptionalNativeModule('ExpoWidgets') ? 'available' : 'missing-build';
}, async () => (await import('./widgets/WorkoutActivity')).default);
