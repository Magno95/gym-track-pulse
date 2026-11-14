import { Platform, Vibration } from 'react-native';
import type { RestTimer } from './data/workout-run';

let notifications: Promise<typeof import('expo-notifications')> | undefined;
function loadNotifications() {
  return notifications ??= import('expo-notifications').then((module) => {
    module.setNotificationHandler({ handleNotification: async () => ({
      shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false,
    }) });
    return module;
  });
}
export function vibrateRestComplete() {
  Vibration.vibrate(Platform.OS === 'ios' ? [0, 500] : [0, 350, 180, 350]);
}
export async function allowRestNotifications() {
  const module = await loadNotifications();
  if (Platform.OS === 'android') await module.setNotificationChannelAsync('workout-rest', {
    name: 'Timer allenamento', importance: module.AndroidImportance.HIGH, vibrationPattern: [0, 350, 180, 350], sound: 'default',
  });
  let permission = await module.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await module.requestPermissionsAsync();
  return permission.granted;
}
export async function scheduleRestNotification(rest: RestTimer) {
  const module = await loadNotifications();
  if (rest.endsAt <= Date.now()) return;
  if (!(await module.getPermissionsAsync()).granted) throw new Error('Notifiche non autorizzate.');
  await module.scheduleNotificationAsync({ identifier: rest.notificationId,
    content: { title: 'Timer terminato', body: 'Il tempo impostato è trascorso.', sound: 'default', data: { url: 'gymtrack://session' } },
    trigger: { type: module.SchedulableTriggerInputTypes.DATE, date: new Date(rest.endsAt), channelId: 'workout-rest' },
  });
}
export async function cancelRestNotification(id: string) {
  const module = await loadNotifications();
  await module.cancelScheduledNotificationAsync(id);
  await module.dismissNotificationAsync(id);
}
